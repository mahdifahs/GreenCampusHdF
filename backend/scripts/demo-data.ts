// Repart de zéro à chaque exécution (vide Participant/Bilan/Engagement/Suivi/QuizReponse via
// TRUNCATE, voir plus bas) puis remplit la base de DEV avec des données réalistes (participants,
// bilans, défis, suivis, quiz) pour visualiser le rendu du site : classement des filières, liste
// des participants en admin, statistiques du tableau de bord, etc. N'utilise QUE l'API réelle
// (donc le moteur NGC, les règles métier comme le max de 3 défis/semaine, les questionnaires de
// suivi...) : aucune donnée n'est inventée à la main, tout passe par les mêmes validations qu'un
// vrai usage du site.
//
// Usage : npm run db:seed-demo   (depuis backend/)
//
// Ne touche JAMAIS aux comptes admin, aux évènements, aux vêtements ni aux filières/défis (le
// catalogue de référence) : ni en les générant, ni en les vidant au reset. Ces données sont
// gérées à la main depuis l'administration (ou par `prisma/seed.ts`), pas par ce script.

import { Annee } from '@prisma/client';
import { buildApp } from '../src/app.js';
import { loadConfig } from '../src/config.js';
import { QUESTIONS_QUIZ } from '../src/modules/quiz/questions.js';
import { QUESTIONNAIRES } from '../src/modules/suivis/questionnaire.js';

if (loadConfig().NODE_ENV === 'production') {
  console.error('Refus de lancer ce script en production : il crée de fausses données.');
  process.exit(1);
}

const JOUR_MS = 24 * 60 * 60 * 1000;

function alea(min: number, max: number) {
  return min + Math.random() * (max - min);
}
function aleaInt(min: number, max: number) {
  return Math.round(alea(min, max));
}
function choisir<T>(liste: readonly T[]): T {
  return liste[aleaInt(0, liste.length - 1)];
}
function melanger<T>(liste: T[]): T[] {
  const copie = [...liste];
  for (let i = copie.length - 1; i > 0; i--) {
    const j = aleaInt(0, i);
    [copie[i], copie[j]] = [copie[j], copie[i]];
  }
  return copie;
}

// Plages réalistes pour les questions du stand de type « nombre » (l'API ne donne pas de min/max,
// seulement le type réel de la question et, pour choix/oui-non, les possibilités valides).
const PLAGES_NOMBRE: Record<string, [number, number]> = {
  'transport . voiture . km': [0, 15000],
  'transport . transports commun . bus . heures par semaine': [0, 10],
  'transport . transports commun . métro ou tram . heures par semaine': [0, 10],
  'transport . train . km': [0, 5000],
  'transport . avion . vols annuels . heures court courrier . saisie': [0, 15],
  'transport . avion . vols annuels . heures moyen et long courrier . saisie': [0, 20],
  'alimentation . plats . végétalien . nombre': [0, 21],
  'alimentation . plats . végétarien . nombre': [0, 21],
  'alimentation . plats . viande blanche . nombre': [0, 14],
  'alimentation . plats . viande rouge . nombre': [0, 14],
  'alimentation . plats . poisson gras . nombre': [0, 7],
  'alimentation . plats . poisson blanc . nombre': [0, 7],
  'alimentation . boisson . chaude . café . nombre': [0, 21],
  'logement . habitants': [1, 5],
  'logement . surface': [12, 100],
  'divers . numérique . internet . durée journalière': [0, 8],
};

type QuestionStand = {
  dottedName: string;
  type: 'nombre' | 'choix' | 'oui-non';
  possibilites: { valeur: string; titre: string }[];
};

function situationAleatoire(questions: QuestionStand[]): Record<string, string | number> {
  const situation: Record<string, string | number> = {};
  for (const q of questions) {
    // Simule un passage au stand plus ou moins complet : environ 75 % des questions répondues.
    if (Math.random() > 0.75) continue;
    if (q.type === 'nombre') {
      const [min, max] = PLAGES_NOMBRE[q.dottedName] ?? [0, 5];
      situation[q.dottedName] = aleaInt(min, max);
    } else {
      situation[q.dottedName] = choisir(q.possibilites).valeur;
    }
  }
  return situation;
}

