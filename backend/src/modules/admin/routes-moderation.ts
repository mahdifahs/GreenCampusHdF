import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import { z } from 'zod';
import { erreurSchema } from '../../lib/schemas.js';
import * as moderation from './moderation.js';
import { auteur, securiteOpenapi } from './routes-commun.js';

// Administration : modération des participants (liste, fiche, exclusion, blocage, suppression,
// annulation d'un défi) et journal des actions de l'équipe.
const routes: FastifyPluginAsyncZod = async (app) => {
  // ---------- Modération des participants ----------

  const alerteSchema = z.object({ code: z.string(), message: z.string() });
  const resumeSchema = z.object({
    id: z.uuid(),
    pseudo: z.string(),
    filiere: z.string(),
    annee: z.string(),
    createdAt: z.iso.datetime(),
    lastSeenAt: z.iso.datetime(),
    exclu: z.boolean(),
    bloque: z.boolean(),
    nbBilans: z.number().int(),
    dernierBilanKg: z.number().nullable(),
    nbEngagements: z.number().int(),
    defisValides: z.number().int(),
    co2EviteKg: z.number(),
    nbSuivis: z.number().int(),
    alertes: z.array(alerteSchema),
  });
  const idParticipant = z.object({ id: z.uuid() });
  const motifSchema = z.object({ motif: z.string().trim().max(200).optional() }).nullish();

  app.get(
    '/participants',
    {
      schema: {
        tags: ['Administration'],
        summary: 'Liste des participants avec leur activité et les alertes de comportement suspect',
        security: securiteOpenapi,
        querystring: z.object({
          recherche: z.string().trim().max(40).optional(),
          filtre: z.enum(['tous', 'suspects', 'exclus', 'bloques']).default('tous'),
          tri: z.enum(['recents', 'co2', 'bilans', 'alertes']).default('recents'),
          page: z.coerce.number().int().min(1).default(1),
          parPage: z.coerce.number().int().min(1).max(200).default(50),
        }),
        response: {
          200: z.object({ total: z.number().int(), page: z.number().int(), parPage: z.number().int(), participants: z.array(resumeSchema) }),
          401: erreurSchema,
          403: erreurSchema,
        },
      },
    },
    async (request) => moderation.lister(app.prisma, request.query),
  );

  app.get(
    '/participants/:id',
    {
      schema: {
        tags: ['Administration'],
        summary: 'Fiche détaillée d’un participant (bilans, défis, suivis, alertes)',
        security: securiteOpenapi,
        params: idParticipant,
        response: {
          200: resumeSchema.extend({
            bilans: z.array(
              z.object({
                id: z.uuid(),
                type: z.string(),
                createdAt: z.iso.datetime(),
                totalKg: z.number(),
                nbReponses: z.number().int(),
                invraisemblable: z.boolean(),
              }),
            ),
            engagements: z.array(
              z.object({
                id: z.uuid(),
                defi: z.string(),
                semaine: z.iso.date(),
                statut: z.string(),
                co2EviteKgSemaine: z.number(),
                createdAt: z.iso.datetime(),
                reponduAt: z.iso.datetime().nullable(),
                validationRapide: z.boolean(),
              }),
            ),
            suivis: z.array(z.object({ etape: z.string(), createdAt: z.iso.datetime() })),
          }),
          401: erreurSchema,
          403: erreurSchema,
          404: erreurSchema,
        },
      },
    },
    async (request) => moderation.detail(app.prisma, request.params.id),
  );

  app.patch(
    '/participants/:id',
    {
      schema: {
        tags: ['Administration'],
        summary: 'Exclure des statistiques et/ou bloquer un participant (ou annuler)',
        description:
          'exclu : le compte ne compte plus dans le tableau de bord ni le classement (ses données sont conservées). ' +
          'bloque : le compte ne peut plus se connecter ni rien faire.',
        security: securiteOpenapi,
        params: idParticipant,
        body: z
          .object({ exclu: z.boolean(), bloque: z.boolean() })
          .partial()
          .refine((b) => Object.keys(b).length > 0, 'Aucun changement demandé.'),
        response: { 204: z.null(), 400: erreurSchema, 401: erreurSchema, 403: erreurSchema, 404: erreurSchema },
      },
    },
    async (request, reply) => {
      await moderation.modifier(app.prisma, auteur(request), request.params.id, request.body);
      return reply.status(204).send(null);
    },
  );

  app.delete(
    '/participants/:id',
    {
      schema: {
        tags: ['Administration'],
        summary: 'Supprimer définitivement un participant et toutes ses données',
        security: securiteOpenapi,
        params: idParticipant,
        body: motifSchema,
        response: { 204: z.null(), 401: erreurSchema, 403: erreurSchema, 404: erreurSchema },
      },
    },
    async (request, reply) => {
      await moderation.supprimer(app.prisma, auteur(request), request.params.id, request.body?.motif);
      return reply.status(204).send(null);
    },
  );

  app.delete(
    '/engagements/:id',
    {
      schema: {
        tags: ['Administration'],
        summary: 'Annuler un défi (par exemple une validation frauduleuse)',
        security: securiteOpenapi,
        params: z.object({ id: z.uuid() }),
        body: motifSchema,
        response: { 204: z.null(), 401: erreurSchema, 403: erreurSchema, 404: erreurSchema },
      },
    },
    async (request, reply) => {
      await moderation.annulerEngagement(app.prisma, auteur(request), request.params.id, request.body?.motif);
      return reply.status(204).send(null);
    },
  );

  app.get(
    '/journal',
    {
      schema: {
        tags: ['Administration'],
        summary: 'Journal des 200 dernières actions de l’équipe (filtrable)',
        description: 'Filtres facultatifs : auteur (prénom exact), action (code), du / au (journées AAAA-MM-JJ, heure de Paris, incluses). Export complet : GET /export/journal.',
        security: securiteOpenapi,
        querystring: z.object({
          auteur: z.string().max(40).optional(),
          action: z.string().max(60).optional(),
          du: z.iso.date().optional(),
          au: z.iso.date().optional(),
        }),
        response: {
          200: z.array(
            z.object({
              auteur: z.string(),
              action: z.string(),
              cible: z.string(),
              details: z.record(z.string(), z.unknown()).nullable(),
              createdAt: z.iso.datetime(),
            }),
          ),
          401: erreurSchema,
          403: erreurSchema,
        },
      },
    },
    async (request) => moderation.journal(app.prisma, request.query),
  );

  app.get(
    '/journal/filtres',
    {
      schema: {
        tags: ['Administration'],
        summary: 'Auteurs et actions présents dans le journal (pour les filtres)',
        security: securiteOpenapi,
        response: { 200: z.object({ auteurs: z.array(z.string()), actions: z.array(z.string()) }), 401: erreurSchema, 403: erreurSchema },
      },
    },
    async () => moderation.filtresDisponibles(app.prisma),
  );
};

export default routes;
