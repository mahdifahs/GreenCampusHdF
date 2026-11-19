import { SOURCES, type CleSource } from '../guide-ia/sources.js';

// Quiz du stand. Chaque question a une seule bonne réponse, une explication et une source.
export type QuestionQuiz = {
  id: string;
  theme: 'ia';
  question: string;
  choix: { id: string; texte: string }[];
  bonneReponse: string;
  explication: string;
  source: CleSource;
};

export const QUESTIONS_QUIZ: QuestionQuiz[] = [
  {
    id: 'ia-energie-requete',
    theme: 'ia',
    question: 'Combien d’énergie consomme une question texte simple posée à une IA comme Gemini ?',
    choix: [
      { id: 'a', texte: 'Environ 1 seconde de micro-ondes (0,24 Wh)' },
      { id: 'b', texte: 'Une recharge complète de téléphone (environ 15 Wh)' },
      { id: 'c', texte: 'Une bouilloire pleine (environ 100 Wh)' },
      { id: 'd', texte: 'Une journée de chauffage électrique' },
    ],
    bonneReponse: 'a',
    explication:
      'Selon Google, la requête texte médiane consomme 0,24 Wh. Une question isolée pèse peu : ce sont la répétition et les usages lourds qui comptent.',
    source: 'google2025',
  },
  {
    id: 'ia-raisonnement',
    theme: 'ia',
    question: 'Activer le mode « raisonnement » (réflexion approfondie) multiplie la consommation, en moyenne, par…',
    choix: [
      { id: 'a', texte: '2' },
      { id: 'b', texte: '5' },
      { id: 'c', texte: '30' },
      { id: 'd', texte: 'Ça ne change rien' },
    ],
    bonneReponse: 'c',
    explication:
      'L’AI Energy Score a mesuré 30 fois plus d’énergie en moyenne, et jusqu’à plusieurs centaines de fois pour certains modèles. À réserver aux problèmes complexes.',
    source: 'aiEnergyScore2025',
  },
  {
    id: 'ia-long-document',
    theme: 'ia',
    question: 'Coller un long document (environ 10 000 tokens, un article de magazine) dans ta question multiplie l’énergie par environ…',
    choix: [
      { id: 'a', texte: '1, la longueur ne compte pas' },
      { id: 'b', texte: '2' },
      { id: 'c', texte: '8' },
      { id: 'd', texte: '1 000' },
    ],
    bonneReponse: 'c',
    explication: 'Epoch AI estime qu’on passe d’environ 0,3 Wh à 2,5 Wh. Mieux vaut ne coller que l’extrait utile.',
    source: 'epoch2025',
  },
  {
    id: 'ia-eau',
    theme: 'ia',
    question: 'Combien d’eau faut-il pour une réponse de Le Chat (Mistral), fabrication des serveurs et entraînement compris ?',
    choix: [
      { id: 'a', texte: 'Quelques gouttes (0,5 mL)' },
      { id: 'b', texte: 'Un fond de verre (45 mL)' },
      { id: 'c', texte: 'Une bouteille (1,5 L)' },
      { id: 'd', texte: 'Un seau (10 L)' },
    ],
    bonneReponse: 'b',
    explication:
      'L’analyse de cycle de vie de Mistral donne 45 mL d’eau et 1,14 g de CO2e pour une réponse de 400 tokens. Pour la seule utilisation, Google annonce 0,26 mL : tout dépend de ce qu’on compte.',
    source: 'mistral2025',
  },
  {
    id: 'ia-locale',
    theme: 'ia',
    question: 'Faire tourner une IA sur ton propre ordinateur (Ollama, LM Studio) plutôt que dans le cloud…',
    choix: [
      { id: 'a', texte: 'Consomme toujours moins d’énergie' },
      { id: 'b', texte: 'N’a aucun impact environnemental' },
      { id: 'c', texte: 'Garde tes données chez toi, mais n’est pas forcément plus économe' },
      { id: 'd', texte: 'Est réservé aux entreprises' },
    ],
    bonneReponse: 'c',
    explication:
      'Un ordinateur personnel fait tourner un même modèle moins efficacement qu’un centre de données. Ses atouts : la confidentialité, et une électricité française peu carbonée avec un petit modèle.',
    source: 'stanford2025',
  },
  {
    id: 'ia-question-factuelle',
    theme: 'ia',
    question: 'Pour une question factuelle simple (les horaires du tram, une date d’examen), le plus adapté est…',
    choix: [
      { id: 'a', texte: 'Une IA en mode raisonnement' },
      { id: 'b', texte: 'Le site officiel ou un moteur de recherche' },
      { id: 'c', texte: 'Poser la question 5 fois à l’IA pour être sûr' },
      { id: 'd', texte: 'Générer une infographie avec l’IA' },
    ],
    bonneReponse: 'b',
    explication:
      'L’énergie est du même ordre qu’une question simple à une IA (environ 0,3 Wh), mais la source officielle est fiable et à jour, sans risque d’erreur inventée.',
    source: 'google2009',
  },
];

export const questionPublique = (q: QuestionQuiz) => ({
  id: q.id,
  theme: q.theme,
  question: q.question,
  choix: q.choix,
});

export const correction = (q: QuestionQuiz) => ({
  bonneReponse: q.bonneReponse,
  explication: q.explication,
  source: SOURCES[q.source],
});
