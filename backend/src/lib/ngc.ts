import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import Engine, { type RawPublicodes } from 'publicodes';

// Modèle officiel Nos Gestes Climat (ADEME), France, en français.
const require = createRequire(import.meta.url);
const CHEMIN_MODELE = require.resolve('@incubateur-ademe/nosgestesclimat/public/co2-model.FR-lang.fr.json');

type RegleBrute = {
  titre?: string;
  question?: string;
  unité?: string;
  mosaique?: unknown;
  'une possibilité'?: string[];
  plancher?: number;
  plafond?: number;
};

export const CATEGORIES = {
  transport: 'transport',
  alimentation: 'alimentation',
  logement: 'logement',
  divers: 'divers',
  servicesSocietaux: 'services sociétaux',
} as const;
export type Categorie = keyof typeof CATEGORIES;
// Catégories sur lesquelles un étudiant peut agir (les services sociétaux sont incompressibles à son échelle).
const CATEGORIES_ACTIONNABLES = ['transport', 'alimentation', 'logement', 'divers'] as const;

export type ValeurReponse = number | string | boolean;
export type Situation = Record<string, number | string>;
export type TypeQuestion = 'nombre' | 'choix' | 'oui-non';

export type Question = {
  dottedName: string;
  question: string;
  categorie: string;
  type: TypeQuestion;
  unite: string | null;
  possibilites: { valeur: string; titre: string }[];
  // Bornes d'une question « nombre » (plancher/plafond du modèle, ou bornes du projet). null sinon.
  min: number | null;
  max: number | null;
};

export type Bornes = { min: number | null; max: number | null };

export type ResultatBilan = {
  totalKg: number;
  parCategorie: Record<Categorie, number>;
  categorieDominante: Categorie;
};

export class ErreurSituation extends Error {
  constructor(public erreurs: { champ: string; message: string }[]) {
    super('Situation invalide');
  }
}

export const VALEUR_MAX = 10_000_000;

// Bornes ajoutées par le projet quand le modèle n'en donne pas (sinon « 500 h de bus par semaine » passait).
const BORNES_PROJET: Record<string, { min?: number; max?: number }> = {
  'transport . transports commun . bus . heures par semaine': { max: 40 },
  'transport . transports commun . métro ou tram . heures par semaine': { max: 40 },
};

// Les plats se comptent sur 14 repas par semaine (midi et soir), comme les suggestions du modèle.
// Chaque plat est borné à 21 par le modèle, mais leur total ne l'est pas : on le plafonne.
export const QUESTIONS_PLATS = [
  'alimentation . plats . végétalien . nombre',
  'alimentation . plats . végétarien . nombre',
  'alimentation . plats . viande blanche . nombre',
  'alimentation . plats . viande rouge . nombre',
  'alimentation . plats . poisson gras . nombre',
  'alimentation . plats . poisson blanc . nombre',
];
export const REPAS_MAX_SEMAINE = 14;

export class ModeleNgc {
  private regles: Record<string, RegleBrute>;
  private engine: Engine;
  private questions = new Map<string, Question>();

  constructor() {
    this.regles = JSON.parse(readFileSync(CHEMIN_MODELE, 'utf8'));
    this.engine = new Engine(this.regles as RawPublicodes<string>, {
      logger: { log() {}, warn() {}, error() {} },
    });
    for (const [dottedName, regle] of Object.entries(this.regles)) {
      // Les « mosaïques » regroupent d'autres questions : on ne répond qu'à leurs sous-questions.
      if (!regle?.question || regle.mosaique) continue;
      this.questions.set(dottedName, this.decrireQuestion(dottedName, regle));
    }
  }

  private decrireQuestion(dottedName: string, regle: RegleBrute): Question {
    const options = regle['une possibilité'];
    let type: TypeQuestion = 'oui-non';
    if (options) type = 'choix';
    else if (regle.unité || typeof this.engine.evaluate(dottedName).nodeValue === 'number') type = 'nombre';
    const projet = BORNES_PROJET[dottedName] ?? {};
    return {
      dottedName,
      question: regle.question!,
      categorie: dottedName.split(' . ')[0],
      type,
      unite: regle.unité ?? null,
      possibilites:
        type === 'oui-non'
          ? [
              { valeur: 'oui', titre: 'Oui' },
              { valeur: 'non', titre: 'Non' },
            ]
          : (options ?? []).map((valeur) => ({
              valeur,
              titre: this.regles[`${dottedName} . ${valeur}`]?.titre ?? valeur,
            })),
      min: type === 'nombre' ? Math.max(0, projet.min ?? regle.plancher ?? 0) : null,
      max: type === 'nombre' ? Math.min(VALEUR_MAX, projet.max ?? regle.plafond ?? VALEUR_MAX) : null,
    };
  }

  question(dottedName: string): Question | undefined {
    return this.questions.get(dottedName);
  }

  toutesQuestions(): IterableIterator<Question> {
    return this.questions.values();
  }

  // Limites strictes du modèle (plancher/plafond) : les bornes réglées dans l'administration doivent
  // rester à l'intérieur. Sans plafond dans le modèle, VALEUR_MAX (les bornes du projet sont un réglage
  // par défaut, pas une limite).
  limitesModele(dottedName: string): { min: number; max: number } | null {
    const q = this.questions.get(dottedName);
    if (q?.type !== 'nombre') return null;
    const regle = this.regles[dottedName];
    return { min: Math.max(0, regle.plancher ?? 0), max: Math.min(VALEUR_MAX, regle.plafond ?? VALEUR_MAX) };
  }

