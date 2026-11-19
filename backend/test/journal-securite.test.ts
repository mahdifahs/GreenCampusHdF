import type { PrismaClient } from '@prisma/client';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { buildApp } from '../src/app.js';
import { loadConfig } from '../src/config.js';
import { alertesActives, enregistrer, purger } from '../src/modules/securite/service.js';
import { connecterAdmin } from './aide-admin.js';
import { avecJeton } from './aide-session.js';

let app: Awaited<ReturnType<typeof buildApp>>;
let admin: Awaited<ReturnType<typeof connecterAdmin>>;

beforeAll(async () => {
  // TRUST_PROXY=1 : chaque test se donne sa propre IP via X-Forwarded-For pour retrouver ses événements.
  app = await buildApp(loadConfig({ ...process.env, ADMIN_ENABLED: 'true', TRUST_PROXY: '1', RATE_LIMIT_CONNEXION_PAR_MIN: '3' }));
  admin = await connecterAdmin(app, { prenom: 'Camille', headers: { 'x-forwarded-for': '192.0.2.1' } });
});

afterAll(() => app.close());

const ip = (n: number) => ({ 'x-forwarded-for': `192.0.2.${n}` });
const evenements = (adresse: string) =>
  app.prisma.evenementSecurite.findMany({ where: { ip: adresse }, orderBy: { createdAt: 'asc' } });

describe('journal des événements de sécurité', () => {
  it('trace les connexions admin réussies, avec le prénom', async () => {
    const e = await evenements('192.0.2.1');
    expect(e.map((x) => x.type)).toContain('ADMIN_CONNEXION');
    expect(e.find((x) => x.type === 'ADMIN_CONNEXION')!.details).toEqual({ nom: admin.prenom });
  });

  it('trace les échecs de connexion admin', async () => {
    await app.inject({ method: 'POST', url: '/api/admin/session', headers: ip(10), payload: { motDePasse: 'mauvais', nom: 'Intrus' } });
    const e = await evenements('192.0.2.10');
    expect(e.map((x) => [x.type, x.niveau])).toEqual([['ADMIN_ECHEC_CONNEXION', 'alerte']]);
  });

  it('trace les codes de récupération invalides et les dépassements de limite', async () => {
    for (let i = 0; i < 4; i++) {
      await app.inject({ method: 'POST', url: '/api/sessions', headers: ip(20), payload: { codeRecuperation: 'ZZZZ-ZZZZ-ZZZZ-ZZZZ' } });
    }
    // Le dépassement de limite est journalisé sans être attendu (hook onExceeded) : on laisse
    // le temps à l'écriture d'aboutir, sinon le test échoue quand la machine est chargée.
    await vi.waitFor(async () => {
      const types = (await evenements('192.0.2.20')).map((x) => x.type);
      expect(types.filter((t) => t === 'CODE_INVALIDE')).toHaveLength(3);
      expect(types).toContain('TROP_DE_REQUETES');
    });
  });

  it('trace les accès à l’administration avec un jeton non autorisé, mais pas l’absence de jeton', async () => {
    const filieres = (await app.inject({ method: 'GET', url: '/api/filieres' })).json();
    const p = avecJeton(await app.inject({ method: 'POST', url: '/api/participants', payload: { filiereId: filieres[0].id, annee: 'L1', consentement: true } }));

    await app.inject({ method: 'GET', url: '/api/admin/stats', headers: { ...ip(30), authorization: `Bearer ${p.token}` } });
    await app.inject({ method: 'GET', url: '/api/admin/stats', headers: { ...ip(30), authorization: 'Bearer jeton.falsifie.xyz' } });
    await app.inject({ method: 'GET', url: '/api/admin/stats', headers: ip(30) });

    const e = await evenements('192.0.2.30');
    expect(e.map((x) => x.details)).toEqual([{ motif: 'jeton de participant' }, { motif: 'jeton invalide' }]);
  });

  it('trace les tentatives d’un compte bloqué', async () => {
    const filieres = (await app.inject({ method: 'GET', url: '/api/filieres' })).json();
    const p = avecJeton(await app.inject({ method: 'POST', url: '/api/participants', payload: { filiereId: filieres[0].id, annee: 'L1', consentement: true } }));
    await app.inject({ method: 'PATCH', url: `/api/admin/participants/${p.participant.id}`, headers: admin, payload: { bloque: true } });

    await app.inject({ method: 'GET', url: '/api/me', headers: { ...ip(40), authorization: `Bearer ${p.token}` } });
    expect((await evenements('192.0.2.40')).map((x) => x.type)).toEqual(['COMPTE_BLOQUE_TENTATIVE']);
  });
});

describe('alertes, conservation et consultation', () => {
  it('lève une alerte quand un seuil est dépassé sur la dernière heure', async () => {
    const maintenant = new Date('2030-01-01T12:00:00Z');
    await app.prisma.evenementSecurite.createMany({
      data: Array.from({ length: 10 }, () => ({ type: 'ADMIN_ECHEC_CONNEXION', niveau: 'alerte', createdAt: new Date('2030-01-01T11:30:00Z') })),
    });
    const alertes = await alertesActives(app.prisma, maintenant);
    expect(alertes.find((a) => a.type === 'ADMIN_ECHEC_CONNEXION')).toMatchObject({ nombre: 10 });
    // Deux heures plus tard, l'alerte n'est plus active.
    expect((await alertesActives(app.prisma, new Date('2030-01-01T14:00:00Z'))).find((a) => a.type === 'ADMIN_ECHEC_CONNEXION')).toBeUndefined();
    await app.prisma.evenementSecurite.deleteMany({ where: { createdAt: new Date('2030-01-01T11:30:00Z') } });
  });

  it('supprime les événements de plus de 30 jours (ils contiennent des adresses IP)', async () => {
    const maintenant = new Date();
    const vieux = new Date(maintenant.getTime() - 31 * 24 * 3600 * 1000);
    const recent = new Date(maintenant.getTime() - 29 * 24 * 3600 * 1000);
    await app.prisma.evenementSecurite.createMany({
      data: [
        { type: 'CODE_INVALIDE', niveau: 'info', ip: '192.0.2.200', createdAt: vieux },
        { type: 'CODE_INVALIDE', niveau: 'info', ip: '192.0.2.200', createdAt: recent },
      ],
    });
    await purger(app.prisma, maintenant);
    const restants = await evenements('192.0.2.200');
    expect(restants.map((e) => e.createdAt.getTime())).toEqual([recent.getTime()]);
  });

  it('ne fait jamais échouer la requête si l’écriture du journal échoue', async () => {
    const enPanne = { evenementSecurite: { create: () => Promise.reject(new Error('base en panne')) } } as unknown as PrismaClient;
    const erreurs: unknown[] = [];
    await expect(enregistrer(enPanne, { type: 'CODE_INVALIDE' }, { error: (e) => erreurs.push(e) })).resolves.toBeUndefined();
    expect(erreurs).toHaveLength(1);
  });

  it('est consultable dans l’administration et exportable en CSV', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/admin/securite?type=CODE_INVALIDE', headers: admin });
    expect(res.statusCode).toBe(200);
    const t = res.json();
    expect(t.dernieres24h.map((x: { type: string }) => x.type)).toContain('ADMIN_VERROUILLE');
    expect(t.evenements.every((e: { type: string }) => e.type === 'CODE_INVALIDE')).toBe(true);

    const csv = await app.inject({ method: 'GET', url: '/api/admin/export/securite', headers: admin });
    expect(csv.body.replace('﻿', '').split('\r\n')[0]).toBe('date;type;niveau;ip;details');
  });
});
