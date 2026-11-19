import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { buildApp } from '../src/app.js';
import { loadConfig } from '../src/config.js';
import { envoyerRelances, type Envoyeur, type Notification } from '../src/modules/suivis/service.js';
import { jetonDe } from './aide-session.js';

const JOUR_MS = 24 * 60 * 60 * 1000;
let app: Awaited<ReturnType<typeof buildApp>>;

beforeAll(async () => {
  app = await buildApp(loadConfig({ ...process.env }));
});

afterAll(() => app.close());

async function filiere(slug: string) {
  const filieres = (await app.inject({ method: 'GET', url: '/api/filieres' })).json();
  return filieres.find((f: { slug: string }) => f.slug === slug);
}

async function participant(filiereId: number) {
  const res = await app.inject({
    method: 'POST',
    url: '/api/participants',
    payload: { filiereId, annee: 'L2', consentement: true },
  });
  const { participant } = res.json();
  const token = jetonDe(res);
  return { id: participant.id as string, headers: { authorization: `Bearer ${token}` } };
}

async function bilan(headers: Record<string, string>, situation: Record<string, unknown> = {}) {
  return app.inject({ method: 'POST', url: '/api/bilans', headers, payload: { type: 'STAND', situation } });
}

async function vieillirBilans(participantId: string, jours: number) {
  for (const b of await app.prisma.bilan.findMany({ where: { participantId } })) {
    await app.prisma.bilan.update({ where: { id: b.id }, data: { createdAt: new Date(b.createdAt.getTime() - jours * JOUR_MS) } });
  }
}

const tableau = async () => (await app.inject({ method: 'GET', url: '/api/tableau-de-bord' })).json();

describe('tableau de bord', () => {
  it('est public et masque une filière sous le seuil d’anonymat (2 en test)', async () => {
    const staps = await filiere('staps');
    const a = await participant(staps.id);
    await bilan(a.headers);

    let t = await tableau();
    expect(t.classementFilieres.some((f: { filiere: { id: number } }) => f.filiere.id === staps.id)).toBe(false);
    expect(t.filieresMasquees).toBeGreaterThanOrEqual(1);

    const b = await participant(staps.id);
    t = await tableau();
    const ligne = t.classementFilieres.find((f: { filiere: { id: number } }) => f.filiere.id === staps.id);
    expect(ligne).toMatchObject({ participants: 2, bilans: 1, empreinteMoyenneKg: null });

    // Avec 2 bilans, la moyenne de la filière devient visible.
    await bilan(b.headers);
    t = await tableau();
    const ligne2 = t.classementFilieres.find((f: { filiere: { id: number } }) => f.filiere.id === staps.id);
    expect(ligne2.empreinteMoyenneKg).toBeGreaterThan(0);
  });

  it('cumule le CO2 évité des défis validés et classe les filières', async () => {
    const droit = await filiere('droit');
    const membres = [await participant(droit.id), await participant(droit.id)];
    const avant = await tableau();

    const { defis } = (await app.inject({ method: 'GET', url: '/api/defis', headers: membres[0].headers })).json();
    const e = (
      await app.inject({ method: 'POST', url: '/api/engagements', headers: membres[0].headers, payload: { defiId: defis[0].id } })
    ).json();
    await app.inject({ method: 'PATCH', url: `/api/engagements/${e.id}`, headers: membres[0].headers, payload: { statut: 'VALIDE' } });

    const apres = await tableau();
    expect(apres.co2EviteKg).toBeCloseTo(avant.co2EviteKg + e.co2EviteKgSemaine, 1);
    expect(apres.defisValides).toBe(avant.defisValides + 1);
    const ligne = apres.classementFilieres.find((f: { filiere: { id: number } }) => f.filiere.id === droit.id);
    // Valeurs arrondies au dixième.
    expect(Math.abs(ligne.co2EviteKgParParticipant - e.co2EviteKgSemaine / 2)).toBeLessThanOrEqual(0.051);
    expect(apres.classementFilieres.map((f: { rang: number }) => f.rang)).toEqual(
      apres.classementFilieres.map((_: unknown, i: number) => i + 1),
    );
    expect(apres.defisPopulaires.map((d: { titre: string }) => d.titre)).toContain(defis[0].titre);
  });
});

