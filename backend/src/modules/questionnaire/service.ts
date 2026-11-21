import { Prisma, type FormatQuestion, type PrismaClient, type QuestionBilan } from '@prisma/client';
import { ErreurApi } from '../../lib/errors.js';
import type { Bornes, ModeleNgc, Question } from '../../lib/ngc.js';
import { QUESTIONS_STAND } from '../bilans/questions-stand.js';

// Questionnaire du bilan, géré depuis l'administration (table QuestionBilan).
// - ADEME : question du modèle Nos Gestes Climat, comptée dans le calcul. Texte affiché et bornes
//   modifiables, bornes toujours à l'intérieur des limites du modèle. Sans réponse : moyenne ADEME.
// - INFORMATION : question de l'équipe, hors calcul (statistiques anonymes). Nombre borné ou choix
//   dans une liste, jamais de texte libre (RGPD).

export const ECART_ORDRE = 10;
export const CHOIX_MAX = 20;
export const LONGUEUR_MAX_CHOIX = 80;

export type QuestionAdemePublique = Question & { id: string };
export type QuestionInformationPublique = {
  id: string;
  question: string;
  type: 'nombre' | 'choix';
  unite: string | null;
  possibilites: { valeur: string; titre: string }[];
  min: number | null;
  max: number | null;
};
export type QuestionnaireActif = {
  ademe: QuestionAdemePublique[];
  information: QuestionInformationPublique[];
  // Bornes réglées dans l'admin pour chaque question ADEME active (validation des bilans).
  bornes: Map<string, Bornes>;
};

// Premier démarrage (table vide) : les 29 questions de la version stand, dans cet ordre, avec les bornes
// par défaut (modèle + projet). Idempotent : ne fait rien dès qu'une question existe.
export async function initialiser(prisma: PrismaClient, ngc: ModeleNgc) {
  if ((await prisma.questionBilan.count()) > 0) return;
  await prisma.questionBilan.createMany({
    data: QUESTIONS_STAND.map((dottedName, i) => {
      const q = ngc.question(dottedName)!;
      return { type: 'ADEME' as const, dottedName, texte: q.question, min: q.min, max: q.max, ordre: (i + 1) * ECART_ORDRE };
    }),
    skipDuplicates: true,
  });
}

const versInformation = (q: QuestionBilan): QuestionInformationPublique => ({
  id: q.id,
  question: q.texte,
  type: q.format === 'CHOIX' ? 'choix' : 'nombre',
  unite: q.unite,
  possibilites: q.choix.map((c) => ({ valeur: c, titre: c })),
  min: q.format === 'NOMBRE' ? q.min : null,
  max: q.format === 'NOMBRE' ? q.max : null,
});

export async function actif(prisma: PrismaClient, ngc: ModeleNgc): Promise<QuestionnaireActif> {
  const lignes = await prisma.questionBilan.findMany({ where: { actif: true }, orderBy: [{ ordre: 'asc' }, { createdAt: 'asc' }] });
  const ademe: QuestionAdemePublique[] = [];
  const bornes = new Map<string, Bornes>();
  for (const l of lignes) {
    const q = l.type === 'ADEME' && l.dottedName ? ngc.question(l.dottedName) : undefined;
    // Une question disparue du modèle (mise à jour NGC) est ignorée plutôt que de casser le bilan.
    if (!q) continue;
    const b = q.type === 'nombre' ? { min: l.min, max: l.max } : { min: null, max: null };
    ademe.push({ ...q, id: l.id, question: l.texte, ...b });
    if (q.type === 'nombre') bornes.set(q.dottedName, b);
  }
  return { ademe, information: lignes.filter((l) => l.type === 'INFORMATION').map(versInformation), bornes };
}

// ---------- Réponses aux questions « information » ----------

export type ValeurInformation = number | string;

