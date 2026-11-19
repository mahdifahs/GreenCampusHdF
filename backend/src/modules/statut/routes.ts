import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import { z } from 'zod';

// État du site, lu par le front au chargement : s'il est en maintenance, il affiche sa page dédiée.
// Seule route publique encore joignable pendant la maintenance (voir plugins/maintenance.ts).
const routes: FastifyPluginAsyncZod = async (app) => {
  app.get(
    '/statut',
    {
      schema: {
        tags: ['Site'],
        summary: 'État du site (maintenance en cours ou non)',
        response: { 200: z.object({ maintenance: z.boolean() }) },
      },
    },
    async (_, reply) => {
      reply.header('cache-control', 'no-store');
      return { maintenance: await app.maintenance.active() };
    },
  );
};

export default routes;
