import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { buildApp } from '../src/app.js';
import { loadConfig } from '../src/config.js';
import { jetonDe } from './aide-session.js';

// Les autres fichiers tournent avec DEFI_DELAI_VALIDATION_HEURES=0 (vitest.config.ts) ; ici, le délai réel.
let app: Awaited<ReturnType<typeof buildApp>>;
const HEURE_MS = 60 * 60 * 1000;

beforeAll(async () => {
  app = await buildApp(loadConfig({ ...process.env, DEFI_DELAI_VALIDATION_HEURES: '24' }));
});

afterAll(() => app.close());

async function participantAvecDefi() {
  const filieres = (await app.inject({ method: 'GET', url: '/api/filieres' })).json();
  const inscription = await app.inject({
    method: 'POST',
    url: '/api/participants',
    payload: { filiereId: filieres[0].id, annee: 'L2', consentement: true },
  });
  const headers = { authorization: `Bearer ${jetonDe(inscription)}` };
  await app.inject({
    method: 'POST',
    url: '/api/bilans',
    headers,
    payload: { type: 'STAND', situation: { 'transport . voiture . utilisateur': 'propriétaire', 'transport . voiture . km': 8000 } },
  });
  const { defis } = (await app.inject({ method: 'GET', url: '/api/defis', headers })).json();
  const engagement = (await app.inject({ method: 'POST', url: '/api/engagements', headers, payload: { defiId: defis[0].id } })).json();
  return { headers, engagement };
}

const repondre = (headers: { authorization: string }, id: string, statut: string) =>
  app.inject({ method: 'PATCH', url: `/api/engagements/${id}`, headers, payload: { statut } });

describe('délai minimum avant de valider un défi', () => {
  it('indique dans chaque engagement à partir de quand il est validable', async () => {
    const { headers, engagement } = await participantAvecDefi();
    expect(new Date(engagement.validableAt).getTime() - new Date(engagement.createdAt).getTime()).toBe(24 * HEURE_MS);
    const [liste] = (await app.inject({ method: 'GET', url: '/api/engagements', headers })).json();
    expect(liste.validableAt).toBe(engagement.validableAt);
  });

  it('refuse « Tenu » juste après le choix, sans rien modifier', async () => {
    const { headers, engagement } = await participantAvecDefi();
    const res = await repondre(headers, engagement.id, 'VALIDE');
    expect(res.statusCode).toBe(409);
    expect(res.json().code).toBe('VALIDATION_TROP_TOT');
    expect(res.json().message).toMatch(/à partir de/);
    const enBase = await app.prisma.engagement.findUniqueOrThrow({ where: { id: engagement.id } });
    expect(enBase).toMatchObject({ statut: 'EN_COURS', reponduAt: null });
  });

  it('accepte « Non tenu » à tout moment', async () => {
    const { headers, engagement } = await participantAvecDefi();
    const res = await repondre(headers, engagement.id, 'NON_TENU');
    expect(res.statusCode).toBe(200);
    expect(res.json().statut).toBe('NON_TENU');
  });

  it('accepte « Tenu » une fois le délai écoulé', async () => {
    const { headers, engagement } = await participantAvecDefi();
    await app.prisma.engagement.update({
      where: { id: engagement.id },
      data: { createdAt: new Date(Date.now() - 25 * HEURE_MS) },
    });
    const res = await repondre(headers, engagement.id, 'VALIDE');
    expect(res.statusCode).toBe(200);
    expect(res.json().statut).toBe('VALIDE');
  });

  it('« Non tenu » puis changement d’avis : « Tenu » attend quand même le délai', async () => {
    const { headers, engagement } = await participantAvecDefi();
    await repondre(headers, engagement.id, 'NON_TENU');
    expect((await repondre(headers, engagement.id, 'VALIDE')).statusCode).toBe(409);
  });
});

describe('sans délai (DEFI_DELAI_VALIDATION_HEURES=0)', () => {
  it('accepte « Tenu » même si l’horloge de la base est en avance sur celle de l’API', async () => {
    const sansDelai = await buildApp(loadConfig({ ...process.env, DEFI_DELAI_VALIDATION_HEURES: '0' }));
    try {
      const filieres = (await sansDelai.inject({ method: 'GET', url: '/api/filieres' })).json();
      const inscription = await sansDelai.inject({ method: 'POST', url: '/api/participants', payload: { filiereId: filieres[0].id, annee: 'L2', consentement: true } });
      const headers = { authorization: `Bearer ${jetonDe(inscription)}` };
      await sansDelai.inject({ method: 'POST', url: '/api/bilans', headers, payload: { type: 'STAND', situation: {} } });
      const { defis } = (await sansDelai.inject({ method: 'GET', url: '/api/defis', headers })).json();
      const engagement = (await sansDelai.inject({ method: 'POST', url: '/api/engagements', headers, payload: { defiId: defis[0].id } })).json();
      // Cas vécu en CI : createdAt (posé par PostgreSQL) quelques millisecondes après Date.now() côté Node.
      await sansDelai.prisma.engagement.update({ where: { id: engagement.id }, data: { createdAt: new Date(Date.now() + 5000) } });
      const res = await sansDelai.inject({ method: 'PATCH', url: `/api/engagements/${engagement.id}`, headers, payload: { statut: 'VALIDE' } });
      expect(res.statusCode).toBe(200);
      expect(res.json().statut).toBe('VALIDE');
    } finally {
      await sansDelai.close();
    }
  });
});
