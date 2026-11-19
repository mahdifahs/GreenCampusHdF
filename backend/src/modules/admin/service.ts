import { EtapeSuivi, type PrismaClient } from '@prisma/client';
import { versCsv } from '../../lib/csv.js';
import { arrondir, CATEGORIES, type Categorie } from '../../lib/ngc.js';
import { versDateIso } from '../../lib/semaine.js';
import { QUESTIONS_QUIZ } from '../quiz/questions.js';
import { ACTIONS_SUR_PARTICIPANT, journalComplet, nombreExclus } from './moderation.js';
import { bilan as bilanVetements } from './vetements.js';
import { statistiques as statsQuiz } from '../quiz/service.js';
import { QUESTIONNAIRES } from '../suivis/questionnaire.js';

const formatJour = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Paris' });
const jour = (d: Date) => formatJour.format(d);
const CLES_CATEGORIES = Object.keys(CATEGORIES) as Categorie[];

// Activité jour par jour (heure de Paris) : utile pour les graphiques de la vidéo.
async function activiteQuotidienne(prisma: PrismaClient) {
  const [participants, bilans, engagements] = await Promise.all([
    prisma.participant.findMany({ where: { exclu: false }, select: { createdAt: true } }),
    prisma.bilan.findMany({ where: { participant: { exclu: false } }, select: { createdAt: true } }),
    prisma.engagement.findMany({
      where: { participant: { exclu: false } },
      select: { createdAt: true, reponduAt: true, statut: true, co2EviteKgSemaine: true },
    }),
  ]);
  const jours = new Map<string, { inscriptions: number; bilans: number; engagements: number; defisValides: number; co2EviteKg: number }>();
  const du = (d: Date) => {
    const cle = jour(d);
    if (!jours.has(cle)) jours.set(cle, { inscriptions: 0, bilans: 0, engagements: 0, defisValides: 0, co2EviteKg: 0 });
    return jours.get(cle)!;
  };
  for (const p of participants) du(p.createdAt).inscriptions++;
  for (const b of bilans) du(b.createdAt).bilans++;
  for (const e of engagements) {
    du(e.createdAt).engagements++;
    if (e.statut === 'VALIDE' && e.reponduAt) {
      const j = du(e.reponduAt);
      j.defisValides++;
      j.co2EviteKg += e.co2EviteKgSemaine;
    }
  }
  return [...jours.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, v]) => ({ date, ...v, co2EviteKg: arrondir(v.co2EviteKg) }));
}

async function statsDefis(prisma: PrismaClient) {
  const [defis, groupes] = await Promise.all([
    prisma.defi.findMany({ orderBy: { id: 'asc' } }),
    prisma.engagement.groupBy({ by: ['defiId', 'statut'], where: { participant: { exclu: false } }, _count: true, _sum: { co2EviteKgSemaine: true } }),
  ]);
  return defis.map((d) => {
    const g = groupes.filter((x) => x.defiId === d.id);
    const statut = (s: string) => g.find((x) => x.statut === s);
    return {
      id: d.id,
      slug: d.slug,
      titre: d.titre,
      categorie: d.categorie,
      actif: d.actif,
      engagements: g.reduce((n, x) => n + x._count, 0),
      valides: statut('VALIDE')?._count ?? 0,
      nonTenus: statut('NON_TENU')?._count ?? 0,
      enCours: statut('EN_COURS')?._count ?? 0,
      co2EviteKg: arrondir(statut('VALIDE')?._sum.co2EviteKgSemaine ?? 0),
    };
  });
}

// Répartition des réponses à chaque question de suivi (J7 et J14).
async function statsSuivis(prisma: PrismaClient) {
  const suivis = await prisma.suivi.findMany({ where: { participant: { exclu: false } }, select: { etape: true, reponses: true } });
  return (['J7', 'J14'] as const).map((etape) => {
    const reponses = suivis.filter((s) => s.etape === etape).map((s) => s.reponses as Record<string, string | number>);
    return {
      etape,
      nbReponses: reponses.length,
      questions: QUESTIONNAIRES[etape].map((q) => {
        const valeurs = q.type === 'choix' ? q.options.map((o) => ({ valeur: o.valeur, libelle: o.libelle })) : Array.from(
          { length: q.max - q.min + 1 },
          (_, i) => ({ valeur: String(q.min + i), libelle: String(q.min + i) }),
        );
        return {
          id: q.id,
          question: q.question,
          repartition: valeurs.map((v) => ({ ...v, nombre: reponses.filter((r) => String(r[q.id]) === v.valeur).length })),
        };
      }),
    };
  });
}

