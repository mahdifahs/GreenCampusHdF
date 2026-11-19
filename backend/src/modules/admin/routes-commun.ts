import type { FastifyInstance, FastifyRequest } from 'fastify';
import { ErreurApi } from '../../lib/errors.js';

// Aides partagées par les fichiers routes-*.ts de l'administration.

// Documentation OpenAPI : session admin par cookie (navigateur) ou jeton Bearer (outils, tests).
export const securiteOpenapi: Record<string, string[]>[] = [{ bearerAuth: [] }, { cookieAdmin: [] }];

// Auteur d'une action : le prénom porté par la session admin.
export const auteur = (request: { user: { nom?: string } }) => request.user.nom ?? 'équipe';

// Journal des actions de l'équipe (ActionAdmin). Détails à plat : l'onglet Journal les affiche en « clé : valeur ».
export const creerJournaliser =
  (app: FastifyInstance) =>
  (request: { user: { nom?: string } }, action: string, cible: string, details?: Record<string, string | number | boolean | null>) =>
    app.prisma.actionAdmin.create({ data: { auteur: auteur(request), action, cible, details } });

// Réservé aux comptes SUPER_ADMIN : à ajouter en plus de authenticateAdmin sur une route.
export const creerExigerSuperAdmin = (app: FastifyInstance) =>
  async function exigerSuperAdmin(request: FastifyRequest) {
    if (request.compteAdmin?.role !== 'SUPER_ADMIN') {
      await app.journalSecurite(request, 'ADMIN_ACCES_SUPER_REFUSE', { compteId: request.compteAdmin?.id });
      throw new ErreurApi(403, 'ACCES_REFUSE', 'Réservé aux super-admins.');
    }
  };
