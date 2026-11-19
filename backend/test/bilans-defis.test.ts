import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { buildApp } from '../src/app.js';
import { loadConfig } from '../src/config.js';
import { QUESTIONNAIRES } from '../src/modules/suivis/questionnaire.js';
import { jetonDe } from './aide-session.js';

let app: Awaited<ReturnType<typeof buildApp>>;

beforeAll(async () => {
  app = await buildApp(loadConfig({ ...process.env }));
});

afterAll(() => app.close());

async function nouveauParticipant() {
  const filieres = (await app.inject({ method: 'GET', url: '/api/filieres' })).json();
  const res = await app.inject({
    method: 'POST',
    url: '/api/participants',
    payload: { filiereId: filieres[0].id, annee: 'L1', consentement: true },
  });
  return { authorization: `Bearer ${jetonDe(res)}` };
}

const situationEtudiant = {
  'transport . voiture . utilisateur': 'propriétaire',
  'transport . voiture . km': 8000,
  'logement . type': 'appartement',
  'logement . habitants': 2,
  'logement . surface': 30,
  'alimentation . plats . viande rouge . nombre': 5,
};

describe('bilans', () => {
  it('liste les questions du stand sans authentification', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/bilans/questions-stand' });
    expect(res.statusCode).toBe(200);
    expect(res.json().length).toBeGreaterThan(20);
    expect(res.json()[0]).toMatchObject({ dottedName: expect.any(String), question: expect.any(String) });
  });

  it('enregistre un bilan recalculé côté serveur et le restitue', async () => {
    const headers = await nouveauParticipant();
    const res = await app.inject({
      method: 'POST',
      url: '/api/bilans',
      headers,
      payload: { type: 'STAND', situation: situationEtudiant, totalKg: 1 }, // totalKg envoyé : ignoré
    });
    expect(res.statusCode).toBe(201);
    const bilan = res.json();
    expect(bilan.totalKg).toBeGreaterThan(1000);
    expect(bilan.nbReponses).toBe(6);
    expect(Object.keys(bilan.parCategorie).sort()).toEqual(
      ['alimentation', 'divers', 'logement', 'servicesSocietaux', 'transport'],
    );

    const dernier = (await app.inject({ method: 'GET', url: '/api/bilans/dernier', headers })).json();
    expect(dernier.id).toBe(bilan.id);
    expect(dernier.situation['logement . type']).toBe("'appartement'");

    const liste = (await app.inject({ method: 'GET', url: '/api/bilans', headers })).json();
    expect(liste).toHaveLength(1);
    expect(liste[0].situation).toBeUndefined();
  });

  it('refuse une situation invalide avec le détail des réponses en cause', async () => {
    const headers = await nouveauParticipant();
    const res = await app.inject({
      method: 'POST',
      url: '/api/bilans',
      headers,
      payload: { type: 'STAND', situation: { 'transport . voiture . km': 'bilan * 0', 'pas une question': 1 } },
    });
    expect(res.statusCode).toBe(400);
    expect(res.json().code).toBe('SITUATION_INVALIDE');
    expect(res.json().details.map((d: { champ: string }) => d.champ).sort()).toEqual([
      'pas une question',
      'transport . voiture . km',
    ]);
  });

  it('estime en direct sans rien enregistrer, et dit quelles questions restent applicables', async () => {
    const headers = await nouveauParticipant();
    const estimer = (situation: Record<string, string | number>) =>
      app.inject({ method: 'POST', url: '/api/bilans/estimation', headers, payload: { situation } });

    const proprio = await estimer(situationEtudiant);
    expect(proprio.statusCode).toBe(200);
    expect(proprio.json().applicables).toEqual(
      expect.arrayContaining(['transport . voiture . km', 'transport . voiture . motorisation']),
    );
    const enregistre = (
      await app.inject({ method: 'POST', url: '/api/bilans', headers, payload: { type: 'STAND', situation: situationEtudiant } })
    ).json();
    expect(proprio.json().totalKg).toBe(enregistre.totalKg);

    const sansVoiture = (await estimer({ 'transport . voiture . utilisateur': 'jamais' })).json();
    expect(sansVoiture.applicables).not.toContain('transport . voiture . km');
    expect(sansVoiture.applicables).not.toContain('transport . voiture . motorisation');
    expect(sansVoiture.totalKg).toBeLessThan(proprio.json().totalKg);

    const train = (await estimer({ 'transport . train . usager': 'oui' })).json().applicables;
    expect(train).toContain('transport . train . km');
    expect((await estimer({ 'transport . train . usager': 'non' })).json().applicables).not.toContain('transport . train . km');

    // Une seule ligne en base : celle enregistrée explicitement, pas les estimations.
    expect((await app.inject({ method: 'GET', url: '/api/bilans', headers })).json()).toHaveLength(1);
  });

  it('applique la même validation stricte à l’estimation, et exige une session', async () => {
    const headers = await nouveauParticipant();
    const piege = await app.inject({
      method: 'POST',
      url: '/api/bilans/estimation',
      headers,
      payload: { situation: { 'transport . voiture . km': 'bilan * 0' } },
    });
    expect(piege.statusCode).toBe(400);
    expect(piege.json().code).toBe('SITUATION_INVALIDE');
    expect((await app.inject({ method: 'POST', url: '/api/bilans/estimation', payload: { situation: {} } })).statusCode).toBe(401);
  });

  it('répond 404 quand il n’y a pas encore de bilan, et protège les routes', async () => {
    const headers = await nouveauParticipant();
    expect((await app.inject({ method: 'GET', url: '/api/bilans/dernier', headers })).statusCode).toBe(404);
    expect((await app.inject({ method: 'GET', url: '/api/bilans' })).statusCode).toBe(401);
  });
});

