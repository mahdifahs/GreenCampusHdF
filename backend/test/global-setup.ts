import { execSync } from 'node:child_process';
import { PrismaClient } from '@prisma/client';
import type { TestProject } from 'vitest/node';
import { seedDefis } from '../prisma/defis.js';
import { seedFilieres } from '../prisma/filieres.js';

// Prépare la base de test : migrations à jour, tables vidées, filières et défis insérés.
export default async function setup(project: TestProject) {
  const url = project.config.env.DATABASE_URL as string;
  // Garde-fou : on ne vide jamais une base qui n'est pas explicitement une base de test.
  if (!new URL(url).pathname.endsWith('_test')) {
    throw new Error(`Refus de lancer les tests sur ${url} : le nom de la base doit finir par "_test".`);
  }

  execSync('npx prisma migrate deploy', { env: { ...process.env, DATABASE_URL: url }, stdio: 'ignore' });

  const prisma = new PrismaClient({ datasourceUrl: url });
  await prisma.$executeRawUnsafe(
    'TRUNCATE "Annonce", "Maintenance", "Session", "CompteAdmin", "Evenement", "EvenementSecurite", "ActionAdmin", "QuantiteVetement", "TypeVetement", "Matiere", "CompteurJour", "QuizReponse", "Relance", "PushAbonnement", "Suivi", "Engagement", "Bilan", "Participant", "Defi" RESTART IDENTITY CASCADE',
  );
  await seedFilieres(prisma);
  await seedDefis(prisma);
  await prisma.$disconnect();
}
