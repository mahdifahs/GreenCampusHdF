import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import { z } from 'zod';
import * as service from './service.js';

const categoriesSchema = z.object({
  transport: z.number(),
  alimentation: z.number(),
  logement: z.number(),
  divers: z.number(),
  servicesSocietaux: z.number(),
});

const tableauSchema = z.object({
  seuilAnonymat: z.number().int(),
  participants: z.number().int(),
  participantsAvecBilan: z.number().int(),
  empreinteMoyenneKg: z.number().nullable().describe('null tant qu’il y a moins de bilans que le seuil d’anonymat'),
  parCategorieMoyenne: categoriesSchema.nullable(),
  co2EviteKg: z.number(),
  defisValides: z.number().int(),
  defisEnCours: z.number().int(),
  defisNonTenus: z.number().int(),
  defisPopulaires: z.array(z.object({ titre: z.string(), engagements: z.number().int() })),
  classementFilieres: z.array(
    z.object({
      rang: z.number().int(),
      filiere: z.object({ id: z.number().int(), libelle: z.string() }),
      participants: z.number().int(),
      bilans: z.number().int(),
      empreinteMoyenneKg: z.number().nullable(),
      co2EviteKg: z.number(),
      co2EviteKgParParticipant: z.number(),
      defisValides: z.number().int(),
    }),
  ),
  filieresMasquees: z.number().int().describe('Filières non affichées car sous le seuil d’anonymat'),
  suivis: z.object({
    reponsesJ7: z.number().int(),
    reponsesJ14: z.number().int(),
    changementDeclareJ14: z.record(z.string(), z.number().int()),
  }),
  quiz: z.object({
    parties: z.number().int(),
    tauxReussite: z.number().int().nullable().describe('Pourcentage de bonnes réponses au quiz, tous joueurs confondus'),
  }),
  misAJourA: z.iso.datetime(),
});

// Le tableau est affiché en continu sur l'écran du stand : on ne le recalcule qu'après `cacheMs`.
const routes: FastifyPluginAsyncZod<{ seuil: number; cacheMs: number }> = async (app, opts) => {
  let cache: { valeur: z.infer<typeof tableauSchema>; expire: number } | undefined;

  app.get(
    '/tableau-de-bord',
    {
      schema: {
        tags: ['Tableau de bord'],
        summary: 'Statistiques collectives anonymes (sans authentification)',
        description:
          'Classement des filières par CO2 évité par participant. Une filière n’apparaît qu’à partir du seuil ' +
          'd’anonymat ; les moyennes restent à null tant qu’il n’y a pas assez de bilans. Résultat mis en cache quelques secondes.',
        response: { 200: tableauSchema },
      },
    },
    async () => {
      if (!cache || cache.expire < Date.now()) {
        cache = { valeur: await service.calculer(app.prisma, opts.seuil), expire: Date.now() + opts.cacheMs };
      }
      return cache.valeur;
    },
  );
};

export default routes;
