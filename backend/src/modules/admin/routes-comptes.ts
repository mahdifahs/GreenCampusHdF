import { RoleAdmin } from '@prisma/client';
import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import { z } from 'zod';
import { ErreurApi } from '../../lib/errors.js';
import { erreurSchema } from '../../lib/schemas.js';
import * as comptes from './comptes.js';
import { creerExigerSuperAdmin, securiteOpenapi } from './routes-commun.js';

// Administration : comptes de l'équipe (création, blocage, réinitialisation, suppression),
// réservé aux super-admins.
const routes: FastifyPluginAsyncZod<{ limiteComptes: number; limiteBenevoles?: number }> = async (app, opts) => {
  const exigerSuperAdmin = creerExigerSuperAdmin(app);

  // ---------- Comptes admin (réservé aux super-admins) ----------

  const compteAdminSchema = z.object({
    id: z.uuid(),
    prenom: z.string(),
    role: z.enum(RoleAdmin),
    bloque: z.boolean(),
    createdAt: z.iso.datetime(),
    derniereConnexionAt: z.iso.datetime().nullable(),
  });
  const idCompteAdmin = z.object({ id: z.uuid() });

  app.get(
    '/comptes-admin',
    {
      preHandler: exigerSuperAdmin,
      schema: {
        tags: ['Administration'],
        summary: 'Liste des comptes admin',
        security: securiteOpenapi,
        response: { 200: z.array(compteAdminSchema), 401: erreurSchema, 403: erreurSchema },
      },
    },
    async () => comptes.lister(app.prisma),
  );

  app.post(
    '/comptes-admin',
    {
      preHandler: exigerSuperAdmin,
      schema: {
        tags: ['Administration'],
        summary: 'Créer un compte admin (mot de passe généré, affiché une seule fois dans la réponse)',
        security: securiteOpenapi,
        body: z.object({ prenom: z.string().trim().min(2).max(40), role: z.enum(RoleAdmin).default('ADMIN') }),
        response: {
          201: compteAdminSchema.extend({ motDePasse: z.string() }),
          401: erreurSchema,
          403: erreurSchema,
          409: erreurSchema,
        },
      },
    },
    async (request, reply) =>
      reply
        .status(201)
        .send(await comptes.creer(app.prisma, request.compteAdmin!.prenom, request.body.prenom, request.body.role, opts.limiteComptes, opts.limiteBenevoles)),
  );

  app.patch(
    '/comptes-admin/:id',
    {
      preHandler: exigerSuperAdmin,
      schema: {
        tags: ['Administration'],
        summary: 'Bloquer ou débloquer un compte admin',
        security: securiteOpenapi,
        params: idCompteAdmin,
        body: z.object({ bloque: z.boolean() }),
        response: { 200: compteAdminSchema, 401: erreurSchema, 403: erreurSchema, 404: erreurSchema, 409: erreurSchema },
      },
    },
    async (request) => {
      if (request.body.bloque && request.params.id === request.compteAdmin!.id) {
        throw new ErreurApi(409, 'ACTION_SUR_SOI_MEME', 'Impossible de bloquer son propre compte.');
      }
      return comptes.bloquer(app.prisma, request.compteAdmin!.prenom, request.params.id, request.body.bloque);
    },
  );

  app.post(
    '/comptes-admin/:id/reinitialiser-mot-de-passe',
    {
      preHandler: exigerSuperAdmin,
      schema: {
        tags: ['Administration'],
        summary: 'Générer un nouveau mot de passe pour un compte admin (affiché une seule fois)',
        security: securiteOpenapi,
        params: idCompteAdmin,
        response: { 200: z.object({ motDePasse: z.string() }), 401: erreurSchema, 403: erreurSchema, 404: erreurSchema },
      },
    },
    async (request) => comptes.reinitialiserMotDePasse(app.prisma, request.compteAdmin!.prenom, request.params.id),
  );

  app.delete(
    '/comptes-admin/:id',
    {
      preHandler: exigerSuperAdmin,
      schema: {
        tags: ['Administration'],
        summary: 'Supprimer définitivement un compte admin',
        security: securiteOpenapi,
        params: idCompteAdmin,
        response: { 204: z.null(), 401: erreurSchema, 403: erreurSchema, 404: erreurSchema, 409: erreurSchema },
      },
    },
    async (request, reply) => {
      if (request.params.id === request.compteAdmin!.id) {
        throw new ErreurApi(409, 'ACTION_SUR_SOI_MEME', 'Impossible de supprimer son propre compte.');
      }
      await comptes.supprimer(app.prisma, request.compteAdmin!.prenom, request.params.id);
      return reply.status(204).send(null);
    },
  );
};

export default routes;
