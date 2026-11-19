import argon2 from 'argon2';
import type { PrismaClient } from '@prisma/client';

const LONGUEUR_MIN = 12;

// Amorce le tout premier compte super-admin, uniquement si la table est entièrement vide (jamais
// de remplacement d'un compte existant) et si ADMIN_SUPER_PRENOM/ADMIN_SUPER_MOT_DE_PASSE sont
// définis. Les comptes suivants se créent ensuite depuis l'administration (super-admin → ADMIN).
export async function seedSuperAdmin(prisma: PrismaClient) {
  const total = await prisma.compteAdmin.count();
  if (total > 0) return;

  const prenom = process.env.ADMIN_SUPER_PRENOM?.trim();
  const motDePasse = process.env.ADMIN_SUPER_MOT_DE_PASSE;
  if (!prenom || !motDePasse) {
    console.log('Aucun compte admin : définis ADMIN_SUPER_PRENOM et ADMIN_SUPER_MOT_DE_PASSE dans .env puis relance le seed pour amorcer un super-admin.');
    return;
  }
  if (motDePasse.length < LONGUEUR_MIN) {
    console.error(`ADMIN_SUPER_MOT_DE_PASSE doit faire au moins ${LONGUEUR_MIN} caractères : compte non créé.`);
    return;
  }

  await prisma.compteAdmin.create({
    data: { prenom, role: 'SUPER_ADMIN', motDePasseHash: await argon2.hash(motDePasse) },
  });
  console.log(`Compte super-admin « ${prenom} » créé. Tu peux retirer ADMIN_SUPER_MOT_DE_PASSE de .env.`);
}
