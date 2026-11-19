import { Prisma, type Matiere, type PrismaClient, type TypeVetement } from '@prisma/client';
import { ErreurApi } from '../../lib/errors.js';
import { arrondir } from '../../lib/ngc.js';

// ---------- Types de vêtements ----------

function typePublic(t: TypeVetement) {
  return { id: t.id, nom: t.nom, poidsMoyenGrammes: t.poidsMoyenGrammes, actif: t.actif };
}

export async function listerTypes(prisma: PrismaClient) {
  return (await prisma.typeVetement.findMany({ orderBy: { nom: 'asc' } })).map(typePublic);
}

export async function creerType(prisma: PrismaClient, nom: string, poidsMoyenGrammes?: number | null) {
  try {
    return typePublic(await prisma.typeVetement.create({ data: { nom, poidsMoyenGrammes: poidsMoyenGrammes ?? null } }));
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') {
      throw new ErreurApi(409, 'NOM_DEJA_UTILISE', `Un type « ${nom} » existe déjà.`);
    }
    throw e;
  }
}

export async function modifierType(prisma: PrismaClient, id: number, donnees: { nom?: string; poidsMoyenGrammes?: number | null; actif?: boolean }) {
  try {
    return typePublic(await prisma.typeVetement.update({ where: { id }, data: donnees }));
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') {
      throw new ErreurApi(409, 'NOM_DEJA_UTILISE', `Un type « ${donnees.nom} » existe déjà.`);
    }
    throw e;
  }
}

export async function supprimerType(prisma: PrismaClient, id: number) {
  const utilise = await prisma.quantiteVetement.findFirst({ where: { typeId: id } });
  if (utilise) {
    throw new ErreurApi(409, 'TYPE_UTILISE', 'Ce type a déjà des quantités enregistrées : désactive-le plutôt que de le supprimer.');
  }
  await prisma.typeVetement.delete({ where: { id } });
}

// ---------- Matières ----------

function matierePublic(m: Matiere) {
  return { id: m.id, nom: m.nom, facteurEmissionKgCo2ParKg: m.facteurEmissionKgCo2ParKg, source: m.source, actif: m.actif };
}

export async function listerMatieres(prisma: PrismaClient) {
  return (await prisma.matiere.findMany({ orderBy: { nom: 'asc' } })).map(matierePublic);
}

export async function creerMatiere(prisma: PrismaClient, nom: string, facteurEmissionKgCo2ParKg?: number | null, source?: string | null) {
  try {
    return matierePublic(
      await prisma.matiere.create({ data: { nom, facteurEmissionKgCo2ParKg: facteurEmissionKgCo2ParKg ?? null, source: source ?? null } }),
    );
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') {
      throw new ErreurApi(409, 'NOM_DEJA_UTILISE', `Une matière « ${nom} » existe déjà.`);
    }
    throw e;
  }
}

export async function modifierMatiere(
  prisma: PrismaClient,
  id: number,
  donnees: { nom?: string; facteurEmissionKgCo2ParKg?: number | null; source?: string | null; actif?: boolean },
) {
  try {
    return matierePublic(await prisma.matiere.update({ where: { id }, data: donnees }));
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') {
      throw new ErreurApi(409, 'NOM_DEJA_UTILISE', `Une matière « ${donnees.nom} » existe déjà.`);
    }
    throw e;
  }
}

export async function supprimerMatiere(prisma: PrismaClient, id: number) {
  const utilisee = await prisma.quantiteVetement.findFirst({ where: { matiereId: id } });
  if (utilisee) {
    throw new ErreurApi(409, 'MATIERE_UTILISEE', 'Cette matière a déjà des quantités enregistrées : désactive-la plutôt que de la supprimer.');
  }
  await prisma.matiere.delete({ where: { id } });
}

// ---------- Quantités (par journée × type × matière) ----------

export const SENS = ['recuperes', 'donnes'] as const;
export type Sens = (typeof SENS)[number];

async function ligne(prisma: PrismaClient, date: Date, typeId: number, matiereId: number) {
  return prisma.quantiteVetement.findUnique({ where: { date_typeId_matiereId: { date, typeId, matiereId } } });
}

function quantitePublic(q: { date: Date; typeId: number; matiereId: number; recuperes: number; donnes: number; type: TypeVetement; matiere: Matiere }) {
  return {
    typeId: q.typeId,
    type: q.type.nom,
    matiereId: q.matiereId,
    matiere: q.matiere.nom,
    recuperes: q.recuperes,
    donnes: q.donnes,
  };
}

export async function jour(prisma: PrismaClient, date: string) {
  const lignes = await prisma.quantiteVetement.findMany({
    where: { date: new Date(date) },
    include: { type: true, matiere: true },
    orderBy: [{ type: { nom: 'asc' } }, { matiere: { nom: 'asc' } }],
  });
  return lignes.map(quantitePublic);
}

