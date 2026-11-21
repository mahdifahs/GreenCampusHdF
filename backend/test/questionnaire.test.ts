import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { buildApp } from '../src/app.js';
import { loadConfig } from '../src/config.js';
import { QUESTIONS_STAND } from '../src/modules/bilans/questions-stand.js';
import { connecterAdmin } from './aide-admin.js';
import { jetonDe } from './aide-session.js';

let app: Awaited<ReturnType<typeof buildApp>>;
let admin: { authorization: string; prenom: string };
let benevole: { authorization: string; prenom: string };

const THE = 'alimentation . boisson . chaude . thé . nombre';
const BUS = 'transport . transports commun . bus . heures par semaine';

beforeAll(async () => {
  app = await buildApp(loadConfig({ ...process.env, ADMIN_ENABLED: 'true' }));
  admin = await connecterAdmin(app, { prenom: 'Questionnaire', role: 'ADMIN' });
  benevole = await connecterAdmin(app, { prenom: 'QuestionnaireBenevole', role: 'BENEVOLE' });
});

// Les fichiers de test se suivent sur la même base : on rend le questionnaire d'origine aux suivants.
afterAll(async () => {
  const ajoutees = await app.prisma.questionBilan.findMany({
    where: { OR: [{ type: 'INFORMATION' }, { dottedName: { notIn: [...QUESTIONS_STAND] } }] },
    select: { id: true },
  });
  await app.prisma.reponseQuestion.deleteMany({ where: { questionId: { in: ajoutees.map((q) => q.id) } } });
  await app.prisma.questionBilan.deleteMany({ where: { id: { in: ajoutees.map((q) => q.id) } } });
  const bus = await app.prisma.questionBilan.findUniqueOrThrow({ where: { dottedName: BUS } });
  await app.prisma.questionBilan.update({ where: { id: bus.id }, data: { actif: true, min: 0, max: 40, texte: app.ngc.question(BUS)!.question } });
  await app.close();
});

const h = (qui = admin) => ({ authorization: qui.authorization });
const lister = async () => (await app.inject({ method: 'GET', url: '/api/admin/questionnaire', headers: h() })).json();
const ajouter = (payload: Record<string, unknown>) => app.inject({ method: 'POST', url: '/api/admin/questionnaire', headers: h(), payload });
const modifier = (id: string, payload: Record<string, unknown>) => app.inject({ method: 'PATCH', url: `/api/admin/questionnaire/${id}`, headers: h(), payload });
const questionsStand = async () => (await app.inject({ method: 'GET', url: '/api/bilans/questions-stand' })).json();
const questionsInfo = async () => (await app.inject({ method: 'GET', url: '/api/bilans/questions-information' })).json();

async function participant() {
  const filieres = (await app.inject({ method: 'GET', url: '/api/filieres' })).json();
  const res = await app.inject({ method: 'POST', url: '/api/participants', payload: { filiereId: filieres[0].id, annee: 'L1', consentement: true } });
  return { authorization: `Bearer ${jetonDe(res)}` };
}
const enregistrer = (headers: Record<string, string>, payload: Record<string, unknown>) =>
  app.inject({ method: 'POST', url: '/api/bilans', headers, payload: { type: 'STAND', situation: {}, ...payload } });

