import { CategorieDefi, StatutEngagement } from '@prisma/client';
import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import { z } from 'zod';
import { erreurSchema } from '../../lib/schemas.js';
import * as service from './service.js';

const defiSchema = z.object({
  id: z.number().int(),
  slug: z.string(),
  titre: z.string(),
  description: z.string(),
  categorie: z.enum(CategorieDefi),
  co2EviteKgSemaine: z.number().describe('CO2 évité estimé pour une semaine, en kg CO2e'),
  source: z.string(),
  recommande: z.boolean(),
});

const engagementSchema = z.object({
  id: z.uuid(),
  defi: z.object({ id: z.number().int(), slug: z.string(), titre: z.string(), categorie: z.enum(CategorieDefi) }),
  semaine: z.iso.date().describe('Lundi de la semaine du défi'),
  co2EviteKgSemaine: z.number(),
  statut: z.enum(StatutEngagement),
  createdAt: z.iso.datetime(),
  reponduAt: z.iso.datetime().nullable(),
  validableAt: z.iso.datetime().describe('À partir de quand « Tenu » est accepté (DEFI_DELAI_VALIDATION_HEURES après le choix)'),
});

const idParams = z.object({ id: z.uuid() });
const securite: Record<string, string[]>[] = [{ bearerAuth: [] }, { cookieParticipant: [] }];

const routes: FastifyPluginAsyncZod<{ delaiValidationMs: number }> = async (app, opts) => {
  const versPublic = (e: Parameters<typeof service.engagementVersPublic>[0]) => service.engagementVersPublic(e, opts.delaiValidationMs);

  app.addHook('preHandler', app.authenticate);

  app.get(
    '/defis',
    {
      schema: {
        tags: ['Défis'],
        summary: 'Catalogue des défis, personnalisé selon mon dernier bilan',
        description:
          'Le CO2 évité vient des actions du modèle Nos Gestes Climat, calculées avec mes réponses. ' +
          'Les défis qui ne me concernent pas sont retirés. Les 3 premiers (recommande = true) : le meilleur défi de ma catégorie la plus émettrice, puis les plus gros gains.',
        security: securite,
        response: {
          200: z.object({
            categorieDominante: z.enum(['transport', 'alimentation', 'logement', 'divers']).nullable(),
            defis: z.array(defiSchema),
          }),
          401: erreurSchema,
        },
      },
    },
    async (request) => service.catalogue(app.prisma, app.ngc, request.participantId),
  );

  app.post(
    '/engagements',
    {
      schema: {
        tags: ['Défis'],
        summary: `S'engager sur un défi pour la semaine en cours (${service.MAX_DEFIS_PAR_SEMAINE} maximum)`,
        security: securite,
        body: z.object({ defiId: z.number().int().positive() }),
        response: { 201: engagementSchema, 401: erreurSchema, 404: erreurSchema, 409: erreurSchema },
      },
    },
    async (request, reply) => {
      const e = await service.sEngager(app.prisma, app.ngc, request.participantId, request.body.defiId);
      return reply.status(201).send(versPublic(e));
    },
  );

  app.get(
    '/engagements',
    {
      schema: {
        tags: ['Défis'],
        summary: 'Mes défis (semaine en cours par défaut)',
        security: securite,
        querystring: z.object({ periode: z.enum(['semaine', 'tout']).default('semaine') }),
        response: { 200: z.array(engagementSchema), 401: erreurSchema },
      },
    },
    async (request) =>
      (await service.lister(app.prisma, request.participantId, request.query.periode === 'semaine')).map(
        versPublic,
      ),
  );

  app.patch(
    '/engagements/:id',
    {
      schema: {
        tags: ['Défis'],
        summary: 'Indiquer si un défi a été tenu (déclaratif)',
        description: '« Tenu » (VALIDE) n’est accepté qu’à partir de validableAt (409 VALIDATION_TROP_TOT sinon) ; « Non tenu » à tout moment.',
        security: securite,
        params: idParams,
        body: z.object({ statut: z.enum(['VALIDE', 'NON_TENU']) }),
        response: { 200: engagementSchema, 401: erreurSchema, 404: erreurSchema, 409: erreurSchema },
      },
    },
    async (request) =>
      versPublic(
        await service.repondre(app.prisma, request.participantId, request.params.id, request.body.statut, opts.delaiValidationMs),
      ),
  );

  app.delete(
    '/engagements/:id',
    {
      schema: {
        tags: ['Défis'],
        summary: 'Retirer un défi choisi par erreur (seulement s’il est encore en cours)',
        security: securite,
        params: idParams,
        response: { 204: z.null(), 401: erreurSchema, 404: erreurSchema, 409: erreurSchema },
      },
    },
    async (request, reply) => {
      await service.abandonner(app.prisma, request.participantId, request.params.id);
      return reply.status(204).send(null);
    },
  );

  app.get(
    '/me/impact',
    {
      schema: {
        tags: ['Défis'],
        summary: 'Mon impact : CO2 évité grâce aux défis validés',
        security: securite,
        response: {
          200: z.object({
            co2EviteKg: z.number(),
            defisValides: z.number().int(),
            defisEnCours: z.number().int(),
            defisNonTenus: z.number().int(),
          }),
          401: erreurSchema,
        },
      },
    },
    async (request) => service.impact(app.prisma, request.participantId),
  );
};

export default routes;