export function validerInformations(
  questionnaire: QuestionnaireActif,
  brutes: Record<string, ValeurInformation>,
): { erreurs: { champ: string; message: string }[]; reponses: { questionId: string; valeurNombre: number | null; valeurChoix: string | null }[] } {
  const parId = new Map(questionnaire.information.map((q) => [q.id, q]));
  const erreurs: { champ: string; message: string }[] = [];
  const reponses: { questionId: string; valeurNombre: number | null; valeurChoix: string | null }[] = [];
  for (const [id, valeur] of Object.entries(brutes)) {
    const q = parId.get(id);
    if (!q) {
      erreurs.push({ champ: id, message: 'Question inconnue ou retirée du questionnaire.' });
    } else if (q.type === 'nombre') {
      const ok = typeof valeur === 'number' && Number.isFinite(valeur) && valeur >= (q.min ?? 0) && (q.max === null || valeur <= q.max);
      if (ok) reponses.push({ questionId: id, valeurNombre: valeur, valeurChoix: null });
      else erreurs.push({ champ: id, message: `Valeur attendue : un nombre entre ${q.min ?? 0} et ${q.max}.` });
    } else if (typeof valeur === 'string' && q.possibilites.some((p) => p.valeur === valeur)) {
      reponses.push({ questionId: id, valeurNombre: null, valeurChoix: valeur });
    } else {
      erreurs.push({ champ: id, message: `Valeur attendue parmi : ${q.possibilites.map((p) => p.valeur).join(', ')}.` });
    }
  }
  return { erreurs, reponses };
}

// ---------- Administration ----------

// Nombre de bilans ayant répondu à chaque question du modèle (clés de `situation`).
async function reponsesAdeme(prisma: PrismaClient): Promise<Map<string, number>> {
  const lignes = await prisma.$queryRaw<{ cle: string; n: bigint }[]>`
    SELECT cle, count(*) AS n FROM "Bilan", jsonb_object_keys("situation") AS cle GROUP BY cle`;
  return new Map(lignes.map((l) => [l.cle, Number(l.n)]));
}

async function nbReponses(prisma: PrismaClient, q: QuestionBilan): Promise<number> {
  if (q.type === 'INFORMATION') return prisma.reponseQuestion.count({ where: { questionId: q.id } });
  const [{ n }] = await prisma.$queryRaw<{ n: bigint }[]>`
    SELECT count(*) AS n FROM "Bilan" WHERE jsonb_exists("situation", ${q.dottedName})`;
  return Number(n);
}

export type Statistiques =
  | { type: 'nombre'; repondants: number; moyenne: number | null; mediane: number | null; min: number | null; max: number | null }
  | { type: 'choix'; repondants: number; repartition: { valeur: string; nombre: number }[] };

const arrondi2 = (n: number) => Math.round(n * 100) / 100;

// Statistiques d'une question « information » : dernière réponse de chaque participant, comptes exclus
// des statistiques publiques mis à part (même règle que le tableau de bord).
async function statistiques(prisma: PrismaClient, q: QuestionBilan): Promise<Statistiques> {
  const reponses = await prisma.reponseQuestion.findMany({
    where: { questionId: q.id, bilan: { participant: { exclu: false } } },
    select: { valeurNombre: true, valeurChoix: true, bilan: { select: { participantId: true, createdAt: true } } },
    orderBy: { bilan: { createdAt: 'desc' } },
  });
  const vues = new Set<string>();
  const dernieres = reponses.filter((r) => !vues.has(r.bilan.participantId) && vues.add(r.bilan.participantId));
  if (q.format === 'CHOIX') {
    const comptes = new Map(q.choix.map((c) => [c, 0]));
    for (const r of dernieres) if (r.valeurChoix !== null) comptes.set(r.valeurChoix, (comptes.get(r.valeurChoix) ?? 0) + 1);
    return { type: 'choix', repondants: dernieres.length, repartition: [...comptes].map(([valeur, nombre]) => ({ valeur, nombre })) };
  }
  const valeurs = dernieres.map((r) => r.valeurNombre).filter((v): v is number => v !== null).sort((a, b) => a - b);
  const n = valeurs.length;
  return {
    type: 'nombre',
    repondants: n,
    moyenne: n ? arrondi2(valeurs.reduce((s, v) => s + v, 0) / n) : null,
    mediane: n ? arrondi2(n % 2 ? valeurs[(n - 1) / 2] : (valeurs[n / 2 - 1] + valeurs[n / 2]) / 2) : null,
    min: n ? valeurs[0] : null,
    max: n ? valeurs[n - 1] : null,
  };
}

