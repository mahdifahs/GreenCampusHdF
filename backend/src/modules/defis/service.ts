import { Prisma, type Defi, type PrismaClient, type StatutEngagement } from '@prisma/client';
import { ErreurApi } from '../../lib/errors.js';
import { arrondir, categorieDominante, type Categorie, type ModeleNgc, type Situation } from '../../lib/ngc.js';
import { lundiDeLaSemaine, versDateIso } from '../../lib/semaine.js';
import { dernier } from '../bilans/service.js';

export const MAX_DEFIS_PAR_SEMAINE = 3;
const NB_RECOMMANDES = 3;
const SEMAINES_PAR_AN = 52;

// Catégorie de défi correspondant à chaque catégorie du bilan.
const CATEGORIE_BILAN_VERS_DEFI = {
  transport: ['TRANSPORT'],
  alimentation: ['ALIMENTATION'],
  logement: ['LOGEMENT'],
  divers: ['DIVERS', 'NUMERIQUE'],
} as const;

type DefiPerso = Defi & { co2EviteKgSemaine: number };

async function situationDuParticipant(prisma: PrismaClient, participantId: string) {
  const bilan = await dernier(prisma, participantId);
  return {
    situation: (bilan?.situation ?? {}) as Situation,
    categorieDominante: bilan ? categorieDominante(bilan.parCategorie as Record<Categorie, number>) : null,
  };
}

async function defisPersonnalises(prisma: PrismaClient, ngc: ModeleNgc, situation: Situation): Promise<DefiPerso[]> {
  const defis = await prisma.defi.findMany({ where: { actif: true }, orderBy: { id: 'asc' } });
  const gains = ngc.gainsActions(
    situation,
    defis.map((d) => d.actionNgc),
  );
  return defis.map((d) => ({ ...d, co2EviteKgSemaine: arrondir(gains[d.actionNgc] / SEMAINES_PAR_AN) }));
}

function versPublic(d: DefiPerso, ngc: ModeleNgc, recommande = false) {
  return {
    id: d.id,
    slug: d.slug,
    titre: d.titre,
    description: d.description,
    categorie: d.categorie,
    co2EviteKgSemaine: d.co2EviteKgSemaine,
    source: `Nos Gestes Climat (ADEME), action « ${ngc.titre(d.actionNgc) ?? d.actionNgc} »`,
    recommande,
  };
}

// Catalogue personnalisé : le gain de chaque défi est calculé à partir du dernier bilan
// (ou de la situation moyenne française s'il n'y en a pas). Les défis qui ne concernent pas
// la personne (gain nul) sont retirés ; 3 défis sont mis en avant (voir plus bas).
export async function catalogue(prisma: PrismaClient, ngc: ModeleNgc, participantId: string) {
  const { situation, categorieDominante } = await situationDuParticipant(prisma, participantId);
  const defis = (await defisPersonnalises(prisma, ngc, situation))
    .filter((d) => d.co2EviteKgSemaine > 0)
    .sort((a, b) => b.co2EviteKgSemaine - a.co2EviteKgSemaine);

  // Recommandés : le meilleur défi de la catégorie la plus émettrice, puis les plus gros gains toutes catégories.
  const cibles: readonly string[] = categorieDominante ? CATEGORIE_BILAN_VERS_DEFI[categorieDominante] : [];
  const meilleurCible = defis.find((d) => cibles.includes(d.categorie));
  const recommandes = [
    ...(meilleurCible ? [meilleurCible] : []),
    ...defis.filter((d) => d !== meilleurCible),
  ].slice(0, NB_RECOMMANDES);

  return {
    categorieDominante,
    defis: [...recommandes, ...defis.filter((d) => !recommandes.includes(d))].map((d) =>
      versPublic(d, ngc, recommandes.includes(d)),
    ),
  };
}

const inclureDefi = { defi: { select: { id: true, slug: true, titre: true, categorie: true } } } as const;
type EngagementAvecDefi = Prisma.EngagementGetPayload<{ include: typeof inclureDefi }>;

// Date à partir de laquelle l'engagement peut être validé (« Tenu »).
export const validableA = (e: { createdAt: Date }, delaiMs: number) => new Date(e.createdAt.getTime() + delaiMs);

export function engagementVersPublic(e: EngagementAvecDefi, delaiMs: number) {
  return {
    id: e.id,
    defi: e.defi,
    semaine: versDateIso(e.semaine),
    co2EviteKgSemaine: e.co2EviteKgSemaine,
    statut: e.statut,
    createdAt: e.createdAt.toISOString(),
    reponduAt: e.reponduAt?.toISOString() ?? null,
    validableAt: validableA(e, delaiMs).toISOString(),
  };
}

