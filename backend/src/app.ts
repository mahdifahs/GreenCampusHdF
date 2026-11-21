import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import cors from '@fastify/cors';
import helmet from '@fastify/helmet';
import rateLimit from '@fastify/rate-limit';
import fastifyStatic from '@fastify/static';
import swagger from '@fastify/swagger';
import swaggerUi from '@fastify/swagger-ui';
import Fastify from 'fastify';
import {
  jsonSchemaTransform,
  serializerCompiler,
  validatorCompiler,
  type ZodTypeProvider,
} from 'fastify-type-provider-zod';
import type { Config } from './config.js';
import { installerGestionErreurs } from './lib/errors.js';
import adminRoutes from './modules/admin/routes.js';
import annonceRoutes from './modules/annonce/routes.js';
import bilansRoutes from './modules/bilans/routes.js';
import defisRoutes from './modules/defis/routes.js';
import devRoutes from './modules/dev/routes.js';
import evenementsRoutes from './modules/evenements/routes.js';
import filieresRoutes from './modules/filieres/routes.js';
import guideIaRoutes from './modules/guide-ia/routes.js';
import statutRoutes from './modules/statut/routes.js';
import participantsRoutes from './modules/participants/routes.js';
import quizRoutes from './modules/quiz/routes.js';
import suivisRoutes from './modules/suivis/routes.js';
import tableauRoutes from './modules/tableau-de-bord/routes.js';
import vetementsRoutes from './modules/vetements/routes.js';
import annonce from './plugins/annonce.js';
import questionnaire from './plugins/questionnaire.js';
import auth from './plugins/auth.js';
import maintenance from './plugins/maintenance.js';
import ngc from './plugins/ngc.js';
import prisma from './plugins/prisma.js';
import relances from './plugins/relances.js';
import securite from './plugins/securite.js';

const DOSSIER_ADMIN = fileURLToPath(new URL('../admin/', import.meta.url));

