import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globalSetup: ['test/global-setup.ts'],
    env: {
      NODE_ENV: 'test',
      DATABASE_URL:
        process.env.TEST_DATABASE_URL ?? 'postgresql://greencampus:greencampus@localhost:5432/greencampus_test',
      JWT_SECRET: 'secret-de-test-suffisamment-long-pour-jwt-0123456789',
      RATE_LIMIT_INSCRIPTION_PAR_MIN: '1000',
      RATE_LIMIT_CONNEXION_PAR_MIN: '1000',
      TABLEAU_CACHE_SECONDES: '0',
      SEUIL_ANONYMAT: '2',
      VAPID_PUBLIC_KEY: '',
      DEMO_ENABLED: 'false',
      // Les tests valident les défis juste après les avoir choisis ; le délai a son propre test.
      DEFI_DELAI_VALIDATION_HEURES: '0',
    },
    // Les tests d'intégration partagent la même base : on les exécute l'un après l'autre.
    fileParallelism: false,
  },
});