// Rappels Web Push : combien de participants les ont activés et combien de relances sont parties,
// pour le rapport (taux d'activation, efficacité des relances). Comptes exclus non comptés.
async function statsRappels(prisma: PrismaClient) {
  const [abonnements, abonnes, relances, reponses] = await Promise.all([
    prisma.pushAbonnement.count({ where: { participant: { exclu: false } } }),
    prisma.pushAbonnement.findMany({ where: { participant: { exclu: false } }, distinct: ['participantId'], select: { participantId: true } }),
    prisma.relance.groupBy({ by: ['etape'], where: { participant: { exclu: false } }, _count: { _all: true } }),
    prisma.suivi.groupBy({ by: ['etape'], where: { participant: { exclu: false } }, _count: { _all: true } }),
  ]);
  const compte = (lignes: { etape: EtapeSuivi; _count: { _all: number } }[], etape: EtapeSuivi) =>
    lignes.find((l) => l.etape === etape)?._count._all ?? 0;
  return {
    participantsAbonnes: abonnes.length,
    abonnements,
    etapes: Object.values(EtapeSuivi).map((etape) => ({
      etape,
      relancesEnvoyees: compte(relances, etape),
      questionnairesRemplis: compte(reponses, etape),
    })),
  };
}

// Résumé de l'évènement (stand) : personnes venues et vêtements, tous jours confondus.
async function statsEvenement(prisma: PrismaClient) {
  const [stand, vetements, b] = await Promise.all([
    prisma.compteurJour.aggregate({ _sum: { personnesVenues: true }, _count: { _all: true }, where: { personnesVenues: { gt: 0 } } }),
    prisma.quantiteVetement.aggregate({ _sum: { recuperes: true, donnes: true } }),
    bilanVetements(prisma),
  ]);
  return {
    joursDeStand: stand._count._all,
    personnesVenues: stand._sum.personnesVenues ?? 0,
    vetementsRecuperes: vetements._sum.recuperes ?? 0,
    vetementsDonnes: vetements._sum.donnes ?? 0,
    poidsVetementsKg: arrondir(b.poidsRecupereKg + b.poidsDonneKg),
    co2EviteVetementsKg: arrondir(b.co2EviteRecupereKg + b.co2EviteDonneKg),
    donneesVetementsIncompletes: b.donneesIncompletes,
  };
}

export async function statistiques(prisma: PrismaClient) {
  const [participants, participantsExclus, bilans, quotidien, defis, suivis, quiz, rappels, evenement] = await Promise.all([
    prisma.participant.count({ where: { exclu: false } }),
    nombreExclus(prisma),
    prisma.bilan.count({ where: { participant: { exclu: false } } }),
    activiteQuotidienne(prisma),
    statsDefis(prisma),
    statsSuivis(prisma),
    statsQuiz(prisma),
    statsRappels(prisma),
    statsEvenement(prisma),
  ]);
  return {
    participants,
    participantsExclus,
    bilans,
    engagements: defis.reduce((n, d) => n + d.engagements, 0),
    defisValides: defis.reduce((n, d) => n + d.valides, 0),
    co2EviteKg: arrondir(defis.reduce((n, d) => n + d.co2EviteKg, 0)),
    quotidien,
    defis,
    suivis,
    quiz,
    rappels,
    evenement,
  };
}

export async function changerActivationDefi(prisma: PrismaClient, id: number, actif: boolean) {
  await prisma.defi.update({ where: { id }, data: { actif } });
}

// ---------- exports CSV ----------
// Les participants n'y apparaissent que par leur identifiant aléatoire (pas de pseudo, aucune donnée personnelle).

export const JEUX_EXPORT = ['participants', 'bilans', 'engagements', 'suivis', 'quotidien', 'quiz', 'stand', 'vetements', 'securite', 'journal'] as const;
export type JeuExport = (typeof JEUX_EXPORT)[number];

