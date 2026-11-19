import type { EtapeSuivi } from '@prisma/client';

// Questions de suivi posées 7 et 14 jours après le premier bilan (le jour du stand).
// Uniquement des choix et des échelles : pas de texte libre, donc pas de risque de collecter des données personnelles.
export type QuestionSuivi =
  | { id: string; question: string; type: 'choix'; options: { valeur: string; libelle: string }[] }
  | { id: string; question: string; type: 'echelle'; min: number; max: number; libelleMin: string; libelleMax: string };

const changement: QuestionSuivi = {
  id: 'changement',
  question: 'Depuis le stand, as-tu changé certaines de tes habitudes ?',
  type: 'choix',
  options: [
    { valeur: 'beaucoup', libelle: 'Oui, plusieurs' },
    { valeur: 'un-peu', libelle: 'Oui, une ou deux' },
    { valeur: 'pas-encore', libelle: 'Pas encore, mais j’y pense' },
    { valeur: 'non', libelle: 'Non' },
  ],
};

const domaine: QuestionSuivi = {
  id: 'domaine',
  question: 'Dans quel domaine as-tu le plus changé ?',
  type: 'choix',
  options: [
    { valeur: 'transport', libelle: 'Transport' },
    { valeur: 'alimentation', libelle: 'Alimentation' },
    { valeur: 'logement', libelle: 'Logement, énergie' },
    { valeur: 'numerique', libelle: 'Numérique' },
    { valeur: 'achats', libelle: 'Achats, vêtements' },
    { valeur: 'aucun', libelle: 'Aucun' },
  ],
};

export const QUESTIONNAIRES: Record<EtapeSuivi, QuestionSuivi[]> = {
  J7: [
    changement,
    domaine,
    {
      id: 'facilite',
      question: 'Tes défis étaient-ils faciles à tenir ?',
      type: 'echelle',
      min: 1,
      max: 5,
      libelleMin: 'Très difficiles',
      libelleMax: 'Très faciles',
    },
  ],
  J14: [
    changement,
    domaine,
    {
      id: 'continuer',
      question: 'Comptes-tu garder ces nouveaux gestes ?',
      type: 'choix',
      options: [
        { valeur: 'oui', libelle: 'Oui' },
        { valeur: 'peut-etre', libelle: 'Peut-être' },
        { valeur: 'non', libelle: 'Non' },
      ],
    },
    {
      id: 'usage-ia',
      question: 'Depuis le stand, as-tu changé ta façon d’utiliser l’IA (ChatGPT, Gemini, Le Chat…) ?',
      type: 'choix',
      options: [
        { valeur: 'moins', libelle: 'Oui, je l’utilise seulement quand c’est utile' },
        { valeur: 'autrement', libelle: 'Oui, autrement (sans mode raisonnement, requêtes plus courtes, IA locale…)' },
        { valeur: 'non', libelle: 'Non, rien n’a changé' },
        { valeur: 'pas-utilisateur', libelle: 'Je n’utilise pas d’IA' },
      ],
    },
    {
      id: 'prise-de-conscience',
      question: 'Le bilan t’a-t-il appris quelque chose sur ton empreinte ?',
      type: 'echelle',
      min: 1,
      max: 5,
      libelleMin: 'Rien du tout',
      libelleMax: 'Beaucoup',
    },
  ],
};

export const DELAI_JOURS: Record<EtapeSuivi, number> = { J7: 7, J14: 14 };

// Renvoie les réponses validées, ou la liste des erreurs.
export function validerReponses(etape: EtapeSuivi, reponses: Record<string, string | number>) {
  const erreurs: { champ: string; message: string }[] = [];
  const questions = QUESTIONNAIRES[etape];
  for (const q of questions) {
    const r = reponses[q.id];
    if (r === undefined) erreurs.push({ champ: q.id, message: 'Réponse manquante.' });
    else if (q.type === 'choix' && !q.options.some((o) => o.valeur === r)) {
      erreurs.push({ champ: q.id, message: `Valeur attendue parmi : ${q.options.map((o) => o.valeur).join(', ')}.` });
    } else if (q.type === 'echelle' && !(Number.isInteger(r) && (r as number) >= q.min && (r as number) <= q.max)) {
      erreurs.push({ champ: q.id, message: `Nombre entier attendu entre ${q.min} et ${q.max}.` });
    }
  }
  for (const id of Object.keys(reponses)) {
    if (!questions.some((q) => q.id === id)) erreurs.push({ champ: id, message: 'Question inconnue.' });
  }
  return erreurs;
}