describe('questionnaire du bilan (administration)', () => {
  it('démarre avec les 29 questions de la version stand, dans l’ordre', async () => {
    const liste = await lister();
    expect(liste.filter((q: { type: string }) => q.type === 'ADEME').map((q: { dottedName: string }) => q.dottedName)).toEqual([...QUESTIONS_STAND]);
    expect(liste.find((q: { dottedName: string }) => q.dottedName === BUS)).toMatchObject({ min: 0, max: 40, limites: { min: 0, max: 10_000_000 }, actif: true });
    expect((await questionsStand()).map((q: { dottedName: string }) => q.dottedName)).toEqual([...QUESTIONS_STAND]);
  });

  it('est fermé aux bénévoles et aux participants', async () => {
    expect((await app.inject({ method: 'GET', url: '/api/admin/questionnaire', headers: h(benevole) })).statusCode).toBe(403);
    expect((await app.inject({ method: 'GET', url: '/api/admin/questionnaire', headers: await participant() })).statusCode).toBe(403);
  });

  it('ajoute une question du modèle : recherche, bornes dans les limites du modèle, puis posée au public', async () => {
    const trouvees = (await app.inject({ method: 'GET', url: '/api/admin/questionnaire/modele?recherche=the chaude', headers: h() })).json();
    expect(trouvees.map((q: { dottedName: string }) => q.dottedName)).toContain(THE);
    // Déjà dans le questionnaire : pas proposée.
    const bus = (await app.inject({ method: 'GET', url: '/api/admin/questionnaire/modele?recherche=bus heures', headers: h() })).json();
    expect(bus.map((q: { dottedName: string }) => q.dottedName)).not.toContain(BUS);

    expect((await ajouter({ type: 'ADEME', dottedName: THE, max: 11 })).json().code).toBe('BORNES_HORS_MODELE');
    expect((await ajouter({ type: 'ADEME', dottedName: 'pas . une . question' })).json().code).toBe('QUESTION_INCONNUE');
    const res = await ajouter({ type: 'ADEME', dottedName: THE, texte: 'Combien de tasses de thé bois-tu par jour ?', max: 6 });
    expect(res.statusCode).toBe(201);
    expect(res.json()).toMatchObject({ texte: 'Combien de tasses de thé bois-tu par jour ?', min: 0, max: 6, limites: { min: 0, max: 10 }, nbReponses: 0 });
    expect((await ajouter({ type: 'ADEME', dottedName: THE })).statusCode).toBe(409);

    const publique = (await questionsStand()).at(-1);
    expect(publique).toMatchObject({ dottedName: THE, question: 'Combien de tasses de thé bois-tu par jour ?', categorie: 'alimentation', min: 0, max: 6 });
  });

  it('applique les bornes réglées dans l’admin aux bilans et à l’estimation', async () => {
    const bus = (await lister()).find((q: { dottedName: string }) => q.dottedName === BUS);
    expect((await modifier(bus.id, { max: 60 })).json()).toMatchObject({ max: 60 });
    const p = await participant();
    expect((await enregistrer(p, { situation: { [BUS]: 55 } })).statusCode).toBe(201);
    expect((await modifier(bus.id, { min: 5, max: 3 })).json().code).toBe('BORNES_INVALIDES');
    expect((await modifier(bus.id, { max: 20 })).statusCode).toBe(200);
    const refus = await enregistrer(p, { situation: { [BUS]: 25 } });
    expect(refus.json().details).toEqual([{ champ: BUS, message: 'Valeur attendue : un nombre entre 0 et 20.' }]);
    const estimation = await app.inject({ method: 'POST', url: '/api/bilans/estimation', headers: p, payload: { situation: { [BUS]: 25 } } });
    expect(estimation.statusCode).toBe(400);
  });

  it('désactive une question déjà répondue (suppression refusée), sans toucher aux anciens bilans', async () => {
    const bus = (await lister()).find((q: { dottedName: string }) => q.dottedName === BUS);
    expect(bus.nbReponses).toBeGreaterThan(0);
    const suppression = await app.inject({ method: 'DELETE', url: `/api/admin/questionnaire/${bus.id}`, headers: h() });
    expect(suppression.statusCode).toBe(409);
    expect(suppression.json().code).toBe('QUESTION_DEJA_REPONDUE');

    expect((await modifier(bus.id, { actif: false })).json()).toMatchObject({ actif: false });
    expect((await questionsStand()).map((q: { dottedName: string }) => q.dottedName)).not.toContain(BUS);
    expect((await questionsStand()).find((q: { dottedName: string }) => q.dottedName === 'transport . transports commun . bus . présent')).toBeDefined();
    const journal = (await app.inject({ method: 'GET', url: '/api/admin/journal', headers: h() })).json();
    expect(journal.some((a: { action: string; auteur: string }) => a.action === 'QUESTION_DESACTIVEE' && a.auteur === admin.prenom)).toBe(true);
    expect((await modifier(bus.id, { actif: true })).json()).toMatchObject({ actif: true });
  });

  it('supprime une question sans réponse', async () => {
    const the = (await lister()).find((q: { dottedName: string }) => q.dottedName === THE);
    expect((await app.inject({ method: 'DELETE', url: `/api/admin/questionnaire/${the.id}`, headers: h() })).statusCode).toBe(204);
    expect((await questionsStand()).map((q: { dottedName: string }) => q.dottedName)).not.toContain(THE);
  });

  it('déplace une question à l’intérieur de sa catégorie', async () => {
    const ordre = async () => (await questionsStand()).filter((q: { categorie: string }) => q.categorie === 'logement').map((q: { dottedName: string }) => q.dottedName);
    const avant = await ordre();
    const id = (await lister()).find((q: { dottedName: string }) => q.dottedName === avant[1]).id;
    const deplacer = (sens: string) => app.inject({ method: 'POST', url: `/api/admin/questionnaire/${id}/deplacer`, headers: h(), payload: { sens } });
    expect((await deplacer('haut')).json()).toEqual({ deplacee: true });
    expect(await ordre()).toEqual([avant[1], avant[0], ...avant.slice(2)]);
    // Déjà en tête de sa catégorie : ne passe pas dans la catégorie précédente.
    expect((await deplacer('haut')).json()).toEqual({ deplacee: false });
    await deplacer('bas');
    expect(await ordre()).toEqual(avant);
  });
});

