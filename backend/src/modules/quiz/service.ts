import { randomUUID } from 'node:crypto';
import type { PrismaClient } from '@prisma/client';
import { ErreurApi } from '../../lib/errors.js';
import { correction, QUESTIONS_QUIZ } from './questions.js';

// Corrige une partie et l'enregistre anonymement (aucun lien avec un compte).
export async function corriger(prisma: PrismaClient, reponses: Record<string, string>) {
  const erreurs: { champ: string; message: string }[] = [];
  const lignes = Object.entries(reponses).map(([questionId, choix]) => {
    const q = QUESTIONS_QUIZ.find((x) => x.id === questionId);
    if (!q) erreurs.push({ champ: questionId, message: 'Question inconnue.' });
    else if (!q.choix.some((c) => c.id === choix)) erreurs.push({ champ: questionId, message: 'Choix inconnu.' });
    return { q, choix };
  });
  if (erreurs.length) throw new ErreurApi(400, 'REPONSES_INVALIDES', 'Certaines réponses ne sont pas valides.', erreurs);

  const partie = randomUUID();
  await prisma.quizReponse.createMany({
    data: lignes.map(({ q, choix }) => ({ partie, questionId: q!.id, choix, correct: choix === q!.bonneReponse })),
  });

  // Taux de réussite de tous les joueurs, pour « tu fais partie des X % qui ont trouvé ».
  const taux = await tauxDeReussite(prisma);
  const corrections = lignes.map(({ q, choix }) => ({
    questionId: q!.id,
    question: q!.question,
    choix,
    correct: choix === q!.bonneReponse,
    ...correction(q!),
    tauxReussite: taux.get(q!.id) ?? 0,
  }));
  return { score: corrections.filter((c) => c.correct).length, total: corrections.length, corrections };
}

async function tauxDeReussite(prisma: PrismaClient) {
  const groupes = await prisma.quizReponse.groupBy({ by: ['questionId', 'correct'], _count: true });
  const taux = new Map<string, number>();
  for (const q of QUESTIONS_QUIZ) {
    const bons = groupes.find((g) => g.questionId === q.id && g.correct)?._count ?? 0;
    const total = groupes.filter((g) => g.questionId === q.id).reduce((n, g) => n + g._count, 0);
    taux.set(q.id, total ? Math.round((100 * bons) / total) : 0);
  }
  return taux;
}

// Statistiques détaillées pour l'administration (répartition des choix par question).
export async function statistiques(prisma: PrismaClient) {
  const [groupes, parties] = await Promise.all([
    prisma.quizReponse.groupBy({ by: ['questionId', 'choix'], _count: true }),
    prisma.quizReponse.findMany({ distinct: ['partie'], select: { partie: true } }),
  ]);
  return {
    parties: parties.length,
    questions: QUESTIONS_QUIZ.map((q) => {
      const repartition = q.choix.map((c) => ({
        choix: c.id,
        texte: c.texte,
        correct: c.id === q.bonneReponse,
        nombre: groupes.find((g) => g.questionId === q.id && g.choix === c.id)?._count ?? 0,
      }));
      const total = repartition.reduce((n, r) => n + r.nombre, 0);
      const bons = repartition.find((r) => r.correct)!.nombre;
      return { id: q.id, question: q.question, reponses: total, tauxReussite: total ? Math.round((100 * bons) / total) : 0, repartition };
    }),
  };
}

// Résumé public pour le tableau de bord du stand.
export async function resume(prisma: PrismaClient) {
  const [parties, total, bons] = await Promise.all([
    prisma.quizReponse.findMany({ distinct: ['partie'], select: { partie: true } }),
    prisma.quizReponse.count(),
    prisma.quizReponse.count({ where: { correct: true } }),
  ]);
  return { parties: parties.length, tauxReussite: total ? Math.round((100 * bons) / total) : null };
}
