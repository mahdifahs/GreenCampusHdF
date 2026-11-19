import { afterEach, describe, expect, it, vi } from 'vitest';
import { buildApp } from '../src/app.js';
import { loadConfig } from '../src/config.js';
import { VerrouEchecs } from '../src/lib/verrou.js';
import { VERROU_ADMIN } from '../src/modules/admin/routes.js';
import { connecterAdmin, MOT_DE_PASSE_ADMIN_TEST } from './aide-admin.js';

// Variables dont la valeur par défaut dépend de l'environnement : retirées pour tester ces valeurs par défaut
// (le .env local de développement les définit).
const SANS_REGLAGES = { DOCS_ENABLED: undefined, DEMO_ENABLED: undefined, TRUST_PROXY: undefined };

// Configuration de production valide, à dégrader champ par champ dans les tests.
const PRODUCTION = {
  ...process.env,
  ...SANS_REGLAGES,
  NODE_ENV: 'production',
  JWT_SECRET: 'Zq8sK2vN4pR7tW1xY5bC9dF3gH6jL0mQ-secret-solide',
  CORS_ORIGIN: 'https://greencampus.example.org',
};

const apps: Awaited<ReturnType<typeof buildApp>>[] = [];
async function app(env: Record<string, string | undefined> = {}) {
  const a = await buildApp(loadConfig({ ...process.env, ...env }));
  apps.push(a);
  return a;
}
afterEach(async () => {
  vi.restoreAllMocks();
  while (apps.length) await apps.pop()!.close();
});

describe('A02 : configuration de production', () => {
  it('accepte une configuration de production correcte, sans documentation ni démo par défaut', () => {
    const c = loadConfig(PRODUCTION);
    expect(c.DOCS_ENABLED).toBe(false);
    expect(c.DEMO_ENABLED).toBe(false);
    expect(c.TRUST_PROXY).toBe(1);
  });

  it('garde la documentation et la démo en développement', () => {
    const c = loadConfig({ ...process.env, ...SANS_REGLAGES, NODE_ENV: 'development' });
    expect(c.DOCS_ENABLED).toBe(true);
    expect(c.DEMO_ENABLED).toBe(true);
    expect(c.TRUST_PROXY).toBe(0);
  });

  it('refuse de démarrer avec le secret d’exemple de .env.example', () => {
    expect(() => loadConfig({ ...PRODUCTION, JWT_SECRET: 'a-remplacer-par-un-secret-de-plus-de-32-caracteres' })).toThrow(/JWT_SECRET/);
  });

  it('exige des origines CORS en https:// en production, et refuse « * » partout', () => {
    expect(() => loadConfig({ ...PRODUCTION, CORS_ORIGIN: 'http://greencampus.example.org' })).toThrow(/https/);
    expect(() => loadConfig({ ...process.env, CORS_ORIGIN: '*' })).toThrow(/\*/);
  });

  it('n’expose pas /docs quand la documentation est désactivée', async () => {
    const a = await app({ DOCS_ENABLED: 'false' });
    expect((await a.inject({ method: 'GET', url: '/docs' })).statusCode).toBe(404);
  });
});

describe('A02 / A05 : en-têtes de sécurité et CSP', () => {
  it('envoie une CSP stricte sur l’API et les pages', async () => {
    const a = await app({ ADMIN_ENABLED: 'true' });
    for (const url of ['/api/filieres', '/admin/']) {
      const res = await a.inject({ method: 'GET', url });
      const csp = res.headers['content-security-policy'] as string;
      expect(csp, url).toContain("default-src 'self'");
      expect(csp).toContain("script-src 'self'");
      expect(csp).toContain("object-src 'none'");
      expect(csp).toContain("frame-ancestors 'none'");
      expect(csp).not.toContain('unsafe-inline');
      // Hors production, pas de passage forcé en HTTPS (casserait http://localhost).
      expect(csp).not.toContain('upgrade-insecure-requests');
      expect(res.headers['x-content-type-options']).toBe('nosniff');
    }
  });

  it('refuse les requêtes trop volumineuses', async () => {
    const a = await app();
    const res = await a.inject({
      method: 'POST',
      url: '/api/participants',
      headers: { 'content-type': 'application/json' },
      payload: JSON.stringify({ remplissage: 'x'.repeat(300 * 1024) }),
    });
    expect(res.statusCode).toBe(413);
  });
});

