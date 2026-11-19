import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { buildApp } from '../src/app.js';
import { loadConfig } from '../src/config.js';
import { jetonDe } from './aide-session.js';

let app: Awaited<ReturnType<typeof buildApp>>;
let filiereId: number;

beforeAll(async () => {
  app = await buildApp(loadConfig({ ...process.env }));
  const res = await app.inject({ method: 'GET', url: '/api/filieres' });
  filiereId = res.json()[0].id;
});

afterAll(() => app.close());

async function inscrire(body: Record<string, unknown> = { filiereId, annee: 'M2', consentement: true }) {
  return app.inject({ method: 'POST', url: '/api/participants', payload: body });
}

const auth = (token: string) => ({ authorization: `Bearer ${token}` });

describe('inscription anonyme', () => {
  it('crée un participant avec pseudo, code de récupération et jeton', async () => {
    const res = await inscrire();
    expect(res.statusCode).toBe(201);
    const body = res.json();
    expect(body.participant.pseudo).toBeTruthy();
    expect(body.participant.annee).toBe('M2');
    expect(body.codeRecuperation).toMatch(/^.{4}-.{4}-.{4}-.{4}$/);
    expect(body.token).toBeUndefined();
    expect(jetonDe(res)).toBeTruthy();
    // Le hash et le sélecteur ne doivent jamais sortir de l'API.
    expect(JSON.stringify(body)).not.toContain('codeVerifHash');
  });

  it('exige le consentement', async () => {
    const res = await inscrire({ filiereId, annee: 'M2', consentement: false });
    expect(res.statusCode).toBe(400);
    expect(res.json().code).toBe('REQUETE_INVALIDE');
    expect(res.json().details).toEqual([expect.objectContaining({ champ: '/consentement' })]);
  });

  it('répond en français à un JSON mal formé et à une route inconnue', async () => {
    const json = await app.inject({
      method: 'POST',
      url: '/api/participants',
      headers: { 'content-type': 'application/json' },
      payload: '{pas du json',
    });
    expect(json.statusCode).toBe(400);
    expect(json.json().message).toMatch(/JSON valide/);
    const absente = await app.inject({ method: 'GET', url: '/api/nexistepas' });
    expect(absente.statusCode).toBe(404);
    expect(absente.json().code).toBe('INTROUVABLE');
  });

  it('refuse une filière inconnue', async () => {
    const res = await inscrire({ filiereId: 999999, annee: 'L1', consentement: true });
    expect(res.statusCode).toBe(400);
    expect(res.json().code).toBe('FILIERE_INCONNUE');
  });
});

describe('reconnexion par code', () => {
  it('redonne une session avec le bon code, même saisi en minuscules sans tirets', async () => {
    const { codeRecuperation, participant } = (await inscrire()).json();
    const res = await app.inject({
      method: 'POST',
      url: '/api/sessions',
      payload: { codeRecuperation: codeRecuperation.toLowerCase().replaceAll('-', ' ') },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().participant.id).toBe(participant.id);
  });

  it('refuse un mauvais code sans dire pourquoi', async () => {
    const { codeRecuperation } = (await inscrire()).json();
    const faux = codeRecuperation.slice(0, -1) + (codeRecuperation.endsWith('0') ? '1' : '0');
    for (const code of [faux, 'ZZZZ-ZZZZ-ZZZZ-ZZZZ', 'nimporte quoi']) {
      const res = await app.inject({ method: 'POST', url: '/api/sessions', payload: { codeRecuperation: code } });
      expect(res.statusCode).toBe(401);
      expect(res.json().code).toBe('CODE_INVALIDE');
    }
  });
});

describe('profil', () => {
  it('protège /api/me', async () => {
    expect((await app.inject({ method: 'GET', url: '/api/me' })).statusCode).toBe(401);
    expect((await app.inject({ method: 'GET', url: '/api/me', headers: auth('abc') })).statusCode).toBe(401);
  });

  it('lit et modifie le profil', async () => {
    const token = jetonDe(await inscrire());
    const me = await app.inject({ method: 'GET', url: '/api/me', headers: auth(token) });
    expect(me.statusCode).toBe(200);

    const patch = await app.inject({ method: 'PATCH', url: '/api/me', headers: auth(token), payload: { annee: 'L3' } });
    expect(patch.statusCode).toBe(200);
    expect(patch.json().annee).toBe('L3');
  });

  it('supprime le compte et invalide la session et le code (RGPD)', async () => {
    const inscription = await inscrire();
    const token = jetonDe(inscription);
    const { codeRecuperation } = inscription.json();
    const del = await app.inject({ method: 'DELETE', url: '/api/me', headers: auth(token) });
    expect(del.statusCode).toBe(204);

    expect((await app.inject({ method: 'GET', url: '/api/me', headers: auth(token) })).statusCode).toBe(401);
    const login = await app.inject({ method: 'POST', url: '/api/sessions', payload: { codeRecuperation } });
    expect(login.statusCode).toBe(401);
  });
});

describe('limitation de débit', () => {
  it('bloque au-delà de la limite de connexions par minute', async () => {
    const limitee = await buildApp(loadConfig({ ...process.env, RATE_LIMIT_CONNEXION_PAR_MIN: '3' }));
    const codes = [];
    for (let i = 0; i < 4; i++) {
      const res = await limitee.inject({
        method: 'POST',
        url: '/api/sessions',
        payload: { codeRecuperation: 'ZZZZ-ZZZZ-ZZZZ-ZZZZ' },
      });
      codes.push(res.statusCode);
    }
    await limitee.close();
    expect(codes).toEqual([401, 401, 401, 429]);
  });
});
