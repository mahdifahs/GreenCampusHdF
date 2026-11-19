import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import { z } from 'zod';
import { collectePublique } from '../admin/vetements.js';

// Totaux de la collecte de vêtements, affichés sur le tableau de bord public. Aucune donnée
// personnelle : uniquement des quantités globales saisies par l'équipe dans l'admin.
const routes: FastifyPluginAsyncZod = async (app) => {
  app.get(
    '/vetements/collecte',
    {
      schema: {
        tags: ['Tableau de bord'],
        summary: 'Collecte de vêtements : pièces, kilos et CO2 évité',
        description:
          'Kilos = nombre de pièces × poids moyen du type ; CO2 = kilos × facteur de la matière (Ecobalyse). ' +
          'donneesIncompletes signale qu’un type ou une matière utilisé n’a pas encore de poids ou de facteur (chiffres alors sous-estimés).',
        response: {
          200: z.object({
            nombreRecuperes: z.number().int(),
            nombreDonnes: z.number().int(),
            poidsRecupereKg: z.number(),
            poidsDonneKg: z.number(),
            co2EviteDonneKg: z.number(),
            co2EviteRecupereKg: z.number(),
            donneesIncompletes: z.boolean(),
          }),
        },
      },
    },
    async () => collectePublique(app.prisma),
  );
};

export default routes;
