import { randomBytes } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { buildApp } from '../src/app.js';
import { loadConfig } from '../src/config.js';
import { connecterAdmin } from './aide-admin.js';
import { jetonDe } from './aide-session.js';

// Session dans un cookie HttpOnly (SECURITY.md §4) et protection CSRF par l'en-tête Origin.
type App = Awaited<ReturnType<typeof buildApp>>;
let app: App;
let filiereId: number;

// Le site tel que le voit l'API derrière Nginx (Host transmis tel quel).
const SITE = { host: 'greencampus.test' };
const MEME_ORIGINE = { ...SITE, origin: 'https://greencampus.test' };

beforeAll(async () => {
  // Beaucoup de connexions admin dans ce fichier : limite par minute relevée (sinon 429).
  app = await buildApp(loadConfig({ ...process.env, ADMIN_ENABLED: 'true', CORS_ORIGIN: 'http://localhost:5173', ADMIN_RATE_LIMIT_CONNEXION_PAR_MIN: '100' }));
  filiereId = (await app.inject({ method: 'GET', url: '/api/filieres' })).json()[0].id;
});

afterAll(async () => {
  await app.close();
});

const inscrire = () =>
  app.inject({ method: 'POST', url: '/api/participants', headers: SITE, payload: { filiereId, annee: 'L1', consentement: true } });
const cookieDe = (res: { cookies: { name: string }[] }, nom: string) => res.cookies.find((c) => c.name === nom) as Record<string, unknown>;

describe('cookie de session participant', () => {
  it('est posé à l’inscription, HttpOnly et SameSite=Strict, sans jeton dans le corps', async () => {
    const res = await inscrire();
    expect(res.statusCode).toBe(201);
    expect(res.json().token).toBeUndefined();
    const cookie = cookieDe(res, 'gc_session');
    expect(cookie).toMatchObject({ httpOnly: true, sameSite: 'Strict', path: '/api', maxAge: 60 * 24 * 3600 });
    // Hors production (http://localhost), pas de Secure : sinon le cookie ne serait jamais renvoyé.
    expect(cookie.secure).toBeUndefined();
  });

  it('est posé aussi à la reconnexion par code', async () => {
    const { codeRecuperation } = (await inscrire()).json();
    const res = await app.inject({ method: 'POST', url: '/api/sessions', headers: SITE, payload: { codeRecuperation } });
    expect(res.statusCode).toBe(200);
    expect(res.json().token).toBeUndefined();
    expect(jetonDe(res)).toBeTruthy();
  });

  it('suffit pour lire son profil', async () => {
    const inscription = await inscrire();
    const me = await app.inject({ method: 'GET', url: '/api/me', headers: SITE, cookies: { gc_session: jetonDe(inscription) } });
    expect(me.statusCode).toBe(200);
    expect(me.json().pseudo).toBe(inscription.json().participant.pseudo);
  });

  it('est effacé à la déconnexion, même sans session valide', async () => {
    const res = await app.inject({ method: 'DELETE', url: '/api/sessions', headers: SITE });
    expect(res.statusCode).toBe(204);
    const cookie = cookieDe(res, 'gc_session');
    expect(cookie.value).toBe('');
    expect(cookie.path).toBe('/api');
    expect((cookie.expires as Date).getTime()).toBeLessThan(Date.now());
  });

  it('est effacé à la suppression du compte', async () => {
    const jeton = jetonDe(await inscrire());
    const res = await app.inject({ method: 'DELETE', url: '/api/me', headers: MEME_ORIGINE, cookies: { gc_session: jeton } });
    expect(res.statusCode).toBe(204);
    expect(cookieDe(res, 'gc_session').value).toBe('');
  });
});

describe('protection CSRF (en-tête Origin)', () => {
  let jeton: string;
  beforeAll(async () => {
    jeton = jetonDe(await inscrire());
  });
  const modifier = (headers: Record<string, string>) =>
    app.inject({ method: 'PATCH', url: '/api/me', headers, cookies: { gc_session: jeton }, payload: { annee: 'L2' } });

  it('accepte une modification venant du site lui-même', async () => {
    expect((await modifier(MEME_ORIGINE)).statusCode).toBe(200);
  });

  it('accepte une origine de CORS_ORIGIN (serveur Vite en développement)', async () => {
    expect((await modifier({ ...SITE, origin: 'http://localhost:5173' })).statusCode).toBe(200);
  });

  it('refuse et journalise une modification venant d’un autre site', async () => {
    const res = await modifier({ ...SITE, origin: 'https://site-malveillant.example' });
    expect(res.statusCode).toBe(403);
    expect(res.json().code).toBe('ORIGINE_REFUSEE');
    const evenement = await app.prisma.evenementSecurite.findFirst({ where: { type: 'ORIGINE_REFUSEE' }, orderBy: { createdAt: 'desc' } });
    expect(evenement?.details).toMatchObject({ origine: 'https://site-malveillant.example' });
  });

  it('refuse une modification sans en-tête Origin', async () => {
    expect((await modifier(SITE)).statusCode).toBe(403);
  });

  it('refuse une origine invalide', async () => {
    expect((await modifier({ ...SITE, origin: 'null' })).statusCode).toBe(403);
  });

  it('laisse passer les lectures sans Origin', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/me', headers: SITE, cookies: { gc_session: jeton } });
    expect(res.statusCode).toBe(200);
  });

  it('ne s’applique pas au jeton Bearer, qu’un autre site ne peut pas envoyer', async () => {
    const res = await app.inject({ method: 'PATCH', url: '/api/me', headers: { ...SITE, authorization: `Bearer ${jeton}` }, payload: { annee: 'L3' } });
    expect(res.statusCode).toBe(200);
  });
});

