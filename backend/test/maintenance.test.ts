import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { buildApp } from '../src/app.js';
import { loadConfig } from '../src/config.js';
import { connecterAdmin } from './aide-admin.js';
import { jetonDe } from './aide-session.js';

let app: Awaited<ReturnType<typeof buildApp>>;
let admin: { authorization: string; prenom: string };
let participant: { authorization: string };

beforeAll(async () => {
  app = await buildApp(loadConfig({ ...process.env, ADMIN_ENABLED: 'true' }));
  admin = await connecterAdmin(app, { prenom: 'Maintenance', role: 'ADMIN' });
  const filiere = (await app.inject({ method: 'GET', url: '/api/filieres' })).json()[0];
  const inscription = await app.inject({
    method: 'POST',
    url: '/api/participants',
    payload: { filiereId: filiere.id, annee: 'L1', consentement: true },
  });
  participant = { authorization: `Bearer ${jetonDe(inscription)}` };
});

// Les fichiers de test se suivent sur la même base : ne jamais laisser le site en maintenance.
afterAll(async () => {
  await app.prisma.maintenance.deleteMany();
  await app.close();
});

const basculer = (actif: boolean) =>
  app.inject({ method: 'PUT', url: '/api/admin/maintenance', headers: { authorization: admin.authorization }, payload: { actif } });

describe('mode maintenance', () => {
  it('est coupé par défaut', async () => {
    expect((await app.inject({ method: 'GET', url: '/api/statut' })).json()).toEqual({ maintenance: false });
    expect((await app.inject({ method: 'GET', url: '/api/filieres' })).statusCode).toBe(200);
  });

  it('un admin simple peut l’activer : l’API publique et participant répond 503, l’admin reste accessible', async () => {
    const res = await basculer(true);
    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({ actif: true, par: admin.prenom });
    expect(res.json().depuis).toEqual(expect.any(String));

    expect((await app.inject({ method: 'GET', url: '/api/statut' })).json()).toEqual({ maintenance: true });

    for (const requete of [
      { method: 'GET', url: '/api/filieres' },
      { method: 'GET', url: '/api/tableau-de-bord' },
      { method: 'POST', url: '/api/participants', payload: { consentement: true } },
      { method: 'GET', url: '/api/me', headers: participant },
      { method: 'GET', url: '/api/route-inexistante' },
    ] as const) {
      const r = await app.inject(requete);
      expect(r.statusCode, requete.url).toBe(503);
      expect(r.json().code).toBe('MAINTENANCE');
      expect(r.headers['retry-after']).toBeDefined();
    }

    const stats = await app.inject({ method: 'GET', url: '/api/admin/stats', headers: { authorization: admin.authorization } });
    expect(stats.statusCode).toBe(200);
    expect((await app.inject({ method: 'GET', url: '/health' })).statusCode).toBe(200);
    // Se déconnecter reste possible (cookie effacé, aucune écriture en base).
    expect((await app.inject({ method: 'DELETE', url: '/api/sessions' })).statusCode).toBe(204);
  });

  it('se coupe depuis l’admin et l’API répond de nouveau', async () => {
    const res = await basculer(false);
    expect(res.json()).toEqual({ actif: false, depuis: null, par: null });
    expect((await app.inject({ method: 'GET', url: '/api/statut' })).json()).toEqual({ maintenance: false });
    expect((await app.inject({ method: 'GET', url: '/api/me', headers: participant })).statusCode).toBe(200);
  });

  it('journalise chaque bascule (et pas une demande qui ne change rien)', async () => {
    await basculer(true);
    await basculer(true);
    await basculer(false);
    const actions = await app.prisma.actionAdmin.findMany({ where: { auteur: admin.prenom }, orderBy: { createdAt: 'asc' } });
    expect(actions.map((a) => [a.action, a.cible])).toEqual([
      ['MAINTENANCE_ACTIVEE', 'site'],
      ['MAINTENANCE_DESACTIVEE', 'site'],
      ['MAINTENANCE_ACTIVEE', 'site'],
      ['MAINTENANCE_DESACTIVEE', 'site'],
    ]);
  });

  it('exige une session admin pour lire ou basculer', async () => {
    expect((await app.inject({ method: 'PUT', url: '/api/admin/maintenance', payload: { actif: true } })).statusCode).toBe(401);
    expect((await app.inject({ method: 'PUT', url: '/api/admin/maintenance', headers: participant, payload: { actif: true } })).statusCode).toBe(403);
    expect((await app.inject({ method: 'GET', url: '/api/statut' })).json()).toEqual({ maintenance: false });
  });

});
