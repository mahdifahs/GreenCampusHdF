import { Annee } from '@prisma/client';
import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import { z } from 'zod';
import { ErreurApi } from '../../lib/errors.js';
import { erreurSchema } from '../../lib/schemas.js';
import * as service from './service.js';

const participantSchema = z.object({
  id: z.uuid(),
  pseudo: z.string(),
  filiere: z.object({ id: z.number().int(), libelle: z.string() }),
  annee: z.enum(Annee),
  createdAt: z.iso.datetime(),
});

type Options = { limiteInscription: number; limiteConnexion: number };

const routes: FastifyPluginAsyncZod<Options> = async (app, opts) => {
  app.post(
    '/participants',
    {
      config: { rateLimit: { max: opts.limiteInscription, timeWindow: '1 minute' } },
      schema: {
        tags: ['Participants'],
        summary: 'Créer un compte anonyme',
        description:
          'Génère un pseudo et un code de récupération. Le code n’est renvoyé qu’une seule fois : le participant doit le conserver. La session est ouverte par un cookie HttpOnly (gc_session).',
        body: z.object({
          filiereId: z.number().int().positive(),
          annee: z.enum(Annee),
          consentement: z.literal(true, { error: 'Le consentement est obligatoire.' }),
        }),
        response: {
          201: z.object({ participant: participantSchema, codeRecuperation: z.string() }),
          400: erreurSchema,
        },
      },
    },
    async (request, reply) => {
      const { participant, codeRecuperation } = await service.inscrire(app.prisma, request.body);
      await app.ouvrirSession(reply, participant.id);
      return reply.status(201).send({ participant: service.versPublic(participant), codeRecuperation });
    },
  );

  app.post(
    '/sessions',
    {
      config: { rateLimit: { max: opts.limiteConnexion, timeWindow: '1 minute' } },
      schema: {
        tags: ['Participants'],
        summary: 'Se reconnecter avec son code de récupération',
        description: 'Ouvre la session par un cookie HttpOnly (gc_session).',
        body: z.object({ codeRecuperation: z.string().min(1).max(40) }),
        response: {
          200: z.object({ participant: participantSchema }),
          401: erreurSchema,
        },
      },
    },
    async (request, reply) => {
      try {
        const participant = await service.connecter(app.prisma, request.body.codeRecuperation);
        await app.ouvrirSession(reply, participant.id);
        return { participant: service.versPublic(participant) };
      } catch (e) {
        if (e instanceof ErreurApi && e.code === 'CODE_INVALIDE') await app.journalSecurite(request, 'CODE_INVALIDE');
        if (e instanceof ErreurApi && e.code === 'COMPTE_BLOQUE') await app.journalSecurite(request, 'COMPTE_BLOQUE_TENTATIVE');
        throw e;
      }
    },
  );

  // Sans authentification : efface le cookie, même si la session a déjà expiré.
  app.delete(
    '/sessions',
    {
      schema: {
        tags: ['Participants'],
        summary: 'Se déconnecter',
        description: 'Efface le cookie de session. Le code de récupération permet de se reconnecter.',
        response: { 204: z.null() },
      },
    },
    async (request, reply) => {
      await app.fermerSession(request, reply);
      return reply.status(204).send(null);
    },
  );

  const securite: Record<string, string[]>[] = [{ bearerAuth: [] }, { cookieParticipant: [] }];

  app.get(
    '/me',
    {
      preHandler: app.authenticate,
      schema: {
        tags: ['Participants'],
        summary: 'Mon profil',
        security: securite,
        response: { 200: participantSchema, 401: erreurSchema },
      },
    },
    async (request) => service.versPublic(await service.lire(app.prisma, request.participantId)),
  );

  app.patch(
    '/me',
    {
      preHandler: app.authenticate,
      schema: {
        tags: ['Participants'],
        summary: 'Modifier ma filière ou mon année',
        security: securite,
        body: z
          .object({ filiereId: z.number().int().positive(), annee: z.enum(Annee) })
          .partial()
          .refine((b) => Object.keys(b).length > 0, 'Aucun champ à modifier.'),
        response: { 200: participantSchema, 400: erreurSchema, 401: erreurSchema },
      },
    },
    async (request) =>
      service.versPublic(await service.modifier(app.prisma, request.participantId, request.body)),
  );

  app.delete(
    '/me',
    {
      preHandler: app.authenticate,
      schema: {
        tags: ['Participants'],
        summary: 'Supprimer mon compte et toutes mes données (RGPD)',
        security: securite,
        response: { 204: z.null(), 401: erreurSchema },
      },
    },
    async (request, reply) => {
      await service.supprimer(app.prisma, request.participantId);
      await app.fermerSession(request, reply);
      return reply.status(204).send(null);
    },
  );
};

export default routes;
