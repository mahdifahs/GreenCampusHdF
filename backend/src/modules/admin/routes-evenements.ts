import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import { z } from 'zod';
import { ErreurApi } from '../../lib/errors.js';
import { erreurSchema } from '../../lib/schemas.js';
import * as evenements from './evenements.js';
import { creerJournaliser, securiteOpenapi } from './routes-commun.js';

// Administration : évènements de la page d'accueil publique (brouillon / publié).
const routes: FastifyPluginAsyncZod = async (app) => {
  const journaliser = creerJournaliser(app);

  // ---------- Évènements (page d'accueil publique) ----------

  const statutEvenementSchema = z.enum(['BROUILLON', 'PUBLIE']);
  const evenementAdminSchema = z.object({
    id: z.uuid(),
    titre: z.string(),
    description: z.string().nullable(),
    lieu: z.string().nullable(),
    dateDebut: z.iso.datetime(),
    dateFin: z.iso.datetime().nullable(),
    statut: statutEvenementSchema,
    createdAt: z.iso.datetime(),
    updatedAt: z.iso.datetime(),
  });
  const idEvenement = z.object({ id: z.uuid() });
  const champsEvenementSchema = {
    titre: z.string().trim().min(1).max(200),
    description: z.string().trim().max(2000).nullable().optional(),
    lieu: z.string().trim().max(200).nullable().optional(),
    dateDebut: z.coerce.date(),
    dateFin: z.coerce.date().nullable().optional(),
    statut: statutEvenementSchema.optional(),
  };

  app.get(
    '/evenements',
    {
      schema: {
        tags: ['Administration'],
        summary: 'Tous les évènements (brouillons et publiés)',
        security: securiteOpenapi,
        response: { 200: z.array(evenementAdminSchema), 401: erreurSchema, 403: erreurSchema },
      },
    },
    async () => evenements.lister(app.prisma),
  );

  app.post(
    '/evenements',
    {
      schema: {
        tags: ['Administration'],
        summary: 'Créer un évènement (brouillon par défaut, invisible du public jusqu’à publication)',
        security: securiteOpenapi,
        body: z.object(champsEvenementSchema),
        response: { 201: evenementAdminSchema, 400: erreurSchema, 401: erreurSchema, 403: erreurSchema },
      },
    },
    async (request, reply) => {
      const evenement = await evenements.creer(app.prisma, request.body);
      await journaliser(request, 'CREATION_EVENEMENT', evenement.titre, { statut: evenement.statut });
      return reply.status(201).send(evenement);
    },
  );

  app.patch(
    '/evenements/:id',
    {
      schema: {
        tags: ['Administration'],
        summary: 'Modifier un évènement, y compris son statut (publier/dépublier)',
        security: securiteOpenapi,
        params: idEvenement,
        body: z
          .object(champsEvenementSchema)
          .partial()
          .refine((b) => Object.keys(b).length > 0, 'Aucun changement demandé.'),
        response: { 200: evenementAdminSchema, 400: erreurSchema, 401: erreurSchema, 403: erreurSchema, 404: erreurSchema },
      },
    },
    async (request) => {
      const existe = await app.prisma.evenement.findUnique({ where: { id: request.params.id }, select: { id: true } });
      if (!existe) throw new ErreurApi(404, 'EVENEMENT_INCONNU', 'Cet évènement n’existe pas.');
      const evenement = await evenements.modifier(app.prisma, request.params.id, request.body);
      await journaliser(request, 'MODIFICATION_EVENEMENT', evenement.titre, {
        champs: Object.keys(request.body).join(', '),
        statut: evenement.statut,
      });
      return evenement;
    },
  );

  app.delete(
    '/evenements/:id',
    {
      schema: {
        tags: ['Administration'],
        summary: 'Supprimer définitivement un évènement',
        security: securiteOpenapi,
        params: idEvenement,
        response: { 204: z.null(), 401: erreurSchema, 403: erreurSchema, 404: erreurSchema },
      },
    },
    async (request, reply) => {
      const existe = await app.prisma.evenement.findUnique({ where: { id: request.params.id }, select: { titre: true } });
      if (!existe) throw new ErreurApi(404, 'EVENEMENT_INCONNU', 'Cet évènement n’existe pas.');
      await evenements.supprimer(app.prisma, request.params.id);
      await journaliser(request, 'SUPPRESSION_EVENEMENT', existe.titre);
      return reply.status(204).send(null);
    },
  );
};

export default routes;