async function main() {
  const config = loadConfig({
    ...process.env,
    // Ce script crée beaucoup de comptes/bilans d'un coup : les limites habituelles (pensées
    // pour un vrai stand) seraient atteintes en quelques secondes.
    RATE_LIMIT_INSCRIPTION_PAR_MIN: '2000',
    RATE_LIMIT_CONNEXION_PAR_MIN: '2000',
    // Les défis de démo sont validés aussitôt créés.
    DEFI_DELAI_VALIDATION_HEURES: '0',
    // Coupe le logger Fastify (sinon une ligne par requête HTTP interne, illisible ici).
    NODE_ENV: 'test',
  });
  const app = await buildApp(config);

  // Repart de zéro à chaque exécution : vide uniquement ce que ce script génère lui-même.
  // `Participant` entraîne en cascade (voir schema.prisma) Bilan, Engagement, Suivi,
  // PushAbonnement et Relance ; QuizReponse est anonyme, donc à part. Jamais touché : Filiere,
  // Defi, CompteAdmin, Evenement, EvenementSecurite, ActionAdmin, CompteurJour, TypeVetement,
  // Matiere, QuantiteVetement.
  const avant = await app.prisma.participant.count();
  await app.prisma.$executeRawUnsafe('TRUNCATE "Participant", "QuizReponse" RESTART IDENTITY CASCADE');
  console.log(`Base réinitialisée : ${avant} ancien(s) participant(s) et leurs données supprimés.`);

  const filieres = await (await app.inject({ method: 'GET', url: '/api/filieres' })).json();
  const questionsStand: QuestionStand[] = await (
    await app.inject({ method: 'GET', url: '/api/bilans/questions-stand' })
  ).json();
  const annees = Object.values(Annee);

  // Combien de participants par filière touchée (certaines filières n'en ont aucun, d'autres
  // restent sous le seuil d'anonymat (${config.SEUIL_ANONYMAT}) : les deux cas se voient sur le site).
  const repartition = melanger([14, 11, 9, 8, 7, 6, 5, 5, 3, 2, 0, 0, 0, 0, 0, 0]).slice(0, filieres.length);

  let totalParticipants = 0;
  let totalBilans = 0;
  let totalEngagements = 0;
  let totalValides = 0;
  let totalNonTenus = 0;
  let totalSuivis = 0;
  const parFiliere: { libelle: string; participants: number }[] = [];

  for (let i = 0; i < filieres.length; i++) {
    const filiere = filieres[i];
    const nb = repartition[i] ?? 0;
    parFiliere.push({ libelle: filiere.libelle, participants: nb });

    for (let n = 0; n < nb; n++) {
      // --- Inscription ---
      const reponse = await app.inject({
        method: 'POST',
        url: '/api/participants',
        payload: { filiereId: filiere.id, annee: choisir(annees), consentement: true },
      });
      const inscription = reponse.json();
      // La session arrive dans le cookie gc_session ; l'API accepte aussi ce jeton en Bearer.
      const jeton = reponse.cookies.find((c) => c.name === 'gc_session')?.value;
      const headers = { authorization: `Bearer ${jeton}` };
      const participantId: string = inscription.participant.id;
      totalParticipants++;

      // --- Bilan carbone (recalculé côté serveur via le vrai moteur NGC) ---
      const resBilan = await app.inject({
        method: 'POST',
        url: '/api/bilans',
        headers,
        payload: { type: 'STAND', situation: situationAleatoire(questionsStand) },
      });
      if (resBilan.statusCode !== 201) continue;
      totalBilans++;

      // --- Étale l'activité sur les 20 derniers jours, pour le graphique « activité par jour »
      //     et pour rendre les questionnaires de suivi J+7/J+14 disponibles pour les plus anciens.
      const joursAvant = aleaInt(0, 20);
      const dateActivite = new Date(Date.now() - joursAvant * JOUR_MS - aleaInt(0, 12) * 3600_000);
      const dateVue = Math.random() < 0.5 ? new Date() : dateActivite;
      await app.prisma.participant.update({
        where: { id: participantId },
        data: { createdAt: dateActivite, lastSeenAt: dateVue },
      });
      await app.prisma.bilan.updateMany({ where: { participantId }, data: { createdAt: dateActivite } });

      // --- Défis de la semaine : 1 à 3 engagements, puis « Tenu »/« Non tenu » pour la plupart ---
      const catalogue = await (await app.inject({ method: 'GET', url: '/api/defis', headers })).json();
      const defis = melanger(catalogue.defis as { id: number }[]).slice(0, aleaInt(1, 3));
      for (const defi of defis) {
        const res = await app.inject({ method: 'POST', url: '/api/engagements', headers, payload: { defiId: defi.id } });
        if (res.statusCode !== 201) continue;
        totalEngagements++;
        const engagement = res.json();
        const tirage = Math.random();
        if (tirage < 0.7) {
          await app.inject({ method: 'PATCH', url: `/api/engagements/${engagement.id}`, headers, payload: { statut: 'VALIDE' } });
          totalValides++;
        } else if (tirage < 0.85) {
          await app.inject({ method: 'PATCH', url: `/api/engagements/${engagement.id}`, headers, payload: { statut: 'NON_TENU' } });
          totalNonTenus++;
        }
        // sinon : laissé « en cours », comme un défi pas encore répondu.
      }

      // --- Questionnaires de suivi (seulement pour les bilans assez anciens) ---
      const aFaire = await (await app.inject({ method: 'GET', url: '/api/suivis/a-faire', headers })).json();
      for (const etape of aFaire.etapes as { etape: 'J7' | 'J14'; disponible: boolean }[]) {
        if (!etape.disponible) continue;
        const reponses: Record<string, string | number> = {};
        for (const q of QUESTIONNAIRES[etape.etape]) {
          reponses[q.id] = q.type === 'choix' ? choisir(q.options).valeur : aleaInt(q.min, q.max);
        }
        const res = await app.inject({ method: 'POST', url: '/api/suivis', headers, payload: { etape: etape.etape, reponses } });
        if (res.statusCode === 201) totalSuivis++;
      }
    }
  }

  // --- Quiz IA (anonyme, aucun compte nécessaire) : ~65 % de bonnes réponses en moyenne ---
  let partiesQuiz = 0;
  for (let i = 0; i < 40; i++) {
    const reponses: Record<string, string> = {};
    for (const q of QUESTIONS_QUIZ) {
      reponses[q.id] = Math.random() < 0.65 ? q.bonneReponse : choisir(q.choix).id;
    }
    const res = await app.inject({ method: 'POST', url: '/api/quiz/reponses', payload: { reponses } });
    if (res.statusCode === 200) partiesQuiz++;
  }

  console.log('\nDonnées de démo créées (base repartie de zéro) :');
  console.log(`  ${totalParticipants} participants, ${totalBilans} bilans`);
  console.log(`  ${totalEngagements} engagements (${totalValides} validés, ${totalNonTenus} non tenus, reste en cours)`);
  console.log(`  ${totalSuivis} questionnaires de suivi (J+7/J+14) remplis`);
  console.log(`  ${partiesQuiz} parties de quiz IA`);
  console.log(`\nPar filière (seuil d'anonymat = ${config.SEUIL_ANONYMAT} pour apparaître au tableau de bord) :`);
  for (const f of parFiliere.sort((a, b) => b.participants - a.participants)) {
    if (f.participants > 0) console.log(`  ${f.participants >= config.SEUIL_ANONYMAT ? '✓' : '·'} ${f.libelle} : ${f.participants}`);
  }
  console.log('\nRien touché côté comptes admin, évènements ou vêtements (gérés à la main).');

  await app.close();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
