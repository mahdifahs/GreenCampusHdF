import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { buildApp } from '../src/app.js';
import { loadConfig } from '../src/config.js';
import { connecterAdmin } from './aide-admin.js';

let app: Awaited<ReturnType<typeof buildApp>>;
let admin: { authorization: string; prenom: string };
let benevole: { authorization: string; prenom: string };

beforeAll(async () => {
  app = await buildApp(loadConfig({ ...process.env, ADMIN_ENABLED: 'true' }));
  admin = await connecterAdmin(app, { prenom: 'Annonce', role: 'ADMIN' });
  benevole = await connecterAdmin(app, { prenom: 'AnnonceBenevole', role: 'BENEVOLE' });
});

// Les fichiers de test se suivent sur la même base : ne pas laisser de bandeau aux suivants.
afterAll(async () => {
  await app.prisma.annonce.deleteMany();
  await app.close();
});

const publique = async () => (await app.inject({ method: 'GET', url: '/api/annonce' })).json().annonce;
const definir = (payload: Record<string, unknown>, qui = admin) =>
  app.inject({ method: 'PUT', url: '/api/admin/annonce', headers: { authorization: qui.authorization }, payload });

describe('message d’information (bandeau du site)', () => {
  it('aucun message par défaut', async () => {
    expect(await publique()).toBeNull();
    const res = await app.inject({ method: 'GET', url: '/api/admin/annonce', headers: { authorization: admin.authorization } });
    expect(res.json()).toEqual({ annonce: null });
  });

  it('un brouillon n’est pas visible du public', async () => {
    const res = await definir({ texte: 'Brouillon', niveau: 'INFO', publiee: false });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({ texte: 'Brouillon', publiee: false, par: admin.prenom });
    expect(await publique()).toBeNull();
  });

  it('publié : visible sans authentification, texte nettoyé, version qui change à chaque modification', async () => {
    const res = await definir({ texte: '  Version de test, les données ne seront pas conservées.  ', niveau: 'ATTENTION', publiee: true });
    expect(res.statusCode).toBe(200);
    const a = await publique();
    expect(a).toMatchObject({ texte: 'Version de test, les données ne seront pas conservées.', niveau: 'ATTENTION', fin: null });

    await new Promise((r) => setTimeout(r, 5));
    await definir({ texte: 'Autre message', niveau: 'IMPORTANT', publiee: true });
    const b = await publique();
    // Un seul message à la fois : le nouveau remplace l'ancien.
    expect(b).toMatchObject({ texte: 'Autre message', niveau: 'IMPORTANT' });
    expect(b.version).not.toBe(a.version);
  });

  it('retiré : disparaît du site mais reste dans l’admin', async () => {
    await definir({ texte: 'Autre message', niveau: 'IMPORTANT', publiee: false });
    expect(await publique()).toBeNull();
    const res = await app.inject({ method: 'GET', url: '/api/admin/annonce', headers: { authorization: admin.authorization } });
    expect(res.json().annonce).toMatchObject({ texte: 'Autre message', publiee: false });
  });

  it('date de fin : visible avant, retiré automatiquement après', async () => {
    const fin = new Date(Date.now() + 300);
    expect((await definir({ texte: 'Bientôt fini', niveau: 'INFO', publiee: true, fin: fin.toISOString() })).statusCode).toBe(200);
    expect((await publique())?.fin).toBe(fin.toISOString());
    await new Promise((r) => setTimeout(r, 400));
    // Même avec le cache, la date de fin est vérifiée à chaque lecture.
    expect(await publique()).toBeNull();
    const res = await app.inject({ method: 'GET', url: '/api/admin/annonce', headers: { authorization: admin.authorization } });
    expect(res.json().annonce).toMatchObject({ publiee: true, expiree: true });
  });

  it('refuse une date de fin passée, un texte vide ou trop long, un niveau inconnu', async () => {
    const passe = await definir({ texte: 'Trop tard', niveau: 'INFO', publiee: true, fin: new Date(Date.now() - 1000).toISOString() });
    expect(passe.statusCode).toBe(400);
    expect(passe.json().code).toBe('DATE_PASSEE');
    for (const payload of [
      { texte: '   ', niveau: 'INFO', publiee: true },
      { texte: 'x'.repeat(301), niveau: 'INFO', publiee: true },
      { texte: 'Niveau inconnu', niveau: 'URGENT', publiee: true },
    ]) {
      expect((await definir(payload)).statusCode).toBe(400);
    }
  });

  it('chaque changement est journalisé', async () => {
    await definir({ texte: 'Journal A', niveau: 'INFO', publiee: true });
    await definir({ texte: 'Journal A', niveau: 'INFO', publiee: false });
    const actions = await app.prisma.actionAdmin.findMany({
      where: { auteur: admin.prenom, action: { startsWith: 'ANNONCE_' } },
      orderBy: { createdAt: 'asc' },
    });
    expect(actions.map((a) => a.action)).toEqual([
      'ANNONCE_ENREGISTREE',
      'ANNONCE_PUBLIEE',
      'ANNONCE_PUBLIEE',
      'ANNONCE_RETIREE',
      'ANNONCE_PUBLIEE',
      'ANNONCE_PUBLIEE',
      'ANNONCE_RETIREE',
    ]);
  });

  it('fermé aux bénévoles et sans session', async () => {
    expect((await definir({ texte: 'Bénévole', niveau: 'INFO', publiee: true }, benevole)).statusCode).toBe(403);
    expect((await app.inject({ method: 'GET', url: '/api/admin/annonce', headers: { authorization: benevole.authorization } })).statusCode).toBe(403);
    expect((await app.inject({ method: 'PUT', url: '/api/admin/annonce', payload: { texte: 'x', niveau: 'INFO', publiee: true } })).statusCode).toBe(401);
  });
});
