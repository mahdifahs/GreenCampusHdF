import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { buildApp } from '../src/app.js';
import { loadConfig } from '../src/config.js';
import { detecterAlertes, SEUILS } from '../src/modules/admin/moderation.js';
import { connecterAdmin } from './aide-admin.js';
import { avecJeton } from './aide-session.js';

const HEURE = 60 * 60 * 1000;
let app: Awaited<ReturnType<typeof buildApp>>;
let admin: Awaited<ReturnType<typeof connecterAdmin>>;

beforeAll(async () => {
  app = await buildApp(loadConfig({ ...process.env, ADMIN_ENABLED: 'true' }));
  admin = await connecterAdmin(app, { prenom: 'Camille' });
});

afterAll(() => app.close());

async function participant(filiereSlug = 'genie-civil') {
  const filieres = (await app.inject({ method: 'GET', url: '/api/filieres' })).json();
  const filiereId = filieres.find((f: { slug: string }) => f.slug === filiereSlug).id;
  const r = avecJeton(
    await app.inject({ method: 'POST', url: '/api/participants', payload: { filiereId, annee: 'L1', consentement: true } }),
  );
  return { id: r.participant.id as string, pseudo: r.participant.pseudo as string, code: r.codeRecuperation as string, headers: { authorization: `Bearer ${r.token}` } };
}

async function bilan(headers: Record<string, string>, situation: Record<string, unknown> = {}) {
  return app.inject({ method: 'POST', url: '/api/bilans', headers, payload: { type: 'STAND', situation } });
}

// Un participant qui choisit un défi et le valide aussitôt.
async function tricheur() {
  const p = await participant();
  await bilan(p.headers);
  const { defis } = (await app.inject({ method: 'GET', url: '/api/defis', headers: p.headers })).json();
  const e = (await app.inject({ method: 'POST', url: '/api/engagements', headers: p.headers, payload: { defiId: defis[0].id } })).json();
  await app.inject({ method: 'PATCH', url: `/api/engagements/${e.id}`, headers: p.headers, payload: { statut: 'VALIDE' } });
  return { ...p, engagementId: e.id as string, co2: e.co2EviteKgSemaine as number };
}

const fiche = async (id: string) => (await app.inject({ method: 'GET', url: `/api/admin/participants/${id}`, headers: admin })).json();
const tableau = async () => (await app.inject({ method: 'GET', url: '/api/tableau-de-bord' })).json();

describe('détection des comportements suspects', () => {
  const t0 = new Date('2026-12-03T10:00:00Z');
  const a = (h: number) => new Date(t0.getTime() + h * HEURE);

  it('ne signale rien pour un usage normal', () => {
    expect(
      detecterAlertes({
        bilans: [{ createdAt: t0, totalKg: 7500 }, { createdAt: a(48), totalKg: 7200 }],
        engagements: [{ createdAt: t0, reponduAt: a(5 * 24), statut: 'VALIDE', co2EviteKgSemaine: 12 }],
      }),
    ).toEqual([]);
  });

  it('signale validations immédiates, bilans en rafale, bilans invraisemblables et gains anormaux', () => {
    const codes = detecterAlertes({
      bilans: [
        ...Array.from({ length: SEUILS.bilansParJour + 1 }, (_, i) => ({ createdAt: a(i), totalKg: 8000 })),
        { createdAt: a(30), totalKg: 900_000 },
      ],
      engagements: [
        { createdAt: t0, reponduAt: a(0.1), statut: 'VALIDE', co2EviteKgSemaine: 400 },
        { createdAt: t0, reponduAt: null, statut: 'EN_COURS', co2EviteKgSemaine: 3 },
      ],
    }).map((x) => x.code);
    expect(codes.sort()).toEqual(['BILANS_EN_RAFALE', 'BILAN_INVRAISEMBLABLE', 'GAIN_ANORMAL', 'VALIDATION_RAPIDE']);
  });
});

describe('liste et fiche des participants', () => {
  it('liste les participants avec leur activité, filtre les suspects et cherche par pseudo', async () => {
    const t = await tricheur();
    const sage = await participant();
    await bilan(sage.headers);

    const suspects = (await app.inject({ method: 'GET', url: '/api/admin/participants?filtre=suspects', headers: admin })).json();
    expect(suspects.participants.map((p: { id: string }) => p.id)).toContain(t.id);
    expect(suspects.participants.map((p: { id: string }) => p.id)).not.toContain(sage.id);

    const recherche = (
      await app.inject({ method: 'GET', url: `/api/admin/participants?recherche=${t.pseudo.toLowerCase()}`, headers: admin })
    ).json();
    expect(recherche.total).toBe(1);
    expect(recherche.participants[0]).toMatchObject({ pseudo: t.pseudo, nbBilans: 1, defisValides: 1, exclu: false, bloque: false });
    expect(recherche.participants[0].alertes[0].code).toBe('VALIDATION_RAPIDE');
  });

  it('donne la fiche détaillée (bilans, défis, validations rapides)', async () => {
    const t = await tricheur();
    const f = await fiche(t.id);
    expect(f.bilans).toHaveLength(1);
    expect(f.engagements[0]).toMatchObject({ id: t.engagementId, statut: 'VALIDE', validationRapide: true });
    expect((await app.inject({ method: 'GET', url: '/api/admin/participants/00000000-0000-0000-0000-000000000000', headers: admin })).statusCode).toBe(404);
  });

  it('repère un bilan aux réponses fantaisistes', async () => {
    const p = await participant();
    await bilan(p.headers, { 'transport . voiture . utilisateur': 'propriétaire', 'transport . voiture . km': 5_000_000 });
    const f = await fiche(p.id);
    expect(f.bilans[0].invraisemblable).toBe(true);
    expect(f.alertes.map((a: { code: string }) => a.code)).toContain('BILAN_INVRAISEMBLABLE');
  });

  it('est réservé à l’administration', async () => {
    const p = await participant();
    expect((await app.inject({ method: 'GET', url: '/api/admin/participants', headers: p.headers })).statusCode).toBe(403);
    expect((await app.inject({ method: 'GET', url: '/api/admin/participants' })).statusCode).toBe(401);
  });
});

