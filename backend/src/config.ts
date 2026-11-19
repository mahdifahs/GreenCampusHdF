import { existsSync } from 'node:fs';
import { z } from 'zod';

// Booléen d'environnement facultatif : sa valeur par défaut dépend de l'environnement (voir plus bas).
const booleenFacultatif = z
  .enum(['true', 'false'])
  .optional()
  .transform((v) => (v === undefined ? undefined : v === 'true'));

// Valeurs d'exemple de .env.example : refusées en production (OWASP A02, mauvaise configuration).
const SECRETS_EXEMPLE = ['a-remplacer-par-un-secret-de-plus-de-32-caracteres'];

// Durées de session : un nombre suivi de s, m, h ou d (ex. 60d, 12h).
const DUREE = /^\d+[smhd]$/;
const enSecondes = (duree: string) => Number(duree.slice(0, -1)) * { s: 1, m: 60, h: 3600, d: 86400 }[duree.slice(-1) as 's' | 'm' | 'h' | 'd'];

const schema = z
  .object({
    NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
    HOST: z.string().default('0.0.0.0'),
    PORT: z.coerce.number().int().positive().default(4000),
    DATABASE_URL: z.string().url(),
    JWT_SECRET: z.string().min(32, 'JWT_SECRET doit faire au moins 32 caractères'),
    // Durée de validité d'une session (format @fastify/jwt : "60d", "12h"...). Sert aussi de durée
    // au cookie de session, d'où le format restreint (nombre + s, m, h ou d).
    TOKEN_TTL: z.string().regex(DUREE, 'TOKEN_TTL : un nombre suivi de s, m, h ou d (ex. 60d).').default('60d'),
    CORS_ORIGIN: z.string().default('http://localhost:5173'),
    // Nombre de reverse proxys devant l'API (Caddy = 1). L'IP du client est lue dans X-Forwarded-For
    // en ne faisant confiance qu'à ces proxys : sinon un client pourrait inventer son IP et contourner
    // la limitation de débit. Par défaut : 1 en production, 0 (aucun proxy) ailleurs.
    TRUST_PROXY: z.coerce.number().int().min(0).max(5).optional(),
    // Le campus sort souvent par une seule IP publique : limites volontairement larges.
    RATE_LIMIT_INSCRIPTION_PAR_MIN: z.coerce.number().int().positive().default(60),
    RATE_LIMIT_CONNEXION_PAR_MIN: z.coerce.number().int().positive().default(20),
    // Par défaut : activés en développement, désactivés en production.
    DOCS_ENABLED: booleenFacultatif,
    DEMO_ENABLED: booleenFacultatif,
    SEUIL_ANONYMAT: z.coerce.number().int().min(1).default(5),
    // Interface /admin/ désactivée par défaut (opt-in explicite). Les comptes eux-mêmes vivent en
    // base (CompteAdmin) : voir ADMIN_SUPER_PRENOM/ADMIN_SUPER_MOT_DE_PASSE pour amorcer le premier.
    ADMIN_ENABLED: booleenFacultatif.transform((v) => v ?? false),
    ADMIN_LIMITE_COMPTES: z.coerce.number().int().positive().default(3),
    // Comptes « bénévole » (saisie au stand seulement), comptés à part des comptes admin.
    ADMIN_LIMITE_BENEVOLES: z.coerce.number().int().positive().default(5),
    ADMIN_RATE_LIMIT_CONNEXION_PAR_MIN: z.coerce.number().int().positive().default(5),
    ADMIN_SESSION_TTL: z.string().regex(DUREE, 'ADMIN_SESSION_TTL : un nombre suivi de s, m, h ou d (ex. 12h).').default('12h'),
    TABLEAU_CACHE_SECONDES: z.coerce.number().min(0).default(10),
    VAPID_PUBLIC_KEY: z.string().default(''),
    VAPID_PRIVATE_KEY: z.string().default(''),
    VAPID_SUJET: z.string().default('mailto:contact@example.org'),
    RELANCE_INTERVALLE_MIN: z.coerce.number().positive().default(60),
    // Délai minimum entre le choix d'un défi et sa validation (« Tenu »). 0 = aucun délai.
    DEFI_DELAI_VALIDATION_HEURES: z.coerce.number().min(0).max(168).default(24),
  })
  .superRefine((c, ctx) => {
    const origines = c.CORS_ORIGIN.split(',').map((o) => o.trim());
    if (origines.includes('*')) {
      ctx.addIssue({ code: 'custom', path: ['CORS_ORIGIN'], message: 'CORS_ORIGIN ne doit pas contenir « * » : lister les origines autorisées.' });
    }
    if (c.NODE_ENV !== 'production') return;

    // Garde-fous de production : mieux vaut refuser de démarrer que tourner avec une configuration faible.
    if (SECRETS_EXEMPLE.includes(c.JWT_SECRET) || /remplacer|exemple|changeme/i.test(c.JWT_SECRET)) {
      ctx.addIssue({ code: 'custom', path: ['JWT_SECRET'], message: 'JWT_SECRET est la valeur d’exemple : générer un vrai secret.' });
    }
    if (origines.some((o) => !o.startsWith('https://'))) {
      ctx.addIssue({ code: 'custom', path: ['CORS_ORIGIN'], message: 'En production, les origines CORS doivent être en https://.' });
    }
  })
  .transform((c) => {
    const production = c.NODE_ENV === 'production';
    return {
      ...c,
      TRUST_PROXY: c.TRUST_PROXY ?? (production ? 1 : 0),
      TOKEN_TTL_SECONDES: enSecondes(c.TOKEN_TTL),
      ADMIN_SESSION_TTL_SECONDES: enSecondes(c.ADMIN_SESSION_TTL),
      DOCS_ENABLED: c.DOCS_ENABLED ?? !production,
      DEMO_ENABLED: c.DEMO_ENABLED ?? !production,
    };
  });

export type Config = z.infer<typeof schema>;

export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
  if (env === process.env && existsSync('.env')) process.loadEnvFile('.env');
  const parsed = schema.safeParse(env);
  if (!parsed.success) {
    const details = parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('\n');
    throw new Error(`Configuration invalide :\n${details}`);
  }
  return parsed.data;
}