  titre(dottedName: string): string | undefined {
    return this.regles[dottedName]?.titre;
  }

  // Une situation venant du client n'est jamais passée telle quelle au moteur : en publicodes, une chaîne est
  // une expression (elle pourrait référencer d'autres règles). On n'accepte donc que des questions connues,
  // avec des nombres, oui/non, ou une des possibilités prévues par le modèle.
  // `bornes` remplace, question par question, les bornes par défaut (réglages du questionnaire admin).
  validerSituation(brute: Record<string, ValeurReponse>, bornes?: ReadonlyMap<string, Bornes>): Situation {
    const situation: Situation = {};
    const erreurs: { champ: string; message: string }[] = [];
    for (const [cle, valeur] of Object.entries(brute)) {
      const q = this.questions.get(cle);
      const b = (q && bornes?.get(cle)) ?? q;
      const normalisee = q && b ? this.normaliser(q, valeur, b) : undefined;
      if (!q || !b) erreurs.push({ champ: cle, message: 'Question inconnue du modèle Nos Gestes Climat.' });
      else if (normalisee === undefined) erreurs.push({ champ: cle, message: this.messageType(q, b) });
      else situation[cle] = normalisee;
    }
    const repas = QUESTIONS_PLATS.reduce((somme, q) => somme + (typeof situation[q] === 'number' ? (situation[q] as number) : 0), 0);
    if (repas > REPAS_MAX_SEMAINE) {
      erreurs.push({
        champ: 'alimentation . plats',
        message: `Au plus ${REPAS_MAX_SEMAINE} repas par semaine au total (midi et soir) : ${repas} renseignés.`,
      });
    }
    if (erreurs.length) throw new ErreurSituation(erreurs);
    return situation;
  }

  private normaliser(q: Question, valeur: ValeurReponse, b: Bornes): number | string | undefined {
    if (q.type === 'choix') {
      const brute = typeof valeur === 'string' ? valeur.replace(/^'(.*)'$/, '$1') : undefined;
      return brute !== undefined && q.possibilites.some((p) => p.valeur === brute) ? `'${brute}'` : undefined;
    }
    if (typeof valeur === 'number') {
      const min = b.min ?? 0;
      const max = b.max ?? VALEUR_MAX;
      return Number.isFinite(valeur) && valeur >= min && valeur <= max ? valeur : undefined;
    }
    if (typeof valeur === 'boolean') return valeur ? 'oui' : 'non';
    return valeur === 'oui' || valeur === 'non' ? valeur : undefined;
  }

  private messageType(q: Question, b: Bornes): string {
    if (q.type === 'choix') return `Valeur attendue parmi : ${q.possibilites.map((p) => p.valeur).join(', ')}.`;
    if (q.type === 'nombre') return `Valeur attendue : un nombre entre ${b.min ?? 0} et ${b.max ?? VALEUR_MAX}.`;
    return 'Valeur attendue : un nombre positif, ou "oui" / "non".';
  }

  // Le moteur est partagé : setSituation + evaluate s'exécutent d'un bloc (code synchrone), sans entrelacement possible.
  private avecSituation<T>(situation: Situation, calcul: () => T): T {
    this.engine.setSituation(situation, { keepPreviousSituation: false });
    return calcul();
  }

  private kg(dottedName: string): number {
    const valeur = this.engine.evaluate(dottedName).nodeValue;
    return typeof valeur === 'number' && Number.isFinite(valeur) ? valeur : 0;
  }

  // À appeler à l'intérieur de avecSituation.
  private resultat(): ResultatBilan {
    const parCategorie = Object.fromEntries(
      Object.entries(CATEGORIES).map(([cle, regle]) => [cle, arrondir(this.kg(regle))]),
    ) as Record<Categorie, number>;
    return { totalKg: arrondir(this.kg('bilan')), parCategorie, categorieDominante: categorieDominante(parCategorie) };
  }

  calculerBilan(situation: Situation): ResultatBilan {
    return this.avecSituation(situation, () => this.resultat());
  }

  // Estimation en direct pendant la saisie : bilan + questions qui ont encore un sens avec ces réponses
  // (ex. « km en voiture » disparaît si on ne prend jamais la voiture). Rien n'est enregistré.
  estimer(situation: Situation, questions: readonly string[]): ResultatBilan & { applicables: string[] } {
    return this.avecSituation(situation, () => ({
      ...this.resultat(),
      applicables: questions.filter(
        (q) => this.engine.evaluate({ 'est applicable': q } as unknown as string).nodeValue === true,
      ),
    }));
  }

  // Gain annuel (kg CO2e/an) de chaque action si la personne l'adoptait, calculé à partir de sa situation.
  // 0 quand l'action ne la concerne pas (ex. « réduire la viande » pour quelqu'un de végétarien).
  gainsActions(situation: Situation, actions: string[]): Record<string, number> {
    return this.avecSituation(situation, () =>
      Object.fromEntries(actions.map((a) => [a, Math.max(0, this.kg(a))])),
    );
  }

  existe(dottedName: string): boolean {
    return dottedName in this.regles;
  }
}

export function categorieDominante(parCategorie: Partial<Record<Categorie, number>>) {
  return CATEGORIES_ACTIONNABLES.reduce((a, b) => ((parCategorie[b] ?? 0) > (parCategorie[a] ?? 0) ? b : a));
}

export function arrondir(kg: number): number {
  return Math.round(kg * 10) / 10;
}
