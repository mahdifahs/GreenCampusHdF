import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { buildApp } from '../src/app.js';
import { loadConfig } from '../src/config.js';
import { QUESTIONS_QUIZ } from '../src/modules/quiz/questions.js';
import { QUESTIONNAIRES } from '../src/modules/suivis/questionnaire.js';
import { connecterAdmin } from './aide-admin.js';

let app: Awaited<ReturnType<typeof buildApp>>;

beforeAll(async () => {
  app = await buildApp(loadConfig({ ...process.env, ADMIN_ENABLED: 'true' }));
});

afterAll(() => app.close());

const toutesBonnes = () => Object.fromEntries(QUESTIONS_QUIZ.map((q) => [q.id, q.bonneReponse]));

describe('guide « IA responsable »', () => {
  it('fournit tout le contenu de la page, chaque chiffre avec sa source', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/guide-ia' });
    expect(res.statusCode).toBe(200);
    const g = res.json();
    expect(g.titre).toBeTruthy();
    expect(g.chiffresCles.length).toBeGreaterThanOrEqual(4);
    expect(g.conseils.length).toBeGreaterThanOrEqual(6);
    expect(g.ideesRecues.length).toBeGreaterThanOrEqual(3);
    for (const bloc of [...g.chiffresCles, ...g.conseils, ...g.ideesRecues, g.ordreDeGrandeur]) {
      expect(bloc.source.url).toMatch(/^https:\/\//);
    }
    // Toute source citée figure dans la liste finale des sources.
    const urls = new Set(g.sources.map((s: { url: string }) => s.url));
    for (const bloc of [...g.chiffresCles, ...g.conseils, ...g.ideesRecues]) expect(urls.has(bloc.source.url)).toBe(true);
  });
});

describe('quiz du stand', () => {
  it('a des questions cohérentes (bonne réponse parmi les choix, identifiants uniques)', () => {
    expect(new Set(QUESTIONS_QUIZ.map((q) => q.id)).size).toBe(QUESTIONS_QUIZ.length);
    for (const q of QUESTIONS_QUIZ) expect(q.choix.map((c) => c.id), q.id).toContain(q.bonneReponse);
  });

  it('ne révèle pas les réponses avant d’avoir joué', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/quiz' });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toHaveLength(QUESTIONS_QUIZ.length);
    expect(res.body).not.toMatch(/bonneReponse|explication/);
  });

  it('corrige une partie, explique, cite la source et donne le taux de réussite', async () => {
    const reponses = { ...toutesBonnes(), 'ia-raisonnement': 'a' }; // une erreur volontaire
    const res = await app.inject({ method: 'POST', url: '/api/quiz/reponses', payload: { reponses } });
    expect(res.statusCode).toBe(200);
    const r = res.json();
    expect(r).toMatchObject({ score: QUESTIONS_QUIZ.length - 1, total: QUESTIONS_QUIZ.length });
    const raisonnement = r.corrections.find((c: { questionId: string }) => c.questionId === 'ia-raisonnement');
    expect(raisonnement).toMatchObject({ correct: false, bonneReponse: 'c' });
    expect(raisonnement.explication).toMatch(/30/);
    expect(raisonnement.source.url).toMatch(/^https:\/\//);
    expect(raisonnement.tauxReussite).toBeGreaterThanOrEqual(0);
    expect(raisonnement.tauxReussite).toBeLessThanOrEqual(100);
  });

  it('refuse les questions ou choix inconnus, et une partie vide', async () => {
    const inconnue = await app.inject({ method: 'POST', url: '/api/quiz/reponses', payload: { reponses: { 'pas-une-question': 'a', 'ia-eau': 'z' } } });
    expect(inconnue.statusCode).toBe(400);
    expect(inconnue.json().details.map((d: { champ: string }) => d.champ).sort()).toEqual(['ia-eau', 'pas-une-question']);
    expect((await app.inject({ method: 'POST', url: '/api/quiz/reponses', payload: { reponses: {} } })).statusCode).toBe(400);
  });

  it('enregistre les parties anonymement et les compte au tableau de bord', async () => {
    const avant = (await app.inject({ method: 'GET', url: '/api/tableau-de-bord' })).json().quiz.parties;
    await app.inject({ method: 'POST', url: '/api/quiz/reponses', payload: { reponses: toutesBonnes() } });
    const apres = (await app.inject({ method: 'GET', url: '/api/tableau-de-bord' })).json().quiz;
    expect(apres.parties).toBe(avant + 1);
    expect(apres.tauxReussite).toBeGreaterThan(0);
    const colonnes = Object.keys((await app.prisma.quizReponse.findFirst())!);
    expect(colonnes).not.toContain('participantId');
  });

  it('remonte dans l’administration (statistiques et export CSV)', async () => {
    const headers = await connecterAdmin(app);
    const stats = (await app.inject({ method: 'GET', url: '/api/admin/stats', headers })).json();
    expect(stats.quiz.parties).toBeGreaterThan(0);
    const q = stats.quiz.questions.find((x: { id: string }) => x.id === 'ia-raisonnement');
    expect(q.repartition.find((r: { correct: boolean }) => r.correct).choix).toBe('c');

    const csv = await app.inject({ method: 'GET', url: '/api/admin/export/quiz', headers });
    expect(csv.statusCode).toBe(200);
    expect(csv.body.replace('﻿', '').split('\r\n')[0]).toBe('partie;date;question;choix;reponse_choisie;correct');
  });
});

describe('questionnaire J+14', () => {
  it('demande si l’usage de l’IA a changé', () => {
    const q = QUESTIONNAIRES.J14.find((x) => x.id === 'usage-ia');
    expect(q?.type).toBe('choix');
  });
});
