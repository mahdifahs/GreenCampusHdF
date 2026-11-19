import type { PrismaClient } from '@prisma/client';

type Ligne = { date: Date; personnesVenues: number };

function versPublic(c: Ligne) {
  return { date: c.date.toISOString().slice(0, 10), personnesVenues: c.personnesVenues };
}

const vide = (date: Date): Ligne => ({ date, personnesVenues: 0 });

export async function jour(prisma: PrismaClient, date: string) {
  const d = new Date(date);
  return versPublic((await prisma.compteurJour.findUnique({ where: { date: d } })) ?? vide(d));
}

export async function historique(prisma: PrismaClient) {
  return (await prisma.compteurJour.findMany({ orderBy: { date: 'desc' } })).map(versPublic);
}

// Lu-puis-écrit (pas atomique) : acceptable ici, un seul appareil tape les compteurs au stand.
// Empêche de descendre sous zéro même si plusieurs -1 sont envoyés d'affilée.
export async function incrementer(prisma: PrismaClient, date: string, delta: 1 | -1) {
  const d = new Date(date);
  const existant = await prisma.compteurJour.findUnique({ where: { date: d } });
  const valeur = Math.max(0, (existant?.personnesVenues ?? 0) + delta);
  const c = await prisma.compteurJour.upsert({
    where: { date: d },
    create: { date: d, personnesVenues: valeur },
    update: { personnesVenues: valeur },
  });
  return versPublic(c);
}

export async function definir(prisma: PrismaClient, date: string, valeur: number) {
  const d = new Date(date);
  const c = await prisma.compteurJour.upsert({
    where: { date: d },
    create: { date: d, personnesVenues: valeur },
    update: { personnesVenues: valeur },
  });
  return versPublic(c);
}
