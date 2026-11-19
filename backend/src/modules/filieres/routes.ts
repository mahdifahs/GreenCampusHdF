import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import { z } from 'zod';

export const filiereSchema = z.object({ id: z.number().int(), slug: z.string(), libelle: z.string() });

const routes: FastifyPluginAsyncZod = async (app) => {
  app.get(
    '/filieres',
    {
      schema: {
        tags: ['Filières'],
        summary: 'Liste des filières proposées à l’inscription',
        response: { 200: z.array(filiereSchema) },
      },
    },
    async () => app.prisma.filiere.findMany({ orderBy: { libelle: 'asc' } }),
  );
};

export default routes;
