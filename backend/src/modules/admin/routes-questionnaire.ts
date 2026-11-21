import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import { z } from 'zod';
import { erreurSchema } from '../../lib/schemas.js';
import * as questionnaire from '../questionnaire/service.js';
import { creerJournaliser, securiteOpenapi } from './routes-commun.js';

export const LONGUEUR_MAX_QUESTION = 300;

// Administration : questionnaire du bilan (questions du modèle ADEME et questions « information »).
// Ouvert à tous les comptes admin, fermé aux bénévoles (absent de ROUTES_BENEVOLE). Tout est journalisé.
const routes: FastifyPluginAsyncZod = async (app) => {
  const journaliser = creerJournaliser(app);
  const cible = (texte: string) => (texte.length > 80 ? `${texte.slice(0, 79)}…` : texte);

  const bornesSchema = z.object({ min: z.number(), max: z.number() });
  const statistiquesSchema = z.discriminatedUnion('type', [
    z.object({
      type: z.literal('nombre'),
      repondants: z.number().int(),
      moyenne: z.number().nullable(),
      mediane: z.number().nullable(),
      min: z.number().nullable(),
      max: z.number().nullable(),
    }),
    z.object({ type: z.literal('choix'), repondants: z.number().int(), repartition: z.array(z.object({ valeur: z.string(), nombre: z.number().int() })) }),
  ]);
  const questionAdminSchema = z.object({
    id: z.uuid(),
    type: z.enum(['ADEME', 'INFORMATION']),
    dottedName: z.string().nullable(),
    texte: z.string(),
    texteModele: z.string().nullable().describe('Texte d’origine du modèle ADEME'),
    categorie: z.string(),
    format: z.enum(['nombre', 'choix', 'oui-non']),
    unite: z.string().nullable(),
    choix: z.array(z.string()),
    min: z.number().nullable(),
    max: z.number().nullable(),
    limites: bornesSchema.nullable().describe('Limites du modèle ADEME : les bornes doivent rester à l’intérieur'),
    horsModele: z.boolean().describe('Question ADEME disparue du modèle : plus posée'),
    ordre: z.number().int(),
    actif: z.boolean(),
    nbReponses: z.number().int().describe('Bilans ayant répondu à cette question'),
    statistiques: statistiquesSchema.nullable().describe('Questions « information » : dernière réponse de chaque participant, comptes exclus mis à part'),
  });
  const idParams = z.object({ id: z.uuid() });
  const texteSchema = z.string().trim().min(3).max(LONGUEUR_MAX_QUESTION);
  const nombre = z.number().finite().min(0).max(10_000_000);
  const choixSchema = z.array(z.string().trim().max(questionnaire.LONGUEUR_MAX_CHOIX)).max(questionnaire.CHOIX_MAX);

  app.get(
    '/questionnaire',
    {
      schema: {
        tags: ['Administration'],
        summary: 'Questionnaire du bilan (toutes les questions, actives ou non)',
        security: securiteOpenapi,
        response: { 200: z.array(questionAdminSchema), 401: erreurSchema, 403: erreurSchema },
      },
    },
    async () => {
      await app.questionnaire.pret();
      return questionnaire.lister(app.prisma, app.ngc);
    },
  );

  app.get(
    '/questionnaire/modele',
    {
      schema: {
        tags: ['Administration'],
        summary: 'Rechercher une question du modèle ADEME pas encore dans le questionnaire',
        security: securiteOpenapi,
        querystring: z.object({ recherche: z.string().trim().max(100).default('') }),
        response: {
          200: z.array(
            z.object({
              dottedName: z.string(),
              question: z.string(),
              categorie: z.string(),
              type: z.enum(['nombre', 'choix', 'oui-non']),
              unite: z.string().nullable(),
              choix: z.array(z.string()),
              min: z.number().nullable(),
              max: z.number().nullable(),
              limites: bornesSchema.nullable(),
            }),
          ),
          401: erreurSchema,
          403: erreurSchema,
        },
      },
    },
    async (request) => questionnaire.rechercherModele(app.prisma, app.ngc, request.query.recherche),
  );

  app.post(
    '/questionnaire',
    {
      schema: {
        tags: ['Administration'],
        summary: 'Ajouter une question (modèle ADEME ou information)',
        description:
          'ADEME : `dottedName` d’une question du modèle (GET /admin/questionnaire/modele), texte et bornes facultatifs ' +
          '(par défaut ceux du modèle). INFORMATION : texte, `format` NOMBRE (min et max obligatoires, unité facultative) ' +
          'ou CHOIX (2 à 20 réponses possibles). Jamais de texte libre. Ajoutée à la fin, active. Journalisé.',
        security: securiteOpenapi,
        body: z.discriminatedUnion('type', [
          z.object({ type: z.literal('ADEME'), dottedName: z.string().max(200), texte: texteSchema.optional(), min: nombre.optional(), max: nombre.optional() }),
          z.object({
            type: z.literal('INFORMATION'),
            texte: texteSchema,
            format: z.enum(['NOMBRE', 'CHOIX']),
            unite: z.string().trim().max(30).nullable().optional(),
            min: nombre.optional(),
            max: nombre.optional(),
            choix: choixSchema.optional(),
          }),
        ]),
        response: { 201: questionAdminSchema, 400: erreurSchema, 401: erreurSchema, 403: erreurSchema, 409: erreurSchema },
      },
    },
    async (request, reply) => {
      await app.questionnaire.pret();
      const q = await questionnaire.creer(app.prisma, app.ngc, request.body);
      app.questionnaire.invalider();
      await journaliser(request, 'QUESTION_AJOUTEE', cible(q.texte), {
        type: q.type,
        dottedName: q.dottedName,
        min: q.min,
        max: q.max,
        choix: q.choix.length && q.type === 'INFORMATION' ? q.choix.join(' | ') : null,
      });
      return reply.status(201).send(q);
    },
  );

  app.patch(
    '/questionnaire/:id',
    {
      schema: {
        tags: ['Administration'],
        summary: 'Modifier une question (texte, bornes, unité, choix, activation)',
        description:
          'Le type et le format ne se modifient pas : créer une nouvelle question et désactiver l’ancienne. ' +
          'Bornes ADEME limitées à celles du modèle. Une réponse déjà choisie par des participants ne peut pas être ' +
          'retirée des choix (409 CHOIX_DEJA_REPONDU). Les bilans déjà enregistrés ne sont pas recalculés. Journalisé.',
        security: securiteOpenapi,
        params: idParams,
        body: z
          .object({
            texte: texteSchema,
            unite: z.string().trim().max(30).nullable(),
            min: nombre,
            max: nombre,
            choix: choixSchema,
            actif: z.boolean(),
          })
          .partial()
          .refine((b) => Object.keys(b).length > 0, 'Aucun changement demandé.'),
        response: { 200: questionAdminSchema, 400: erreurSchema, 401: erreurSchema, 403: erreurSchema, 404: erreurSchema, 409: erreurSchema },
      },
    },
    async (request) => {
      const avant = await questionnaire.trouver(app.prisma, request.params.id);
      const q = await questionnaire.modifier(app.prisma, app.ngc, request.params.id, request.body);
      app.questionnaire.invalider();
      const { actif, choix, ...reste } = request.body;
      const action =
        actif !== undefined && actif !== avant.actif && Object.keys(reste).length === 0 && choix === undefined
          ? actif
            ? 'QUESTION_REACTIVEE'
            : 'QUESTION_DESACTIVEE'
          : 'QUESTION_MODIFIEE';
      await journaliser(request, action, cible(q.texte), {
        ...reste,
        ...(actif !== undefined ? { actif } : {}),
        ...(choix !== undefined ? { choix: choix.join(' | ') } : {}),
        ...(reste.texte !== undefined && reste.texte !== avant.texte ? { ancienTexte: cible(avant.texte) } : {}),
      });
      return q;
    },
  );

  app.post(
    '/questionnaire/:id/deplacer',
    {
      schema: {
        tags: ['Administration'],
        summary: 'Monter ou descendre une question dans sa catégorie',
        security: securiteOpenapi,
        params: idParams,
        body: z.object({ sens: z.enum(['haut', 'bas']) }),
        response: { 200: z.object({ deplacee: z.boolean() }), 401: erreurSchema, 403: erreurSchema, 404: erreurSchema },
      },
    },
    async (request) => {
      const resultat = await questionnaire.deplacer(app.prisma, app.ngc, request.params.id, request.body.sens);
      app.questionnaire.invalider();
      return resultat;
    },
  );

  app.delete(
    '/questionnaire/:id',
    {
      schema: {
        tags: ['Administration'],
        summary: 'Supprimer une question (refusé si des participants y ont déjà répondu : la désactiver)',
        security: securiteOpenapi,
        params: idParams,
        response: { 204: z.null(), 401: erreurSchema, 403: erreurSchema, 404: erreurSchema, 409: erreurSchema },
      },
    },
    async (request, reply) => {
      const q = await questionnaire.supprimer(app.prisma, request.params.id);
      app.questionnaire.invalider();
      await journaliser(request, 'QUESTION_SUPPRIMEE', cible(q.texte), { type: q.type, dottedName: q.dottedName });
      return reply.status(204).send(null);
    },
  );
};

export default routes;
