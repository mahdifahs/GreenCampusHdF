import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { buildApp } from '../src/app.js';
import { loadConfig } from '../src/config.js';
import * as comptesService from '../src/modules/admin/comptes.js';
import { connecterAdmin } from './aide-admin.js';

let app: Awaited<ReturnType<typeof buildApp>>;
let superAdmin: Awaited<ReturnType<typeof connecterAdmin>>;
let superAdminId: string;

beforeAll(async () => {
  // Limite de comptes haute ici : la limite basse est testée séparément avec sa propre app isolée
  // (voir plus bas). Limite de connexion/min relevée aussi : ce fichier ouvre beaucoup de sessions
  // admin (une par compte créé) depuis la même IP de test.
  app = await buildApp(loadConfig({ ...process.env, ADMIN_ENABLED: 'true', ADMIN_LIMITE_COMPTES: '50', ADMIN_RATE_LIMIT_CONNEXION_PAR_MIN: '50' }));
  superAdmin = await connecterAdmin(app, { prenom: 'Cheffe' });
  superAdminId = (await app.prisma.compteAdmin.findUniqueOrThrow({ where: { prenom: superAdmin.prenom } })).id;
});

afterAll(() => app.close());

describe('accès réservé aux super-admins', () => {
  it('refuse à un admin simple la gestion des comptes', async () => {
    const admin = await connecterAdmin(app, { prenom: 'Simple', role: 'ADMIN' });
    expect((await app.inject({ method: 'GET', url: '/api/admin/comptes-admin', headers: admin })).statusCode).toBe(403);
    expect(
      (await app.inject({ method: 'POST', url: '/api/admin/comptes-admin', headers: admin, payload: { prenom: 'Nouveau' } })).statusCode,
    ).toBe(403);
  });
});

describe('création de comptes', () => {
  it('crée un compte et affiche le mot de passe une seule fois', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/admin/comptes-admin',
      headers: superAdmin,
      payload: { prenom: 'Nouvel', role: 'ADMIN' },
    });
    expect(res.statusCode).toBe(201);
    const compte = res.json();
    expect(compte.motDePasse).toMatch(/^([0-9A-HJKMNP-TV-Z]{4}-){3}[0-9A-HJKMNP-TV-Z]{4}$/);
    expect(compte.role).toBe('ADMIN');
    expect(compte.bloque).toBe(false);

    // Le compte peut se connecter avec ce mot de passe, et la réponse ne renvoie plus le mot de passe.
    const connexion = await app.inject({
      method: 'POST',
      url: '/api/admin/session',
      payload: { motDePasse: compte.motDePasse, nom: 'Nouvel' },
    });
    expect(connexion.statusCode).toBe(204);
    const liste = await (await app.inject({ method: 'GET', url: '/api/admin/comptes-admin', headers: superAdmin })).json();
    expect(liste.find((c: { prenom: string }) => c.prenom === 'Nouvel').motDePasse).toBeUndefined();
  });

  it('refuse un prénom déjà utilisé', async () => {
    await app.inject({ method: 'POST', url: '/api/admin/comptes-admin', headers: superAdmin, payload: { prenom: 'Doublon' } });
    const res = await app.inject({ method: 'POST', url: '/api/admin/comptes-admin', headers: superAdmin, payload: { prenom: 'Doublon' } });
    expect(res.statusCode).toBe(409);
    expect(res.json().code).toBe('PRENOM_DEJA_UTILISE');
  });

  it('refuse de dépasser la limite de comptes', async () => {
    // La base est partagée avec les autres fichiers de test exécutés en parallèle : la limite est
    // fixée relativement au total déjà présent, pas à une valeur absolue. Les bénévoles ont leur
    // propre limite et ne comptent pas ici.
    const totalActuel = await app.prisma.compteAdmin.count({ where: { role: { not: 'BENEVOLE' } } });
    const limitee = await buildApp(
      loadConfig({ ...process.env, ADMIN_ENABLED: 'true', ADMIN_LIMITE_COMPTES: String(totalActuel + 1), ADMIN_RATE_LIMIT_CONNEXION_PAR_MIN: '50' }),
    );
    try {
      const chef = await connecterAdmin(limitee, { prenom: 'ChefLimite' }); // compte totalActuel + 1 : limite déjà atteinte.
      const res = await limitee.inject({ method: 'POST', url: '/api/admin/comptes-admin', headers: chef, payload: { prenom: 'DeTrop' } });
      expect(res.statusCode).toBe(409);
      expect(res.json().code).toBe('LIMITE_COMPTES_ATTEINTE');
    } finally {
      await limitee.close();
    }
  });
});

