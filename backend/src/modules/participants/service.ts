import { Prisma, type Annee, type PrismaClient } from '@prisma/client';
import argon2 from 'argon2';
import { ErreurApi } from '../../lib/errors.js';
import { genererPseudo } from '../../lib/pseudo.js';
import { analyserCode, genererCode } from '../../lib/recovery-code.js';

const inclureFiliere = { filiere: { select: { id: true, libelle: true } } } as const;
type ParticipantAvecFiliere = Prisma.ParticipantGetPayload<{ include: typeof inclureFiliere }>;

// Hash factice : on vérifie quand même un hash quand le sélecteur est inconnu,
// pour que le temps de réponse ne révèle pas si un code existe.
const hashFactice = argon2.hash('verificateur-factice');

export function versPublic(p: ParticipantAvecFiliere) {
  return {
    id: p.id,
    pseudo: p.pseudo,
    filiere: p.filiere,
    annee: p.annee,
    createdAt: p.createdAt.toISOString(),
  };
}

async function verifierFiliere(prisma: PrismaClient, filiereId: number) {
  const filiere = await prisma.filiere.findUnique({ where: { id: filiereId }, select: { id: true } });
  if (!filiere) throw new ErreurApi(400, 'FILIERE_INCONNUE', 'Cette filière n’existe pas.');
}

function estConflitUnique(e: unknown) {
  return e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002';
}

export async function inscrire(prisma: PrismaClient, data: { filiereId: number; annee: Annee }) {
  await verifierFiliere(prisma, data.filiereId);

  // Pseudo et sélecteur doivent être uniques : on régénère en cas de collision (rare).
  for (let tentative = 0; tentative < 5; tentative++) {
    const { code, selecteur, verificateur } = genererCode();
    try {
      const participant = await prisma.participant.create({
        data: {
          pseudo: genererPseudo(),
          codeSelecteur: selecteur,
          codeVerifHash: await argon2.hash(verificateur),
          filiereId: data.filiereId,
          annee: data.annee,
          consentementAt: new Date(),
        },
        include: inclureFiliere,
      });
      return { participant, codeRecuperation: code };
    } catch (e) {
      if (!estConflitUnique(e)) throw e;
    }
  }
  throw new ErreurApi(503, 'INSCRIPTION_INDISPONIBLE', 'Impossible de créer le compte, réessaie.');
}

export async function connecter(prisma: PrismaClient, saisie: string) {
  const erreur = new ErreurApi(401, 'CODE_INVALIDE', 'Code de récupération incorrect.');
  const code = analyserCode(saisie);
  if (!code) throw erreur;

  const participant = await prisma.participant.findUnique({
    where: { codeSelecteur: code.selecteur },
    include: inclureFiliere,
  });
  const valide = await argon2.verify(participant?.codeVerifHash ?? (await hashFactice), code.verificateur);
  if (!participant || !valide) throw erreur;
  if (participant.bloque) throw new ErreurApi(403, 'COMPTE_BLOQUE', 'Ce compte a été suspendu par l’équipe GreenCampus.');

  return prisma.participant.update({
    where: { id: participant.id },
    data: { lastSeenAt: new Date() },
    include: inclureFiliere,
  });
}

export async function lire(prisma: PrismaClient, id: string) {
  return prisma.participant.findUniqueOrThrow({ where: { id }, include: inclureFiliere });
}

export async function modifier(prisma: PrismaClient, id: string, data: { filiereId?: number; annee?: Annee }) {
  if (data.filiereId !== undefined) await verifierFiliere(prisma, data.filiereId);
  return prisma.participant.update({ where: { id }, data, include: inclureFiliere });
}

// Droit à l'effacement : les bilans, engagements, suivis et abonnements partent en cascade.
export async function supprimer(prisma: PrismaClient, id: string) {
  await prisma.participant.delete({ where: { id } });
}
