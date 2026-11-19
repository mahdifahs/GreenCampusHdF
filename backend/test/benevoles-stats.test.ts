import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { buildApp } from '../src/app.js';
import { loadConfig } from '../src/config.js';
import { ROUTES_BENEVOLE } from '../src/modules/admin/routes.js';
import { connecterAdmin } from './aide-admin.js';

let app: Awaited<ReturnType<typeof buildApp>>;
let superAdmin: { authorization: string };
let benevole: { authorization: string };
let prenomBenevole: string;

// Journée réservée à ce fichier (la base est partagée avec les autres fichiers de test).
const JOUR = '2018-06-21';

beforeAll(async () => {
  app = await buildApp(loadConfig({ ...process.env, ADMIN_ENABLED: 'true', ADMIN_RATE_LIMIT_CONNEXION_PAR_MIN: '50' }));
  superAdmin = { authorization: (await connecterAdmin(app, { prenom: 'ChefStand' })).authorization };
  const b = await connecterAdmin(app, { prenom: 'Benevole', role: 'BENEVOLE' });
  benevole = { authorization: b.authorization };
  prenomBenevole = b.prenom;
});

afterAll(() => app.close());

async function participant() {
  const filieres = (await app.inject({ method: 'GET', url: '/api/filieres' })).json();
  const r = (
    await app.inject({ method: 'POST', url: '/api/participants', payload: { filiereId: filieres[0].id, annee: 'L1', consentement: true } })
  ).json();
  return { id: r.participant.id as string, pseudo: r.participant.pseudo as string };
}

describe('rôle bénévole', () => {
  it('se présente avec son rôle', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/admin/moi', headers: benevole });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ prenom: prenomBenevole, role: 'BENEVOLE' });
  });

  it('saisit les personnes venues et les vêtements, et le journal garde son prénom', async () => {
    const inc = await app.inject({ method: 'POST', url: `/api/admin/compteurs/${JOUR}/incrementer`, headers: benevole, payload: { delta: 1 } });
    expect(inc.statusCode).toBe(200);
    const corr = await app.inject({ method: 'PATCH', url: `/api/admin/compteurs/${JOUR}`, headers: benevole, payload: { valeur: 4 } });
    expect(corr.statusCode).toBe(200);

    const [types, matieres] = await Promise.all([
      app.inject({ method: 'GET', url: '/api/admin/vetements/types', headers: benevole }),
      app.inject({ method: 'GET', url: '/api/admin/vetements/matieres', headers: benevole }),
    ]);
    expect(types.statusCode).toBe(200);
    expect(matieres.statusCode).toBe(200);
    // La base de test n'a pas le catalogue du seed : un type et une matière créés par le super-admin.
    const suffixe = Date.now();
    const typeId = (await app.inject({ method: 'POST', url: '/api/admin/vetements/types', headers: superAdmin, payload: { nom: `Gilet ${suffixe}`, poidsMoyenGrammes: 500 } })).json().id;
    const matiereId = (await app.inject({ method: 'POST', url: '/api/admin/vetements/matieres', headers: superAdmin, payload: { nom: `Laine ${suffixe}`, facteurEmissionKgCo2ParKg: 10 } })).json().id;
    expect(typeId).toEqual(expect.any(Number));
    expect(matiereId).toEqual(expect.any(Number));
    const vet = await app.inject({
      method: 'POST',
      url: `/api/admin/vetements/quantites/${JOUR}/incrementer`,
      headers: benevole,
      payload: { typeId, matiereId, sens: 'recuperes', delta: 2 },
    });
    expect(vet.statusCode).toBe(200);
    expect((await app.inject({ method: 'GET', url: '/api/admin/vetements/bilan', headers: benevole })).statusCode).toBe(200);

    const saisie = await app.prisma.actionAdmin.findFirst({ where: { auteur: prenomBenevole, action: 'SAISIE_COMPTEUR_JOUR' } });
    expect(saisie).not.toBeNull();
  });

  it.each([
    ['GET', '/api/admin/stats'],
    ['GET', '/api/admin/participants'],
    ['GET', '/api/admin/journal'],
    ['GET', '/api/admin/securite'],
    ['GET', '/api/admin/maintenance'],
    ['PUT', '/api/admin/maintenance'],
    ['GET', '/api/admin/export/participants'],
    ['GET', '/api/admin/evenements'],
    ['GET', '/api/admin/comptes-admin'],
    ['POST', '/api/admin/vetements/types'],
    ['PATCH', '/api/admin/vetements/matieres/1'],
    ['DELETE', '/api/admin/vetements/types/1'],
    ['DELETE', '/api/admin/participants/00000000-0000-0000-0000-000000000000'],
  ])('refuse %s %s et le journalise', async (method, url) => {
    const res = await app.inject({ method: method as 'GET', url, headers: benevole, payload: method === 'GET' ? undefined : {} });
    expect(res.statusCode).toBe(403);
    expect(res.json().code).toBe('ACCES_REFUSE');
  });

  it('trace les refus dans le journal de sécurité', async () => {
    const refus = await app.prisma.evenementSecurite.count({ where: { type: 'ADMIN_ACCES_BENEVOLE_REFUSE' } });
    expect(refus).toBeGreaterThan(0);
  });

  it('chaque route de la liste blanche existe vraiment', () => {
    const routes = app.printRoutes({ commonPrefix: false });
    for (const r of ROUTES_BENEVOLE) {
      const chemin = r.split(' ')[1].split('/').filter(Boolean).at(-1)!;
      expect(routes).toContain(chemin);
    }
  });

  it('un admin classique garde l’accès à tout', async () => {
    const admin = await connecterAdmin(app, { prenom: 'AdminClassique', role: 'ADMIN' });
    expect((await app.inject({ method: 'GET', url: '/api/admin/stats', headers: { authorization: admin.authorization } })).statusCode).toBe(200);
  });
});

