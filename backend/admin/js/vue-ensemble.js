import { NOMS_CATEGORIES, api, barre, chiffre, el, kg, nombre, notifier, remplir, tableau, telecharger } from './outils.js';
import { cumuler, dateLongue, graphiqueLignes, joursContinus } from './graphiques.js';
import { bandeauAlertes } from './vue-securite.js';

const EXPORTS = [
  { jeu: 'quotidien', titre: 'Activité par jour', aide: 'Inscriptions, bilans, engagements, défis validés et CO2 évité, jour par jour (graphiques de la vidéo).' },
  { jeu: 'bilans', titre: 'Bilans', aide: 'Un bilan par ligne : filière, année, type, total et détail par poste.' },
  { jeu: 'questionnaire', titre: 'Questions d’information', aide: 'Une réponse par ligne : bilan, filière, année, question, réponse (questions hors calcul de l’empreinte).' },
  { jeu: 'engagements', titre: 'Défis', aide: 'Un engagement par ligne : défi, semaine, statut, CO2 évité.' },
  { jeu: 'suivis', titre: 'Questionnaires de suivi', aide: 'Réponses J+7 et J+14, une colonne par question.' },
  { jeu: 'participants', titre: 'Participants', aide: 'Filière, année, date d’inscription et nombre de bilans, défis et suivis.' },
  { jeu: 'quiz', titre: 'Quiz IA', aide: 'Une réponse par ligne : partie (anonyme), question, choix, bonne ou mauvaise réponse.' },
  { jeu: 'stand', titre: 'Personnes venues (jour J)', aide: 'Un jour d’événement par ligne : nombre de personnes venues.' },
  { jeu: 'vetements', titre: 'Vêtements récoltés et donnés', aide: 'Une ligne par jour/type/matière : quantités, poids moyen et facteur d’émission utilisés.' },
  { jeu: 'securite', titre: 'Journal de sécurité', aide: 'Événements de sécurité des 30 derniers jours (contient des adresses IP : ne pas diffuser).' },
];

// ---------- Vue d'ensemble ----------

// « Par jour » ou « Cumulé », gardé quand on change d'onglet puis revient.
let modeActivite = 'cumule';


function carteChiffresCles(s) {
  const e = s.evenement;
  return el(
    'div',
    { class: 'carte chiffres-cles' },
    el('section', {},
      el('h3', {}, 'Participation'),
      el('div', { class: 'kpis' },
        chiffre(s.participants, 'participants'),
        chiffre(s.bilans, 'bilans'),
        chiffre(s.engagements, 'engagements'),
        chiffre(s.defisValides, 'défis validés'),
        chiffre(kg(s.co2EviteKg), 'CO2 évité (défis)')),
      s.participantsExclus ? el('p', { class: 'aide' }, `${s.participantsExclus} compte(s) exclu(s) des statistiques, non comptés.`) : null),
    el('section', {},
      el('h3', {}, 'Stand'),
      el('div', { class: 'kpis' },
        chiffre(e.personnesVenues, 'personnes venues'),
        chiffre(e.vetementsRecuperes, 'vêtements récupérés'),
        chiffre(e.vetementsDonnes, 'vêtements donnés'),
        chiffre(kg(e.poidsVetementsKg), 'de vêtements'),
        chiffre(kg(e.co2EviteVetementsKg), 'CO2 évité (vêtements)')),
      el('p', { class: 'aide' }, e.joursDeStand
        ? `Cumul de ${e.joursDeStand} journée(s) de stand.${e.donneesVetementsIncompletes ? ' CO2 des vêtements sous-estimé : certains n’ont pas de poids ou de facteur d’émission.' : ''}`
        : 'Rien de saisi dans Jour J et Vêtements pour l’instant.')),
  );
}

function carteActivite(s, zone) {
  const jours = joursContinus(s.quotidien);
  if (!jours.length) {
    return el('div', { class: 'carte' }, el('h3', {}, 'Activité'), el('p', { class: 'aide' }, 'Aucune activité pour le moment.'));
  }
  const cumul = modeActivite === 'cumule';
  const valeurs = (cle) => (cumul ? cumuler(jours.map((j) => j[cle])) : jours.map((j) => j[cle]));
  const choix = (mode, libelle) =>
    el('button', { type: 'button', class: modeActivite === mode ? 'actif' : null, 'aria-pressed': modeActivite === mode ? 'true' : 'false',
      onclick: () => { modeActivite = mode; afficherTableau(zone); } }, libelle);

  return el(
    'div',
    { class: 'carte' },
    el('div', { class: 'entete-carte' },
      el('h3', {}, 'Activité'),
      el('div', { class: 'bascule', role: 'group', 'aria-label': 'Affichage' }, choix('jour', 'Par jour'), choix('cumule', 'Cumulé'))),
    el('p', { class: 'aide' }, cumul
      ? `Totaux cumulés depuis le ${dateLongue(jours[0].date)}, jour après jour.`
      : 'Ce qui s’est passé chaque jour. Survole un graphique pour lire les valeurs.'),
    el('div', { class: 'graphiques' },
      graphiqueLignes({
        titre: 'Participants et défis',
        jours,
        series: [
          { libelle: 'Inscriptions', classe: 's1', valeurs: valeurs('inscriptions') },
          { libelle: 'Bilans', classe: 's2', valeurs: valeurs('bilans') },
          { libelle: 'Engagements', classe: 's3', valeurs: valeurs('engagements') },
          { libelle: 'Défis validés', classe: 's4', valeurs: valeurs('defisValides') },
        ],
      }),
      // Des kilos, pas des personnes : graphique séparé (jamais deux échelles sur un même graphique).
      graphiqueLignes({
        titre: 'CO2 évité par les défis (kg)',
        jours,
        series: [{ libelle: 'CO2 évité', classe: 'co2', valeurs: valeurs('co2EviteKg') }],
        format: (v) => `${nombre(v)} kg`,
      })),
    el('details', {},
      el('summary', {}, 'Voir les chiffres jour par jour'),
      tableau(
        el('thead', {}, el('tr', {}, ['Date', 'Inscriptions', 'Bilans', 'Engagements', 'Défis validés', 'CO2 évité'].map((t, i) => el('th', { class: i ? 'nombre' : null }, t)))),
        el('tbody', {}, [...jours].reverse().map((j) =>
          el('tr', {}, el('td', {}, new Date(`${j.date.slice(0, 10)}T12:00:00Z`).toLocaleDateString('fr-FR')),
            [j.inscriptions, j.bilans, j.engagements, j.defisValides, kg(j.co2EviteKg)].map((v) => el('td', { class: 'nombre' }, v))))),
      )),
  );
}

