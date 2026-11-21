import argon2 from 'argon2';
import type { CompteAdmin, Prisma, PrismaClient, RoleAdmin } from '@prisma/client';
import { ErreurApi } from '../../lib/errors.js';
import { genererMotDePasse } from '../../lib/mot-de-passe.js';

export const LIMITE_COMPTES_DEFAUT = 3;
export const LIMITE_BENEVOLES_DEFAUT = 5;

async function journaliser(prisma: PrismaClient, auteur: string, action: string, cible: string, details?: Prisma.InputJsonValue) {
  await prisma.actionAdmin.create({ data: { auteur, action, cible, details } });
}

function versPublic(compte: CompteAdmin) {
  return {
    id: compte.id,
    prenom: compte.prenom,
    role: compte.role,
    bloque: compte.bloque,
    createdAt: compte.createdAt.toISOString(),
    derniereConnexionAt: compte.derniereConnexionAt?.toISOString() ?? null,
  };
}

export async function lister(prisma: PrismaClient) {
  const comptes = await prisma.compteAdmin.findMany({ orderBy: { createdAt: 'asc' } });
  return comptes.map(versPublic);
}

// Deux limites séparées : les comptes admin (ADMIN + SUPER_ADMIN) et les comptes bénévoles, pour que
// créer des bénévoles pour le stand ne prenne jamais la place d'un compte admin, et inversement.
export async function creer(
  prisma: PrismaClient,
  auteur: string,
  prenom: string,
  role: RoleAdmin,
  limite = LIMITE_COMPTES_DEFAUT,
  limiteBenevoles = LIMITE_BENEVOLES_DEFAUT,
) {
  if (role === 'BENEVOLE') {
    const benevoles = await prisma.compteAdmin.count({ where: { role: 'BENEVOLE' } });
    if (benevoles >= limiteBenevoles) {
      throw new ErreurApi(409, 'LIMITE_COMPTES_ATTEINTE', `Limite de ${limiteBenevoles} comptes bénévoles atteinte : bloque ou supprime un compte avant d’en créer un autre.`);
    }
  } else {
    const admins = await prisma.compteAdmin.count({ where: { role: { not: 'BENEVOLE' } } });
    if (admins >= limite) {
      throw new ErreurApi(409, 'LIMITE_COMPTES_ATTEINTE', `Limite de ${limite} comptes admin atteinte : bloque ou supprime un compte avant d’en créer un autre.`);
    }
  }
  const motDePasse = genererMotDePasse();
  try {
    const compte = await prisma.compteAdmin.create({
      data: { prenom: prenom.trim(), role, motDePasseHash: await argon2.hash(motDePasse) },
    });
    await journaliser(prisma, auteur, 'CREATION_COMPTE_ADMIN', compte.prenom, { role });
    return { ...versPublic(compte), motDePasse };
  } catch (e) {
    if ((e as { code?: string }).code === 'P2002') {
      throw new ErreurApi(409, 'PRENOM_DEJA_UTILISE', 'Un compte admin avec ce prénom existe déjà.');
    }
    throw e;
  }
}

async function trouver(prisma: PrismaClient, id: string) {
  const compte = await prisma.compteAdmin.findUnique({ where: { id } });
  if (!compte) throw new ErreurApi(404, 'COMPTE_ADMIN_INCONNU', 'Ce compte admin n’existe pas.');
  return compte;
}

// Refuse de bloquer/supprimer le dernier super-admin actif : il ne faut jamais se retrouver sans
// personne capable de gérer les comptes (le seul autre recours serait de relancer le script de
// seed, qui n'amorce un super-admin que si la table est entièrement vide).
async function verifierPasDernierSuperAdmin(prisma: PrismaClient, id: string) {
  const autresSuperAdminsActifs = await prisma.compteAdmin.count({
    where: { id: { not: id }, role: 'SUPER_ADMIN', bloque: false },
  });
  if (autresSuperAdminsActifs === 0) {
    throw new ErreurApi(409, 'DERNIER_SUPER_ADMIN', 'Impossible : ce serait le dernier super-admin actif.');
  }
}

export async function bloquer(prisma: PrismaClient, auteur: string, id: string, bloque: boolean) {
  const compte = await trouver(prisma, id);
  if (bloque && compte.role === 'SUPER_ADMIN') await verifierPasDernierSuperAdmin(prisma, id);
  const maj = await prisma.compteAdmin.update({ where: { id }, data: { bloque } });
  await journaliser(prisma, auteur, bloque ? 'BLOCAGE_COMPTE_ADMIN' : 'DEBLOCAGE_COMPTE_ADMIN', compte.prenom);
  return versPublic(maj);
}

export async function reinitialiserMotDePasse(prisma: PrismaClient, auteur: string, id: string, sessionAGarder?: string) {
  const compte = await trouver(prisma, id);
  const motDePasse = genererMotDePasse();
  // Une réinitialisation suppose souvent un mot de passe compromis : les sessions ouvertes avec
  // l'ancien sont fermées en même temps. Sauf celle de l'auteur (`sessionAGarder`) : un super-admin
  // qui réinitialise son propre mot de passe doit rester connecté pour voir le nouveau.
  const hash = await argon2.hash(motDePasse);
  await prisma.$transaction([
    prisma.compteAdmin.update({ where: { id }, data: { motDePasseHash: hash } }),
    prisma.session.deleteMany({
      where: { compteAdminId: id, ...(sessionAGarder ? { NOT: { id: sessionAGarder } } : {}) },
    }),
  ]);
  await journaliser(prisma, auteur, 'REINITIALISATION_MOT_DE_PASSE_ADMIN', compte.prenom);
  return { motDePasse };
}

export async function supprimer(prisma: PrismaClient, auteur: string, id: string) {
  const compte = await trouver(prisma, id);
  if (compte.role === 'SUPER_ADMIN') await verifierPasDernierSuperAdmin(prisma, id);
  await prisma.compteAdmin.delete({ where: { id } });
  await journaliser(prisma, auteur, 'SUPPRESSION_COMPTE_ADMIN', compte.prenom);
}
