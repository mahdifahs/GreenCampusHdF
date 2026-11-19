import type { Prisma, PrismaClient } from '@prisma/client';
import { ErreurApi } from '../../lib/errors.js';
import { arrondir } from '../../lib/ngc.js';
import { versDateIso } from '../../lib/semaine.js';

// Seuils de détection des comportements suspects. Ce ne sont que des alertes : l'équipe décide ensuite.
export const SEUILS = {
  // Un défi est hebdomadaire : le valider quelques heures après l'avoir choisi est suspect.
  validationRapideHeures: 12,
  // Bilans enregistrés sur 24 h glissantes.
  bilansParJour: 5,
  // Empreinte hors de toute plausibilité pour un étudiant (kg CO2e/an) : la moyenne française est d'environ 8 300 kg.
  // Le modèle plafonne déjà certaines réponses (les km en voiture par exemple) : 20 t suppose des réponses extrêmes.
  bilanMinKg: 2_500,
  bilanMaxKg: 20_000,
  // Gain d'un défi sur une semaine (le plus élevé du catalogue, pour un profil moyen, est d'environ 17 kg).
  gainSemaineMaxKg: 50,
};

const HEURE_MS = 60 * 60 * 1000;

export type Alerte = { code: string; message: string };

type Activite = {
  bilans: { createdAt: Date; totalKg: number }[];
  engagements: { createdAt: Date; reponduAt: Date | null; statut: string; co2EviteKgSemaine: number }[];
};

export function detecterAlertes({ bilans, engagements }: Activite): Alerte[] {
  const alertes: Alerte[] = [];

  const rapides = engagements.filter(
    (e) => e.statut === 'VALIDE' && e.reponduAt && e.reponduAt.getTime() - e.createdAt.getTime() < SEUILS.validationRapideHeures * HEURE_MS,
  ).length;
  if (rapides) {
    alertes.push({
      code: 'VALIDATION_RAPIDE',
      message: `${rapides} défi(s) validé(s) moins de ${SEUILS.validationRapideHeures} h après avoir été choisi(s).`,
    });
  }

  const dates = bilans.map((b) => b.createdAt.getTime()).sort((a, b) => a - b);
  const maxSur24h = dates.reduce((max, t) => Math.max(max, dates.filter((u) => u >= t && u - t < 24 * HEURE_MS).length), 0);
  if (maxSur24h > SEUILS.bilansParJour) {
    alertes.push({ code: 'BILANS_EN_RAFALE', message: `${maxSur24h} bilans enregistrés en moins de 24 h.` });
  }

  const extremes = bilans.filter((b) => b.totalKg < SEUILS.bilanMinKg || b.totalKg > SEUILS.bilanMaxKg);
  if (extremes.length) {
    const exemple = (extremes[0].totalKg / 1000).toLocaleString('fr-FR', { maximumFractionDigits: 1 });
    alertes.push({
      code: 'BILAN_INVRAISEMBLABLE',
      message: `${extremes.length} bilan(s) hors de la plage plausible (ex. ${exemple} t CO2e/an) : réponses probablement fantaisistes.`,
    });
  }

  const gainsEleves = engagements.filter((e) => e.co2EviteKgSemaine > SEUILS.gainSemaineMaxKg).length;
  if (gainsEleves) {
    alertes.push({
      code: 'GAIN_ANORMAL',
      message: `${gainsEleves} défi(s) avec un gain supérieur à ${SEUILS.gainSemaineMaxKg} kg CO2e/semaine (bilan probablement gonflé).`,
    });
  }
  return alertes;
}

const selectionListe = {
  id: true,
  pseudo: true,
  annee: true,
  createdAt: true,
  lastSeenAt: true,
  exclu: true,
  bloque: true,
  filiere: { select: { libelle: true } },
  bilans: { select: { createdAt: true, totalKg: true }, orderBy: { createdAt: 'asc' } },
  engagements: { select: { createdAt: true, reponduAt: true, statut: true, co2EviteKgSemaine: true } },
  _count: { select: { suivis: true } },
} satisfies Prisma.ParticipantSelect;

type ParticipantListe = Prisma.ParticipantGetPayload<{ select: typeof selectionListe }>;

function resume(p: ParticipantListe) {
  const valides = p.engagements.filter((e) => e.statut === 'VALIDE');
  return {
    id: p.id,
    pseudo: p.pseudo,
    filiere: p.filiere.libelle,
    annee: p.annee,
    createdAt: p.createdAt.toISOString(),
    lastSeenAt: p.lastSeenAt.toISOString(),
    exclu: p.exclu,
    bloque: p.bloque,
    nbBilans: p.bilans.length,
    dernierBilanKg: p.bilans.at(-1)?.totalKg ?? null,
    nbEngagements: p.engagements.length,
    defisValides: valides.length,
    co2EviteKg: arrondir(valides.reduce((n, e) => n + e.co2EviteKgSemaine, 0)),
    nbSuivis: p._count.suivis,
    alertes: detecterAlertes(p),
  };
}