export async function buildApp(config: Config) {
  const app = Fastify({
    logger: config.NODE_ENV === 'test' ? false : { level: config.NODE_ENV === 'production' ? 'info' : 'debug' },
    // Ne fait confiance qu'au nombre déclaré de reverse proxys (Caddy = 1) pour lire l'IP du client :
    // avec « true », un client pourrait inventer son IP dans X-Forwarded-For et contourner la limitation de débit.
    trustProxy: config.TRUST_PROXY > 0 ? (_adresse: string, saut: number) => saut < config.TRUST_PROXY : false,
    // Aucune requête légitime ne dépasse quelques dizaines de Ko (un bilan complet fait moins de 30 Ko).
    bodyLimit: 256 * 1024,
  }).withTypeProvider<ZodTypeProvider>();

  app.setValidatorCompiler(validatorCompiler);
  app.setSerializerCompiler(serializerCompiler);
  installerGestionErreurs(app);

  // Politique de sécurité du contenu (CSP) : uniquement des ressources servies par l'application elle-même,
  // aucun script ou style en ligne, pas d'intégration dans une iframe tierce (OWASP A02 et A05, XSS).
  await app.register(helmet, {
    contentSecurityPolicy: {
      useDefaults: false,
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'"],
        styleSrc: ["'self'"],
        imgSrc: ["'self'", 'data:'],
        fontSrc: ["'self'"],
        connectSrc: ["'self'"],
        workerSrc: ["'self'"],
        manifestSrc: ["'self'"],
        objectSrc: ["'none'"],
        baseUri: ["'self'"],
        formAction: ["'self'"],
        frameAncestors: ["'none'"],
        // En local (http://localhost), forcer HTTPS casserait le chargement des ressources.
        upgradeInsecureRequests: config.NODE_ENV === 'production' ? [] : null,
      },
    },
  });
  await app.register(cors, { origin: config.CORS_ORIGIN.split(',').map((o) => o.trim()) });
  // Pas de limite globale : seules les routes sensibles (inscription, connexion) en déclarent une.
  // Chaque dépassement est tracé dans le journal de sécurité (OWASP A09).
  await app.register(rateLimit, {
    global: false,
    onExceeded: (request) => void app.journalSecurite(request, 'TROP_DE_REQUETES', { route: request.routeOptions.url ?? request.url }),
  });

  if (config.DOCS_ENABLED) {
    await app.register(swagger, {
      openapi: {
        info: { title: 'API GreenCampus HdF', version: '0.1.0' },
        components: {
          securitySchemes: {
            bearerAuth: { type: 'http', scheme: 'bearer', bearerFormat: 'JWT' },
            // Le navigateur utilise ces cookies HttpOnly, posés à la connexion ; Bearer reste accepté (outils, tests).
            cookieParticipant: { type: 'apiKey', in: 'cookie', name: 'gc_session' },
            cookieAdmin: { type: 'apiKey', in: 'cookie', name: 'gc_admin' },
          },
        },
      },
      transform: jsonSchemaTransform,
    });
    // staticCSP : Swagger UI fournit sa propre CSP compatible avec ses scripts (développement uniquement par défaut).
    await app.register(swaggerUi, { routePrefix: '/docs', staticCSP: true });
  }

  await app.register(prisma);
  await app.register(securite);
  await app.register(auth, {
    secret: config.JWT_SECRET,
    ttlSecondes: config.TOKEN_TTL_SECONDES,
    ttlAdminSecondes: config.ADMIN_SESSION_TTL_SECONDES,
    cookieSecure: config.NODE_ENV === 'production',
    origines: config.CORS_ORIGIN.split(',').map((o) => o.trim()),
  });
  await app.register(ngc);
  await app.register(maintenance);
  await app.register(annonce);
  await app.register(questionnaire);
  await app.register(relances, {
    clePublique: config.VAPID_PUBLIC_KEY,
    clePrivee: config.VAPID_PRIVATE_KEY,
    sujet: config.VAPID_SUJET,
    intervalleMin: config.RELANCE_INTERVALLE_MIN,
  });

  // Sonde de supervision : vérifie réellement la base, pour qu'une panne ne passe pas inaperçue (OWASP A10).
  app.get('/health', { schema: { hide: true } }, async (request, reply) => {
    try {
      await Promise.race([
        app.prisma.$queryRaw`SELECT 1`,
        new Promise((_, rejeter) => setTimeout(() => rejeter(new Error('Délai dépassé')), 2000).unref()),
      ]);
      return { status: 'ok', base: 'ok' };
    } catch (e) {
      request.log.error(e, 'Base de données injoignable');
      return reply.status(503).send({ status: 'indisponible', base: 'injoignable' });
    }
  });

  await app.register(
    async (api) => {
      await api.register(statutRoutes);
      await api.register(annonceRoutes);
      await api.register(filieresRoutes);
      await api.register(evenementsRoutes);
      await api.register(participantsRoutes, {
        limiteInscription: config.RATE_LIMIT_INSCRIPTION_PAR_MIN,
        limiteConnexion: config.RATE_LIMIT_CONNEXION_PAR_MIN,
      });
      await api.register(bilansRoutes);
      await api.register(defisRoutes, { delaiValidationMs: config.DEFI_DELAI_VALIDATION_HEURES * 60 * 60 * 1000 });
      await api.register(tableauRoutes, { seuil: config.SEUIL_ANONYMAT, cacheMs: config.TABLEAU_CACHE_SECONDES * 1000 });
      await api.register(vetementsRoutes);
      await api.register(suivisRoutes, { clePublique: config.VAPID_PUBLIC_KEY });
      await api.register(guideIaRoutes);
      await api.register(quizRoutes);
      if (config.ADMIN_ENABLED) {
        await api.register(adminRoutes, {
          prefix: '/admin',
          limiteComptes: config.ADMIN_LIMITE_COMPTES,
          limiteBenevoles: config.ADMIN_LIMITE_BENEVOLES,
          limiteConnexionParMin: config.ADMIN_RATE_LIMIT_CONNEXION_PAR_MIN,
        });
      }
      // Outils de test (vieillir ses bilans, déclencher les relances) : jamais en production.
      if (config.NODE_ENV !== 'production' && config.DEMO_ENABLED) await api.register(devRoutes, { prefix: '/dev' });
    },
    { prefix: '/api' },
  );

  // Interface d'administration de l'équipe : active via ADMIN_ENABLED, y compris en production.
  const adminActive = config.ADMIN_ENABLED && existsSync(DOSSIER_ADMIN);
  if (adminActive) await app.register(fastifyStatic, { root: DOSSIER_ADMIN, prefix: '/admin/' });

  return app;
}
