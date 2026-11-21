import type { Bilan, PrismaClient, ReponseQuestion, TypeBilan } from '@prisma/client';
import { ErreurApi } from '../../lib/errors.js';
import {
  categorieDominante,
  ErreurSituation,
  type Categorie,
  type ModeleNgc,
  type Situation,
  type ValeurReponse,
} from '../../lib/ngc.js';
import { validerInformations, type QuestionnaireActif, type ValeurInformation } from '../questionnaire/service.js';

export function versPublic(bilan: Bilan & { reponses?: ReponseQuestion[] }, avecSituation = false) {
  const parCategorie = bilan.parCategorie as Record<Categorie, number>;
  return {
    id: bilan.id,
    type: bilan.type,
    totalKg: bilan.totalKg,
    parCategorie,
    categorieDominante: categorieDominante(parCategorie),
    nbReponses: Object.keys(bilan.situation as object).length,
    createdAt: bilan.createdAt.toISOString(),
    ...(avecSituation
      ? {
          situation: bilan.situation as Situation,
          informations: Object.fromEntries((bilan.reponses ?? []).map((r) => [r.questionId, r.valeurChoix ?? r.valeurNombre!])),
        }
      : {}),
  };
}

// Le résultat est toujours recalculé ici à partir des réponses : on ne fait jamais confiance
// à un total envoyé par le navigateur (le classement serait facile à truquer).
function valider(ngc: ModeleNgc, questionnaire: QuestionnaireActif, brute: Record<string, ValeurReponse>): Situation {
  try {
    return ngc.validerSituation(brute, questionnaire.bornes);
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
  questionnaire: QuestionnaireActif,
  data: { type: TypeBilan; situation: Record<string, ValeurReponse>; informations?: Record<string, ValeurInformation> },
) {
  const situation = valider(ngc, questionnaire, data.situation);
  // Questions « information » : hors calcul, enregistrées à part pour les statistiques anonymes.
  const { erreurs, reponses } = validerInformations(questionnaire, data.informations ?? {});
  if (erreurs.length) throw new ErreurApi(400, 'SITUATION_INVALIDE', 'Certaines réponses ne sont pas valides.', erreurs);
  const resultat = ngc.calculerBilan(situation);
  return prisma.bilan.create({
    data: {
      participantId,
      type: data.type,
      situation,
      totalKg: resultat.totalKg,
      parCategorie: resultat.parCategorie,
      reponses: { create: reponses },
    },
  });
}

export function estimer(ngc: ModeleNgc, questionnaire: QuestionnaireActif, brute: Record<string, ValeurReponse>) {
  return ngc.estimer(
    valider(ngc, questionnaire, brute),
    questionnaire.ademe.map((q) => q.dottedName),
  );
}

export async function lister(prisma: PrismaClient, participantId: string) {
  return prisma.bilan.findMany({ where: { participantId }, orderBy: { createdAt: 'desc' } });
}

export async function dernier(prisma: PrismaClient, participantId: string) {
  return prisma.bilan.findFirst({ where: { participantId }, orderBy: { createdAt: 'desc' }, include: { reponses: true } });
}