describe('questionnaires de suivi', () => {
  const reponsesJ7 = { changement: 'un-peu', domaine: 'alimentation', facilite: 4 };

  it('ne propose rien sans bilan, puis J+7 et J+14 à leur date', async () => {
    const p = await participant((await filiere('autre')).id);
    let aFaire = (await app.inject({ method: 'GET', url: '/api/suivis/a-faire', headers: p.headers })).json();
    expect(aFaire).toEqual({ jourZero: null, etapes: [] });

    await bilan(p.headers);
    aFaire = (await app.inject({ method: 'GET', url: '/api/suivis/a-faire', headers: p.headers })).json();
    expect(aFaire.etapes.map((e: { etape: string; disponible: boolean }) => [e.etape, e.disponible])).toEqual([
      ['J7', false],
      ['J14', false],
    ]);
    const tropTot = await app.inject({ method: 'POST', url: '/api/suivis', headers: p.headers, payload: { etape: 'J7', reponses: reponsesJ7 } });
    expect(tropTot.json().code).toBe('SUIVI_PAS_ENCORE_DISPONIBLE');

    await vieillirBilans(p.id, 8);
    const invalide = await app.inject({
      method: 'POST',
      url: '/api/suivis',
      headers: p.headers,
      payload: { etape: 'J7', reponses: { changement: 'peut-être', facilite: 9, intrus: 'x' } },
    });
    expect(invalide.statusCode).toBe(400);
    expect(invalide.json().details.map((d: { champ: string }) => d.champ).sort()).toEqual(['changement', 'domaine', 'facilite', 'intrus']);

    const ok = await app.inject({ method: 'POST', url: '/api/suivis', headers: p.headers, payload: { etape: 'J7', reponses: reponsesJ7 } });
    expect(ok.statusCode).toBe(201);
    const deja = await app.inject({ method: 'POST', url: '/api/suivis', headers: p.headers, payload: { etape: 'J7', reponses: reponsesJ7 } });
    expect(deja.json().code).toBe('SUIVI_DEJA_REMPLI');

    aFaire = (await app.inject({ method: 'GET', url: '/api/suivis/a-faire', headers: p.headers })).json();
    expect(aFaire.etapes.map((e: { etape: string }) => e.etape)).toEqual(['J14']);
  });

  it('accepte un abonnement aux notifications en https uniquement', async () => {
    const p = await participant((await filiere('autre')).id);
    const keys = { p256dh: 'cle', auth: 'auth' };
    const http = await app.inject({ method: 'POST', url: '/api/push/abonnement', headers: p.headers, payload: { endpoint: 'http://exemple.org/x', keys } });
    expect(http.statusCode).toBe(400);
    const https = await app.inject({ method: 'POST', url: '/api/push/abonnement', headers: p.headers, payload: { endpoint: 'https://push.exemple.org/abc', keys } });
    expect(https.statusCode).toBe(204);
    expect(await app.prisma.pushAbonnement.count({ where: { participantId: p.id } })).toBe(1);
  });
});

describe('envoi des relances', () => {
  function fauxEnvoyeur(expires: string[] = []) {
    const envois: { endpoint: string; notification: Notification }[] = [];
    const envoyer: Envoyeur = async (abonnement, notification) => {
      envois.push({ endpoint: abonnement.endpoint, notification });
      return expires.includes(abonnement.endpoint) ? 'expire' : 'ok';
    };
    return { envois, envoyer };
  }

  async function abonne(endpoint: string) {
    const p = await participant((await filiere('autre')).id);
    await bilan(p.headers);
    await app.prisma.pushAbonnement.create({ data: { participantId: p.id, endpoint, p256dh: 'k', auth: 'a' } });
    return p;
  }

  it('relance une seule fois par étape, au bon moment', async () => {
    const p = await abonne('https://push.exemple.org/relance-1');
    const { envois, envoyer } = fauxEnvoyeur();
    const pour = () => envois.filter((e) => e.endpoint === 'https://push.exemple.org/relance-1');

    await envoyerRelances(app.prisma, envoyer);
    expect(pour()).toHaveLength(0); // trop tôt

    await vieillirBilans(p.id, 8);
    await envoyerRelances(app.prisma, envoyer);
    await envoyerRelances(app.prisma, envoyer);
    expect(pour().map((e) => e.notification.titre)).toEqual([expect.stringContaining('une semaine')]);

    await vieillirBilans(p.id, 7);
    await envoyerRelances(app.prisma, envoyer);
    expect(pour()).toHaveLength(2);
    expect(pour()[1].notification.titre).toContain('dernier point');
  });

  it('ne relance pas pour un questionnaire déjà rempli, et supprime les abonnements expirés', async () => {
    const p = await abonne('https://push.exemple.org/expire');
    await vieillirBilans(p.id, 8);
    await app.prisma.suivi.create({ data: { participantId: p.id, etape: 'J7', reponses: {} } });

    const { envois, envoyer } = fauxEnvoyeur(['https://push.exemple.org/expire']);
    await envoyerRelances(app.prisma, envoyer);
    expect(envois.filter((e) => e.endpoint === 'https://push.exemple.org/expire')).toHaveLength(0);

    await vieillirBilans(p.id, 7); // J+15 : J14 dû
    await envoyerRelances(app.prisma, envoyer);
    expect(envois.filter((e) => e.endpoint === 'https://push.exemple.org/expire')).toHaveLength(1);
    expect(await app.prisma.pushAbonnement.count({ where: { participantId: p.id } })).toBe(0);
  });

  it('n’expose pas les routes de développement quand la démo est désactivée', async () => {
    const res = await app.inject({ method: 'POST', url: '/api/dev/relances' });
    expect(res.statusCode).toBe(404);
  });
});
