import cookie from '@fastify/cookie';
import jwt from '@fastify/jwt';
import type { RoleAdmin } from '@prisma/client';
import type { FastifyReply, FastifyRequest } from 'fastify';
import fp from 'fastify-plugin';
import { ErreurApi } from '../lib/errors.js';

declare module '@fastify/jwt' {
  interface FastifyJWT {
    // jti = id de la ligne Session : un jeton sans session ouverte en base est refusé.
    payload: { sub: string; jti: string; role?: 'admin'; nom?: string; roleAdmin?: RoleAdmin };
    user: { sub: string; jti?: string; role?: 'admin'; nom?: string; roleAdmin?: RoleAdmin };
  }
}

type CompteSession = { id: string; prenom: string; role: RoleAdmin };

declare module 'fastify' {
  interface FastifyInstance {
    authenticate: (request: FastifyRequest, reply: FastifyReply) => Promise<void>;
    authenticateAdmin: (request: FastifyRequest, reply: FastifyReply) => Promise<void>;
    ouvrirSession: (reply: FastifyReply, participantId: string) => Promise<void>;
    ouvrirSessionAdmin: (reply: FastifyReply, compte: CompteSession) => Promise<void>;
    fermerSession: (request: FastifyRequest, reply: FastifyReply) => Promise<void>;
    fermerSessionAdmin: (request: FastifyRequest, reply: FastifyReply) => Promise<void>;
  }
  interface FastifyRequest {
    participantId: string;
    compteAdmin: CompteSession | null;
  }
}

// Le jeton vit dans un cookie HttpOnly : illisible par le JavaScript de la page, il ne peut pas être
// volé par une faille XSS (SECURITY.md §4). Deux cookies distincts, chacun limité à ses routes.
// Chaque jeton renvoie à une ligne Session : se déconnecter la supprime, et une copie du jeton
// (cookie recopié depuis le navigateur) ne vaut alors plus rien.
export const COOKIE_PARTICIPANT = 'gc_session';
export const COOKIE_ADMIN = 'gc_admin';
const CHEMIN_PARTICIPANT = '/api';
const CHEMIN_ADMIN = '/api/admin';
const METHODES_SURES = new Set(['GET', 'HEAD', 'OPTIONS']);
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const PURGE_INTERVALLE_MS = 60 * 60 * 1000;

type Options = {
  secret: string;
  // Durées des sessions, en secondes (TOKEN_TTL et ADMIN_SESSION_TTL).
  ttlSecondes: number;
  ttlAdminSecondes: number;
  // false seulement hors production : un cookie Secure n'est pas renvoyé en http:// (téléphone sur le réseau local).
  cookieSecure: boolean;
  // Origines autorisées en plus de celle du site lui-même (CORS_ORIGIN, ex. le serveur Vite en dev).
  origines: string[];
};

// Bearer d'abord (outils, tests, scripts), sinon le cookie (navigateur).
function extraireJeton(request: FastifyRequest, nomCookie: string): string | null {
  const entete = request.headers.authorization;
  if (entete?.startsWith('Bearer ')) return entete.slice(7).trim() || null;
  return request.cookies[nomCookie] || null;
}

const estExpire = (e: unknown) => {
  const code = (e as { code?: string }).code;
  return code === 'FAST_JWT_EXPIRED' || code === 'FST_JWT_AUTHORIZATION_TOKEN_EXPIRED';
};

