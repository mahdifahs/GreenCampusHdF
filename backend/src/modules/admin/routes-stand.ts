import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import { z } from 'zod';
import { ErreurApi } from '../../lib/errors.js';
import { erreurSchema } from '../../lib/schemas.js';
import * as compteurs from './compteurs.js';
import * as vetements from './vetements.js';
import { creerJournaliser, securiteOpenapi } from './routes-commun.js';

// Administration, jour J : compteur de personnes venues et vêtements (catalogue des types et
// matières, quantités récoltées et données, bilan CO2). Seules routes ouvertes aux bénévoles
// (voir ROUTES_BENEVOLE dans routes.ts).
const routes: FastifyPluginAsyncZod = async (app) => {
  const journaliser = creerJournaliser(app);

  // ---------- Compteurs du stand (jour J) ----------

  const compteurSchema = z.object({ date: z.iso.date(), personnesVenues: z.number().int() });
  const dateParam = z.object({ date: z.iso.date() });

  app.get(
    '/compteurs',
    {
      schema: {
        tags: ['Administration'],
        summary: 'Historique des compteurs du stand, du plus récent au plus ancien',
        security: securiteOpenapi,
        response: { 200: z.array(compteurSchema), 401: erreurSchema, 403: erreurSchema },
      },
    },
    async () => compteurs.historique(app.prisma),
  );

  app.get(
    '/compteurs/:date',
    {
      schema: {
        tags: ['Administration'],
        summary: 'Compteurs d’une journée (0 si rien n’a encore été saisi)',
        security: securiteOpenapi,
        params: dateParam,
        response: { 200: compteurSchema, 401: erreurSchema, 403: erreurSchema },
      },
    },
    async (request) => compteurs.jour(app.prisma, request.params.date),
  );

  app.post(
    '/compteurs/:date/incrementer',
    {
      schema: {
        tags: ['Administration'],
        summary: 'Incrémenter (+1) ou décrémenter (-1) le nombre de personnes venues',
        security: securiteOpenapi,
        params: dateParam,
        body: z.object({ delta: z.union([z.literal(1), z.literal(-1)]) }),
        response: { 200: compteurSchema, 401: erreurSchema, 403: erreurSchema },
      },
    },
    async (request) => compteurs.incrementer(app.prisma, request.params.date, request.body.delta),
  );

  app.patch(
    '/compteurs/:date',
    {
      schema: {
        tags: ['Administration'],
        summary: 'Saisir directement le total de personnes venues (ex. comptage manuel)',
        security: securiteOpenapi,
        params: dateParam,
        body: z.object({ valeur: z.number().int().min(0).max(100000) }),
        response: { 200: compteurSchema, 401: erreurSchema, 403: erreurSchema },
      },
    },
    // Pas de journal pour les +1/-1 du stand (une ligne par personne noierait le journal) ; une saisie
    // directe peut écraser un total, elle est donc tracée avec l'ancienne valeur.
    async (request) => {
      const avant = await compteurs.jour(app.prisma, request.params.date);
      const apres = await compteurs.definir(app.prisma, request.params.date, request.body.valeur);
      await journaliser(request, 'SAISIE_COMPTEUR_JOUR', request.params.date, {
        avant: avant.personnesVenues,
        apres: apres.personnesVenues,
      });
      return apres;
    },
  );

  // ---------- Vêtements (jour J : récolte et don, par type et matière) ----------

  const typeVetementSchema = z.object({ id: z.number().int(), nom: z.string(), poidsMoyenGrammes: z.number().int().nullable(), actif: z.boolean() });
  const matiereSchema = z.object({
    id: z.number().int(),
    nom: z.string(),
    facteurEmissionKgCo2ParKg: z.number().nullable(),
    source: z.string().nullable(),
    actif: z.boolean(),
  });
  const idVetement = z.object({ id: z.coerce.number().int().positive() });
  const quantiteSchema = z.object({
    typeId: z.number().int(),
    type: z.string(),
    matiereId: z.number().int(),
    matiere: z.string(),
    recuperes: z.number().int(),
    donnes: z.number().int(),
  });
  const sensSchema = z.enum(vetements.SENS);

  app.get(
    '/vetements/types',
    { schema: { tags: ['Administration'], summary: 'Types de vêtements (catalogue admin)', security: securiteOpenapi, response: { 200: z.array(typeVetementSchema), 401: erreurSchema, 403: erreurSchema } } },
    async () => vetements.listerTypes(app.prisma),
  );
  app.post(
    '/vetements/types',
    {
      schema: {
        tags: ['Administration'],
        summary: 'Créer un type de vêtement',
        security: securiteOpenapi,
        body: z.object({ nom: z.string().trim().min(1).max(100), poidsMoyenGrammes: z.number().int().positive().max(20000).nullish() }),
        response: { 201: typeVetementSchema, 400: erreurSchema, 401: erreurSchema, 403: erreurSchema, 409: erreurSchema },
      },
    },
    async (request, reply) => {
      const type = await vetements.creerType(app.prisma, request.body.nom, request.body.poidsMoyenGrammes);
      await journaliser(request, 'CREATION_TYPE_VETEMENT', type.nom, { poidsMoyenGrammes: type.poidsMoyenGrammes });
      return reply.status(201).send(type);
    },
  );
  app.patch(
    '/vetements/types/:id',
    {
      schema: {
        tags: ['Administration'],
        summary: 'Modifier un type de vêtement (nom, poids moyen, actif)',
        security: securiteOpenapi,
        params: idVetement,
        body: z
          .object({ nom: z.string().trim().min(1).max(100), poidsMoyenGrammes: z.number().int().positive().max(20000).nullable(), actif: z.boolean() })
          .partial()
          .refine((b) => Object.keys(b).length > 0, 'Aucun changement demandé.'),
        response: { 200: typeVetementSchema, 400: erreurSchema, 401: erreurSchema, 403: erreurSchema, 404: erreurSchema, 409: erreurSchema },
      },
    },
    async (request) => {
      const existe = await app.prisma.typeVetement.findUnique({ where: { id: request.params.id }, select: { id: true } });
      if (!existe) throw new ErreurApi(404, 'TYPE_INCONNU', 'Ce type de vêtement n’existe pas.');
      const type = await vetements.modifierType(app.prisma, request.params.id, request.body);
      await journaliser(request, 'MODIFICATION_TYPE_VETEMENT', type.nom, request.body);
      return type;
    },
  );
  app.delete(
    '/vetements/types/:id',
    {
      schema: {
        tags: ['Administration'],
        summary: 'Supprimer un type de vêtement (refusé s’il a déjà des quantités enregistrées)',
        security: securiteOpenapi,
        params: idVetement,
        response: { 204: z.null(), 401: erreurSchema, 403: erreurSchema, 404: erreurSchema, 409: erreurSchema },
      },
    },
    async (request, reply) => {
      const existe = await app.prisma.typeVetement.findUnique({ where: { id: request.params.id }, select: { nom: true } });
      if (!existe) throw new ErreurApi(404, 'TYPE_INCONNU', 'Ce type de vêtement n’existe pas.');
      await vetements.supprimerType(app.prisma, request.params.id);
      await journaliser(request, 'SUPPRESSION_TYPE_VETEMENT', existe.nom);
      return reply.status(204).send(null);
    },
  );

  app.get(
    '/vetements/matieres',
    { schema: { tags: ['Administration'], summary: 'Matières (catalogue admin)', security: securiteOpenapi, response: { 200: z.array(matiereSchema), 401: erreurSchema, 403: erreurSchema } } },
    async () => vetements.listerMatieres(app.prisma),
  );
  app.post(
    '/vetements/matieres',
    {
      schema: {
        tags: ['Administration'],
        summary: 'Créer une matière',
        security: securiteOpenapi,
        body: z.object({
          nom: z.string().trim().min(1).max(100),
          facteurEmissionKgCo2ParKg: z.number().positive().max(1000).nullish(),
          source: z.string().trim().max(300).nullish(),
        }),
        response: { 201: matiereSchema, 400: erreurSchema, 401: erreurSchema, 403: erreurSchema, 409: erreurSchema },
      },
    },
    async (request, reply) => {
      const matiere = await vetements.creerMatiere(app.prisma, request.body.nom, request.body.facteurEmissionKgCo2ParKg, request.body.source);
      await journaliser(request, 'CREATION_MATIERE', matiere.nom, {
        facteurEmissionKgCo2ParKg: matiere.facteurEmissionKgCo2ParKg,
        source: matiere.source,
      });
      return reply.status(201).send(matiere);
    },
  );
  app.patch(
    '/vetements/matieres/:id',
    {
      schema: {
        tags: ['Administration'],
        summary: 'Modifier une matière (nom, facteur d’émission, source, actif)',
        security: securiteOpenapi,
        params: idVetement,
        body: z
          .object({
            nom: z.string().trim().min(1).max(100),
            facteurEmissionKgCo2ParKg: z.number().positive().max(1000).nullable(),
            source: z.string().trim().max(300).nullable(),
            actif: z.boolean(),
          })
          .partial()
          .refine((b) => Object.keys(b).length > 0, 'Aucun changement demandé.'),
        response: { 200: matiereSchema, 400: erreurSchema, 401: erreurSchema, 403: erreurSchema, 404: erreurSchema, 409: erreurSchema },
      },
    },
    async (request) => {
      const existe = await app.prisma.matiere.findUnique({ where: { id: request.params.id }, select: { id: true } });
      if (!existe) throw new ErreurApi(404, 'MATIERE_INCONNUE', 'Cette matière n’existe pas.');
      const matiere = await vetements.modifierMatiere(app.prisma, request.params.id, request.body);
      await journaliser(request, 'MODIFICATION_MATIERE', matiere.nom, request.body);
      return matiere;
    },
  );
  app.delete(
    '/vetements/matieres/:id',
    {
      schema: {
        tags: ['Administration'],
        summary: 'Supprimer une matière (refusé si elle a déjà des quantités enregistrées)',
        security: securiteOpenapi,
        params: idVetement,
        response: { 204: z.null(), 401: erreurSchema, 403: erreurSchema, 404: erreurSchema, 409: erreurSchema },
      },
    },
    async (request, reply) => {
      const existe = await app.prisma.matiere.findUnique({ where: { id: request.params.id }, select: { nom: true } });
      if (!existe) throw new ErreurApi(404, 'MATIERE_INCONNUE', 'Cette matière n’existe pas.');
      await vetements.supprimerMatiere(app.prisma, request.params.id);
      await journaliser(request, 'SUPPRESSION_MATIERE', existe.nom);
      return reply.status(204).send(null);
    },
  );

  app.get(
    '/vetements/quantites/:date',
    {
      schema: {
        tags: ['Administration'],
        summary: 'Quantités de vêtements saisies pour une journée, par type et matière',
        security: securiteOpenapi,
        params: dateParam,
        response: { 200: z.array(quantiteSchema), 401: erreurSchema, 403: erreurSchema },
      },
    },
    async (request) => vetements.jour(app.prisma, request.params.date),
  );
  app.post(
    '/vetements/quantites/:date/incrementer',
    {
      schema: {
        tags: ['Administration'],
        summary: 'Ajouter (ou retirer) une quantité récupérée/donnée pour un type et une matière',
        security: securiteOpenapi,
        params: dateParam,
        body: z.object({ typeId: z.number().int(), matiereId: z.number().int(), sens: sensSchema, delta: z.number().int().min(-10000).max(10000) }),
        response: { 200: quantiteSchema, 401: erreurSchema, 403: erreurSchema },
      },
    },
    async (request) =>
      vetements.incrementer(app.prisma, request.params.date, request.body.typeId, request.body.matiereId, request.body.sens, request.body.delta),
  );
  app.patch(
    '/vetements/quantites/:date',
    {
      schema: {
        tags: ['Administration'],
        summary: 'Corriger directement une quantité pour un type et une matière',
        security: securiteOpenapi,
        params: dateParam,
        body: z.object({ typeId: z.number().int(), matiereId: z.number().int(), sens: sensSchema, valeur: z.number().int().min(0).max(100000) }),
        response: { 200: quantiteSchema, 401: erreurSchema, 403: erreurSchema },
      },
    },
    async (request) => {
      const { typeId, matiereId, sens, valeur } = request.body;
      const avant = await app.prisma.quantiteVetement.findUnique({
        where: { date_typeId_matiereId: { date: new Date(request.params.date), typeId, matiereId } },
      });
      const q = await vetements.definir(app.prisma, request.params.date, typeId, matiereId, sens, valeur);
      await journaliser(request, 'CORRECTION_QUANTITE_VETEMENT', `${request.params.date} · ${q.type} / ${q.matiere}`, {
        sens,
        avant: avant?.[sens] ?? 0,
        apres: q[sens],
      });
      return q;
    },
  );

  app.get(
    '/vetements/bilan',
    {
      schema: {
        tags: ['Administration'],
        summary: 'Bilan chiffré : kg et CO2 évité, cumulés sur toute la collecte',
        description: 'Ignore les types/matières dont le poids moyen ou le facteur d’émission n’est pas encore renseigné (donneesIncompletes le signale).',
        security: securiteOpenapi,
        response: {
          200: z.object({
            poidsRecupereKg: z.number(),
            poidsDonneKg: z.number(),
            co2EviteRecupereKg: z.number(),
            co2EviteDonneKg: z.number(),
            donneesIncompletes: z.boolean(),
            parMatiere: z.array(z.object({ matiere: z.string(), kgRecupere: z.number(), kgDonne: z.number(), co2EviteKg: z.number() })),
          }),
          401: erreurSchema,
          403: erreurSchema,
        },
      },
    },
    async () => vetements.bilan(app.prisma),
  );
};

export default routes;