// Lu-puis-écrit (pas atomique) : acceptable ici, un seul appareil saisit au stand.
export async function incrementer(prisma: PrismaClient, date: string, typeId: number, matiereId: number, sens: Sens, delta: number) {
  const d = new Date(date);
  const existant = await ligne(prisma, d, typeId, matiereId);
  const valeur = Math.max(0, (existant?.[sens] ?? 0) + delta);
  const q = await prisma.quantiteVetement.upsert({
    where: { date_typeId_matiereId: { date: d, typeId, matiereId } },
    create: { date: d, typeId, matiereId, [sens]: valeur },
    update: { [sens]: valeur },
    include: { type: true, matiere: true },
  });
  return quantitePublic(q);
}

export async function definir(prisma: PrismaClient, date: string, typeId: number, matiereId: number, sens: Sens, valeur: number) {
  const d = new Date(date);
  const q = await prisma.quantiteVetement.upsert({
    where: { date_typeId_matiereId: { date: d, typeId, matiereId } },
    create: { date: d, typeId, matiereId, [sens]: valeur },
    update: { [sens]: valeur },
    include: { type: true, matiere: true },
  });
  return quantitePublic(q);
}

// ---------- Bilan CO2 ----------
// kg = quantité × poids moyen du type (g → kg) ; CO2 évité = kg × facteur d'émission de la matière.
// Si le poids ou le facteur n'est pas encore renseigné pour un type/une matière utilisé, le calcul
// l'ignore (traité comme 0) mais le signale via donneesIncompletes pour ne pas afficher un chiffre
// trompeur comme s'il était complet.

export async function bilan(prisma: PrismaClient) {
  const lignes = await prisma.quantiteVetement.findMany({ include: { type: true, matiere: true } });

  let poidsRecupereKg = 0;
  let poidsDonneKg = 0;
  let co2EviteRecupereKg = 0;
  let co2EviteDonneKg = 0;
  let donneesIncompletes = false;

  const parMatiere = new Map<string, { matiere: string; kgRecupere: number; kgDonne: number; co2EviteKg: number }>();

  for (const l of lignes) {
    if (l.type.poidsMoyenGrammes == null || l.matiere.facteurEmissionKgCo2ParKg == null) {
      if (l.recuperes > 0 || l.donnes > 0) donneesIncompletes = true;
      continue;
    }
    const kgParPiece = l.type.poidsMoyenGrammes / 1000;
    const kgRecupere = l.recuperes * kgParPiece;
    const kgDonne = l.donnes * kgParPiece;
    const co2Recupere = kgRecupere * l.matiere.facteurEmissionKgCo2ParKg;
    const co2Donne = kgDonne * l.matiere.facteurEmissionKgCo2ParKg;

    poidsRecupereKg += kgRecupere;
    poidsDonneKg += kgDonne;
    co2EviteRecupereKg += co2Recupere;
    co2EviteDonneKg += co2Donne;

    const m = parMatiere.get(l.matiere.nom) ?? { matiere: l.matiere.nom, kgRecupere: 0, kgDonne: 0, co2EviteKg: 0 };
    m.kgRecupere += kgRecupere;
    m.kgDonne += kgDonne;
    m.co2EviteKg += co2Recupere + co2Donne;
    parMatiere.set(l.matiere.nom, m);
  }

  return {
    poidsRecupereKg: arrondir(poidsRecupereKg),
    poidsDonneKg: arrondir(poidsDonneKg),
    co2EviteRecupereKg: arrondir(co2EviteRecupereKg),
    co2EviteDonneKg: arrondir(co2EviteDonneKg),
    donneesIncompletes,
    parMatiere: [...parMatiere.values()]
      .map((m) => ({ matiere: m.matiere, kgRecupere: arrondir(m.kgRecupere), kgDonne: arrondir(m.kgDonne), co2EviteKg: arrondir(m.co2EviteKg) }))
      .sort((a, b) => b.co2EviteKg - a.co2EviteKg),
  };
}

// Version publique du bilan (tableau de bord du site) : uniquement des totaux, aucun détail par
// journée. Le nombre de pièces est ajouté car il parle davantage au public que les kilos.
export async function collectePublique(prisma: PrismaClient) {
  const [b, totaux] = await Promise.all([
    bilan(prisma),
    prisma.quantiteVetement.aggregate({ _sum: { recuperes: true, donnes: true } }),
  ]);
  return {
    nombreRecuperes: totaux._sum.recuperes ?? 0,
    nombreDonnes: totaux._sum.donnes ?? 0,
    poidsRecupereKg: b.poidsRecupereKg,
    poidsDonneKg: b.poidsDonneKg,
    co2EviteDonneKg: b.co2EviteDonneKg,
    co2EviteRecupereKg: b.co2EviteRecupereKg,
    donneesIncompletes: b.donneesIncompletes,
  };
}