describe('blocage, réinitialisation et suppression', () => {
  it('bloque un compte, qui ne peut plus se connecter ni utiliser son jeton existant', async () => {
    const cible = await connecterAdmin(app, { prenom: 'ACibler', role: 'ADMIN' });
    const id = (await app.prisma.compteAdmin.findUniqueOrThrow({ where: { prenom: cible.prenom } })).id;

    const maj = await app.inject({ method: 'PATCH', url: `/api/admin/comptes-admin/${id}`, headers: superAdmin, payload: { bloque: true } });
    expect(maj.statusCode).toBe(200);
    expect(maj.json().bloque).toBe(true);

    expect((await app.inject({ method: 'GET', url: '/api/admin/stats', headers: cible })).statusCode).toBe(403);
    const reconnexion = await app.inject({ method: 'POST', url: '/api/admin/session', payload: { motDePasse: 'peu-importe', nom: cible.prenom } });
    expect(reconnexion.statusCode).toBe(401);
  });

  it('refuse qu’un super-admin se bloque ou se supprime lui-même', async () => {
    const bloquer = await app.inject({ method: 'PATCH', url: `/api/admin/comptes-admin/${superAdminId}`, headers: superAdmin, payload: { bloque: true } });
    expect(bloquer.statusCode).toBe(409);
    expect(bloquer.json().code).toBe('ACTION_SUR_SOI_MEME');

    const supprimer = await app.inject({ method: 'DELETE', url: `/api/admin/comptes-admin/${superAdminId}`, headers: superAdmin });
    expect(supprimer.statusCode).toBe(409);
    expect(supprimer.json().code).toBe('ACTION_SUR_SOI_MEME');
  });

  it('refuse de bloquer ou supprimer le dernier super-admin actif', async () => {
    // Impossible à déclencher via l'API seule : le garde-fou anti-auto-action empêche un super-admin
    // de s'auto-bloquer, et il faut être soi-même super-admin actif pour appeler ces routes — ce qui
    // garantit toujours au moins un autre super-admin actif (l'appelant). On teste donc directement
    // le service, en isolant « Cheffe » comme seul super-admin actif restant.
    await app.prisma.compteAdmin.updateMany({ where: { role: 'SUPER_ADMIN', id: { not: superAdminId } }, data: { bloque: true } });
    await expect(comptesService.bloquer(app.prisma, 'test', superAdminId, true)).rejects.toMatchObject({ code: 'DERNIER_SUPER_ADMIN' });
    await expect(comptesService.supprimer(app.prisma, 'test', superAdminId)).rejects.toMatchObject({ code: 'DERNIER_SUPER_ADMIN' });
  });

  it('réinitialise le mot de passe d’un compte', async () => {
    const cible = await connecterAdmin(app, { prenom: 'ARegen', role: 'ADMIN' });
    const id = (await app.prisma.compteAdmin.findUniqueOrThrow({ where: { prenom: cible.prenom } })).id;
    const res = await app.inject({ method: 'POST', url: `/api/admin/comptes-admin/${id}/reinitialiser-mot-de-passe`, headers: superAdmin });
    expect(res.statusCode).toBe(200);
    const { motDePasse } = res.json();
    const connexion = await app.inject({ method: 'POST', url: '/api/admin/session', payload: { motDePasse, nom: cible.prenom } });
    expect(connexion.statusCode).toBe(204);
  });

  it('supprime un compte, qui n’apparaît plus dans la liste', async () => {
    const cible = await connecterAdmin(app, { prenom: 'ASupprimer', role: 'ADMIN' });
    const id = (await app.prisma.compteAdmin.findUniqueOrThrow({ where: { prenom: cible.prenom } })).id;
    expect((await app.inject({ method: 'DELETE', url: `/api/admin/comptes-admin/${id}`, headers: superAdmin })).statusCode).toBe(204);
    const liste = await (await app.inject({ method: 'GET', url: '/api/admin/comptes-admin', headers: superAdmin })).json();
    expect(liste.find((c: { id: string }) => c.id === id)).toBeUndefined();
  });

  it('404 sur un compte inconnu', async () => {
    const id = '00000000-0000-0000-0000-000000000000';
    expect((await app.inject({ method: 'PATCH', url: `/api/admin/comptes-admin/${id}`, headers: superAdmin, payload: { bloque: true } })).statusCode).toBe(404);
    expect((await app.inject({ method: 'DELETE', url: `/api/admin/comptes-admin/${id}`, headers: superAdmin })).statusCode).toBe(404);
  });
});

describe('/moi', () => {
  it('indique le prénom et le rôle du compte connecté', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/admin/moi', headers: superAdmin });
    expect(res.json()).toEqual({ prenom: superAdmin.prenom, role: 'SUPER_ADMIN' });
  });
});
