import { TypeBilan } from '@prisma/client';
import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import { z } from 'zod';
import { erreurSchema } from '../../lib/schemas.js';
import * as service from './service.js';

const categoriesSchema = z.object({
  transport: z.number(),
  alimentation: z.number(),
  logement: z.number(),
  divers: z.number(),
  servicesSocietaux: z.number(),
});

const bilanSchema = z.object({
  id: z.uuid(),
  type: z.enum(TypeBilan),
  totalKg: z.number().describe('Empreinte totale en kg CO2e par an'),
  parCategorie: categoriesSchema,
  categorieDominante: z.enum(['transport', 'alimentation', 'logement', 'divers']),
  nbReponses: z.number().int(),
  createdAt: z.iso.datetime(),
});

const bilanDetailSchema = bilanSchema.extend({
  situation: z.record(z.string(), z.union([z.number(), z.string()])),
  informations: z.record(z.string(), z.union([z.number(), z.string()])).describe('Réponses aux questions « information », par identifiant de question'),
});

const questionSchema = z.object({
  dottedName: z.string(),
  question: z.string(),
  categorie: z.string(),
  type: z.enum(['nombre', 'choix', 'oui-non']),
  unite: z.string().nullable(),
  possibilites: z.array(z.object({ valeur: z.string(), titre: z.string() })),
  min: z.number().nullable().describe('Valeur minimale (questions « nombre »)'),
  max: z.number().nullable().describe('Valeur maximale (questions « nombre »)'),
});

const questionInformationSchema = z.object({
  id: z.uuid(),
  question: z.string(),
  type: z.enum(['nombre', 'choix']),
  unite: z.string().nullable(),
  possibilites: z.array(z.object({ valeur: z.string(), titre: z.string() })),
  min: z.number().nullable(),
  max: z.number().nullable(),
});

const situationSchema = z
  .record(z.string().max(200), z.union([z.number(), z.string().max(100), z.boolean()]))
  .refine((s) => Object.keys(s).length <= 400, 'Trop de réponses.');
const informationsSchema = z
  .record(z.uuid(), z.union([z.number(), z.string().max(100)]))
  .refine((s) => Object.keys(s).length <= 100, 'Trop de réponses.')
  .optional()
  .describe('Réponses aux questions « information » (GET /bilans/questions-information), hors calcul');

const securite: Record<string, string[]>[] = [{ bearerAuth: [] }, { cookieParticipant: [] }];

const routes: FastifyPluginAsyncZod = async (app) => {
  app.get(
    '/bilans/questions-stand',
    {
      schema: {
        tags: ['Bilans'],
        summary: 'Questions du bilan comptées dans le calcul (modèle ADEME), dans l’ordre',
        description:
          'Questionnaire réglé dans l’administration (texte, bornes, ordre). Les autres questions du modèle Nos ' +
          'Gestes Climat gardent leur valeur par défaut (moyenne française). POST /bilans/estimation indique ' +
          'lesquelles sont applicables selon les réponses déjà données.',
        response: { 200: z.array(questionSchema) },
      },
    },
    async () => (await app.questionnaire.actif()).ademe.map(({ id: _id, ...q }) => q),
  );

  app.get(
    '/bilans/questions-information',
    {
      schema: {
        tags: ['Bilans'],
        summary: 'Questions « information » de l’équipe (hors calcul de l’empreinte)',
        description: 'Réponses facultatives, utilisées seulement pour des statistiques anonymes. Envoyées dans `informations` de POST /bilans.',
        response: { 200: z.array(questionInformationSchema) },
      },
    },
    async () => (await app.questionnaire.actif()).information,
  );

  app.post(
    '/bilans/estimation',
    {
      preHandler: app.authenticate,
      // Appelée pendant la saisie (le front attend une pause de frappe) ; ~60 ms de calcul. Limite large
      // car tout le campus peut sortir par une seule IP.
      config: { rateLimit: { max: 300, timeWindow: '1 minute' } },
      schema: {
        tags: ['Bilans'],
        summary: 'Estimation en direct, sans rien enregistrer',
        description:
          'Même validation que POST /bilans. Renvoie le total et le détail estimés, et la liste des questions du ' +
          'stand encore applicables (ex. « km en voiture » disparaît si la personne ne prend jamais la voiture).',
        security: securite,
        body: z.object({ situation: situationSchema }),
        response: {
          200: z.object({
            totalKg: z.number(),
            parCategorie: categoriesSchema,
            applicables: z.array(z.string()),
          }),
          400: erreurSchema,
          401: erreurSchema,
        },
      },
    },
    async (request) => {
      const { totalKg, parCategorie, applicables } = service.estimer(app.ngc, await app.questionnaire.actif(), request.body.situation);
      return { totalKg, parCategorie, applicables };
    },
  );

  app.post(
    '/bilans',
    {
      preHandler: app.authenticate,
      // Chaque calcul occupe le processeur quelques dizaines de ms : limite par IP pour éviter les abus.
      config: { rateLimit: { max: 120, timeWindow: '1 minute' } },
      schema: {
        tags: ['Bilans'],
        summary: 'Enregistrer un bilan (recalculé côté serveur)',
        description:
          'La situation contient les réponses aux questions Nos Gestes Climat : ' +
          '{ "transport . voiture . km": 3000, "logement . type": "appartement", "transport . train . usager": "oui" }. ' +
          'Les questions absentes prennent la valeur par défaut du modèle.',
        security: securite,
        body: z.object({
          type: z.enum(TypeBilan),
          situation: situationSchema,
          informations: informationsSchema,
        }),
        response: { 201: bilanSchema, 400: erreurSchema, 401: erreurSchema },
      },
    },
    async (request, reply) => {
      const bilan = await service.enregistrer(app.prisma, app.ngc, request.participantId, await app.questionnaire.actif(), request.body);
      return reply.status(201).send(service.versPublic(bilan));
    },
  );

  app.get(
    '/bilans',
    {
      preHandler: app.authenticate,
      schema: {
        tags: ['Bilans'],
        summary: 'Mes bilans, du plus récent au plus ancien',
        security: securite,
        response: { 200: z.array(bilanSchema), 401: erreurSchema },
      },
    },
    async (request) => (await service.lister(app.prisma, request.participantId)).map((b) => service.versPublic(b)),
  );

  app.get(
    '/bilans/dernier',
    {
      preHandler: app.authenticate,
      schema: {
        tags: ['Bilans'],
        summary: 'Mon dernier bilan, avec mes réponses (pour le reprendre et le compléter)',
        security: securite,
        response: { 200: bilanDetailSchema, 401: erreurSchema, 404: erreurSchema },
      },
    },
    async (request, reply) => {
      const bilan = await service.dernier(app.prisma, request.participantId);
      if (!bilan) return reply.status(404).send({ code: 'AUCUN_BILAN', message: 'Aucun bilan pour le moment.' });
      return service.versPublic(bilan, true) as z.infer<typeof bilanDetailSchema>;
    },
  );
};

export default routes;