describe('actions de modération', () => {
  it('exclut un compte des statistiques publiques, puis le réintègre', async () => {
    const t = await tricheur();
    const avant = await tableau();

    expect((await app.inject({ method: 'PATCH', url: `/api/admin/participants/${t.id}`, headers: admin, payload: { exclu: true } })).statusCode).toBe(204);
    const pendant = await tableau();
    expect(pendant.participants).toBe(avant.participants - 1);
    expect(pendant.co2EviteKg).toBeCloseTo(avant.co2EviteKg - t.co2, 1);
    const stats = (await app.inject({ method: 'GET', url: '/api/admin/stats', headers: admin })).json();
    expect(stats.participantsExclus).toBeGreaterThanOrEqual(1);
    // Le participant, lui, continue d'utiliser l'application normalement.
    expect((await app.inject({ method: 'GET', url: '/api/me', headers: t.headers })).statusCode).toBe(200);

    await app.inject({ method: 'PATCH', url: `/api/admin/participants/${t.id}`, headers: admin, payload: { exclu: false } });
    expect((await tableau()).participants).toBe(avant.participants);
  });

  it('bloque un compte : plus de session ni de reconnexion', async () => {
    const t = await tricheur();
    await app.inject({ method: 'PATCH', url: `/api/admin/participants/${t.id}`, headers: admin, payload: { bloque: true } });

    const me = await app.inject({ method: 'GET', url: '/api/me', headers: t.headers });
    expect(me.statusCode).toBe(403);
    expect(me.json().code).toBe('COMPTE_BLOQUE');
    const reconnexion = await app.inject({ method: 'POST', url: '/api/sessions', payload: { codeRecuperation: t.code } });
    expect(reconnexion.json().code).toBe('COMPTE_BLOQUE');

    await app.inject({ method: 'PATCH', url: `/api/admin/participants/${t.id}`, headers: admin, payload: { bloque: false } });
    expect((await app.inject({ method: 'GET', url: '/api/me', headers: t.headers })).statusCode).toBe(200);
  });

  it('annule un défi frauduleux et supprime un compte', async () => {
    const t = await tricheur();
    const annulation = await app.inject({
      method: 'DELETE',
      url: `/api/admin/engagements/${t.engagementId}`,
      headers: admin,
      payload: { motif: 'Validé 2 minutes après avoir été choisi' },
    });
    expect(annulation.statusCode).toBe(204);
    expect((await app.inject({ method: 'GET', url: '/api/me/impact', headers: t.headers })).json().defisValides).toBe(0);

    expect((await app.inject({ method: 'DELETE', url: `/api/admin/participants/${t.id}`, headers: admin })).statusCode).toBe(204);
    expect(await app.prisma.participant.count({ where: { id: t.id } })).toBe(0);
    expect((await app.inject({ method: 'DELETE', url: `/api/admin/participants/${t.id}`, headers: admin })).statusCode).toBe(404);
  });

  it('trace chaque action dans le journal, avec le prénom de son auteur', async () => {
    const t = await tricheur();
    await app.inject({ method: 'PATCH', url: `/api/admin/participants/${t.id}`, headers: admin, payload: { exclu: true, bloque: true } });
    await app.inject({ method: 'DELETE', url: `/api/admin/participants/${t.id}`, headers: admin, payload: { motif: 'Bilans fantaisistes' } });

    const journal = (await app.inject({ method: 'GET', url: '/api/admin/journal', headers: admin })).json();
    const pourLui = journal.filter((a: { cible: string }) => a.cible === t.pseudo);
    expect(pourLui.map((a: { action: string }) => a.action).sort()).toEqual(['BLOQUER', 'EXCLURE_DES_STATISTIQUES', 'SUPPRIMER_PARTICIPANT']);
    expect(pourLui.every((a: { auteur: string }) => a.auteur === admin.prenom)).toBe(true);
    expect(pourLui.find((a: { action: string }) => a.action === 'SUPPRIMER_PARTICIPANT').details).toEqual({ motif: 'Bilans fantaisistes' });
  });
});
