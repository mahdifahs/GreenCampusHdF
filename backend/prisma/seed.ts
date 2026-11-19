import { PrismaClient } from '@prisma/client';
import { DEFIS, seedDefis } from './defis.js';
import { FILIERES, seedFilieres } from './filieres.js';
import { seedSuperAdmin } from './seed-super-admin.js';
import { afficherRapport, seedVetements } from './vetements.js';

const prisma = new PrismaClient();

seedFilieres(prisma)
  .then(() => seedDefis(prisma))
  .then(() => console.log(`${FILIERES.length} filières et ${DEFIS.length} défis enregistrés`))
  .then(() => seedVetements(prisma))
  .then(afficherRapport)
  .then(() => seedSuperAdmin(prisma))
  .finally(() => prisma.$disconnect());