describe('limite de comptes bénévoles', () => {
  it('compte les bénévoles à part des admins', async () => {
    // Seul ce fichier crée des bénévoles : la limite est fixée par rapport au nombre actuel.
    const actuels = await app.prisma.compteAdmin.count({ where: { role: 'BENEVOLE' } });
    const limitee = await buildApp(
      loadConfig({ ...process.env, ADMIN_ENABLED: 'true', ADMIN_LIMITE_BENEVOLES: String(actuels + 1), ADMIN_LIMITE_COMPTES: '1000', ADMIN_RATE_LIMIT_CONNEXION_PAR_MIN: '50' }),
    );
    try {
      const chef = { authorization: (await connecterAdmin(limitee, { prenom: 'ChefLimiteBenevoles' })).authorization };
      const cree = await limitee.inject({ method: 'POST', url: '/api/admin/comptes-admin', headers: chef, payload: { prenom: `Bene-${Date.now()}`, role: 'BENEVOLE' } });
      expect(cree.statusCode).toBe(201);
      expect(cree.json().role).toBe('BENEVOLE');
      expect(cree.json().motDePasse).toEqual(expect.any(String));

      const deTrop = await limitee.inject({ method: 'POST', url: '/api/admin/comptes-admin', headers: chef, payload: { prenom: `Bene2-${Date.now()}`, role: 'BENEVOLE' } });
      expect(deTrop.statusCode).toBe(409);
      expect(deTrop.json().code).toBe('LIMITE_COMPTES_ATTEINTE');

      // La limite des bénévoles n'empêche pas de créer un admin.
      const admin = await limitee.inject({ method: 'POST', url: '/api/admin/comptes-admin', headers: chef, payload: { prenom: `Adm-${Date.now()}`, role: 'ADMIN' } });
      expect(admin.statusCode).toBe(201);
    } finally {
      await limitee.close();
    }
  });

  it('vaut 5 par défaut', () => {
    expect(loadConfig({ ...process.env }).ADMIN_LIMITE_BENEVOLES).toBe(5);
  });
});

