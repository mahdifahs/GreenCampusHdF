import type { Evenement, PrismaClient, StatutEvenement } from '@prisma/client';
import { ErreurApi } from '../../lib/errors.js';

type Entree = {
  titre: string;
  description?: string | null;
  lieu?: string | null;
  dateDebut: Date;
  dateFin?: Date | null;
  statut?: StatutEvenement;
};

function versPublic(e: Evenement) {
  return {
    id: e.id,
    titre: e.titre,
    description: e.description,
    lieu: e.lieu,
    dateDebut: e.dateDebut.toISOString(),
    dateFin: e.dateFin?.toISOString() ?? null,
    statut: e.statut,
    createdAt: e.createdAt.toISOString(),
    updatedAt: e.updatedAt.toISOString(),
  };
}

export async function lister(prisma: PrismaClient) {
  return (await prisma.evenement.findMany({ orderBy: { dateDebut: 'desc' } })).map(versPublic);
}

// Une fin avant le début afficherait un évènement incohérent sur la page d'accueil.
function verifierDates(debut: Date, fin: Date | null | undefined) {
  if (fin && fin.getTime() < debut.getTime()) {
    throw new ErreurApi(400, 'DATES_INCOHERENTES', 'La fin de l’évènement doit être après son début.');
  }
}

export async function creer(prisma: PrismaClient, donnees: Entree) {
  verifierDates(donnees.dateDebut, donnees.dateFin);
  return versPublic(await prisma.evenement.create({ data: donnees }));
}

export async function modifier(prisma: PrismaClient, id: string, donnees: Partial<Entree>) {
  if (donnees.dateDebut !== undefined || donnees.dateFin !== undefined) {
    // Modification partielle : on compare avec la date déjà enregistrée pour le champ absent.
    const actuel = await prisma.evenement.findUnique({ where: { id } });
    if (actuel) {
      verifierDates(donnees.dateDebut ?? actuel.dateDebut, donnees.dateFin === undefined ? actuel.dateFin : donnees.dateFin);
    }
  }
  return versPublic(await prisma.evenement.update({ where: { id }, data: donnees }));
}

export async function supprimer(prisma: PrismaClient, id: string) {
  await prisma.evenement.delete({ where: { id } });
}
