import { randomBytes } from 'node:crypto'
import { defineConfig, devices } from '@playwright/test'

// Parcours de bout en bout (npm run test:e2e) : une vraie API sur une base dédiée (greencampus_e2e,
// vidée à chaque lancement), le front construit et servi par `vite preview`, un vrai Chromium.
// Voir e2e/README.md.

export const PORT_API = 4100
export const PORT_FRONT = 4173
export const URL_API = `http://127.0.0.1:${PORT_API}`

// Valeurs propres à ce lancement, transmises aux processus de test par l'environnement (les
// workers relisent ce fichier : `??=` garde celles du processus principal).
process.env.E2E_DATABASE_URL ??= 'postgresql://greencampus:greencampus@localhost:5432/greencampus_e2e'
process.env.E2E_ADMIN_PRENOM ??= 'SuperE2e'
process.env.E2E_ADMIN_MOT_DE_PASSE ??= randomBytes(18).toString('base64url')
const JWT_SECRET = (process.env.E2E_JWT_SECRET ??= randomBytes(32).toString('base64url'))

const CI = Boolean(process.env.CI)

export default defineConfig({
  testDir: './e2e',
  // Une seule base partagée et un mode maintenance global : les parcours s'enchaînent un par un.
  workers: 1,
  fullyParallel: false,
  forbidOnly: CI,
  retries: 0,
  timeout: 60_000,
  reporter: CI ? [['list'], ['html', { open: 'never' }]] : 'list',
  use: {
    baseURL: `http://localhost:${PORT_FRONT}`,
    locale: 'fr-FR',
    timezoneId: 'Europe/Paris',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: [
    {
      // Base préparée puis API lancée depuis ses sources (tsx), sur la base e2e. Les valeurs
      // ci-dessous priment sur backend/.env, que Prisma lit pour les variables absentes.
      command: 'npx tsx ../frontend/e2e/preparer-base.ts && npx tsx src/server.ts',
      cwd: '../backend',
      url: `${URL_API}/health`,
      reuseExistingServer: false,
      timeout: 120_000,
      stdout: 'ignore',
      stderr: 'pipe',
      env: {
        NODE_ENV: 'development',
        HOST: '127.0.0.1',
        PORT: String(PORT_API),
        DATABASE_URL: process.env.E2E_DATABASE_URL,
        E2E_DATABASE_URL: process.env.E2E_DATABASE_URL,
        E2E_ADMIN_PRENOM: process.env.E2E_ADMIN_PRENOM,
        E2E_ADMIN_MOT_DE_PASSE: process.env.E2E_ADMIN_MOT_DE_PASSE,
        JWT_SECRET,
        CORS_ORIGIN: `http://localhost:${PORT_FRONT}`,
        TRUST_PROXY: '0',
        ADMIN_ENABLED: 'true',
        DOCS_ENABLED: 'false',
        DEMO_ENABLED: 'false',
        DEFI_DELAI_VALIDATION_HEURES: '0',
        RATE_LIMIT_INSCRIPTION_PAR_MIN: '1000',
        RATE_LIMIT_CONNEXION_PAR_MIN: '1000',
        ADMIN_RATE_LIMIT_CONNEXION_PAR_MIN: '1000',
        TABLEAU_CACHE_SECONDES: '0',
        VAPID_PUBLIC_KEY: '',
        VAPID_PRIVATE_KEY: '',
      },
    },
    {
      command: `npm run build && npx vite preview --port ${PORT_FRONT} --strictPort`,
      url: `http://localhost:${PORT_FRONT}`,
      reuseExistingServer: false,
      timeout: 180_000,
      stdout: 'ignore',
      env: { API_URL: URL_API },
    },
  ],
})
