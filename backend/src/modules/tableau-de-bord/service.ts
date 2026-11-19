import type { PrismaClient } from '@prisma/client';
import { arrondir, CATEGORIES, type Categorie } from '../../lib/ngc.js';
import { resume as resumeQuiz } from '../quiz/service.js';

type DernierBilan = { participantId: string; totalKg: number; parCategorie: Record<Categorie, number> };

function moyenne(valeurs: number[]): number {
  return valeurs.length ? arrondir(valeurs.reduce((a, b) => a + b, 0) / valeurs.length) : 0;
}

// Statistiques collectives et anonymes, projetées sur le stand.
// Une filière (ou une moyenne) n'est affichée qu'à partir de `seuil` personnes, pour éviter toute ré-identification.
export async function calculer(prisma: PrismaClient, seuil: number) {
  const [participants, filieres, derniersBilans, engagements, populaires, suivis, quiz] = await Promise.all([
    prisma.participant.findMany({ where: { exclu: false }, select: { id: true, filiereId: true } }),
    prisma.filiere.findMany({ select: { id: true, libelle: true } }),
    // Dernier bilan de chaque participant.
    prisma.$queryRaw<DernierBilan[]>`
      SELECT DISTINCT ON (b."participantId") b."participantId", b."totalKg", b."parCategorie"
      FROM "Bilan" b JOIN "Participant" p ON p.id = b."participantId"
      WHERE p.exclu = false
      ORDER BY b."participantId", b."createdAt" DESC`,
    prisma.engagement.groupBy({
      by: ['participantId', 'statut'],
      where: { participant: { exclu: false } },
      _count: true,
      _sum: { co2EviteKgSemaine: true },
    }),
    prisma.engagement.groupBy({
      by: ['defiId'],
      where: { participant: { exclu: false } },
      _count: { defiId: true },
      orderBy: { _count: { defiId: 'desc' } },
      take: 5,
    }),
    prisma.suivi.findMany({ where: { participant: { exclu: false } }, select: { etape: true, reponses: true } }),
    resumeQuiz(prisma),
  ]);

  const filiereDe = new Map(participants.map((p) => [p.id, p.filiereId]));
  const bilanDe = new Map(derniersBilans.map((b) => [b.participantId, b]));

  type Cumul = { participants: number; empreintes: number[]; co2EviteKg: number; defisValides: number };
  const parFiliere = new Map<number, Cumul>();
  const cumul = (filiereId: number) => {
    if (!parFiliere.has(filiereId)) parFiliere.set(filiereId, { participants: 0, empreintes: [], co2EviteKg: 0, defisValides: 0 });
    return parFiliere.get(filiereId)!;
  };
  for (const p of participants) {
    const c = cumul(p.filiereId);
    c.participants++;
    const bilan = bilanDe.get(p.id);
    if (bilan) c.empreintes.push(bilan.totalKg);
  }

  const totaux = { co2EviteKg: 0, defisValides: 0, defisEnCours: 0, defisNonTenus: 0 };
  for (const g of engagements) {
    if (g.statut === 'VALIDE') {
      const co2 = g._sum.co2EviteKgSemaine ?? 0;
      totaux.co2EviteKg += co2;
      totaux.defisValides += g._count;
      const c = cumul(filiereDe.get(g.participantId)!);
      c.co2EviteKg += co2;
      c.defisValides += g._count;
    } else if (g.statut === 'EN_COURS') totaux.defisEnCours += g._count;
    else totaux.defisNonTenus += g._count;
  }

  const libelle = new Map(filieres.map((f) => [f.id, f.libelle]));
  const visibles = [...parFiliere.entries()].filter(([, c]) => c.participants >= seuil);
  const classementFilieres = visibles
    .map(([id, c]) => ({
      filiere: { id, libelle: libelle.get(id) ?? '?' },
      participants: c.participants,
      bilans: c.empreintes.length,
      empreinteMoyenneKg: c.empreintes.length >= seuil ? moyenne(c.empreintes) : null,
      co2EviteKg: arrondir(c.co2EviteKg),
      co2EviteKgParParticipant: arrondir(c.co2EviteKg / c.participants),
      defisValides: c.defisValides,
    }))
    .sort((a, b) => b.co2EviteKgParParticipant - a.co2EviteKgParParticipant || b.participants - a.participants)
    .map((f, i) => ({ rang: i + 1, ...f }));

  const titres = new Map(
    (await prisma.defi.findMany({ where: { id: { in: populaires.map((p) => p.defiId) } }, select: { id: true, titre: true } })).map(
      (d) => [d.id, d.titre],
    ),
  );

  const assezDeBilans = derniersBilans.length >= seuil;
  const parCategorieMoyenne = assezDeBilans
    ? (Object.fromEntries(
        (Object.keys(CATEGORIES) as Categorie[]).map((c) => [c, moyenne(derniersBilans.map((b) => b.parCategorie[c] ?? 0))]),
      ) as Record<Categorie, number>)
    : null;

  const changement: Record<string, number> = {};
  for (const s of suivis) {
    const reponse = (s.reponses as Record<string, unknown>).changement;
    if (s.etape === 'J14' && typeof reponse === 'string') changement[reponse] = (changement[reponse] ?? 0) + 1;
  }

  return {
    seuilAnonymat: seuil,
    participants: participants.length,
    participantsAvecBilan: derniersBilans.length,
    empreinteMoyenneKg: assezDeBilans ? moyenne(derniersBilans.map((b) => b.totalKg)) : null,
    parCategorieMoyenne,
    co2EviteKg: arrondir(totaux.co2EviteKg),
    defisValides: totaux.defisValides,
    defisEnCours: totaux.defisEnCours,
    defisNonTenus: totaux.defisNonTenus,
    defisPopulaires: populaires.map((p) => ({ titre: titres.get(p.defiId) ?? '?', engagements: p._count.defiId })),
    classementFilieres,
    filieresMasquees: parFiliere.size - visibles.length,
    suivis: {
      reponsesJ7: suivis.filter((s) => s.etape === 'J7').length,
      reponsesJ14: suivis.filter((s) => s.etape === 'J14').length,
      changementDeclareJ14: changement,
    },
    quiz,
    misAJourA: new Date().toISOString(),
  };
}
