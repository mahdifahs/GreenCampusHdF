import { EtapeSuivi } from '@prisma/client';
import type { FastifyPluginAsyncZod, ZodTypeProvider } from 'fastify-type-provider-zod';
import { z } from 'zod';
import { erreurSchema } from '../../lib/schemas.js';
import * as service from './service.js';

const questionSchema = z.union([
  z.object({
    id: z.string(),
    question: z.string(),
    type: z.literal('choix'),
    options: z.array(z.object({ valeur: z.string(), libelle: z.string() })),
  }),
  z.object({
    id: z.string(),
    question: z.string(),
    type: z.literal('echelle'),
    min: z.number().int(),
    max: z.number().int(),
    libelleMin: z.string(),
    libelleMax: z.string(),
  }),
]);

const securite: Record<string, string[]>[] = [{ bearerAuth: [] }, { cookieParticipant: [] }];

const routes: FastifyPluginAsyncZod<{ clePublique: string }> = async (app, opts) => {
  app.get(
    '/push/cle-publique',
    {
      schema: {
        tags: ['Relances'],
        summary: 'Clé publique VAPID pour s’abonner aux notifications (null si désactivées)',
        response: { 200: z.object({ clePublique: z.string().nullable() }) },
      },
    },
    async () => ({ clePublique: opts.clePublique || null }),
  );

  // Sous-contexte où toutes les routes demandent une session.
  await app.register(async (contexte) => {
    const prive = contexte.withTypeProvider<ZodTypeProvider>();
    prive.addHook('preHandler', app.authenticate);

    prive.get(
      '/suivis/a-faire',
      {
        schema: {
          tags: ['Relances'],
          summary: 'Mes questionnaires de suivi (J+7 et J+14 après mon premier bilan) non remplis',
          security: securite,
          response: {
            200: z.object({
              jourZero: z.iso.datetime().nullable(),
              etapes: z.array(
                z.object({
                  etape: z.enum(EtapeSuivi),
                  disponibleLe: z.iso.datetime(),
                  disponible: z.boolean(),
                  questions: z.array(questionSchema),
                }),
              ),
            }),
            401: erreurSchema,
          },
        },
      },
      async (request) => service.aFaire(app.prisma, request.participantId),
    );

    prive.post(
      '/suivis',
      {
        schema: {
          tags: ['Relances'],
          summary: 'Répondre à un questionnaire de suivi',
          security: securite,
          body: z.object({
            etape: z.enum(EtapeSuivi),
            reponses: z.record(z.string().max(50), z.union([z.string().max(50), z.number()])),
          }),
          response: {
            201: z.object({ etape: z.enum(EtapeSuivi), createdAt: z.iso.datetime() }),
            400: erreurSchema,
            401: erreurSchema,
            409: erreurSchema,
          },
        },
      },
      async (request, reply) => {
        const s = await service.repondre(app.prisma, request.participantId, request.body.etape, request.body.reponses);
        return reply.status(201).send({ etape: s.etape, createdAt: s.createdAt.toISOString() });
      },
    );

    prive.post(
      '/push/abonnement',
      {
        schema: {
          tags: ['Relances'],
          summary: 'Activer les notifications de relance sur cet appareil',
          description: 'Corps : l’objet PushSubscription du navigateur (subscription.toJSON()).',
          security: securite,
          body: z.object({
            endpoint: z.url().max(1000).startsWith('https://'),
            keys: z.object({ p256dh: z.string().max(200), auth: z.string().max(100) }),
          }),
          response: { 204: z.null(), 400: erreurSchema, 401: erreurSchema },
        },
      },
      async (request, reply) => {
        await service.enregistrerAbonnement(app.prisma, request.participantId, request.body);
        return reply.status(204).send(null);
      },
    );

    prive.delete(
      '/push/abonnement',
      {
        schema: {
          tags: ['Relances'],
          summary: 'Désactiver les notifications sur cet appareil',
          security: securite,
          body: z.object({ endpoint: z.string().max(1000) }),
          response: { 204: z.null(), 401: erreurSchema },
        },
      },
      async (request, reply) => {
        await service.supprimerAbonnement(app.prisma, request.participantId, request.body.endpoint);
        return reply.status(204).send(null);
      },
    );
  });
};

export default routes;
