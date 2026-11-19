// Liste initiale des filières proposées à l'inscription (modifiable).
export const FILIERES = [
  { slug: 'informatique', libelle: 'Informatique' },
  { slug: 'mathematiques', libelle: 'Mathématiques' },
  { slug: 'physique-chimie', libelle: 'Physique, chimie' },
  { slug: 'sciences-vie', libelle: 'Sciences de la vie' },
  { slug: 'genie-civil', libelle: 'Génie civil' },
  { slug: 'genie-mecanique', libelle: 'Génie mécanique' },
  { slug: 'genie-electrique', libelle: 'Génie électrique, électronique' },
  { slug: 'staps', libelle: 'STAPS' },
  { slug: 'droit', libelle: 'Droit' },
  { slug: 'economie-gestion', libelle: 'Économie, gestion' },
  { slug: 'langues', libelle: 'Langues (LEA, LLCER)' },
  { slug: 'lettres-sciences-humaines', libelle: 'Lettres, sciences humaines' },
  { slug: 'arts-design', libelle: 'Arts, design, audiovisuel' },
  { slug: 'communication', libelle: 'Communication, information' },
  { slug: 'insa-ingenieur', libelle: 'École d’ingénieurs INSA' },
  { slug: 'autre', libelle: 'Autre' },
];

export async function seedFilieres(client: import('@prisma/client').PrismaClient) {
  for (const f of FILIERES) {
    await client.filiere.upsert({ where: { slug: f.slug }, update: { libelle: f.libelle }, create: f });
  }
}