describe('statistiques : rappels et évènement', () => {
  it('compte les abonnés aux rappels et les relances envoyées', async () => {
    const p = await participant();
    await app.prisma.pushAbonnement.create({ data: { participantId: p.id, endpoint: `https://push.exemple/${p.id}`, p256dh: 'x', auth: 'y' } });
    await app.prisma.relance.create({ data: { participantId: p.id, etape: 'J7' } });

    const s = (await app.inject({ method: 'GET', url: '/api/admin/stats', headers: superAdmin })).json();
    expect(s.rappels.participantsAbonnes).toBeGreaterThanOrEqual(1);
    expect(s.rappels.abonnements).toBeGreaterThanOrEqual(s.rappels.participantsAbonnes);
    const j7 = s.rappels.etapes.find((e: { etape: string }) => e.etape === 'J7');
    expect(j7.relancesEnvoyees).toBeGreaterThanOrEqual(1);
    expect(s.rappels.etapes.map((e: { etape: string }) => e.etape)).toEqual(['J7', 'J14']);
  });

  it('résume l’évènement (personnes venues, vêtements)', async () => {
    const s = (await app.inject({ method: 'GET', url: '/api/admin/stats', headers: superAdmin })).json();
    expect(s.evenement.joursDeStand).toBeGreaterThanOrEqual(1);
    expect(s.evenement.personnesVenues).toBeGreaterThanOrEqual(4);
    expect(s.evenement.vetementsRecuperes).toBeGreaterThanOrEqual(2);
    expect(typeof s.evenement.co2EviteVetementsKg).toBe('number');
    expect(typeof s.evenement.donneesVetementsIncompletes).toBe('boolean');
  });
});

describe('journal : filtres et export', () => {
  it('filtre par auteur, action et période', async () => {
    const parAuteur = (await app.inject({ method: 'GET', url: `/api/admin/journal?auteur=${prenomBenevole}`, headers: superAdmin })).json();
    expect(parAuteur.length).toBeGreaterThan(0);
    expect(parAuteur.every((a: { auteur: string }) => a.auteur === prenomBenevole)).toBe(true);

    const parAction = (await app.inject({ method: 'GET', url: `/api/admin/journal?auteur=${prenomBenevole}&action=SAISIE_COMPTEUR_JOUR`, headers: superAdmin })).json();
    expect(parAction.length).toBeGreaterThan(0);
    expect(parAction.every((a: { action: string }) => a.action === 'SAISIE_COMPTEUR_JOUR')).toBe(true);

    const passe = (await app.inject({ method: 'GET', url: `/api/admin/journal?auteur=${prenomBenevole}&du=2000-01-01&au=2000-01-31`, headers: superAdmin })).json();
    expect(passe).toEqual([]);

    const aujourdhui = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Paris' }).format(new Date());
    const duJour = (await app.inject({ method: 'GET', url: `/api/admin/journal?auteur=${prenomBenevole}&du=${aujourdhui}&au=${aujourdhui}`, headers: superAdmin })).json();
    expect(duJour.length).toBe(parAuteur.length);

    const invalide = await app.inject({ method: 'GET', url: '/api/admin/journal?du=hier', headers: superAdmin });
    expect(invalide.statusCode).toBe(400);
  });

  it('liste les auteurs et actions disponibles', async () => {
    const f = (await app.inject({ method: 'GET', url: '/api/admin/journal/filtres', headers: superAdmin })).json();
    expect(f.auteurs).toContain(prenomBenevole);
    expect(f.actions).toContain('SAISIE_COMPTEUR_JOUR');
  });

  it('exporte le journal en CSV sans jamais le pseudo d’un participant', async () => {
    const p = await participant();
    const exclu = await app.inject({ method: 'PATCH', url: `/api/admin/participants/${p.id}`, headers: superAdmin, payload: { exclu: true } });
    expect(exclu.statusCode).toBe(204);

    const res = await app.inject({ method: 'GET', url: '/api/admin/export/journal', headers: superAdmin });
    expect(res.statusCode).toBe(200);
    expect(res.headers['content-type']).toContain('text/csv');
    expect(res.body.split('\n')[0]).toContain('auteur');
    expect(res.body).toContain('EXCLURE_DES_STATISTIQUES');
    expect(res.body).not.toContain(p.pseudo);
  });
});