function versAdmin(ngc: ModeleNgc, q: QuestionBilan, reponses: number, stats: Statistiques | null) {
  const modele = q.dottedName ? ngc.question(q.dottedName) : undefined;
  const format = modele ? modele.type : q.format === 'CHOIX' ? 'choix' : 'nombre';
  return {
    id: q.id,
    type: q.type,
    dottedName: q.dottedName,
    texte: q.texte,
    texteModele: modele?.question ?? null,
    categorie: modele ? modele.categorie : 'information',
    format,
    unite: modele ? modele.unite : q.unite,
    choix: modele ? modele.possibilites.map((p) => p.titre) : q.choix,
    min: format === 'nombre' ? q.min : null,
    max: format === 'nombre' ? q.max : null,
    limites: q.dottedName ? ngc.limitesModele(q.dottedName) : null,
    // La question a disparu du modèle (mise à jour NGC) : elle n'est plus posée.
    horsModele: q.type === 'ADEME' && !modele,
    ordre: q.ordre,
    actif: q.actif,
    nbReponses: reponses,
    statistiques: stats,
  };
}
export type QuestionAdmin = ReturnType<typeof versAdmin>;

export async function lister(prisma: PrismaClient, ngc: ModeleNgc): Promise<QuestionAdmin[]> {
  const [lignes, ademe, info] = await Promise.all([
    prisma.questionBilan.findMany({ orderBy: [{ ordre: 'asc' }, { createdAt: 'asc' }] }),
    reponsesAdeme(prisma),
    prisma.reponseQuestion.groupBy({ by: ['questionId'], _count: { _all: true } }),
  ]);
  const parInfo = new Map(info.map((g) => [g.questionId, g._count._all]));
  return Promise.all(
    lignes.map(async (q) =>
      q.type === 'ADEME'
        ? versAdmin(ngc, q, ademe.get(q.dottedName!) ?? 0, null)
        : versAdmin(ngc, q, parInfo.get(q.id) ?? 0, await statistiques(prisma, q)),
    ),
  );
}

async function detail(prisma: PrismaClient, ngc: ModeleNgc, q: QuestionBilan) {
  return versAdmin(ngc, q, await nbReponses(prisma, q), q.type === 'INFORMATION' ? await statistiques(prisma, q) : null);
}

const sansAccents = (t: string) => t.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase();

// Recherche dans les questions du modèle qui ne sont pas encore dans le questionnaire.
export async function rechercherModele(prisma: PrismaClient, ngc: ModeleNgc, recherche: string, limite = 20) {
  const deja = new Set((await prisma.questionBilan.findMany({ where: { type: 'ADEME' }, select: { dottedName: true } })).map((q) => q.dottedName));
  const mots = sansAccents(recherche).split(/\s+/).filter(Boolean);
  const resultats = [];
  for (const q of ngc.toutesQuestions()) {
    if (deja.has(q.dottedName)) continue;
    const texte = sansAccents(`${q.dottedName} ${q.question}`);
    if (!mots.every((m) => texte.includes(m))) continue;
    resultats.push({
      dottedName: q.dottedName,
      question: q.question,
      categorie: q.categorie,
      type: q.type,
      unite: q.unite,
      choix: q.possibilites.map((p) => p.titre),
      min: q.min,
      max: q.max,
      limites: ngc.limitesModele(q.dottedName),
    });
    if (resultats.length >= limite) break;
  }
  return resultats;
}

function verifierBornes(min: number | null | undefined, max: number | null | undefined, limites?: { min: number; max: number } | null) {
  if (min === null || min === undefined || max === null || max === undefined) {
    throw new ErreurApi(400, 'BORNES_REQUISES', 'Indique une valeur minimale et une valeur maximale.');
  }
  if (min > max) throw new ErreurApi(400, 'BORNES_INVALIDES', 'La valeur minimale dépasse la valeur maximale.');
  if (limites && (min < limites.min || max > limites.max)) {
    throw new ErreurApi(400, 'BORNES_HORS_MODELE', `Le modèle ADEME n’accepte que des valeurs entre ${limites.min} et ${limites.max}.`);
  }
}