describe('cookie de session admin', () => {
  it('est posé à la connexion, limité à /api/admin et sans durée (session du navigateur)', async () => {
    const admin = await connecterAdmin(app);
    const res = await app.inject({ method: 'POST', url: '/api/admin/session', headers: SITE, payload: { motDePasse: 'mot-de-passe-de-test-123', nom: admin.prenom } });
    expect(res.statusCode).toBe(204);
    const cookie = cookieDe(res, 'gc_admin');
    expect(cookie).toMatchObject({ httpOnly: true, sameSite: 'Strict', path: '/api/admin' });
    expect(cookie.maxAge).toBeUndefined();
    const moi = await app.inject({ method: 'GET', url: '/api/admin/moi', headers: SITE, cookies: { gc_admin: jetonDe(res, 'gc_admin') } });
    expect(moi.statusCode).toBe(200);
    expect(moi.json().prenom).toBe(admin.prenom);
  });

  it('ne se confond pas avec le cookie participant', async () => {
    const participant = jetonDe(await inscrire());
    // Cookie participant présenté à l'admin, sous le nom du cookie admin ou sous le sien.
    expect((await app.inject({ method: 'GET', url: '/api/admin/moi', headers: SITE, cookies: { gc_session: participant } })).statusCode).toBe(401);
    expect((await app.inject({ method: 'GET', url: '/api/admin/moi', headers: SITE, cookies: { gc_admin: participant } })).statusCode).toBe(403);
    // Et l'inverse : un jeton admin ne vaut pas session de participant.
    const admin = (await connecterAdmin(app)).authorization.slice('Bearer '.length);
    expect((await app.inject({ method: 'GET', url: '/api/me', headers: SITE, cookies: { gc_session: admin } })).statusCode).toBe(401);
  });

  it('protège aussi les modifications admin contre les autres sites', async () => {
    const admin = (await connecterAdmin(app)).authorization.slice('Bearer '.length);
    const requete = (origin: string) =>
      app.inject({ method: 'POST', url: '/api/admin/evenements', headers: { ...SITE, origin }, cookies: { gc_admin: admin }, payload: { titre: 'Test CSRF', dateDebut: '2031-01-01T10:00:00.000Z' } });
    expect((await requete('https://site-malveillant.example')).statusCode).toBe(403);
    const ok = await requete('https://greencampus.test');
    expect(ok.statusCode).toBe(201);
    await app.prisma.evenement.delete({ where: { id: ok.json().id } });
  });

  it('est effacé à la déconnexion', async () => {
    const res = await app.inject({ method: 'DELETE', url: '/api/admin/session', headers: SITE });
    expect(res.statusCode).toBe(204);
    expect(cookieDe(res, 'gc_admin')).toMatchObject({ value: '', path: '/api/admin' });
  });
});

