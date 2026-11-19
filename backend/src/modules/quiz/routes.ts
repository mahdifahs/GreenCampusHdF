import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import { z } from 'zod';
import { erreurSchema } from '../../lib/schemas.js';
import { questionPublique, QUESTIONS_QUIZ } from './questions.js';
import * as service from './service.js';

const sourceSchema = z.object({ titre: z.string(), url: z.url(), date: z.string() });

const routes: FastifyPluginAsyncZod = async (app) => {
  app.get(
    '/quiz',
    {
      schema: {
        tags: ['IA responsable'],
        summary: 'Questions du quiz du stand (sans les réponses)',
        response: {
          200: z.array(
            z.object({
              id: z.string(),
              theme: z.string(),
              question: z.string(),
              choix: z.array(z.object({ id: z.string(), texte: z.string() })),
            }),
          ),
        },
      },
    },
    async () => QUESTIONS_QUIZ.map(questionPublique),
  );

  app.post(
    '/quiz/reponses',
    {
      config: { rateLimit: { max: 60, timeWindow: '1 minute' } },
      schema: {
        tags: ['IA responsable'],
        summary: 'Envoyer ses réponses : correction, explications, sources et taux de réussite des autres joueurs',
        description: 'Enregistré anonymement (aucun compte nécessaire, aucun lien avec un participant).',
        body: z.object({
          reponses: z
            .record(z.string().max(50), z.string().max(5))
            .refine((r) => Object.keys(r).length > 0 && Object.keys(r).length <= QUESTIONS_QUIZ.length, 'Nombre de réponses invalide.'),
        }),
        response: {
          200: z.object({
            score: z.number().int(),
            total: z.number().int(),
            corrections: z.array(
              z.object({
                questionId: z.string(),
                question: z.string(),
                choix: z.string(),
                correct: z.boolean(),
                bonneReponse: z.string(),
                explication: z.string(),
                source: sourceSchema,
                tauxReussite: z.number().int().describe('Pourcentage de joueurs ayant trouvé'),
              }),
            ),
          }),
          400: erreurSchema,
        },
      },
    },
    async (request) => service.corriger(app.prisma, request.body.reponses),
  );
};

export default routes;
