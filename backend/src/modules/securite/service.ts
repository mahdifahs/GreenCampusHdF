import type { Prisma, PrismaClient } from '@prisma/client';

// Journal des événements de sécurité (OWASP A09 : journalisation et alertes).
export const TYPES_EVENEMENT = {
  ADMIN_CONNEXION: 'info',
  ADMIN_ECHEC_CONNEXION: 'alerte',
  ADMIN_VERROUILLE: 'critique',
  ADMIN_ACCES_REFUSE: 'alerte',
  ADMIN_ACCES_SUPER_REFUSE: 'alerte',
  ADMIN_ACCES_BENEVOLE_REFUSE: 'alerte',
  ADMIN_COMPTE_BLOQUE_TENTATIVE: 'info',
  ADMIN_SESSION_FERMEE: 'alerte',
  CODE_INVALIDE: 'info',
  TROP_DE_REQUETES: 'alerte',
  COMPTE_BLOQUE_TENTATIVE: 'info',
  ORIGINE_REFUSEE: 'alerte',
} as const;
export type TypeEvenement = keyof typeof TYPES_EVENEMENT;

// Règles d'alerte : au-delà de `seuil` événements d'un type sur la dernière heure, une alerte est levée.
export const REGLES_ALERTE: { type: TypeEvenement; seuil: number; message: (n: number) => string }[] = [
  { type: 'ADMIN_VERROUILLE', seuil: 1, message: () => 'La connexion à l’administration a été verrouillée après trop d’échecs (attaque par force brute possible).' },
  { type: 'ADMIN_ECHEC_CONNEXION', seuil: 10, message: (n) => `${n} échecs de connexion à l’administration en une heure.` },
  { type: 'ADMIN_ACCES_REFUSE', seuil: 5, message: (n) => `${n} tentatives d’accès à l’administration avec un jeton non autorisé en une heure.` },
  { type: 'ADMIN_ACCES_SUPER_REFUSE', seuil: 5, message: (n) => `${n} tentatives d’un compte admin non super-admin d’accéder à la gestion des comptes en une heure.` },
  { type: 'ADMIN_ACCES_BENEVOLE_REFUSE', seuil: 5, message: (n) => `${n} tentatives d’un compte bénévole d’accéder à une partie de l’administration qui lui est fermée en une heure.` },
  { type: 'CODE_INVALIDE', seuil: 100, message: (n) => `${n} codes de récupération invalides en une heure (essais de codes au hasard ?).` },
  { type: 'ADMIN_SESSION_FERMEE', seuil: 3, message: (n) => `${n} utilisations d’une session d’administration déjà fermée en une heure (cookie recopié après déconnexion ?).` },
  { type: 'ORIGINE_REFUSEE', seuil: 5, message: (n) => `${n} requêtes avec un cookie de session venues d’un autre site en une heure (tentative de CSRF ?).` },
  { type: 'TROP_DE_REQUETES', seuil: 50, message: (n) => `${n} dépassements de limite de débit en une heure.` },
];

export const CONSERVATION_JOURS = 30;
const HEURE_MS = 60 * 60 * 1000;
const JOUR_MS = 24 * HEURE_MS;

let dernierePurge = 0;

// Ne doit jamais faire échouer la requête en cours : une erreur d'écriture est seulement tracée.
export async function enregistrer(
  prisma: PrismaClient,
  evenement: { type: TypeEvenement; ip?: string; details?: Prisma.InputJsonValue },
  journal?: { error: (o: unknown, m: string) => void },
) {
  try {
    await prisma.evenementSecurite.create({
      data: { type: evenement.type, niveau: TYPES_EVENEMENT[evenement.type], ip: evenement.ip, details: evenement.details },
    });
    // Purge des événements trop anciens, au plus une fois par heure.
    if (Date.now() - dernierePurge > HEURE_MS) {
      dernierePurge = Date.now();
      await purger(prisma);
    }
  } catch (e) {
    journal?.error(e, 'Impossible d’enregistrer un événement de sécurité');
  }
}

export async function purger(prisma: PrismaClient, maintenant = new Date()) {
  const limite = new Date(maintenant.getTime() - CONSERVATION_JOURS * JOUR_MS);
  const { count } = await prisma.evenementSecurite.deleteMany({ where: { createdAt: { lt: limite } } });
  return count;
}

export async function alertesActives(prisma: PrismaClient, maintenant = new Date()) {
  const groupes = await prisma.evenementSecurite.groupBy({
    by: ['type'],
    where: { createdAt: { gte: new Date(maintenant.getTime() - HEURE_MS) } },
    _count: true,
  });
  return REGLES_ALERTE.flatMap((r) => {
    const n = groupes.find((g) => g.type === r.type)?._count ?? 0;
    return n >= r.seuil ? [{ type: r.type, nombre: n, message: r.message(n) }] : [];
  });
}

export async function tableau(prisma: PrismaClient, options: { type?: string; page: number; parPage: number }) {
  const maintenant = new Date();
  const where: Prisma.EvenementSecuriteWhereInput = options.type ? { type: options.type } : {};
  const [alertes, sur24h, total, evenements] = await Promise.all([
    alertesActives(prisma, maintenant),
    prisma.evenementSecurite.groupBy({
      by: ['type'],
      where: { createdAt: { gte: new Date(maintenant.getTime() - JOUR_MS) } },
      _count: true,
    }),
    prisma.evenementSecurite.count({ where }),
    prisma.evenementSecurite.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      skip: (options.page - 1) * options.parPage,
      take: options.parPage,
    }),
  ]);
  return {
    alertes,
    dernieres24h: (Object.keys(TYPES_EVENEMENT) as TypeEvenement[]).map((type) => ({
      type,
      niveau: TYPES_EVENEMENT[type],
      nombre: sur24h.find((g) => g.type === type)?._count ?? 0,
    })),
    total,
    page: options.page,
    parPage: options.parPage,
    evenements: evenements.map((e) => ({
      type: e.type,
      niveau: e.niveau,
      ip: e.ip,
      details: (e.details ?? null) as Record<string, unknown> | null,
      createdAt: e.createdAt.toISOString(),
    })),
  };
}