describe('questions « information » (hors calcul)', () => {
  let nombreId: string;
  let choixId: string;

  it('crée une question nombre (bornes obligatoires) et une question à choix (2 réponses au moins)', async () => {
    expect((await ajouter({ type: 'INFORMATION', texte: 'Combien de cours as-tu par semaine ?', format: 'NOMBRE' })).json().code).toBe('BORNES_REQUISES');
    expect((await ajouter({ type: 'INFORMATION', texte: 'Tu viens comment ?', format: 'CHOIX', choix: ['Bus'] })).json().code).toBe('CHOIX_REQUIS');
    expect((await ajouter({ type: 'INFORMATION', texte: 'Tu viens comment ?', format: 'CHOIX', choix: ['Bus', ' bus '] })).json().code).toBe('CHOIX_EN_DOUBLE');

    const nombre = await ajouter({ type: 'INFORMATION', texte: 'Combien de cours as-tu par semaine ?', format: 'NOMBRE', unite: 'cours', min: 0, max: 40 });
    expect(nombre.statusCode).toBe(201);
    nombreId = nombre.json().id;
    const choix = await ajouter({ type: 'INFORMATION', texte: 'Comment viens-tu au campus ?', format: 'CHOIX', choix: ['À pied', 'Bus', 'Voiture'] });
    expect(choix.json()).toMatchObject({ categorie: 'information', format: 'choix', choix: ['À pied', 'Bus', 'Voiture'], min: null, max: null });
    choixId = choix.json().id;

    expect(await questionsInfo()).toEqual([
      { id: nombreId, question: 'Combien de cours as-tu par semaine ?', type: 'nombre', unite: 'cours', possibilites: [], min: 0, max: 40 },
      {
        id: choixId,
        question: 'Comment viens-tu au campus ?',
        type: 'choix',
        unite: null,
        possibilites: ['À pied', 'Bus', 'Voiture'].map((c) => ({ valeur: c, titre: c })),
        min: null,
        max: null,
      },
    ]);
  });

  it('enregistre les réponses avec le bilan, sans changer le total, et les rend pour reprendre le bilan', async () => {
    const p = await participant();
    const sans = (await enregistrer(p, {})).json();
    const res = await enregistrer(p, { informations: { [nombreId]: 22, [choixId]: 'Bus' } });
    expect(res.statusCode).toBe(201);
    expect(res.json().totalKg).toBe(sans.totalKg);
    const dernier = (await app.inject({ method: 'GET', url: '/api/bilans/dernier', headers: p })).json();
    expect(dernier.informations).toEqual({ [nombreId]: 22, [choixId]: 'Bus' });

    const refus = await enregistrer(p, { informations: { [nombreId]: 41, [choixId]: 'Trottinette', '00000000-0000-4000-8000-000000000000': 1 } });
    expect(refus.statusCode).toBe(400);
    expect(refus.json().details.map((d: { champ: string }) => d.champ).sort()).toEqual(['00000000-0000-4000-8000-000000000000', choixId, nombreId].sort());
  });

  it('statistiques : dernière réponse de chaque participant', async () => {
    const p = await participant();
    await enregistrer(p, { informations: { [nombreId]: 10, [choixId]: 'À pied' } });
    await enregistrer(p, { informations: { [nombreId]: 30, [choixId]: 'Bus' } });
    const liste = await lister();
    expect(liste.find((q: { id: string }) => q.id === nombreId).statistiques).toEqual({ type: 'nombre', repondants: 2, moyenne: 26, mediane: 26, min: 22, max: 30 });
    expect(liste.find((q: { id: string }) => q.id === choixId).statistiques).toEqual({
      type: 'choix',
      repondants: 2,
      repartition: [
        { valeur: 'À pied', nombre: 0 },
        { valeur: 'Bus', nombre: 2 },
        { valeur: 'Voiture', nombre: 0 },
      ],
    });
    const csv = (await app.inject({ method: 'GET', url: '/api/admin/export/questionnaire', headers: h() })).body;
    expect(csv.split('\n')[0]).toContain('question');
    expect(csv).toContain('Comment viens-tu au campus ?');
  });

  it('une réponse déjà choisie ne peut pas être retirée, mais on peut ajouter des choix ; le type ne change pas', async () => {
    const retrait = await modifier(choixId, { choix: ['À pied', 'Voiture'] });
    expect(retrait.statusCode).toBe(409);
    expect(retrait.json().code).toBe('CHOIX_DEJA_REPONDU');
    expect((await modifier(choixId, { choix: ['À pied', 'Bus', 'Voiture', 'Vélo'] })).json().choix).toEqual(['À pied', 'Bus', 'Voiture', 'Vélo']);
    expect((await modifier(choixId, { min: 0, max: 3 })).json().code).toBe('BORNES_SANS_OBJET');
    expect((await modifier(nombreId, { choix: ['a', 'b'] })).json().code).toBe('CHOIX_SANS_OBJET');
  });

  it('désactivée : plus posée, réponse refusée, statistiques gardées', async () => {
    expect((await modifier(choixId, { actif: false })).statusCode).toBe(200);
    expect((await questionsInfo()).map((q: { id: string }) => q.id)).toEqual([nombreId]);
    expect((await enregistrer(await participant(), { informations: { [choixId]: 'Bus' } })).statusCode).toBe(400);
    expect((await lister()).find((q: { id: string }) => q.id === choixId).statistiques.repondants).toBe(2);
  });

  it('suppression du compte : ses réponses partent avec ses bilans (RGPD)', async () => {
    const p = await participant();
    await enregistrer(p, { informations: { [nombreId]: 5 } });
    const avant = await app.prisma.reponseQuestion.count({ where: { questionId: nombreId } });
    expect((await app.inject({ method: 'DELETE', url: '/api/me', headers: p })).statusCode).toBe(204);
    expect(await app.prisma.reponseQuestion.count({ where: { questionId: nombreId } })).toBe(avant - 1);
  });
});
