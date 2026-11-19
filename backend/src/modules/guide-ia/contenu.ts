import { SOURCES, type CleSource } from './sources.js';

// Contenu du guide « Utiliser l'IA de façon responsable ». Ton honnête : une requête isolée pèse peu,
// les vrais leviers sont le mode raisonnement, les longs documents, les images et la répétition.
const guide = {
  titre: 'Utiliser l’IA de façon responsable',
  miseAJour: '2026-10-12',
  introduction:
    'Les IA génératives (ChatGPT, Gemini, Le Chat, Claude…) font partie du quotidien étudiant. Une question simple consomme peu, ' +
    'mais certains usages consomment des dizaines de fois plus. Voici ce que disent les études, et les gestes qui font vraiment la différence.',
  chiffresCles: [
    {
      valeur: '0,24 Wh',
      libelle: 'pour une question texte simple à Gemini (médiane), soit environ 1 seconde de micro-ondes, 0,03 g de CO2e et 0,26 mL d’eau',
      source: 'google2025',
    },
    {
      valeur: '× 30',
      libelle: 'en moyenne : la consommation d’un modèle quand son mode « raisonnement » est activé (jusqu’à plusieurs centaines de fois pour certains)',
      source: 'aiEnergyScore2025',
    },
    {
      valeur: '× 8',
      libelle: 'environ, quand on colle un long document (10 000 tokens) dans sa question : de 0,3 Wh à environ 2,5 Wh',
      source: 'epoch2025',
    },
    {
      valeur: '45 mL',
      libelle: 'd’eau et 1,14 g de CO2e pour une réponse de Le Chat (400 tokens), fabrication des serveurs et entraînement compris',
      source: 'mistral2025',
    },
    {
      valeur: '2/3',
      libelle: 'des usages numériques des Français passent par des centres de données à l’étranger, dont l’électricité est plus carbonée',
      source: 'ademe2026',
    },
  ],
  ordreDeGrandeur: {
    texte:
      '20 questions par jour pendant une semaine représentent environ 160 g de CO2e (estimation de Mistral, cycle de vie compris). ' +
      'C’est réel, mais bien moins qu’une semaine végétarienne (environ 10 kg évités) : l’IA est surtout une affaire de bonnes habitudes, ' +
      'qui comptent parce que des millions de personnes les répètent chaque jour.',
    source: 'mistral2025',
  },
  conseils: [
    {
      titre: 'Se demander si l’IA est utile',
      explication:
        'Pour une information factuelle (horaires, définition, règlement), un site officiel ou un moteur de recherche est souvent plus fiable, ' +
        'pour une énergie comparable. Le référentiel de l’IA frugale commence par cette question : en a-t-on vraiment besoin ?',
      source: 'afnor2024',
    },
    {
      titre: 'Désactiver le mode « raisonnement » pour les questions simples',
      explication:
        'Les modes « réflexion approfondie » génèrent beaucoup plus de texte en coulisses : environ 30 fois plus d’énergie en moyenne. ' +
        'À réserver aux problèmes complexes.',
      source: 'aiEnergyScore2025',
    },
    {
      titre: 'Choisir un modèle adapté à la tâche',
      explication:
        'Les versions « mini », « flash » ou « small » suffisent pour reformuler, résumer ou traduire. Les grands modèles servent aux tâches difficiles.',
      source: 'aiEnergyScore2025',
    },
    {
      titre: 'Écrire des requêtes courtes et précises',
      explication:
        'Ne colle que l’extrait utile d’un document : un texte de 10 000 tokens multiplie l’énergie d’une requête par 8 environ, ' +
        'et 100 000 tokens la portent à près de 40 Wh.',
      source: 'epoch2025',
    },
    {
      titre: 'Éviter de régénérer en boucle',
      explication:
        'Chaque nouvelle réponse est un nouveau calcul. Mieux vaut préciser sa demande une fois que relancer cinq fois la même question.',
      source: 'epoch2025',
    },
    {
      titre: 'Limiter la génération d’images et de vidéos',
      explication:
        'Les chiffres ci-dessus concernent le texte uniquement. Générer des images ou des vidéos demande bien plus de calcul : à garder pour les vrais besoins.',
      source: 'google2025',
    },
    {
      titre: 'Essayer une IA locale pour les tâches simples',
      explication:
        'Avec Ollama ou LM Studio et un petit modèle, tes données restent sur ton ordinateur et l’électricité utilisée est française, peu carbonée. ' +
        'Attention : ce n’est pas « zéro impact », un ordinateur personnel est moins efficace qu’un centre de données pour le même modèle.',
      source: 'stanford2025',
    },
    {
      titre: 'Protéger ses données et vérifier les réponses',
      explication:
        'Ne saisis jamais de données personnelles (les tiennes ou celles des autres) et vérifie les informations importantes : une IA peut se tromper avec assurance.',
      source: 'comparia',
    },
  ],
  ideesRecues: [
    {
      idee: '« Une question à ChatGPT consomme autant qu’une bouilloire. »',
      realite:
        'Faux pour une question texte simple : environ 0,24 à 0,3 Wh, soit une seconde de micro-ondes. L’impact vient du nombre de requêtes et des usages lourds.',
      source: 'google2025',
    },
    {
      idee: '« Une recherche Google consomme beaucoup moins qu’une IA. »',
      realite:
        'Pour une question simple, c’est le même ordre de grandeur (environ 0,3 Wh selon Google en 2009). L’écart devient énorme avec le raisonnement, les longs documents ou les images.',
      source: 'google2009',
    },
    {
      idee: '« Une IA installée sur mon ordinateur n’a aucun impact. »',
      realite:
        'Elle consomme l’électricité de ton ordinateur, souvent moins efficacement qu’un centre de données. Ses vrais atouts : la confidentialité et l’électricité française.',
      source: 'stanford2025',
    },
    {
      idee: '« Ma requête ne change rien. »',
      realite:
        'Une requête pèse peu, mais l’ensemble pèse lourd : en 18 mois, l’entraînement et l’usage de Mistral Large 2 ont émis environ 20 400 t de CO2e et consommé 281 000 m³ d’eau.',
      source: 'mistral2025',
    },
  ],
  outils: [
    {
      nom: 'compar:IA',
      description: 'Le comparateur de l’État : pose une question à deux IA anonymes, vote, puis découvre leur impact énergétique.',
      url: 'https://comparia.beta.gouv.fr/',
    },
    {
      nom: 'EcoLogits',
      description: 'Méthode et calculateur open source qui estiment l’impact des requêtes aux IA (utilisés par compar:IA).',
      url: 'https://ecologits.ai/',
    },
    { nom: 'Ollama', description: 'Faire tourner de petits modèles d’IA en local, sur son ordinateur.', url: 'https://ollama.com/' },
    { nom: 'LM Studio', description: 'Application pour télécharger et utiliser des modèles d’IA en local.', url: 'https://lmstudio.ai/' },
  ],
} as const;

// Les sources sont résolues en objets complets pour que le front n'ait rien à recoller.
const avecSource = <T extends { source: CleSource }>(x: T) => ({ ...x, source: SOURCES[x.source] });

export const GUIDE_IA = {
  ...guide,
  chiffresCles: guide.chiffresCles.map(avecSource),
  ordreDeGrandeur: avecSource(guide.ordreDeGrandeur),
  conseils: guide.conseils.map(avecSource),
  ideesRecues: guide.ideesRecues.map(avecSource),
  outils: [...guide.outils],
  sources: Object.values(SOURCES),
};
