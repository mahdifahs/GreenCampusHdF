import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import { z } from 'zod';
import { erreurSchema } from '../../lib/schemas.js';

const JOUR_MS = 24 * 60 * 60 * 1000;

// Routes de développement uniquement (non enregistrées en production) : simuler le passage du temps
// pour tester les questionnaires J+7 / J+14 et les notifications sans attendre.
const routes: FastifyPluginAsyncZod = async (app) => {
  app.post(
    '/vieillir-bilans',
    {
      preHandler: app.authenticate,
      schema: {
        tags: ['Développement'],
        summary: '[DEV] Décaler mes bilans dans le passé de N jours',
        security: [{ bearerAuth: [] as string[] }, { cookieParticipant: [] as string[] }],
        body: z.object({ jours: z.number().int().min(1).max(60) }),
        response: { 200: z.object({ bilansDecales: z.number().int() }), 401: erreurSchema },
      },
    },
    async (request) => {
      const decalage = request.body.jours * JOUR_MS;
      const bilans = await app.prisma.bilan.findMany({ where: { participantId: request.participantId } });
      for (const b of bilans) {
        await app.prisma.bilan.update({ where: { id: b.id }, data: { createdAt: new Date(b.createdAt.getTime() - decalage) } });
      }
      return { bilansDecales: bilans.length };
    },
  );

  app.post(
    '/relances',
    {
      schema: {
        tags: ['Développement'],
        summary: '[DEV] Lancer l’envoi des notifications de relance maintenant',
        response: { 200: z.object({ participantsNotifies: z.number().int() }), 409: erreurSchema },
      },
    },
    async (_, reply) => {
      if (!app.lancerRelances) {
        return reply.status(409).send({ code: 'NOTIFICATIONS_DESACTIVEES', message: 'Clés VAPID absentes du .env.' });
      }
      return { participantsNotifies: await app.lancerRelances() };
    },
  );
};

export default routes;