export default fp<Options>(async (app, opts) => {
  await app.register(cookie);
  await app.register(jwt, { secret: opts.secret });

  const base = { httpOnly: true, secure: opts.cookieSecure, sameSite: 'strict' as const };

  // Les sessions expirées ne servent plus à rien : purgées au plus une fois par heure, à
  // l'occasion d'une connexion (sans jamais faire échouer celle-ci).
  let dernierePurge = 0;
  function purgerSiBesoin() {
    if (Date.now() - dernierePurge < PURGE_INTERVALLE_MS) return;
    dernierePurge = Date.now();
    app.prisma.session
      .deleteMany({ where: { expiresAt: { lt: new Date() } } })
      .catch((e) => app.log.error(e, 'Purge des sessions expirées impossible'));
  }

  async function creerSession(titulaire: { participantId: string } | { compteAdminId: string }, dureeSecondes: number) {
    purgerSiBesoin();
    return app.prisma.session.create({
      data: { ...titulaire, expiresAt: new Date(Date.now() + dureeSecondes * 1000) },
      select: { id: true },
    });
  }

  // Ferme la session désignée par le jeton présenté (cookie ou Bearer), si elle appartient bien à
  // son titulaire. Un jeton invalide ou expiré n'a rien à fermer : seul le cookie est effacé.
  async function supprimerSessionDuJeton(request: FastifyRequest, nomCookie: string, admin: boolean) {
    const jeton = extraireJeton(request, nomCookie);
    if (!jeton) return;
    let charge: { sub: string; jti?: string; role?: 'admin' };
    try {
      charge = app.jwt.verify(jeton);
    } catch {
      return;
    }
    if (!charge.jti || !UUID.test(charge.jti) || !UUID.test(charge.sub) || (charge.role === 'admin') !== admin) return;
    await app.prisma.session.deleteMany({
      where: admin ? { id: charge.jti, compteAdminId: charge.sub } : { id: charge.jti, participantId: charge.sub },
    });
  }

  app.decorateRequest('participantId', '');
  app.decorateRequest('compteAdmin', null);

  app.decorate('ouvrirSession', async (reply: FastifyReply, participantId: string) => {
    const session = await creerSession({ participantId }, opts.ttlSecondes);
    const jeton = app.jwt.sign({ sub: participantId, jti: session.id }, { expiresIn: opts.ttlSecondes });
    reply.setCookie(COOKIE_PARTICIPANT, jeton, { ...base, path: CHEMIN_PARTICIPANT, maxAge: opts.ttlSecondes });
  });
  // Cookie de session (sans durée) : comme l'ancien sessionStorage, il disparaît à la fermeture du
  // navigateur ; le jeton et la session expirent de toute façon au bout de ADMIN_SESSION_TTL.
  app.decorate('ouvrirSessionAdmin', async (reply: FastifyReply, compte: CompteSession) => {
    const session = await creerSession({ compteAdminId: compte.id }, opts.ttlAdminSecondes);
    const jeton = app.jwt.sign(
      { sub: compte.id, jti: session.id, role: 'admin', nom: compte.prenom, roleAdmin: compte.role },
      { expiresIn: opts.ttlAdminSecondes },
    );
    reply.setCookie(COOKIE_ADMIN, jeton, { ...base, path: CHEMIN_ADMIN });
  });
  app.decorate('fermerSession', async (request: FastifyRequest, reply: FastifyReply) => {
    await supprimerSessionDuJeton(request, COOKIE_PARTICIPANT, false);
    reply.clearCookie(COOKIE_PARTICIPANT, { ...base, path: CHEMIN_PARTICIPANT });
  });
  app.decorate('fermerSessionAdmin', async (request: FastifyRequest, reply: FastifyReply) => {
    await supprimerSessionDuJeton(request, COOKIE_ADMIN, true);
    reply.clearCookie(COOKIE_ADMIN, { ...base, path: CHEMIN_ADMIN });
  });

  // Protection CSRF : en plus de SameSite=Strict, toute requête qui modifie des données en
  // s'appuyant sur un cookie de session doit venir du site lui-même (en-tête Origin). Les requêtes
  // avec un jeton Bearer ne sont pas concernées : un site tiers ne peut pas les forger.
  app.addHook('onRequest', async (request) => {
    if (METHODES_SURES.has(request.method)) return;
    if (request.headers.authorization?.startsWith('Bearer ')) return;
    if (!request.cookies[COOKIE_PARTICIPANT] && !request.cookies[COOKIE_ADMIN]) return;
    const origine = request.headers.origin;
    let autorisee = false;
    if (origine) {
      try {
        autorisee = new URL(origine).host === request.host || opts.origines.includes(origine);
      } catch {
        autorisee = false;
      }
    }
    if (!autorisee) {
      await app.journalSecurite(request, 'ORIGINE_REFUSEE', { origine: origine ?? null, route: request.url });
      throw new ErreurApi(403, 'ORIGINE_REFUSEE', 'Requête refusée : elle ne vient pas du site GreenCampus.');
    }
  });

  // preHandler des routes protégées : jeton valide, session toujours ouverte en base (ni fermée
  // par une déconnexion, ni effacée avec le compte) et participant non bloqué.
  app.decorate('authenticate', async (request: FastifyRequest) => {
    const refus = () => new ErreurApi(401, 'SESSION_INVALIDE', 'Session absente ou expirée, reconnecte-toi avec ton code.');
    const jeton = extraireJeton(request, COOKIE_PARTICIPANT);
    try {
      if (!jeton) throw new Error('absent');
      request.user = app.jwt.verify(jeton);
    } catch {
      throw refus();
    }
    // Un jeton d'administration ne vaut pas session de participant.
    if (request.user.role === 'admin') throw new ErreurApi(401, 'SESSION_INVALIDE', 'Session de participant requise.');
    const { jti, sub } = request.user;
    if (!jti || !UUID.test(jti)) throw refus();
    const session = await app.prisma.session.findUnique({
      where: { id: jti },
      select: { participantId: true, expiresAt: true, participant: { select: { id: true, bloque: true } } },
    });
    if (!session?.participant || session.participantId !== sub || session.expiresAt <= new Date()) throw refus();
    if (session.participant.bloque) {
      await app.journalSecurite(request, 'COMPTE_BLOQUE_TENTATIVE', { participantId: session.participant.id });
      throw new ErreurApi(403, 'COMPTE_BLOQUE', 'Ce compte a été suspendu par l’équipe GreenCampus.');
    }
    request.participantId = session.participant.id;
  });

  // preHandler des routes d'administration : jeton valide portant le rôle admin, session ouverte.
  app.decorate('authenticateAdmin', async (request: FastifyRequest) => {
    const refus = () => new ErreurApi(401, 'SESSION_ADMIN_INVALIDE', 'Session d’administration absente ou expirée.');
    const jeton = extraireJeton(request, COOKIE_ADMIN);
    if (!jeton) throw refus();
    try {
      request.user = app.jwt.verify(jeton);
    } catch (e) {
      // Un jeton expiré est normal ; un jeton falsifié ou mal formé ne l'est pas.
      if (!estExpire(e)) await app.journalSecurite(request, 'ADMIN_ACCES_REFUSE', { motif: 'jeton invalide' });
      throw refus();
    }
    if (request.user.role !== 'admin') {
      await app.journalSecurite(request, 'ADMIN_ACCES_REFUSE', { motif: 'jeton de participant' });
      throw new ErreurApi(403, 'ACCES_REFUSE', 'Réservé à l’équipe GreenCampus.');
    }
    // La session a pu être fermée (déconnexion, mot de passe réinitialisé) et le compte bloqué ou
    // supprimé depuis l'émission du jeton : on revérifie en base à chaque requête.
    const { jti, sub } = request.user;
    if (!jti || !UUID.test(jti)) throw refus();
    const session = await app.prisma.session.findUnique({
      where: { id: jti },
      select: { compteAdminId: true, expiresAt: true, compteAdmin: { select: { id: true, prenom: true, role: true, bloque: true } } },
    });
    const compte = session?.compteAdmin;
    if (!compte || session.compteAdminId !== sub || session.expiresAt <= new Date()) {
      // Jeton authentique mais session fermée : peut être un cookie recopié après déconnexion.
      await app.journalSecurite(request, 'ADMIN_SESSION_FERMEE', { compteId: sub });
      throw refus();
    }
    if (compte.bloque) {
      await app.journalSecurite(request, 'ADMIN_COMPTE_BLOQUE_TENTATIVE', { compteId: compte.id });
      throw new ErreurApi(403, 'COMPTE_ADMIN_BLOQUE', 'Ce compte administrateur a été bloqué.');
    }
    request.compteAdmin = { id: compte.id, prenom: compte.prenom, role: compte.role };
  });
});