describe('défis', () => {
  it('propose un catalogue sourcé, avec 3 défis recommandés', async () => {
    const headers = await nouveauParticipant();
    const res = await app.inject({ method: 'GET', url: '/api/defis', headers });
    expect(res.statusCode).toBe(200);
    const { defis, categorieDominante } = res.json();
    expect(categorieDominante).toBeNull(); // pas encore de bilan : situation moyenne
    expect(defis.filter((d: { recommande: boolean }) => d.recommande)).toHaveLength(3);
    for (const d of defis) {
      expect(d.co2EviteKgSemaine).toBeGreaterThan(0);
      expect(d.source).toMatch(/^Nos Gestes Climat \(ADEME\)/);
    }
  });

  it('cible la catégorie la plus émettrice du bilan', async () => {
    const headers = await nouveauParticipant();
    await app.inject({
      method: 'POST',
      url: '/api/bilans',
      headers,
      payload: { type: 'STAND', situation: { 'transport . voiture . utilisateur': 'propriétaire', 'transport . voiture . km': 40000 } },
    });
    const { defis, categorieDominante } = (await app.inject({ method: 'GET', url: '/api/defis', headers })).json();
    expect(categorieDominante).toBe('transport');
    expect(defis[0]).toMatchObject({ recommande: true, categorie: 'TRANSPORT' });
    // Les deux autres recommandés sont les plus gros gains restants, toutes catégories confondues.
    const autres = defis.slice(1);
    expect(autres[0].co2EviteKgSemaine).toBe(Math.max(...autres.map((d: { co2EviteKgSemaine: number }) => d.co2EviteKgSemaine)));
  });

  it('gère tout le cycle d’un engagement et calcule l’impact', async () => {
    const headers = await nouveauParticipant();
    const { defis } = (await app.inject({ method: 'GET', url: '/api/defis', headers })).json();
    const [a, b, c, d] = defis;

    const e1 = await app.inject({ method: 'POST', url: '/api/engagements', headers, payload: { defiId: a.id } });
    expect(e1.statusCode).toBe(201);
    expect(e1.json()).toMatchObject({ statut: 'EN_COURS', co2EviteKgSemaine: a.co2EviteKgSemaine });

    const doublon = await app.inject({ method: 'POST', url: '/api/engagements', headers, payload: { defiId: a.id } });
    expect(doublon.json().code).toBe('DEJA_ENGAGE');

    await app.inject({ method: 'POST', url: '/api/engagements', headers, payload: { defiId: b.id } });
    const e3 = await app.inject({ method: 'POST', url: '/api/engagements', headers, payload: { defiId: c.id } });
    const trop = await app.inject({ method: 'POST', url: '/api/engagements', headers, payload: { defiId: d.id } });
    expect(trop.statusCode).toBe(409);
    expect(trop.json().code).toBe('LIMITE_DEFIS');

    // Retirer un défi en cours libère une place.
    expect((await app.inject({ method: 'DELETE', url: `/api/engagements/${e3.json().id}`, headers })).statusCode).toBe(204);

    const valide = await app.inject({
      method: 'PATCH',
      url: `/api/engagements/${e1.json().id}`,
      headers,
      payload: { statut: 'VALIDE' },
    });
    expect(valide.json()).toMatchObject({ statut: 'VALIDE', reponduAt: expect.any(String) });

    const termine = await app.inject({ method: 'DELETE', url: `/api/engagements/${e1.json().id}`, headers });
    expect(termine.json().code).toBe('ENGAGEMENT_TERMINE');

    const liste = (await app.inject({ method: 'GET', url: '/api/engagements', headers })).json();
    expect(liste).toHaveLength(2);

    const impact = (await app.inject({ method: 'GET', url: '/api/me/impact', headers })).json();
    expect(impact).toEqual({ co2EviteKg: a.co2EviteKgSemaine, defisValides: 1, defisEnCours: 1, defisNonTenus: 0 });
  });

  it('permet de changer d’avis sans réécrire la date de la première réponse ni compter deux fois', async () => {
    const headers = await nouveauParticipant();
    const { defis } = (await app.inject({ method: 'GET', url: '/api/defis', headers })).json();
    const e = (await app.inject({ method: 'POST', url: '/api/engagements', headers, payload: { defiId: defis[0].id } })).json();
    const patch = (statut: string) => app.inject({ method: 'PATCH', url: `/api/engagements/${e.id}`, headers, payload: { statut } });

    const premiere = (await patch('VALIDE')).json().reponduAt;
    await new Promise((r) => setTimeout(r, 20));
    expect((await patch('NON_TENU')).json()).toMatchObject({ statut: 'NON_TENU', reponduAt: premiere });
    expect((await patch('VALIDE')).json()).toMatchObject({ statut: 'VALIDE', reponduAt: premiere });
    expect((await patch('VALIDE')).json().reponduAt).toBe(premiere);

    const impact = (await app.inject({ method: 'GET', url: '/api/me/impact', headers })).json();
    expect(impact).toMatchObject({ co2EviteKg: defis[0].co2EviteKgSemaine, defisValides: 1 });
  });

  it('empêche de modifier l’engagement de quelqu’un d’autre', async () => {
    const alice = await nouveauParticipant();
    const bob = await nouveauParticipant();
    const { defis } = (await app.inject({ method: 'GET', url: '/api/defis', headers: alice })).json();
    const e = (await app.inject({ method: 'POST', url: '/api/engagements', headers: alice, payload: { defiId: defis[0].id } })).json();

    const patch = await app.inject({ method: 'PATCH', url: `/api/engagements/${e.id}`, headers: bob, payload: { statut: 'VALIDE' } });
    expect(patch.statusCode).toBe(404);
    const del = await app.inject({ method: 'DELETE', url: `/api/engagements/${e.id}`, headers: bob });
    expect(del.statusCode).toBe(404);
  });

  it('refuse un défi qui ne concerne pas la personne', async () => {
    const headers = await nouveauParticipant();
    await app.inject({
      method: 'POST',
      url: '/api/bilans',
      headers,
      payload: { type: 'STAND', situation: { 'transport . voiture . utilisateur': 'jamais' } },
    });
    const { defis } = (await app.inject({ method: 'GET', url: '/api/defis', headers })).json();
    expect(defis.some((d: { slug: string }) => d.slug === 'eco-conduite')).toBe(false);

    const tous = await app.inject({ method: 'GET', url: '/api/defis', headers: await nouveauParticipant() });
    const ecoConduite = tous.json().defis.find((d: { slug: string }) => d.slug === 'eco-conduite');
    const res = await app.inject({ method: 'POST', url: '/api/engagements', headers, payload: { defiId: ecoConduite.id } });
    expect(res.statusCode).toBe(409);
    expect(res.json().code).toBe('DEFI_NON_PERTINENT');
  });

  it('supprime bilans et engagements avec le compte (RGPD)', async () => {
    const headers = await nouveauParticipant();
    await app.inject({ method: 'POST', url: '/api/bilans', headers, payload: { type: 'STAND', situation: {} } });
    const { defis } = (await app.inject({ method: 'GET', url: '/api/defis', headers })).json();
    await app.inject({ method: 'POST', url: '/api/engagements', headers, payload: { defiId: defis[0].id } });
    const me = (await app.inject({ method: 'GET', url: '/api/me', headers })).json();

    await app.inject({ method: 'DELETE', url: '/api/me', headers });
    expect(await app.prisma.bilan.count({ where: { participantId: me.id } })).toBe(0);
    expect(await app.prisma.engagement.count({ where: { participantId: me.id } })).toBe(0);
  });

  it('efface aussi suivis, abonnements push et relances, et invalide la session (RGPD)', async () => {
    const headers = await nouveauParticipant();
    await app.inject({ method: 'POST', url: '/api/bilans', headers, payload: { type: 'STAND', situation: {} } });
    const me = (await app.inject({ method: 'GET', url: '/api/me', headers })).json();
    // Bilan vieilli de 15 jours : les deux questionnaires de suivi deviennent disponibles.
    await app.prisma.bilan.updateMany({ where: { participantId: me.id }, data: { createdAt: new Date(Date.now() - 15 * 86_400_000) } });
    for (const etape of ['J7', 'J14'] as const) {
      const reponses = Object.fromEntries(
        QUESTIONNAIRES[etape].map((q) => [q.id, q.type === 'choix' ? q.options[0].valeur : q.min]),
      );
      expect((await app.inject({ method: 'POST', url: '/api/suivis', headers, payload: { etape, reponses } })).statusCode).toBe(201);
    }
    await app.prisma.pushAbonnement.create({ data: { participantId: me.id, endpoint: `https://push.example/${me.id}`, p256dh: 'x', auth: 'y' } });
    await app.prisma.relance.create({ data: { participantId: me.id, etape: 'J7' } });

    expect((await app.inject({ method: 'DELETE', url: '/api/me', headers })).statusCode).toBe(204);
    const ou = { where: { participantId: me.id } };
    expect(await app.prisma.participant.count({ where: { id: me.id } })).toBe(0);
    expect(await app.prisma.suivi.count(ou)).toBe(0);
    expect(await app.prisma.pushAbonnement.count(ou)).toBe(0);
    expect(await app.prisma.relance.count(ou)).toBe(0);
    expect(await app.prisma.bilan.count(ou)).toBe(0);
    expect((await app.inject({ method: 'GET', url: '/api/me', headers })).statusCode).toBe(401);
  });
});