export async function exporter(prisma: PrismaClient, jeu: JeuExport): Promise<string> {
  switch (jeu) {
    case 'participants': {
      const lignes = await prisma.participant.findMany({
        orderBy: { createdAt: 'asc' },
        select: {
          id: true,
          annee: true,
          exclu: true,
          createdAt: true,
          filiere: { select: { libelle: true } },
          _count: { select: { bilans: true, engagements: true, suivis: true } },
        },
      });
      return versCsv(
        ['participant', 'filiere', 'annee', 'inscription', 'nb_bilans', 'nb_engagements', 'nb_suivis', 'exclu'],
        lignes.map((p) => [p.id, p.filiere.libelle, p.annee, p.createdAt, p._count.bilans, p._count.engagements, p._count.suivis, p.exclu]),
      );
    }
    case 'bilans': {
      const lignes = await prisma.bilan.findMany({
        orderBy: { createdAt: 'asc' },
        include: { participant: { select: { annee: true, exclu: true, filiere: { select: { libelle: true } } } } },
      });
      return versCsv(
        ['bilan', 'participant', 'filiere', 'annee', 'type', 'date', 'nb_reponses', 'total_kg_co2e_an', ...CLES_CATEGORIES.map((c) => `${c}_kg`), 'exclu'],
        lignes.map((b) => {
          const cat = b.parCategorie as Record<Categorie, number>;
          return [
            b.id,
            b.participantId,
            b.participant.filiere.libelle,
            b.participant.annee,
            b.type,
            b.createdAt,
            Object.keys(b.situation as object).length,
            b.totalKg,
            ...CLES_CATEGORIES.map((c) => cat[c]),
            b.participant.exclu,
          ];
        }),
      );
    }
    case 'engagements': {
      const lignes = await prisma.engagement.findMany({
        orderBy: { createdAt: 'asc' },
        include: {
          defi: { select: { titre: true, categorie: true } },
          participant: { select: { exclu: true, filiere: { select: { libelle: true } } } },
        },
      });
      return versCsv(
        ['participant', 'filiere', 'defi', 'categorie', 'semaine', 'statut', 'co2_evite_kg', 'engage_le', 'repondu_le', 'exclu'],
        lignes.map((e) => [
          e.participantId,
          e.participant.filiere.libelle,
          e.defi.titre,
          e.defi.categorie,
          versDateIso(e.semaine),
          e.statut,
          e.co2EviteKgSemaine,
          e.createdAt,
          e.reponduAt,
          e.participant.exclu,
        ]),
      );
    }
    case 'suivis': {
      const lignes = await prisma.suivi.findMany({
        orderBy: { createdAt: 'asc' },
        include: { participant: { select: { filiere: { select: { libelle: true } } } } },
      });
      const ids = [...new Set(Object.values(QUESTIONNAIRES).flat().map((q) => q.id))];
      return versCsv(
        ['participant', 'filiere', 'etape', 'date', ...ids],
        lignes.map((s) => {
          const r = s.reponses as Record<string, string | number>;
          return [s.participantId, s.participant.filiere.libelle, s.etape, s.createdAt, ...ids.map((id) => r[id])];
        }),
      );
    }
    case 'quiz': {
      const lignes = await prisma.quizReponse.findMany({ orderBy: { createdAt: 'asc' } });
      const intitule = new Map(QUESTIONS_QUIZ.map((q) => [q.id, q]));
      return versCsv(
        ['partie', 'date', 'question', 'choix', 'reponse_choisie', 'correct'],
        lignes.map((r) => [
          r.partie,
          r.createdAt,
          intitule.get(r.questionId)?.question ?? r.questionId,
          r.choix,
          intitule.get(r.questionId)?.choix.find((c) => c.id === r.choix)?.texte,
          r.correct,
        ]),
      );
    }
    case 'quotidien': {
      const lignes = await activiteQuotidienne(prisma);
      return versCsv(
        ['date', 'inscriptions', 'bilans', 'engagements', 'defis_valides', 'co2_evite_kg'],
        lignes.map((j) => [j.date, j.inscriptions, j.bilans, j.engagements, j.defisValides, j.co2EviteKg]),
      );
    }
    case 'stand': {
      const lignes = await prisma.compteurJour.findMany({ orderBy: { date: 'asc' } });
      return versCsv(
        ['date', 'personnes_venues'],
        lignes.map((j) => [versDateIso(j.date), j.personnesVenues]),
      );
    }
    case 'vetements': {
      const lignes = await prisma.quantiteVetement.findMany({
        orderBy: [{ date: 'asc' }],
        include: { type: true, matiere: true },
      });
      return versCsv(
        ['date', 'type', 'matiere', 'recuperes', 'donnes', 'poids_moyen_g', 'facteur_emission_kg_co2_par_kg'],
        lignes.map((l) => [
          versDateIso(l.date),
          l.type.nom,
          l.matiere.nom,
          l.recuperes,
          l.donnes,
          l.type.poidsMoyenGrammes,
          l.matiere.facteurEmissionKgCo2ParKg,
        ]),
      );
    }
    case 'journal': {
      const lignes = await journalComplet(prisma);
      return versCsv(
        ['date', 'auteur', 'action', 'cible', 'details'],
        lignes.map((a) => [
          a.createdAt,
          a.auteur,
          a.action,
          ACTIONS_SUR_PARTICIPANT.has(a.action) ? 'participant' : a.cible,
          a.details ? JSON.stringify(a.details) : '',
        ]),
      );
    }
    case 'securite': {
      const lignes = await prisma.evenementSecurite.findMany({ orderBy: { createdAt: 'asc' } });
      return versCsv(
        ['date', 'type', 'niveau', 'ip', 'details'],
        lignes.map((e) => [e.createdAt, e.type, e.niveau, e.ip, e.details ? JSON.stringify(e.details) : '']),
      );
    }
  }
}
