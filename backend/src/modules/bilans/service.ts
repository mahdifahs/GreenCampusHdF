import type { Bilan, PrismaClient, TypeBilan } from '@prisma/client';
import { ErreurApi } from '../../lib/errors.js';
import {
  categorieDominante,
  ErreurSituation,
  type Categorie,
  type ModeleNgc,
  type Situation,
  type ValeurReponse,
} from '../../lib/ngc.js';

export function versPublic(bilan: Bilan, avecSituation = false) {
  const parCategorie = bilan.parCategorie as Record<Categorie, number>;
  return {
    id: bilan.id,
    type: bilan.type,
    totalKg: bilan.totalKg,
    parCategorie,
    categorieDominante: categorieDominante(parCategorie),
    nbReponses: Object.keys(bilan.situation as object).length,
    createdAt: bilan.createdAt.toISOString(),
    ...(avecSituation ? { situation: bilan.situation as Situation } : {}),
  };
}

// Le résultat est toujours recalculé ici à partir des réponses : on ne fait jamais confiance
// à un total envoyé par le navigateur (le classement serait facile à truquer).
function valider(ngc: ModeleNgc, brute: Record<string, ValeurReponse>): Situation {
  try {
    return ngc.validerSituation(brute);
  } catch (e) {
    if (e instanceof ErreurSituation) {
      throw new ErreurApi(400, 'SITUATION_INVALIDE', 'Certaines réponses ne sont pas valides.', e.erreurs);
    }
    throw e;
  }
}

export async function enregistrer(
  prisma: PrismaClient,
  ngc: ModeleNgc,
  participantId: string,
  data: { type: TypeBilan; situation: Record<string, ValeurReponse> },
) {
  const situation = valider(ngc, data.situation);
  const resultat = ngc.calculerBilan(situation);
  return prisma.bilan.create({
    data: {
      participantId,
      type: data.type,
      situation,
      totalKg: resultat.totalKg,
      parCategorie: resultat.parCategorie,
    },
  });
}

export function estimer(ngc: ModeleNgc, brute: Record<string, ValeurReponse>, questions: readonly string[]) {
  return ngc.estimer(valider(ngc, brute), questions);
}

export async function lister(prisma: PrismaClient, participantId: string) {
  return prisma.bilan.findMany({ where: { participantId }, orderBy: { createdAt: 'desc' } });
}

export async function dernier(prisma: PrismaClient, participantId: string) {
  return prisma.bilan.findFirst({ where: { participantId }, orderBy: { createdAt: 'desc' } });
}
