import { PrismaClient } from '@prisma/client';
import { randomUUID } from 'node:crypto';
import { afterAll, describe, expect, it } from 'vitest';
import { MATIERES, TYPES, seedVetements } from '../prisma/vetements.js';

// Noms suffixés : la base de test est partagée avec vetements.test.ts, qui crée « Lin », « Jean »…
const prisma = new PrismaClient();
const s = randomUUID().slice(0, 8);
const matieres = [
  { nom: `Coton ${s}`, facteur: 17.79, source: 'source A' },
  { nom: `Laine ${s}`, facteur: 57.32, source: 'source B' },
  { nom: `Lin ${s}`, facteur: 11.03, source: 'source C' },
];
const types = [
  { nom: `Jean ${s}`, poids: 450 },
  { nom: `Pull ${s}`, poids: 550 },
];

afterAll(() => prisma.$disconnect());

describe('chiffres de référence des vêtements', () => {
  it('liste les 12 matières et 7 types validés, avec une source par matière', () => {
    expect(MATIERES).toHaveLength(12);
    expect(TYPES).toHaveLength(7);
    expect(MATIERES.every((m) => m.facteur > 0 && m.source.startsWith('Ecobalyse'))).toBe(true);
    expect(TYPES.every((t) => Number.isInteger(t.poids) && t.poids > 0)).toBe(true);
    expect(new Set([...MATIERES, ...TYPES].map((x) => x.nom)).size).toBe(19);
  });

  it('crée, complète les champs vides, ne touche jamais une valeur déjà saisie, et se relance sans doublon', async () => {
    // Déjà en base : une matière sans facteur, une avec un facteur saisi à la main, un type pesé.
    await prisma.matiere.create({ data: { nom: `Laine ${s}` } });
    await prisma.matiere.create({ data: { nom: `Lin ${s}`, facteurEmissionKgCo2ParKg: 9, source: 'pesée' } });
    await prisma.typeVetement.create({ data: { nom: `Pull ${s}`, poidsMoyenGrammes: 600 } });

    const r = await seedVetements(prisma, matieres, types);
    expect(r.crees.sort()).toEqual([`matière Coton ${s}`, `type Jean ${s}`]);
    expect(r.completes).toEqual([`matière Laine ${s}`]);
    expect(r.differents).toHaveLength(2);

    const laine = await prisma.matiere.findUniqueOrThrow({ where: { nom: `Laine ${s}` } });
    expect(laine).toMatchObject({ facteurEmissionKgCo2ParKg: 57.32, source: 'source B' });
    const lin = await prisma.matiere.findUniqueOrThrow({ where: { nom: `Lin ${s}` } });
    expect(lin).toMatchObject({ facteurEmissionKgCo2ParKg: 9, source: 'pesée' });
    const pull = await prisma.typeVetement.findUniqueOrThrow({ where: { nom: `Pull ${s}` } });
    expect(pull.poidsMoyenGrammes).toBe(600);

    const encore = await seedVetements(prisma, matieres, types);
    expect(encore.crees).toEqual([]);
    expect(encore.completes).toEqual([]);
    expect(await prisma.matiere.count({ where: { nom: { endsWith: s } } })).toBe(3);
  });
});