export async function afficherTableau(zone) {
  const [s, securite] = await Promise.all([
    api('GET', '/stats').then((r) => r.json()),
    api('GET', '/securite?parPage=1').then((r) => r.json()),
  ]);

  remplir(
    zone,
    el('h2', {}, 'Vue d’ensemble'),
    bandeauAlertes(securite.alertes),
    carteChiffresCles(s),
    carteActivite(s, zone),
    carteRappels(s.rappels),

    el(
      'div',
      { class: 'carte' },
      el('h3', {}, 'Défis'),
      el('p', { class: 'aide' }, 'Décocher un défi le retire du catalogue proposé aux étudiants (les engagements existants sont conservés).'),
      tableau(
        el('thead', {}, el('tr', {}, ['Actif', 'Défi', 'Catégorie', 'Choisi', 'Validé', 'Non tenu', 'CO2 évité'].map((t, i) => el('th', { class: i > 2 ? 'nombre' : null }, t)))),
        el('tbody', {}, s.defis.map((d) =>
          el(
            'tr',
            {},
            el('td', {}, el('input', {
              type: 'checkbox',
              checked: d.actif,
              'aria-label': `Activer ${d.titre}`,
              onchange: async (ev) => {
                try {
                  await api('PATCH', `/defis/${d.id}`, { actif: ev.target.checked });
                } catch (e) {
                  ev.target.checked = !ev.target.checked;
                  notifier(e.message);
                }
              },
            })),
            el('td', {}, d.titre),
            el('td', {}, NOMS_CATEGORIES[d.categorie] ?? d.categorie),
            [d.engagements, d.valides, d.nonTenus, kg(d.co2EviteKg)].map((v) => el('td', { class: 'nombre' }, v)),
          ),
        )),
      ),
    ),

    el(
      'div',
      { class: 'carte' },
      el('h3', {}, `Quiz IA (${s.quiz.parties} partie${s.quiz.parties > 1 ? 's' : ''})`),
      s.quiz.questions.map((q) => {
        const max = Math.max(1, ...q.repartition.map((r) => r.nombre));
        return el('div', { class: 'question' }, el('label', {}, `${q.question} (${q.tauxReussite} % de bonnes réponses)`),
          q.repartition.map((r) => barre(`${r.texte}${r.correct ? ' (bonne réponse)' : ''}`, r.nombre, max)));
      }),
    ),

    s.suivis.map((etape) =>
      el(
        'div',
        { class: 'carte' },
        el('h3', {}, `Questionnaire ${etape.etape} (${etape.nbReponses} réponse${etape.nbReponses > 1 ? 's' : ''})`),
        etape.questions.map((q) => {
          const max = Math.max(1, ...q.repartition.map((r) => r.nombre));
          return el('div', { class: 'question' }, el('label', {}, q.question), q.repartition.map((r) => barre(r.libelle, r.nombre, max)));
        }),
      ),
    ),

    el(
      'div',
      { class: 'carte' },
      el('h3', {}, 'Exports CSV'),
      el('p', { class: 'aide' }, 'Fichiers lisibles directement dans Excel ou LibreOffice. Les participants n’y figurent que par un identifiant aléatoire : ne pas les publier tels quels.'),
      EXPORTS.map((x) => {
        const bouton = el('button', { class: 'secondaire' }, `Télécharger « ${x.titre} »`);
        bouton.addEventListener('click', () => telecharger(x.jeu, bouton));
        return el('div', { class: 'defi' }, el('div', {}, x.titre, el('small', {}, x.aide)), bouton);
      }),
    ),
  );
}

function carteRappels(r) {
  return el(
    'div',
    { class: 'carte' },
    el('h3', {}, 'Rappels (notifications)'),
    el('div', { class: 'kpis' },
      chiffre(r.participantsAbonnes, 'participants abonnés'),
      chiffre(r.abonnements, 'appareils'),
      r.etapes.map((e) => [
        chiffre(e.relancesEnvoyees, `relances ${e.etape === 'J7' ? 'J+7' : 'J+14'} envoyées`),
        chiffre(e.questionnairesRemplis, `questionnaires ${e.etape === 'J7' ? 'J+7' : 'J+14'} remplis`),
      ])),
    el('p', { class: 'aide' }, 'Une relance part 7 puis 14 jours après le premier bilan, une seule fois par étape. Les questionnaires remplis comptent aussi les personnes revenues sans rappel : un ordre d’idée, pas une mesure exacte.'),
  );
}
