import { execSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'

// Lancé juste avant l'API des parcours (voir webServer dans playwright.config.ts, qui démarre avant
// tout globalSetup) : base e2e à jour des migrations, entièrement vidée, puis référentiel (filières,
// défis, vêtements) et super-admin de test recréés par le seed habituel du backend.
const BACKEND = fileURLToPath(new URL('../../backend/', import.meta.url))

{
  const url = process.env.E2E_DATABASE_URL
  if (!url) throw new Error('E2E_DATABASE_URL manquante : lancer via npm run test:e2e.')
  // Garde-fou, comme pour les tests du backend (_test) : on vide toute la base.
  if (!new URL(url).pathname.endsWith('_e2e')) {
    throw new Error(`Refus de lancer les parcours sur ${url} : le nom de la base doit finir par "_e2e".`)
  }
  const env = { ...process.env, DATABASE_URL: url }
  const lancer = (commande: string, input?: string) =>
    execSync(commande, { cwd: BACKEND, env, input, stdio: [input ? 'pipe' : 'ignore', 'ignore', 'inherit'] })

  lancer('npx prisma migrate deploy')
  lancer(
    'npx prisma db execute --stdin --schema prisma/schema.prisma',
    `DO $$ DECLARE t text; BEGIN
       SELECT string_agg(format('%I', tablename), ', ') INTO t FROM pg_tables
        WHERE schemaname = 'public' AND tablename <> '_prisma_migrations';
       EXECUTE 'TRUNCATE ' || t || ' RESTART IDENTITY CASCADE';
     END $$;`,
  )
  execSync('npm run db:seed', {
    cwd: BACKEND,
    env: {
      ...env,
      ADMIN_SUPER_PRENOM: process.env.E2E_ADMIN_PRENOM,
      ADMIN_SUPER_MOT_DE_PASSE: process.env.E2E_ADMIN_MOT_DE_PASSE,
    },
    stdio: ['ignore', 'ignore', 'inherit'],
  })
}
