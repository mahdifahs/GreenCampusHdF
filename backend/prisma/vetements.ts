// Chiffres de référence pour le bilan CO2 des vêtements (onglet admin « Vêtements »), validés par
// l'équipe le 2026-11-12. Écrits ici une fois pour toutes : pas d'appel à Ecobalyse au lancement,
// les chiffres ne changent donc pas sans qu'on le décide.
//
// - Matières : simulateur Ecobalyse, t-shirt 170 g 100 % de la matière, fabriqué en France. Le
//   facteur inclut la fabrication du vêtement, pas seulement la fibre brute.
// - Poids moyens : vêtements de référence d'Ecobalyse (public/data/textile/examples.json du dépôt
//   MTES-MCT/ecobalyse, commit a241f44 du 08/09/2026), souvent leur « majorant par défaut ».
//   Le modèle TypeVetement n'a pas de champ source : elle est notée ici et dans backend/README.md.
//
// Règle : on crée ce qui manque et on remplit les champs vides, sans jamais écraser une valeur
// déjà saisie (une pesée réelle corrigée dans l'admin doit rester). Relançable sans risque.
import type { PrismaClient } from '@prisma/client';

const SOURCE_MATIERE = (matiere: string) =>
  `Ecobalyse (gouv.), simulation t-shirt 170 g 100 % ${matiere}, fabriqué en France, nov. 2026`;

export const MATIERES: { nom: string; facteur: number; source: string }[] = [
  ['Coton', 17.79, 'coton'],
  ['Coton biologique', 11.25, 'coton biologique'],
  ['Coton recyclé', 12.01, 'coton recyclé'],
  ['Polyester', 15.31, 'polyester'],
  ['Polyester recyclé', 12.19, 'polyester recyclé'],
  ['Nylon', 27.38, 'nylon'],
  ['Acrylique', 25.43, 'acrylique'],
  ['Élasthanne', 20.73, 'élasthanne'],
  ['Viscose', 18.85, 'viscose'],
  ['Laine', 57.32, 'laine'],
  ['Lin', 11.03, 'lin'],
  ['Chanvre', 10.12, 'chanvre'],
].map(([nom, facteur, matiere]) => ({ nom: nom as string, facteur: facteur as number, source: SOURCE_MATIERE(matiere as string) }));

export const TYPES: { nom: string; poids: number }[] = [
  { nom: 'T-shirt / Polo', poids: 150 },
  { nom: 'Chemise', poids: 250 },
  { nom: 'Jupe / Robe', poids: 300 },
  { nom: 'Jean', poids: 450 },
  { nom: 'Pantalon / Short', poids: 450 },
  { nom: 'Pull', poids: 550 },
  { nom: 'Manteau / Veste', poids: 950 },
  // Pas de sous-vêtements (chaussettes, caleçons, boxers, slips) ni de maillots de bain : refusés
  // à la collecte pour raison d'hygiène
  // (décision de l'équipe, 2026-11-19).
];

export type RapportVetements = { crees: string[]; completes: string[]; differents: string[] };

export async function seedVetements(
  client: PrismaClient,
  matieres = MATIERES,
  types = TYPES,
): Promise<RapportVetements> {
  const rapport: RapportVetements = { crees: [], completes: [], differents: [] };

  for (const m of matieres) {
    const existante = await client.matiere.findUnique({ where: { nom: m.nom } });
    if (!existante) {
      await client.matiere.create({ data: { nom: m.nom, facteurEmissionKgCo2ParKg: m.facteur, source: m.source } });
      rapport.crees.push(`matière ${m.nom}`);
    } else if (existante.facteurEmissionKgCo2ParKg === null) {
      await client.matiere.update({
        where: { id: existante.id },
        data: { facteurEmissionKgCo2ParKg: m.facteur, source: existante.source ?? m.source },
      });
      rapport.completes.push(`matière ${m.nom}`);
    } else if (existante.facteurEmissionKgCo2ParKg !== m.facteur) {
      rapport.differents.push(`matière ${m.nom} : ${existante.facteurEmissionKgCo2ParKg} en base, ${m.facteur} prévu`);
    }
  }

  for (const t of types) {
    const existant = await client.typeVetement.findUnique({ where: { nom: t.nom } });
    if (!existant) {
      await client.typeVetement.create({ data: { nom: t.nom, poidsMoyenGrammes: t.poids } });
      rapport.crees.push(`type ${t.nom}`);
    } else if (existant.poidsMoyenGrammes === null) {
      await client.typeVetement.update({ where: { id: existant.id }, data: { poidsMoyenGrammes: t.poids } });
      rapport.completes.push(`type ${t.nom}`);
    } else if (existant.poidsMoyenGrammes !== t.poids) {
      rapport.differents.push(`type ${t.nom} : ${existant.poidsMoyenGrammes} g en base, ${t.poids} g prévu`);
    }
  }

  return rapport;
}

export function afficherRapport(r: RapportVetements) {
  console.log(`Vêtements : ${r.crees.length} créé(s), ${r.completes.length} complété(s), le reste déjà à jour`);
  if (r.differents.length) {
    console.log('  Valeurs déjà saisies et différentes, laissées telles quelles (à vérifier dans l\'admin) :');
    for (const d of r.differents) console.log(`  - ${d}`);
  }
}
