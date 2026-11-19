import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import { z } from 'zod';

export const niveauAnnonceSchema = z.enum(['INFO', 'ATTENTION', 'IMPORTANT']);

// Bandeau d'information affiché sur toutes les pages du site (sans authentification).
const routes: FastifyPluginAsyncZod = async (app) => {
  app.get(
    '/annonce',
    {
      schema: {
        tags: ['Site'],
        summary: 'Message d’information en cours (bandeau du site), ou null',
        description:
          '`version` change à chaque modification du message : le site s’en sert pour réafficher un ' +
          'message que la personne avait masqué, s’il a été modifié depuis.',
        response: {
          200: z.object({
            annonce: z
              .object({
                texte: z.string(),
                niveau: niveauAnnonceSchema,
                fin: z.iso.datetime().nullable(),
                version: z.iso.datetime(),
              })
              .nullable(),
          }),
        },
      },
    },
    async (_, reply) => {
      reply.header('cache-control', 'no-store');
      const annonce = await app.annonce.publique();
      return {
        annonce: annonce && {
          texte: annonce.texte,
          niveau: annonce.niveau,
          fin: annonce.fin?.toISOString() ?? null,
          version: annonce.version.toISOString(),
        },
      };
    },
  );
};

export default routes;
