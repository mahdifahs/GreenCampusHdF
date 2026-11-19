import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { buildApp } from '../src/app.js';
import { loadConfig } from '../src/config.js';
import { versCsv } from '../src/lib/csv.js';
import { connecterAdmin, MOT_DE_PASSE_ADMIN_TEST } from './aide-admin.js';
import { avecJeton } from './aide-session.js';

let app: Awaited<ReturnType<typeof buildApp>>;
let admin: Record<string, string>;

beforeAll(async () => {
  app = await buildApp(loadConfig({ ...process.env, ADMIN_ENABLED: 'true' }));
  admin = await connecterAdmin(app);
});

afterAll(() => app.close());

async function participantAvecActivite() {
  const filieres = (await app.inject({ method: 'GET', url: '/api/filieres' })).json();
  const p = avecJeton(
    await app.inject({ method: 'POST', url: '/api/participants', payload: { filiereId: filieres[0].id, annee: 'L3', consentement: true } }),
  );
  const headers = { authorization: `Bearer ${p.token}` };
  await app.inject({ method: 'POST', url: '/api/bilans', headers, payload: { type: 'STAND', situation: { 'logement . type': 'appartement' } } });
  return { headers, id: p.participant.id as string, pseudo: p.participant.pseudo as string, code: p.codeRecuperation as string };
}

describe('CSV', () => {
  it('produit un fichier lisible par Excel en français', () => {
    const csv = versCsv(['nom', 'valeur', 'actif'], [['Défi « vélo »', 12.5, true], ['a;b', null, false]]);
    expect(csv.startsWith('﻿')).toBe(true); // BOM pour les accents
    expect(csv).toBe('﻿nom;valeur;actif\r\nDéfi « vélo »;12,5;oui\r\n"a;b";;non\r\n');
  });

  it('neutralise les formules (injection CSV) et échappe les guillemets', () => {
    const csv = versCsv(['x'], [['=HYPERLINK("http://pirate")'], ['+1'], ['-2'], ['@SUM(A1)'], ['il dit "bonjour"']]);
    const lignes = csv.slice(1).trim().split('\r\n').slice(1);
    expect(lignes).toEqual(["\"'=HYPERLINK(\"\"http://pirate\"\")\"", "'+1", "'-2", "'@SUM(A1)", '"il dit ""bonjour"""']);
  });
});

describe('accès à l’administration', () => {
  it('refuse un mauvais mot de passe', async () => {
    const res = await app.inject({ method: 'POST', url: '/api/admin/session', payload: { motDePasse: 'mauvais', nom: 'Testeur' } });
    expect(res.statusCode).toBe(401);
    expect(res.json().code).toBe('IDENTIFIANTS_INVALIDES');
  });

  it('refuse un prénom inconnu', async () => {
    const res = await app.inject({ method: 'POST', url: '/api/admin/session', payload: { motDePasse: MOT_DE_PASSE_ADMIN_TEST, nom: 'Inconnu' } });
    expect(res.statusCode).toBe(401);
    expect(res.json().code).toBe('IDENTIFIANTS_INVALIDES');
  });

  it('sépare strictement les rôles admin et participant', async () => {
    const { headers } = await participantAvecActivite();
    expect((await app.inject({ method: 'GET', url: '/api/admin/stats' })).statusCode).toBe(401);
    expect((await app.inject({ method: 'GET', url: '/api/admin/stats', headers })).statusCode).toBe(403);
    // Un jeton admin n'ouvre pas les routes des participants.
    expect((await app.inject({ method: 'GET', url: '/api/me', headers: admin })).statusCode).toBe(401);
  });

  it('n’existe pas quand ADMIN_ENABLED n’est pas activé', async () => {
    const sansAdmin = await buildApp(loadConfig({ ...process.env, ADMIN_ENABLED: 'false' }));
    const res = await sansAdmin.inject({ method: 'POST', url: '/api/admin/session', payload: { motDePasse: 'x', nom: 'Testeur' } });
    await sansAdmin.close();
    expect(res.statusCode).toBe(404);
  });
});

describe('statistiques et défis', () => {
  it('donne l’activité du jour et les compteurs', async () => {
    await participantAvecActivite();
    const s = (await app.inject({ method: 'GET', url: '/api/admin/stats', headers: admin })).json();
    expect(s.participants).toBeGreaterThan(0);
    const aujourdhui = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Paris' }).format(new Date());
    expect(s.quotidien.find((j: { date: string }) => j.date === aujourdhui).bilans).toBeGreaterThan(0);
    expect(s.defis.length).toBe(22);
    expect(s.suivis.map((e: { etape: string }) => e.etape)).toEqual(['J7', 'J14']);
  });

  it('désactive un défi : il disparaît du catalogue des étudiants', async () => {
    const { headers } = await participantAvecActivite();
    const { defis } = (await app.inject({ method: 'GET', url: '/api/defis', headers })).json();
    const cible = defis[0];

    expect((await app.inject({ method: 'PATCH', url: `/api/admin/defis/${cible.id}`, headers: admin, payload: { actif: false } })).statusCode).toBe(204);
    const apres = (await app.inject({ method: 'GET', url: '/api/defis', headers })).json();
    expect(apres.defis.some((d: { id: number }) => d.id === cible.id)).toBe(false);
    const engagement = await app.inject({ method: 'POST', url: '/api/engagements', headers, payload: { defiId: cible.id } });
    expect(engagement.json().code).toBe('DEFI_INCONNU');

    await app.inject({ method: 'PATCH', url: `/api/admin/defis/${cible.id}`, headers: admin, payload: { actif: true } });
    expect((await app.inject({ method: 'PATCH', url: '/api/admin/defis/99999', headers: admin, payload: { actif: true } })).statusCode).toBe(404);
  });
});

describe('exports CSV', () => {
  it('exporte les bilans sans pseudo ni code de récupération', async () => {
    const p = await participantAvecActivite();
    const res = await app.inject({ method: 'GET', url: '/api/admin/export/bilans', headers: admin });
    expect(res.statusCode).toBe(200);
    expect(res.headers['content-type']).toContain('text/csv');
    expect(res.headers['content-disposition']).toMatch(/attachment; filename="greencampus-bilans-\d{4}-\d{2}-\d{2}\.csv"/);
    const lignes = res.body.replace('﻿', '').trim().split('\r\n');
    expect(lignes[0]).toBe(
      'bilan;participant;filiere;annee;type;date;nb_reponses;total_kg_co2e_an;transport_kg;alimentation_kg;logement_kg;divers_kg;servicesSocietaux_kg;exclu',
    );
    expect(lignes.some((l) => l.includes(p.id))).toBe(true);
    expect(res.body).not.toContain(p.pseudo);
    expect(res.body).not.toContain(p.code.slice(0, 9));
  });

  it('propose tous les jeux et refuse les autres', async () => {
    for (const jeu of ['participants', 'bilans', 'engagements', 'suivis', 'quotidien', 'stand', 'vetements']) {
      const res = await app.inject({ method: 'GET', url: `/api/admin/export/${jeu}`, headers: admin });
      expect(res.statusCode, jeu).toBe(200);
      expect(res.body.startsWith('﻿')).toBe(true);
    }
    expect((await app.inject({ method: 'GET', url: '/api/admin/export/codes', headers: admin })).statusCode).toBe(400);
  });
});
