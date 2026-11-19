import type { Annonce } from '@prisma/client';
import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import { z } from 'zod';
import { ErreurApi } from '../../lib/errors.js';
import { erreurSchema } from '../../lib/schemas.js';
import { niveauAnnonceSchema } from '../annonce/routes.js';
import { auteur, creerJournaliser, securiteOpenapi } from './routes-commun.js';

export const LONGUEUR_MAX_ANNONCE = 300;

// Administration : message d'information affiché en bandeau sur tout le site (un seul à la fois).
// Fermé aux bénévoles (absent de ROUTES_BENEVOLE).
const routes: FastifyPluginAsyncZod = async (app) => {
  const journaliser = creerJournaliser(app);

  const annonceAdminSchema = z.object({
    texte: z.string(),
    niveau: niveauAnnonceSchema,
    publiee: z.boolean(),
    fin: z.iso.datetime().nullable(),
    expiree: z.boolean().describe('Publiée mais date de fin dépassée : plus visible du public'),
    par: z.string().nullable(),
    updatedAt: z.iso.datetime(),
  });
  const versAdmin = (a: Annonce) => ({
    texte: a.texte,
    niveau: a.niveau,
    publiee: a.publiee,
    fin: a.fin?.toISOString() ?? null,
    expiree: a.publiee && a.fin !== null && a.fin.getTime() <= Date.now(),
    par: a.par,
    updatedAt: a.updatedAt.toISOString(),
  });

  app.get(
    '/annonce',
    {
      schema: {
        tags: ['Administration'],
        summary: 'Message d’information du site (null si aucun n’a jamais été enregistré)',
        security: securiteOpenapi,
        response: { 200: z.object({ annonce: annonceAdminSchema.nullable() }), 401: erreurSchema, 403: erreurSchema },
      },
    },
    async () => {
      const annonce = await app.annonce.etat();
      return { annonce: annonce && versAdmin(annonce) };
    },
  );

  app.put(
    '/annonce',
    {
      schema: {
        tags: ['Administration'],
        summary: 'Enregistrer, publier ou retirer le message d’information',
        description:
          'Remplace le message précédent (un seul à la fois). `publiee: false` le retire du site sans ' +
          'l’effacer. Une date de fin le retire automatiquement à cette date. Journalisé.',
        security: securiteOpenapi,
        body: z.object({
          texte: z.string().trim().min(1).max(LONGUEUR_MAX_ANNONCE),
          niveau: niveauAnnonceSchema,
          publiee: z.boolean(),
          fin: z.coerce.date().nullable().optional(),
        }),
        response: { 200: annonceAdminSchema, 400: erreurSchema, 401: erreurSchema, 403: erreurSchema },
      },
    },
    async (request) => {
      const { texte, niveau, publiee } = request.body;
      const fin = request.body.fin ?? null;
      if (publiee && fin && fin.getTime() <= Date.now()) {
        throw new ErreurApi(400, 'DATE_PASSEE', 'La date de fin est déjà passée : le message ne serait jamais affiché.');
      }
      const avant = await app.annonce.etat();
      const annonce = await app.annonce.definir({ texte, niveau, fin, publiee }, auteur(request));
      const action = publiee ? 'ANNONCE_PUBLIEE' : avant?.publiee ? 'ANNONCE_RETIREE' : 'ANNONCE_ENREGISTREE';
      await journaliser(request, action, texte.length > 80 ? `${texte.slice(0, 79)}…` : texte, {
        niveau,
        fin: fin?.toISOString() ?? null,
      });
      return versAdmin(annonce);
    },
  );
};

export default routes;
