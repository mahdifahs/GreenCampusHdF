import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import { z } from 'zod';

export const evenementPublicSchema = z.object({
  id: z.uuid(),
  titre: z.string(),
  description: z.string().nullable(),
  lieu: z.string().nullable(),
  dateDebut: z.iso.datetime().nullable(),
  dateFin: z.iso.datetime().nullable(),
});

const routes: FastifyPluginAsyncZod = async (app) => {
  app.get(
    '/evenements',
    {
      schema: {
        tags: ['Évènements'],
        summary: 'Évènements publiés : sans date d’abord, puis par date de début (page d’accueil, sans authentification)',
        response: { 200: z.array(evenementPublicSchema) },
      },
    },
    async () => {
      const evenements = await app.prisma.evenement.findMany({
        where: { statut: 'PUBLIE' },
        // Sans date (message général) en tête, puis par date de début croissante.
        orderBy: [{ dateDebut: { sort: 'asc', nulls: 'first' } }, { createdAt: 'asc' }],
      });
      return evenements.map((e) => ({
        id: e.id,
        titre: e.titre,
        description: e.description,
        lieu: e.lieu,
        dateDebut: e.dateDebut?.toISOString() ?? null,
        dateFin: e.dateFin?.toISOString() ?? null,
      }));
    },
  );
};

export default routes;
