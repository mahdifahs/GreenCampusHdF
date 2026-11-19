import { Prisma, type EtapeSuivi, type PrismaClient } from '@prisma/client';
import { ErreurApi } from '../../lib/errors.js';
import { DELAI_JOURS, QUESTIONNAIRES, validerReponses } from './questionnaire.js';

const JOUR_MS = 24 * 60 * 60 * 1000;
const ETAPES: EtapeSuivi[] = ['J7', 'J14'];

// Le jour zéro est celui du premier bilan (en pratique, le passage au stand).
async function jourZero(prisma: PrismaClient, participantId: string) {
  const premier = await prisma.bilan.findFirst({
    where: { participantId },
    orderBy: { createdAt: 'asc' },
    select: { createdAt: true },
  });
  return premier?.createdAt ?? null;
}

export function dateEtape(jour0: Date, etape: EtapeSuivi) {
  return new Date(jour0.getTime() + DELAI_JOURS[etape] * JOUR_MS);
}

// Étapes disponibles et pas encore remplies, avec leurs questions.
export async function aFaire(prisma: PrismaClient, participantId: string, maintenant = new Date()) {
  const jour0 = await jourZero(prisma, participantId);
  if (!jour0) return { jourZero: null, etapes: [] };
  const faites = new Set(
    (await prisma.suivi.findMany({ where: { participantId }, select: { etape: true } })).map((s) => s.etape),
  );
  return {
    jourZero: jour0.toISOString(),
    etapes: ETAPES.map((etape) => ({ etape, disponibleLe: dateEtape(jour0, etape) }))
      .filter((e) => !faites.has(e.etape))
      .map((e) => ({
        etape: e.etape,
        disponibleLe: e.disponibleLe.toISOString(),
        disponible: e.disponibleLe <= maintenant,
        questions: QUESTIONNAIRES[e.etape],
      })),
  };
}

export async function repondre(
  prisma: PrismaClient,
  participantId: string,
  etape: EtapeSuivi,
  reponses: Record<string, string | number>,
  maintenant = new Date(),
) {
  const jour0 = await jourZero(prisma, participantId);
  if (!jour0) throw new ErreurApi(409, 'AUCUN_BILAN', 'Fais d’abord ton bilan carbone.');
  if (dateEtape(jour0, etape) > maintenant) {
    throw new ErreurApi(409, 'SUIVI_PAS_ENCORE_DISPONIBLE', 'Ce questionnaire n’est pas encore disponible.');
  }
  const erreurs = validerReponses(etape, reponses);
  if (erreurs.length) throw new ErreurApi(400, 'REPONSES_INVALIDES', 'Certaines réponses ne sont pas valides.', erreurs);
  try {
    return await prisma.suivi.create({ data: { participantId, etape, reponses } });
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') {
      throw new ErreurApi(409, 'SUIVI_DEJA_REMPLI', 'Tu as déjà répondu à ce questionnaire.');
    }
    throw e;
  }
}

export async function enregistrerAbonnement(
  prisma: PrismaClient,
  participantId: string,
  abonnement: { endpoint: string; keys: { p256dh: string; auth: string } },
) {
  const data = { participantId, p256dh: abonnement.keys.p256dh, auth: abonnement.keys.auth };
  await prisma.pushAbonnement.upsert({
    where: { endpoint: abonnement.endpoint },
    update: data,
    create: { endpoint: abonnement.endpoint, ...data },
  });
}

export async function supprimerAbonnement(prisma: PrismaClient, participantId: string, endpoint: string) {
  await prisma.pushAbonnement.deleteMany({ where: { participantId, endpoint } });
}

export type Notification = { titre: string; corps: string; url: string };
export type Envoyeur = (
  abonnement: { endpoint: string; p256dh: string; auth: string },
  notification: Notification,
) => Promise<'ok' | 'expire'>;

const MESSAGES: Record<EtapeSuivi, Notification> = {
  J7: {
    titre: 'GreenCampus : une semaine déjà !',
    corps: 'As-tu tenu tes défis ? Réponds à 3 questions et valide-les.',
    url: '/suivi',
  },
  J14: {
    titre: 'GreenCampus : dernier point',
    corps: 'Deux semaines après le stand, où en es-tu ? 4 questions pour mesurer ton impact.',
    url: '/suivi',
  },
};

// Envoie une notification à chaque participant abonné dont une étape est arrivée, sans réponse ni relance déjà faite.
export async function envoyerRelances(prisma: PrismaClient, envoyer: Envoyeur, maintenant = new Date()) {
  const abonnes = await prisma.participant.findMany({
    where: { pushAbonnements: { some: {} }, bilans: { some: {} } },
    select: {
      id: true,
      pushAbonnements: true,
      suivis: { select: { etape: true } },
      relances: { select: { etape: true } },
      bilans: { orderBy: { createdAt: 'asc' }, take: 1, select: { createdAt: true } },
    },
  });

  let envoyees = 0;
  for (const p of abonnes) {
    const dejaFaites = new Set([...p.suivis, ...p.relances].map((x) => x.etape));
    // Si les deux étapes sont dues (retard), on ne relance que pour la plus récente.
    const etape = [...ETAPES]
      .reverse()
      .find((e) => !dejaFaites.has(e) && dateEtape(p.bilans[0].createdAt, e) <= maintenant);
    if (!etape) continue;

    for (const abonnement of p.pushAbonnements) {
      const resultat = await envoyer(abonnement, MESSAGES[etape]).catch(() => 'erreur' as const);
      if (resultat === 'expire') await prisma.pushAbonnement.delete({ where: { id: abonnement.id } });
    }
    await prisma.relance.createMany({
      data: ETAPES.filter((e) => !dejaFaites.has(e) && dateEtape(p.bilans[0].createdAt, e) <= maintenant).map((e) => ({
        participantId: p.id,
        etape: e,
      })),
      skipDuplicates: true,
    });
    envoyees++;
  }
  return envoyees;
}