export type FiltreParticipants = 'tous' | 'suspects' | 'exclus' | 'bloques';
export type TriParticipants = 'recents' | 'co2' | 'bilans' | 'alertes';

export async function lister(
  prisma: PrismaClient,
  options: { recherche?: string; filtre: FiltreParticipants; tri: TriParticipants; page: number; parPage: number },
) {
  const where: Prisma.ParticipantWhereInput = {
    ...(options.recherche ? { pseudo: { contains: options.recherche, mode: 'insensitive' } } : {}),
    ...(options.filtre === 'exclus' ? { exclu: true } : {}),
    ...(options.filtre === 'bloques' ? { bloque: true } : {}),
  };
  // Quelques centaines de participants au plus : les alertes sont calculées en mémoire.
  let lignes = (await prisma.participant.findMany({ where, select: selectionListe })).map(resume);
  if (options.filtre === 'suspects') lignes = lignes.filter((p) => p.alertes.length > 0);

  const tris: Record<TriParticipants, (a: (typeof lignes)[number], b: (typeof lignes)[number]) => number> = {
    recents: (a, b) => b.createdAt.localeCompare(a.createdAt),
    co2: (a, b) => b.co2EviteKg - a.co2EviteKg,
    bilans: (a, b) => b.nbBilans - a.nbBilans,
    alertes: (a, b) => b.alertes.length - a.alertes.length || b.co2EviteKg - a.co2EviteKg,
  };
  lignes.sort(tris[options.tri]);

  const debut = (options.page - 1) * options.parPage;
  return {
    total: lignes.length,
    page: options.page,
    parPage: options.parPage,
    participants: lignes.slice(debut, debut + options.parPage),
  };
}

async function trouver(prisma: PrismaClient, id: string) {
  const participant = await prisma.participant.findUnique({ where: { id }, select: { id: true, pseudo: true } });
  if (!participant) throw new ErreurApi(404, 'PARTICIPANT_INCONNU', 'Ce participant n’existe pas (ou plus).');
  return participant;
}

export async function detail(prisma: PrismaClient, id: string) {
  await trouver(prisma, id);
  const p = await prisma.participant.findUniqueOrThrow({
    where: { id },
    select: {
      ...selectionListe,
      bilans: { select: { id: true, type: true, createdAt: true, totalKg: true, parCategorie: true, situation: true }, orderBy: { createdAt: 'asc' } },
      engagements: {
        select: { id: true, createdAt: true, reponduAt: true, statut: true, co2EviteKgSemaine: true, semaine: true, defi: { select: { titre: true } } },
        orderBy: { createdAt: 'asc' },
      },
      suivis: { select: { etape: true, createdAt: true } },
    },
  });
  return {
    ...resume(p),
    bilans: p.bilans.map((b) => ({
      id: b.id,
      type: b.type,
      createdAt: b.createdAt.toISOString(),
      totalKg: b.totalKg,
      nbReponses: Object.keys(b.situation as object).length,
      invraisemblable: b.totalKg < SEUILS.bilanMinKg || b.totalKg > SEUILS.bilanMaxKg,
    })),
    engagements: p.engagements.map((e) => ({
      id: e.id,
      defi: e.defi.titre,
      semaine: versDateIso(e.semaine),
      statut: e.statut,
      co2EviteKgSemaine: e.co2EviteKgSemaine,
      createdAt: e.createdAt.toISOString(),
      reponduAt: e.reponduAt?.toISOString() ?? null,
      validationRapide:
        e.statut === 'VALIDE' && !!e.reponduAt && e.reponduAt.getTime() - e.createdAt.getTime() < SEUILS.validationRapideHeures * HEURE_MS,
    })),
    suivis: p.suivis.map((s) => ({ etape: s.etape, createdAt: s.createdAt.toISOString() })),
  };
}

async function journaliser(prisma: PrismaClient, auteur: string, action: string, cible: string, details?: Prisma.InputJsonValue) {
  await prisma.actionAdmin.create({ data: { auteur, action, cible, details } });
}

