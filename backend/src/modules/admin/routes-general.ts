import { CategorieDefi, EtapeSuivi, RoleAdmin } from '@prisma/client';
import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import { z } from 'zod';
import { ErreurApi } from '../../lib/errors.js';
import { erreurSchema } from '../../lib/schemas.js';
import * as service from './service.js';
import * as securite from '../securite/service.js';
import { creerJournaliser, securiteOpenapi } from './routes-commun.js';

// Administration : identité du compte connecté, mode maintenance, statistiques, activation des
// défis, journal de sécurité et exports CSV. Hooks d'accès (session, bénévoles) posés par routes.ts.
const routes: FastifyPluginAsyncZod = async (app) => {
  const journaliser = creerJournaliser(app);

  const statsSchema = z.object({
  participants: z.number().int(),
  participantsExclus: z.number().int().describe('Comptes exclus des statistiques (non comptés ci-dessous)'),
  bilans: z.number().int(),
  engagements: z.number().int(),
  defisValides: z.number().int(),
  co2EviteKg: z.number(),
  quotidien: z.array(
  z.object({
    date: z.iso.date(),
    inscriptions: z.number().int(),
    bilans: z.number().int(),
    engagements: z.number().int(),
    defisValides: z.number().int(),
    co2EviteKg: z.number(),
  }),
  ),
  defis: z.array(
  z.object({
    id: z.number().int(),
    slug: z.string(),
    titre: z.string(),
    categorie: z.enum(CategorieDefi),
    actif: z.boolean(),
    engagements: z.number().int(),
    valides: z.number().int(),
    nonTenus: z.number().int(),
    enCours: z.number().int(),
    co2EviteKg: z.number(),
  }),
  ),
  quiz: z.object({
  parties: z.number().int(),
  questions: z.array(
    z.object({
      id: z.string(),
      question: z.string(),
      reponses: z.number().int(),
      tauxReussite: z.number().int(),
      repartition: z.array(z.object({ choix: z.string(), texte: z.string(), correct: z.boolean(), nombre: z.number().int() })),
    }),
  ),
  }),
  suivis: z.array(
  z.object({
    etape: z.enum(EtapeSuivi),
    nbReponses: z.number().int(),
    questions: z.array(
      z.object({
        id: z.string(),
        question: z.string(),
        repartition: z.array(z.object({ valeur: z.string(), libelle: z.string(), nombre: z.number().int() })),
      }),
    ),
  }),
  ),
  rappels: z.object({
  participantsAbonnes: z.number().int().describe('Participants ayant activé les rappels sur au moins un appareil'),
  abonnements: z.number().int().describe('Appareils abonnés (un participant peut en avoir plusieurs)'),
  etapes: z.array(z.object({ etape: z.enum(EtapeSuivi), relancesEnvoyees: z.number().int(), questionnairesRemplis: z.number().int() })),
  }),
  evenement: z.object({
  joursDeStand: z.number().int(),
  personnesVenues: z.number().int(),
  vetementsRecuperes: z.number().int(),
  vetementsDonnes: z.number().int(),
  poidsVetementsKg: z.number(),
  co2EviteVetementsKg: z.number(),
  donneesVetementsIncompletes: z.boolean(),
  }),
  });

  app.get(
    '/moi',
    {
      schema: {
        tags: ['Administration'],
        summary: 'Identité et rôle du compte admin connecté',
        security: securiteOpenapi,
        response: { 200: z.object({ prenom: z.string(), role: z.enum(RoleAdmin) }), 401: erreurSchema },
      },
    },
    async (request) => ({ prenom: request.compteAdmin!.prenom, role: request.compteAdmin!.role }),
  );

  // ---------- Mode maintenance (tout compte admin peut le basculer) ----------

  const maintenanceSchema = z.object({ actif: z.boolean(), depuis: z.iso.datetime().nullable(), par: z.string().nullable() });
  const versPublicMaintenance = (e: { actif: boolean; depuis: Date | null; par: string | null }) => ({
    ...e,
    depuis: e.depuis?.toISOString() ?? null,
  });

  app.get(
    '/maintenance',
    {
      schema: {
        tags: ['Administration'],
        summary: 'État du mode maintenance',
        security: securiteOpenapi,
        response: { 200: maintenanceSchema, 401: erreurSchema, 403: erreurSchema },
      },
    },
    async () => versPublicMaintenance(await app.maintenance.etat()),
  );

  app.put(
    '/maintenance',
    {
      schema: {
        tags: ['Administration'],
        summary: 'Activer ou couper le mode maintenance',
        description:
          'Actif : le site affiche une page de maintenance, toute l’API publique et participant répond 503 ' +
          '(code MAINTENANCE) et les relances push sont suspendues. L’administration reste accessible. Journalisé.',
        security: securiteOpenapi,
        body: z.object({ actif: z.boolean() }),
        response: { 200: maintenanceSchema, 401: erreurSchema, 403: erreurSchema },
      },
    },
    async (request) => {
      const avant = await app.maintenance.etat();
      const apres = await app.maintenance.definir(request.body.actif, request.compteAdmin!.prenom);
      if (avant.actif !== apres.actif) {
        await journaliser(request, apres.actif ? 'MAINTENANCE_ACTIVEE' : 'MAINTENANCE_DESACTIVEE', 'site');
      }
      return versPublicMaintenance(apres);
    },
  );

  app.get(
    '/stats',
    {
      schema: {
        tags: ['Administration'],
        summary: 'Statistiques détaillées (activité quotidienne, défis, réponses au suivi)',
        security: securiteOpenapi,
        response: { 200: statsSchema, 401: erreurSchema, 403: erreurSchema },
      },
    },
    async () => service.statistiques(app.prisma),
  );

  app.patch(
    '/defis/:id',
    {
      schema: {
        tags: ['Administration'],
        summary: 'Activer ou désactiver un défi (un défi désactivé n’est plus proposé)',
        security: securiteOpenapi,
        params: z.object({ id: z.coerce.number().int().positive() }),
        body: z.object({ actif: z.boolean() }),
        response: { 204: z.null(), 401: erreurSchema, 403: erreurSchema, 404: erreurSchema },
      },
    },
    async (request, reply) => {
      const existe = await app.prisma.defi.findUnique({ where: { id: request.params.id }, select: { id: true } });
      if (!existe) throw new ErreurApi(404, 'DEFI_INCONNU', 'Ce défi n’existe pas.');
      await service.changerActivationDefi(app.prisma, request.params.id, request.body.actif);
      return reply.status(204).send(null);
    },
  );

  // ---------- Journal de sécurité (OWASP A09) ----------

  app.get(
    '/securite',
    {
      schema: {
        tags: ['Administration'],
        summary: 'Journal des événements de sécurité, alertes actives et compteurs sur 24 h',
        description: `Événements conservés ${securite.CONSERVATION_JOURS} jours. Une alerte est active quand un type d’événement dépasse son seuil sur la dernière heure.`,
        security: securiteOpenapi,
        querystring: z.object({
          type: z.enum(Object.keys(securite.TYPES_EVENEMENT) as [securite.TypeEvenement, ...securite.TypeEvenement[]]).optional(),
          page: z.coerce.number().int().min(1).default(1),
          parPage: z.coerce.number().int().min(1).max(200).default(50),
        }),
        response: {
          200: z.object({
            alertes: z.array(z.object({ type: z.string(), nombre: z.number().int(), message: z.string() })),
            dernieres24h: z.array(z.object({ type: z.string(), niveau: z.string(), nombre: z.number().int() })),
            total: z.number().int(),
            page: z.number().int(),
            parPage: z.number().int(),
            evenements: z.array(
              z.object({
                type: z.string(),
                niveau: z.string(),
                ip: z.string().nullable(),
                details: z.record(z.string(), z.unknown()).nullable(),
                createdAt: z.iso.datetime(),
              }),
            ),
          }),
          401: erreurSchema,
          403: erreurSchema,
        },
      },
    },
    async (request) => securite.tableau(app.prisma, request.query),
  );

  app.get(
    '/export/:jeu',
    {
      schema: {
        tags: ['Administration'],
        summary: 'Export CSV (séparateur « ; », compatible Excel)',
        description:
          'Jeux : participants, bilans, engagements, suivis, quotidien, quiz, stand, vetements, securite, journal. ' +
          'Les participants n’y figurent que par leur identifiant aléatoire (ni pseudo, ni code).',
        security: securiteOpenapi,
        params: z.object({ jeu: z.enum(service.JEUX_EXPORT) }),
      },
    },
    async (request, reply) => {
      const csv = await service.exporter(app.prisma, request.params.jeu);
      const date = new Date().toISOString().slice(0, 10);
      return reply
        .header('content-type', 'text/csv; charset=utf-8')
        .header('content-disposition', `attachment; filename="greencampus-${request.params.jeu}-${date}.csv"`)
        .header('cache-control', 'no-store')
        .send(csv);
    },
  );
};

export default routes;