describe('A02 / A07 : IP du client derrière le reverse proxy', () => {
  // Derrière Caddy, X-Forwarded-For vaut « <ce qu'envoie le client>, <IP réelle ajoutée par Caddy> ».
  const essai = (a: Awaited<ReturnType<typeof buildApp>>, xff: string) =>
    a.inject({ method: 'POST', url: '/api/sessions', headers: { 'x-forwarded-for': xff }, payload: { codeRecuperation: 'ZZZZ-ZZZZ-ZZZZ-ZZZZ' } });

  it('ne se laisse pas contourner par une fausse IP envoyée par le client', async () => {
    const a = await app({ TRUST_PROXY: '1', RATE_LIMIT_CONNEXION_PAR_MIN: '2' });
    // Le client change sa « fausse » IP à chaque fois, mais Caddy ajoute toujours la même vraie IP.
    const statuts = [];
    for (const fausse of ['1.1.1.1', '2.2.2.2', '3.3.3.3']) statuts.push((await essai(a, `${fausse}, 203.0.113.7`)).statusCode);
    expect(statuts).toEqual([401, 401, 429]);
  });

  it('distingue bien deux vrais clients différents', async () => {
    const a = await app({ TRUST_PROXY: '1', RATE_LIMIT_CONNEXION_PAR_MIN: '1' });
    expect((await essai(a, '203.0.113.7')).statusCode).toBe(401);
    expect((await essai(a, '203.0.113.8')).statusCode).toBe(401);
    expect((await essai(a, '203.0.113.7')).statusCode).toBe(429);
  });
});

describe('A07 : connexion à l’administration', () => {
  it('verrouille la connexion admin après trop d’échecs, même depuis des IP différentes', async () => {
    const a = await app({ TRUST_PROXY: '1', ADMIN_ENABLED: 'true' });
    await connecterAdmin(a, { prenom: 'Test' });
    const connexion = (ip: string, motDePasse: string) =>
      a.inject({ method: 'POST', url: '/api/admin/session', headers: { 'x-forwarded-for': ip }, payload: { motDePasse, nom: 'Test' } });

    for (let i = 0; i < VERROU_ADMIN.seuil; i++) {
      expect((await connexion(`198.51.100.${i}`, 'mauvais')).statusCode).toBe(401);
    }
    // Même le bon mot de passe est refusé pendant le verrou.
    const bloque = await connexion('198.51.100.250', MOT_DE_PASSE_ADMIN_TEST);
    expect(bloque.statusCode).toBe(429);
    expect(bloque.json().code).toBe('ADMIN_VERROUILLE');
  });

  it('libère le verrou une fois la durée écoulée', () => {
    const v = new VerrouEchecs(3, 60_000, 10 * 60_000);
    v.echec(0);
    v.echec(1000);
    expect(v.estVerrouille(1000)).toBe(false);
    v.echec(2000);
    expect(v.estVerrouille(2000)).toBe(true);
    expect(v.minutesRestantes(2000)).toBe(10);
    expect(v.estVerrouille(2000 + 10 * 60_000)).toBe(false);
  });

  it('ne compte pas les échecs trop anciens', () => {
    const v = new VerrouEchecs(3, 60_000, 10 * 60_000);
    v.echec(0);
    v.echec(1000);
    v.echec(120_000); // les deux premiers sont sortis de la fenêtre d'une minute
    expect(v.estVerrouille(120_000)).toBe(false);
  });

  it('n’est inactif (donc oubliable) que sans échec récent ni verrou en cours', () => {
    const v = new VerrouEchecs(2, 60_000, 10 * 60_000);
    expect(v.estInactif(0)).toBe(true);
    v.echec(0);
    expect(v.estInactif(30_000)).toBe(false); // échec encore dans la fenêtre
    expect(v.estInactif(61_000)).toBe(true);
    v.echec(100_000);
    v.echec(101_000); // verrouillé jusqu'à 701 000
    expect(v.estInactif(200_000)).toBe(false); // plus d'échec en mémoire, mais verrou en cours
    expect(v.estInactif(701_000)).toBe(true);
  });
});

describe('A10 : supervision', () => {
  it('/health vérifie la base de données', async () => {
    const a = await app();
    const res = await a.inject({ method: 'GET', url: '/health' });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ status: 'ok', base: 'ok' });
  });

  it('/health répond 503 si la base est injoignable', async () => {
    const a = await app();
    vi.spyOn(a.prisma, '$queryRaw').mockRejectedValue(new Error('connexion refusée'));
    const res = await a.inject({ method: 'GET', url: '/health' });
    expect(res.statusCode).toBe(503);
    expect(res.json()).toEqual({ status: 'indisponible', base: 'injoignable' });
  });
});