function verifierChoix(choix: string[] | undefined): string[] {
  const nettoyes = (choix ?? []).map((c) => c.trim()).filter(Boolean);
  if (nettoyes.length < 2) throw new ErreurApi(400, 'CHOIX_REQUIS', 'Indique au moins deux réponses possibles.');
  if (nettoyes.length > CHOIX_MAX) throw new ErreurApi(400, 'CHOIX_TROP_NOMBREUX', `${CHOIX_MAX} réponses possibles au plus.`);
  if (new Set(nettoyes.map((c) => c.toLowerCase())).size !== nettoyes.length) {
    throw new ErreurApi(400, 'CHOIX_EN_DOUBLE', 'Deux réponses possibles sont identiques.');
  }
  return nettoyes;
}

async function prochainOrdre(prisma: PrismaClient) {
  const { _max } = await prisma.questionBilan.aggregate({ _max: { ordre: true } });
  return (_max.ordre ?? 0) + ECART_ORDRE;
}

export type CreationQuestion =
  | { type: 'ADEME'; dottedName: string; texte?: string; min?: number; max?: number }
  | { type: 'INFORMATION'; texte: string; format: FormatQuestion; unite?: string | null; min?: number; max?: number; choix?: string[] };

export async function creer(prisma: PrismaClient, ngc: ModeleNgc, entree: CreationQuestion) {
  const ordre = await prochainOrdre(prisma);
  if (entree.type === 'ADEME') {
    const modele = ngc.question(entree.dottedName);
    if (!modele) throw new ErreurApi(400, 'QUESTION_INCONNUE', 'Cette question n’existe pas dans le modèle Nos Gestes Climat.');
    const existante = await prisma.questionBilan.findUnique({ where: { dottedName: entree.dottedName } });
    if (existante) {
      throw new ErreurApi(
        409,
        'QUESTION_DEJA_PRESENTE',
        existante.actif ? 'Cette question est déjà dans le questionnaire.' : 'Cette question est déjà dans le questionnaire (désactivée) : réactive-la.',
      );
    }
    let bornes: { min: number | null; max: number | null } = { min: null, max: null };
    if (modele.type === 'nombre') {
      bornes = { min: entree.min ?? modele.min, max: entree.max ?? modele.max };
      verifierBornes(bornes.min, bornes.max, ngc.limitesModele(modele.dottedName));
    }
    try {
      const q = await prisma.questionBilan.create({
        data: { type: 'ADEME', dottedName: modele.dottedName, texte: entree.texte?.trim() || modele.question, ...bornes, ordre },
      });
      return detail(prisma, ngc, q);
    } catch (e) {
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') {
        throw new ErreurApi(409, 'QUESTION_DEJA_PRESENTE', 'Cette question est déjà dans le questionnaire.');
      }
      throw e;
    }
  }
  const nombre = entree.format === 'NOMBRE';
  if (nombre) verifierBornes(entree.min, entree.max);
  const q = await prisma.questionBilan.create({
    data: {
      type: 'INFORMATION',
      texte: entree.texte.trim(),
      format: entree.format,
      unite: nombre ? entree.unite?.trim() || null : null,
      min: nombre ? entree.min : null,
      max: nombre ? entree.max : null,
      choix: nombre ? [] : verifierChoix(entree.choix),
      ordre,
    },
  });
  return detail(prisma, ngc, q);
}

export type ModificationQuestion = { texte?: string; unite?: string | null; min?: number; max?: number; choix?: string[]; actif?: boolean };

export async function trouver(prisma: PrismaClient, id: string) {
  const q = await prisma.questionBilan.findUnique({ where: { id } });
  if (!q) throw new ErreurApi(404, 'QUESTION_INCONNUE', 'Cette question n’existe pas.');
  return q;
}

