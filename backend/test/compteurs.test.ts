import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { buildApp } from '../src/app.js';
import { loadConfig } from '../src/config.js';
import { connecterAdmin } from './aide-admin.js';

let app: Awaited<ReturnType<typeof buildApp>>;
let admin: Record<string, string>;

beforeAll(async () => {
  app = await buildApp(loadConfig({ ...process.env, ADMIN_ENABLED: 'true' }));
  admin = await connecterAdmin(app);
});

afterAll(() => app.close());

describe('compteurs du stand (personnes venues)', () => {
  it('exige une session admin', async () => {
    expect((await app.inject({ method: 'GET', url: '/api/admin/compteurs/2026-10-17' })).statusCode).toBe(401);
  });

  it('renvoie un compteur à zéro pour une journée jamais saisie', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/admin/compteurs/2026-10-17', headers: admin });
    expect(res.json()).toEqual({ date: '2026-10-17', personnesVenues: 0 });
  });

  it('incrémente et décrémente le compteur', async () => {
    const date = '2026-10-18';
    await app.inject({ method: 'POST', url: `/api/admin/compteurs/${date}/incrementer`, headers: admin, payload: { delta: 1 } });
    await app.inject({ method: 'POST', url: `/api/admin/compteurs/${date}/incrementer`, headers: admin, payload: { delta: 1 } });
    const res = await app.inject({ method: 'POST', url: `/api/admin/compteurs/${date}/incrementer`, headers: admin, payload: { delta: -1 } });
    expect(res.json().personnesVenues).toBe(1);
  });

  it('ne descend jamais sous zéro', async () => {
    const date = '2026-10-19';
    const res = await app.inject({ method: 'POST', url: `/api/admin/compteurs/${date}/incrementer`, headers: admin, payload: { delta: -1 } });
    expect(res.json().personnesVenues).toBe(0);
  });

  it('permet de saisir un total directement (comptage manuel)', async () => {
    const date = '2026-10-20';
    const res = await app.inject({ method: 'PATCH', url: `/api/admin/compteurs/${date}`, headers: admin, payload: { valeur: 50 } });
    expect(res.json().personnesVenues).toBe(50);
  });

  it('refuse un delta autre que 1 ou -1', async () => {
    const res = await app.inject({ method: 'POST', url: '/api/admin/compteurs/2026-10-22/incrementer', headers: admin, payload: { delta: 5 } });
    expect(res.statusCode).toBe(400);
  });

  it('liste l’historique du plus récent au plus ancien', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/admin/compteurs', headers: admin });
    const dates = res.json().map((j: { date: string }) => j.date);
    expect(dates).toEqual([...dates].sort().reverse());
    expect(dates).toContain('2026-10-20');
  });

  it('exporte les compteurs en CSV, du plus ancien au plus récent', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/admin/export/stand', headers: admin });
    expect(res.statusCode).toBe(200);
    expect(res.headers['content-type']).toContain('text/csv');
    const lignes = res.body.replace('﻿', '').trim().split('\r\n');
    expect(lignes[0]).toBe('date;personnes_venues');
    expect(lignes.some((l) => l.startsWith('2026-10-20;50'))).toBe(true);
    const dates = lignes.slice(1).map((l) => l.split(';')[0]);
    expect(dates).toEqual([...dates].sort());
  });
});