export async function sEngager(prisma: PrismaClient, ngc: ModeleNgc, participantId: string, defiId: number) {
  const semaine = lundiDeLaSemaine();
  const defi = await prisma.defi.findFirst({ where: { id: defiId, actif: true } });
  if (!defi) throw new ErreurApi(404, 'DEFI_INCONNU', 'Ce défi n’existe pas.');

  const nbSemaine = await prisma.engagement.count({ where: { participantId, semaine } });
  if (nbSemaine >= MAX_DEFIS_PAR_SEMAINE) {
    throw new ErreurApi(409, 'LIMITE_DEFIS', `Tu as déjà choisi ${MAX_DEFIS_PAR_SEMAINE} défis cette semaine.`);
  }

  const { situation } = await situationDuParticipant(prisma, participantId);
  const gainAnnuel = ngc.gainsActions(situation, [defi.actionNgc])[defi.actionNgc];
  if (gainAnnuel <= 0) {
    throw new ErreurApi(409, 'DEFI_NON_PERTINENT', 'D’après ton bilan, ce défi ne réduirait pas ton empreinte.');
  }

  try {
    return await prisma.engagement.create({
      data: {
        participantId,
        defiId,
        semaine,
        co2EviteKgSemaine: arrondir(gainAnnuel / SEMAINES_PAR_AN),
      },
      include: inclureDefi,
    });
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') {
      throw new ErreurApi(409, 'DEJA_ENGAGE', 'Tu as déjà choisi ce défi cette semaine.');
    }
    throw e;
  }
}

export async function lister(prisma: PrismaClient, participantId: string, semaineCourante: boolean) {
  return prisma.engagement.findMany({
    where: { participantId, ...(semaineCourante ? { semaine: lundiDeLaSemaine() } : {}) },
    orderBy: [{ semaine: 'desc' }, { createdAt: 'asc' }],
    include: inclureDefi,
  });
}

async function engagementDuParticipant(prisma: PrismaClient, participantId: string, id: string) {
  const engagement = await prisma.engagement.findFirst({ where: { id, participantId } });
  // Même réponse que l'engagement n'existe pas ou qu'il appartienne à quelqu'un d'autre.
  if (!engagement) throw new ErreurApi(404, 'ENGAGEMENT_INCONNU', 'Engagement introuvable.');
  return engagement;
}

export async function repondre(
  prisma: PrismaClient,
  participantId: string,
  id: string,
  statut: Exclude<StatutEngagement, 'EN_COURS'>,
  delaiMs: number,
) {
  const engagement = await engagementDuParticipant(prisma, participantId, id);
  // Un défi se tient sur la durée : le valider juste après l'avoir choisi n'a pas de sens (et
  // gonflerait le CO2 évité du tableau de bord). « Non tenu » reste possible à tout moment.
  const validable = validableA(engagement, delaiMs);
  // Délai nul (DEFI_DELAI_VALIDATION_HEURES=0) : aucune vérification. Sinon la comparaison entre
  // createdAt (horloge de PostgreSQL) et Date.now() (horloge de Node) refuserait parfois une
  // validation immédiate, la base pouvant avoir quelques millisecondes d'avance.
  if (statut === 'VALIDE' && delaiMs > 0 && validable.getTime() > Date.now()) {
    const quand = validable.toLocaleString('fr-FR', { timeZone: 'Europe/Paris', weekday: 'long', hour: '2-digit', minute: '2-digit' });
    throw new ErreurApi(409, 'VALIDATION_TROP_TOT', `Laisse-toi un peu de temps : tu pourras valider ce défi à partir de ${quand}.`);
  }
  return prisma.engagement.update({
    where: { id },
    // Changer d'avis reste possible (clic involontaire), mais la date de la première réponse est
    // gardée : sinon revalider plus tard effacerait l'alerte de modération VALIDATION_RAPIDE.
    data: { statut, reponduAt: engagement.reponduAt ?? new Date() },
    include: inclureDefi,
  });
}

export async function abandonner(prisma: PrismaClient, participantId: string, id: string) {
  const engagement = await engagementDuParticipant(prisma, participantId, id);
  if (engagement.statut !== 'EN_COURS') {
    throw new ErreurApi(409, 'ENGAGEMENT_TERMINE', 'Ce défi a déjà été validé ou marqué non tenu.');
  }
  await prisma.engagement.delete({ where: { id } });
}

export async function impact(prisma: PrismaClient, participantId: string) {
  const groupes = await prisma.engagement.groupBy({
    by: ['statut'],
    where: { participantId },
    _count: true,
    _sum: { co2EviteKgSemaine: true },
  });
  const parStatut = (s: StatutEngagement) => groupes.find((g) => g.statut === s);
  return {
    co2EviteKg: arrondir(parStatut('VALIDE')?._sum.co2EviteKgSemaine ?? 0),
    defisValides: parStatut('VALIDE')?._count ?? 0,
    defisEnCours: parStatut('EN_COURS')?._count ?? 0,
    defisNonTenus: parStatut('NON_TENU')?._count ?? 0,
  };
}