// Le type et le format ne se modifient pas : les réponses déjà données n'auraient plus de sens.
// Pour en changer, créer une nouvelle question et désactiver l'ancienne.
export async function modifier(prisma: PrismaClient, ngc: ModeleNgc, id: string, m: ModificationQuestion) {
  const q = await trouver(prisma, id);
  const modele = q.dottedName ? ngc.question(q.dottedName) : undefined;
  const estNombre = modele ? modele.type === 'nombre' : q.format === 'NOMBRE';
  const data: Prisma.QuestionBilanUpdateInput = {};
  if (m.texte !== undefined) data.texte = m.texte.trim();
  if (m.actif !== undefined) data.actif = m.actif;
  if (m.min !== undefined || m.max !== undefined) {
    if (!estNombre) throw new ErreurApi(400, 'BORNES_SANS_OBJET', 'Cette question n’attend pas un nombre.');
    const min = m.min ?? q.min;
    const max = m.max ?? q.max;
    verifierBornes(min, max, q.dottedName ? ngc.limitesModele(q.dottedName) : null);
    Object.assign(data, { min, max });
  }
  if (m.unite !== undefined) {
    if (q.type !== 'INFORMATION' || !estNombre) throw new ErreurApi(400, 'UNITE_SANS_OBJET', 'L’unité ne se règle que pour une question d’information de type nombre.');
    data.unite = m.unite?.trim() || null;
  }
  if (m.choix !== undefined) {
    if (q.type !== 'INFORMATION' || estNombre) throw new ErreurApi(400, 'CHOIX_SANS_OBJET', 'Les choix ne se règlent que pour une question d’information à choix.');
    const choix = verifierChoix(m.choix);
    const utilises = await prisma.reponseQuestion.findMany({ where: { questionId: id }, distinct: ['valeurChoix'], select: { valeurChoix: true } });
    const retires = utilises.map((u) => u.valeurChoix).filter((v): v is string => v !== null && !choix.includes(v));
    if (retires.length) {
      throw new ErreurApi(409, 'CHOIX_DEJA_REPONDU', `Réponse(s) déjà choisie(s) par des participants, impossible de les retirer : ${retires.join(', ')}.`);
    }
    data.choix = choix;
  }
  return detail(prisma, ngc, await prisma.questionBilan.update({ where: { id }, data }));
}

// Échange la place de la question avec sa voisine du même groupe (même catégorie du modèle, ou
// questions d'information entre elles), puis renumérote tout le questionnaire (10, 20, 30…).
export async function deplacer(prisma: PrismaClient, ngc: ModeleNgc, id: string, sens: 'haut' | 'bas') {
  const q = await trouver(prisma, id);
  const groupe = (x: QuestionBilan) => (x.dottedName ? (ngc.question(x.dottedName)?.categorie ?? 'hors modèle') : 'information');
  const toutes = await prisma.questionBilan.findMany({ orderBy: [{ ordre: 'asc' }, { createdAt: 'asc' }] });
  const memeGroupe = toutes.filter((x) => groupe(x) === groupe(q));
  const i = memeGroupe.findIndex((x) => x.id === id);
  const voisine = memeGroupe[sens === 'haut' ? i - 1 : i + 1];
  if (!voisine) return { deplacee: false };
  const iq = toutes.findIndex((x) => x.id === q.id);
  const iv = toutes.findIndex((x) => x.id === voisine.id);
  [toutes[iq], toutes[iv]] = [toutes[iv], toutes[iq]];
  await prisma.$transaction(
    toutes
      .map((x, rang) => ({ x, ordre: (rang + 1) * ECART_ORDRE }))
      .filter(({ x, ordre }) => x.ordre !== ordre)
      .map(({ x, ordre }) => prisma.questionBilan.update({ where: { id: x.id }, data: { ordre } })),
  );
  return { deplacee: true };
}

export async function supprimer(prisma: PrismaClient, id: string) {
  const q = await trouver(prisma, id);
  if ((await nbReponses(prisma, q)) > 0) {
    throw new ErreurApi(409, 'QUESTION_DEJA_REPONDUE', 'Des participants ont déjà répondu à cette question : désactive-la plutôt que de la supprimer.');
  }
  await prisma.questionBilan.delete({ where: { id } });
  return q;
}