describe('révocation côté serveur (table Session)', () => {
  const me = (jeton: string) => app.inject({ method: 'GET', url: '/api/me', headers: SITE, cookies: { gc_session: jeton } });

  it('un cookie participant recopié ne vaut plus rien après la déconnexion', async () => {
    const copie = jetonDe(await inscrire());
    expect((await me(copie)).statusCode).toBe(200);
    const sortie = await app.inject({ method: 'DELETE', url: '/api/sessions', headers: MEME_ORIGINE, cookies: { gc_session: copie } });
    expect(sortie.statusCode).toBe(204);
    const res = await me(copie);
    expect(res.statusCode).toBe(401);
    expect(res.json().code).toBe('SESSION_INVALIDE');
  });

  it('se déconnecter sur un appareil ne ferme pas les autres sessions du même compte', async () => {
    const inscription = await inscrire();
    const telephone = jetonDe(inscription);
    const { codeRecuperation } = inscription.json();
    const tablette = jetonDe(await app.inject({ method: 'POST', url: '/api/sessions', headers: SITE, payload: { codeRecuperation } }));
    await app.inject({ method: 'DELETE', url: '/api/sessions', headers: MEME_ORIGINE, cookies: { gc_session: tablette } });
    expect((await me(tablette)).statusCode).toBe(401);
    expect((await me(telephone)).statusCode).toBe(200);
  });

  it('la déconnexion avec un jeton Bearer ferme aussi la session', async () => {
    const jeton = jetonDe(await inscrire());
    await app.inject({ method: 'DELETE', url: '/api/sessions', headers: { authorization: `Bearer ${jeton}` } });
    expect((await me(jeton)).statusCode).toBe(401);
  });

  it('la suppression du compte efface toutes ses sessions', async () => {
    const inscription = await inscrire();
    const id = inscription.json().participant.id;
    const autre = jetonDe(await app.inject({ method: 'POST', url: '/api/sessions', headers: SITE, payload: { codeRecuperation: inscription.json().codeRecuperation } }));
    expect(await app.prisma.session.count({ where: { participantId: id } })).toBe(2);
    await app.inject({ method: 'DELETE', url: '/api/me', headers: MEME_ORIGINE, cookies: { gc_session: jetonDe(inscription) } });
    expect(await app.prisma.session.count({ where: { participantId: id } })).toBe(0);
    expect((await me(autre)).statusCode).toBe(401);
  });

  it('refuse un jeton authentique sans session (ancien format) ou dont la session a expiré', async () => {
    const { participant } = (await inscrire()).json();
    expect((await me(app.jwt.sign({ sub: participant.id } as never))).statusCode).toBe(401);
    const expiree = await app.prisma.session.create({ data: { participantId: participant.id, expiresAt: new Date(Date.now() - 1000) } });
    expect((await me(app.jwt.sign({ sub: participant.id, jti: expiree.id }))).statusCode).toBe(401);
  });

  it('refuse le jeton d’une session appartenant à un autre participant', async () => {
    const a = (await inscrire()).json().participant.id;
    const b = (await inscrire()).json().participant.id;
    const sessionDeB = await app.prisma.session.findFirstOrThrow({ where: { participantId: b } });
    expect((await me(app.jwt.sign({ sub: a, jti: sessionDeB.id }))).statusCode).toBe(401);
  });

  it('un cookie admin recopié ne vaut plus rien après la déconnexion, et l’essai est journalisé', async () => {
    const admin = await connecterAdmin(app);
    const copie = admin.authorization.slice('Bearer '.length);
    const moi = () => app.inject({ method: 'GET', url: '/api/admin/moi', headers: SITE, cookies: { gc_admin: copie } });
    expect((await moi()).statusCode).toBe(200);
    await app.inject({ method: 'DELETE', url: '/api/admin/session', headers: MEME_ORIGINE, cookies: { gc_admin: copie } });
    const res = await moi();
    expect(res.statusCode).toBe(401);
    expect(res.json().code).toBe('SESSION_ADMIN_INVALIDE');
    const compte = await app.prisma.compteAdmin.findUniqueOrThrow({ where: { prenom: admin.prenom } });
    const evenement = await app.prisma.evenementSecurite.findFirst({ where: { type: 'ADMIN_SESSION_FERMEE' }, orderBy: { createdAt: 'desc' } });
    expect(evenement?.details).toMatchObject({ compteId: compte.id });
  });

  it('réinitialiser le mot de passe d’un admin ferme ses sessions ouvertes', async () => {
    const superAdmin = await connecterAdmin(app);
    const cible = await connecterAdmin(app, { role: 'ADMIN' });
    const compte = await app.prisma.compteAdmin.findUniqueOrThrow({ where: { prenom: cible.prenom } });
    expect((await app.inject({ method: 'GET', url: '/api/admin/moi', headers: { authorization: cible.authorization } })).statusCode).toBe(200);
    const reset = await app.inject({ method: 'POST', url: `/api/admin/comptes-admin/${compte.id}/reinitialiser-mot-de-passe`, headers: { authorization: superAdmin.authorization } });
    expect(reset.statusCode).toBe(200);
    expect((await app.inject({ method: 'GET', url: '/api/admin/moi', headers: { authorization: cible.authorization } })).statusCode).toBe(401);
    // La session du super-admin qui a fait la réinitialisation reste ouverte.
    expect((await app.inject({ method: 'GET', url: '/api/admin/moi', headers: { authorization: superAdmin.authorization } })).statusCode).toBe(200);
  });
});

describe('en production', () => {
  it('marque les cookies Secure', async () => {
    const prod = await buildApp(
      loadConfig({
        ...process.env,
        DOCS_ENABLED: undefined,
        DEMO_ENABLED: undefined,
        TRUST_PROXY: undefined,
        NODE_ENV: 'production',
        JWT_SECRET: randomBytes(32).toString('base64url'),
        CORS_ORIGIN: 'https://greencampus.example.org',
      }),
    );
    try {
      const res = await prod.inject({ method: 'POST', url: '/api/participants', headers: SITE, payload: { filiereId, annee: 'L1', consentement: true } });
      expect(cookieDe(res, 'gc_session').secure).toBe(true);
    } finally {
      await prod.close();
    }
  });
});