export async function modifier(prisma: PrismaClient, auteur: string, id: string, data: { exclu?: boolean; bloque?: boolean }) {
  const p = await trouver(prisma, id);
  await prisma.participant.update({ where: { id }, data });
  const actions = [
    data.exclu !== undefined && (data.exclu ? 'EXCLURE_DES_STATISTIQUES' : 'REINTEGRER_DANS_LES_STATISTIQUES'),
    data.bloque !== undefined && (data.bloque ? 'BLOQUER' : 'DEBLOQUER'),
  ].filter((a): a is string => Boolean(a));
  for (const action of actions) await journaliser(prisma, auteur, action, p.pseudo);
}

export async function supprimer(prisma: PrismaClient, auteur: string, id: string, motif?: string) {
  const p = await trouver(prisma, id);
  await prisma.participant.delete({ where: { id } });
  await journaliser(prisma, auteur, 'SUPPRIMER_PARTICIPANT', p.pseudo, motif ? { motif } : undefined);
}

export async function annulerEngagement(prisma: PrismaClient, auteur: string, id: string, motif?: string) {
  const e = await prisma.engagement.findUnique({
    where: { id },
    include: { participant: { select: { pseudo: true } }, defi: { select: { titre: true } } },
  });
  if (!e) throw new ErreurApi(404, 'ENGAGEMENT_INCONNU', 'Engagement introuvable.');
  await prisma.engagement.delete({ where: { id } });
  await journaliser(prisma, auteur, 'ANNULER_DEFI', e.participant.pseudo, {
    defi: e.defi.titre,
    statut: e.statut,
    co2EviteKgSemaine: e.co2EviteKgSemaine,
    ...(motif ? { motif } : {}),
  });
}

// Actions dont la cible est le pseudo d'un participant : masqué dans l'export CSV (jamais de pseudo
// dans un export, voir CLAUDE.md), visible seulement à l'écran pour l'équipe.
export const ACTIONS_SUR_PARTICIPANT = new Set([
  'EXCLURE_DES_STATISTIQUES',
  'REINTEGRER_DANS_LES_STATISTIQUES',
  'BLOQUER',
  'DEBLOQUER',
  'SUPPRIMER_PARTICIPANT',
  'ANNULER_DEFI',
]);

export type FiltresJournal = { auteur?: string; action?: string; du?: string; au?: string };

// du/au : journées (AAAA-MM-JJ) en heure de Paris, bornes incluses.
function filtreJournal(f: FiltresJournal): Prisma.ActionAdminWhereInput {
  const createdAt: Prisma.DateTimeFilter = {};
  if (f.du) createdAt.gte = debutJourneeParis(f.du);
  if (f.au) createdAt.lt = debutJourneeParis(f.au, 1);
  return {
    ...(f.auteur ? { auteur: f.auteur } : {}),
    ...(f.action ? { action: f.action } : {}),
    ...(f.du || f.au ? { createdAt } : {}),
  };
}

// Minuit à Paris pour la journée donnée (+ décalage en jours), heure d'été comprise.
function debutJourneeParis(jour: string, decalageJours = 0) {
  const [a, m, j] = jour.split('-').map(Number);
  const midiUtc = new Date(Date.UTC(a, m - 1, j + decalageJours, 12));
  const heureParis = Number(
    new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/Paris', hour: '2-digit', hourCycle: 'h23' })
      .formatToParts(midiUtc)
      .find((p) => p.type === 'hour')!.value,
  );
  return new Date(midiUtc.getTime() - heureParis * 3_600_000);
}

export async function filtresDisponibles(prisma: PrismaClient) {
  const [auteurs, actions] = await Promise.all([
    prisma.actionAdmin.findMany({ distinct: ['auteur'], select: { auteur: true }, orderBy: { auteur: 'asc' } }),
    prisma.actionAdmin.findMany({ distinct: ['action'], select: { action: true }, orderBy: { action: 'asc' } }),
  ]);
  return { auteurs: auteurs.map((a) => a.auteur), actions: actions.map((a) => a.action) };
}

export async function journalComplet(prisma: PrismaClient, filtres: FiltresJournal = {}) {
  return prisma.actionAdmin.findMany({ where: filtreJournal(filtres), orderBy: { createdAt: 'asc' } });
}

export async function journal(prisma: PrismaClient, filtres: FiltresJournal = {}) {
  const actions = await prisma.actionAdmin.findMany({ where: filtreJournal(filtres), orderBy: { createdAt: 'desc' }, take: 200 });
  return actions.map((a) => ({
    auteur: a.auteur,
    action: a.action,
    cible: a.cible,
    details: (a.details ?? null) as Record<string, unknown> | null,
    createdAt: a.createdAt.toISOString(),
  }));
}

export async function nombreExclus(prisma: PrismaClient) {
  return prisma.participant.count({ where: { exclu: true } });
}
