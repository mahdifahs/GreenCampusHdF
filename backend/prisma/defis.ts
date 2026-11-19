import type { CategorieDefi, PrismaClient } from '@prisma/client';

// Catalogue des défis hebdomadaires. Le CO2 évité n'est pas saisi à la main : il vient de l'action
// correspondante du modèle Nos Gestes Climat (ADEME), calculée selon le bilan de chaque participant
// (gain annuel de l'action ÷ 52 pour une semaine).
export const DEFIS: {
  slug: string;
  titre: string;
  description: string;
  categorie: CategorieDefi;
  actionNgc: string;
}[] = [
  {
    slug: 'viande-2-repas',
    titre: 'Viande à 2 repas maximum cette semaine',
    description: 'Remplace les autres repas par des plats végétariens, du poisson ou des œufs.',
    categorie: 'ALIMENTATION',
    actionNgc: 'alimentation . repas . réduire viande . max 2 par semaine',
  },
  {
    slug: 'viande-1-par-jour',
    titre: 'Pas plus d’un repas avec viande par jour',
    description: 'Le midi ou le soir, mais pas les deux.',
    categorie: 'ALIMENTATION',
    actionNgc: 'alimentation . repas . réduire viande . max 1 par jour',
  },
  {
    slug: 'volaille-plutot-que-boeuf',
    titre: 'Volaille plutôt que bœuf',
    description: 'Quand tu manges de la viande, choisis du poulet ou de la dinde plutôt que du bœuf ou de l’agneau.',
    categorie: 'ALIMENTATION',
    actionNgc: 'alimentation . repas . viande faible empreinte',
  },
  {
    slug: 'semaine-vegetarienne',
    titre: 'Une semaine 100 % végétarienne',
    description: 'Ni viande ni poisson pendant 7 jours (œufs et produits laitiers autorisés).',
    categorie: 'ALIMENTATION',
    actionNgc: 'alimentation . devenir végétarien',
  },
  {
    slug: 'the-plutot-que-cafe',
    titre: 'Un thé à la place d’un café chaque jour',
    description: 'Le café a une empreinte bien plus élevée que le thé.',
    categorie: 'ALIMENTATION',
    actionNgc: 'alimentation . boisson . réduire café . remplace un café par jour par thé',
  },
  {
    slug: 'un-cafe-par-jour',
    titre: 'Un seul café par jour',
    description: 'Limite-toi à une tasse de café par jour pendant la semaine.',
    categorie: 'ALIMENTATION',
    actionNgc: 'alimentation . boisson . réduire café . max un par jour',
  },
  {
    slug: 'sirop-plutot-que-soda',
    titre: 'Sirop à l’eau plutôt que soda ou jus',
    description: 'Les sirops dilués ont une empreinte bien plus faible que les sodas et les jus de fruits.',
    categorie: 'ALIMENTATION',
    actionNgc: 'alimentation . boisson . réduire boissons sucrées . changer pour sirop',
  },
  {
    slug: 'eau-du-robinet',
    titre: 'Eau du robinet uniquement',
    description: 'Aucune bouteille d’eau achetée cette semaine : gourde et robinet.',
    categorie: 'ALIMENTATION',
    actionNgc: 'alimentation . boisson . eau en bouteille . arrêter',
  },
  {
    slug: 'fruits-legumes-de-saison',
    titre: 'Fruits et légumes de saison',
    description: 'N’achète que des fruits et légumes de saison pendant la semaine.',
    categorie: 'ALIMENTATION',
    actionNgc: 'alimentation . bonus . manger de saison',
  },
  {
    slug: 'manger-local',
    titre: 'Manger local',
    description: 'Privilégie les produits de la région (marché, producteurs, AMAP).',
    categorie: 'ALIMENTATION',
    actionNgc: 'alimentation . bonus . manger local',
  },
  {
    slug: 'zero-gaspillage',
    titre: 'Zéro gaspillage alimentaire',
    description: 'Rien à la poubelle : restes cuisinés, portions adaptées, dates surveillées.',
    categorie: 'ALIMENTATION',
    actionNgc: 'alimentation . déchets . réduire gaspillage',
  },
  {
    slug: 'courses-zero-dechet',
    titre: 'Courses zéro déchet',
    description: 'Vrac, contenants réutilisables, pas d’emballage jetable.',
    categorie: 'ALIMENTATION',
    actionNgc: 'alimentation . déchets . devenir zéro déchet',
  },
  {
    slug: 'campus-sans-voiture',
    titre: 'Venir sur le campus sans voiture',
    description: 'Tram, bus, vélo, marche… toute la semaine.',
    categorie: 'TRANSPORT',
    actionNgc: 'transport . voiture . boulot . sans voiture',
  },
  {
    slug: 'covoiturage',
    titre: 'Covoiturer',
    description: 'Partage tes trajets en voiture avec d’autres étudiants.',
    categorie: 'TRANSPORT',
    actionNgc: 'transport . voiture . covoiturage',
  },
  {
    slug: 'pas-de-voiture-moins-5-km',
    titre: 'Pas de voiture pour moins de 5 km',
    description: 'Les petits trajets se font à pied, à vélo ou en transports en commun.',
    categorie: 'TRANSPORT',
    actionNgc: 'transport . voiture . voiture 5km',
  },
  {
    slug: 'eco-conduite',
    titre: 'Adopter l’éco-conduite',
    description: 'Accélérations douces, anticipation, moteur coupé à l’arrêt.',
    categorie: 'TRANSPORT',
    actionNgc: 'transport . voiture . éco-conduite',
  },
  {
    slug: '110-sur-autoroute',
    titre: '110 km/h maximum sur l’autoroute',
    description: 'Rouler 20 km/h moins vite réduit nettement la consommation.',
    categorie: 'TRANSPORT',
    actionNgc: 'transport . voiture . limitation autoroute',
  },
  {
    slug: 'moins-de-streaming',
    titre: 'Moins de streaming vidéo',
    description: 'Réduis ton temps de vidéo en ligne et baisse la qualité quand c’est possible.',
    categorie: 'NUMERIQUE',
    actionNgc: 'divers . numérique . internet . diminuer',
  },
  {
    slug: 'garder-ses-appareils',
    titre: 'Garder ses appareils plus longtemps',
    description: 'Engage-toi à ne pas remplacer ton téléphone ou ton ordinateur tant qu’ils fonctionnent.',
    categorie: 'NUMERIQUE',
    actionNgc: 'divers . numérique . appareils . allongement',
  },
  {
    slug: 'seconde-main',
    titre: 'Vêtements de seconde main',
    description: 'Si tu as besoin d’un vêtement, achète-le d’occasion.',
    categorie: 'DIVERS',
    actionNgc: 'divers . textile . réduire neuf . privilégier la seconde main',
  },
  {
    slug: 'aucun-vetement-neuf',
    titre: 'Aucun vêtement neuf cette semaine',
    description: 'Pas d’achat de vêtement neuf pendant 7 jours.',
    categorie: 'DIVERS',
    actionNgc: 'divers . textile . réduire neuf . diviser par deux achats',
  },
  {
    slug: 'stop-pub',
    titre: 'Coller un stop pub',
    description: 'Un autocollant « stop pub » sur ta boîte aux lettres évite les prospectus.',
    categorie: 'DIVERS',
    actionNgc: 'alimentation . déchets . avoir un stop pub',
  },
];

export async function seedDefis(client: PrismaClient) {
  for (const d of DEFIS) {
    await client.defi.upsert({ where: { slug: d.slug }, update: d, create: d });
  }
}
