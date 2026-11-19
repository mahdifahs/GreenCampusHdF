import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { buildApp } from '../src/app.js';
import { loadConfig } from '../src/config.js';
import { connecterAdmin } from './aide-admin.js';
import { avecJeton, jetonDe } from './aide-session.js';

// Procédure « changer JWT_SECRET » (SECURITY.md) : ce qu'elle produit réellement.
type App = Awaited<ReturnType<typeof buildApp>>;
let avant: App;
let apres: App;

beforeAll(async () => {
  const config = { ...process.env, ADMIN_ENABLED: 'true' };
  avant = await buildApp(loadConfig({ ...config, JWT_SECRET: 'ancien-secret-de-test-assez-long-0123456789' }));
  apres = await buildApp(loadConfig({ ...config, JWT_SECRET: 'nouveau-secret-de-test-assez-long-9876543210' }));
});

afterAll(async () => {
  await avant.close();
  await apres.close();
});

describe('changement de JWT_SECRET', () => {
  it('déconnecte les participants, qui retrouvent leur compte et leurs données avec leur code', async () => {
    const filiere = (await avant.inject({ method: 'GET', url: '/api/filieres' })).json()[0];
    const compte = avecJeton(
      await avant.inject({ method: 'POST', url: '/api/participants', payload: { filiereId: filiere.id, annee: 'M1', consentement: true } }),
    );
    const ancienJeton = { authorization: `Bearer ${compte.token}` };
    expect((await avant.inject({ method: 'GET', url: '/api/me', headers: ancienJeton })).statusCode).toBe(200);

    const refuse = await apres.inject({ method: 'GET', url: '/api/me', headers: ancienJeton });
    expect(refuse.statusCode).toBe(401);
    expect(refuse.json().code).toBe('SESSION_INVALIDE');

    const reconnexion = await apres.inject({ method: 'POST', url: '/api/sessions', payload: { codeRecuperation: compte.codeRecuperation } });
    expect(reconnexion.statusCode).toBe(200);
    const moi = await apres.inject({ method: 'GET', url: '/api/me', headers: { authorization: `Bearer ${jetonDe(reconnexion)}` } });
    expect(moi.json().pseudo).toBe(compte.participant.pseudo);
  });

  it('ferme aussi les sessions admin ouvertes', async () => {
    const admin = await connecterAdmin(avant);
    expect((await apres.inject({ method: 'GET', url: '/api/admin/moi', headers: { authorization: admin.authorization } })).statusCode).toBe(401);
  });
});
