import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import { z } from 'zod';
import { GUIDE_IA } from './contenu.js';

const sourceSchema = z.object({ titre: z.string(), url: z.url(), date: z.string() });

const guideSchema = z.object({
  titre: z.string(),
  miseAJour: z.iso.date(),
  introduction: z.string(),
  chiffresCles: z.array(z.object({ valeur: z.string(), libelle: z.string(), source: sourceSchema })),
  ordreDeGrandeur: z.object({ texte: z.string(), source: sourceSchema }),
  conseils: z.array(z.object({ titre: z.string(), explication: z.string(), source: sourceSchema })),
  ideesRecues: z.array(z.object({ idee: z.string(), realite: z.string(), source: sourceSchema })),
  outils: z.array(z.object({ nom: z.string(), description: z.string(), url: z.url() })),
  sources: z.array(sourceSchema),
});

const routes: FastifyPluginAsyncZod = async (app) => {
  app.get(
    '/guide-ia',
    {
      schema: {
        tags: ['IA responsable'],
        summary: 'Guide « Utiliser l’IA de façon responsable » (contenu de la page dédiée)',
        description:
          'Chiffres clés, ordre de grandeur, conseils, idées reçues, outils et sources. Chaque chiffre est accompagné de sa source.',
        response: { 200: guideSchema },
      },
    },
    async () => GUIDE_IA,
  );
};

export default routes;
