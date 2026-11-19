import { api, date, el, remplir, tableau, telecharger } from './outils.js';

// ---------- Journal ----------

const LIBELLES_ACTIONS = {
  EXCLURE_DES_STATISTIQUES: 'Exclusion des statistiques',
  REINTEGRER_DANS_LES_STATISTIQUES: 'Réintégration dans les statistiques',
  BLOQUER: 'Blocage',
  DEBLOQUER: 'Déblocage',
  SUPPRIMER_PARTICIPANT: 'Suppression du compte',
  ANNULER_DEFI: 'Annulation d’un défi',
  CREATION_COMPTE_ADMIN: 'Création d’un compte admin',
  BLOCAGE_COMPTE_ADMIN: 'Blocage d’un compte admin',
  DEBLOCAGE_COMPTE_ADMIN: 'Déblocage d’un compte admin',
  REINITIALISATION_MOT_DE_PASSE_ADMIN: 'Réinitialisation du mot de passe d’un compte admin',
  SUPPRESSION_COMPTE_ADMIN: 'Suppression d’un compte admin',
  CREATION_EVENEMENT: 'Création d’un évènement',
  MODIFICATION_EVENEMENT: 'Modification d’un évènement',
  SUPPRESSION_EVENEMENT: 'Suppression d’un évènement',
  SAISIE_COMPTEUR_JOUR: 'Saisie du nombre de personnes venues',
  CREATION_TYPE_VETEMENT: 'Création d’un type de vêtement',
  MODIFICATION_TYPE_VETEMENT: 'Modification d’un type de vêtement',
  SUPPRESSION_TYPE_VETEMENT: 'Suppression d’un type de vêtement',
  CREATION_MATIERE: 'Création d’une matière',
  MODIFICATION_MATIERE: 'Modification d’une matière',
  SUPPRESSION_MATIERE: 'Suppression d’une matière',
  CORRECTION_QUANTITE_VETEMENT: 'Correction d’une quantité de vêtements',
  MAINTENANCE_ACTIVEE: 'Site mis en maintenance',
  MAINTENANCE_DESACTIVEE: 'Site remis en ligne',
  ANNONCE_PUBLIEE: 'Publication du message d’information',
  ANNONCE_RETIREE: 'Retrait du message d’information',
  ANNONCE_ENREGISTREE: 'Message d’information enregistré sans publication',
};

// PostgreSQL (jsonb) réordonne les clés : on remet « avant » devant « apres » pour la lecture.
function detailsLisibles(details) {
  const ordre = (k) => (k === 'avant' ? 0 : k === 'apres' ? 1 : -1);
  return Object.entries(details)
    .sort(([a], [b]) => ordre(a) - ordre(b))
    .map(([k, v]) => `${k} : ${v ?? '—'}`)
    .join(' · ');
}

const filtresJournal = { auteur: '', action: '', du: '', au: '' };

export async function afficherJournal(zone) {
  const params = new URLSearchParams(Object.entries(filtresJournal).filter(([, v]) => v));
  const [actions, disponibles] = await Promise.all([
    api('GET', `/journal${params.size ? `?${params}` : ''}`).then((r) => r.json()),
    api('GET', '/journal/filtres').then((r) => r.json()),
  ]);
  const changer = (nom) => (ev) => { filtresJournal[nom] = ev.target.value; afficherJournal(zone); };
  const exporter = el('button', { class: 'secondaire', type: 'button' }, 'Exporter tout le journal (CSV)');
  exporter.addEventListener('click', () => telecharger('journal', exporter));
  const filtreActif = Object.values(filtresJournal).some(Boolean);

  remplir(
    zone,
    el('h2', {}, 'Journal des actions de l’équipe'),
    el('p', { class: 'aide' }, 'Les 200 dernières actions correspondant aux filtres (modération, comptes admin, évènements, vêtements, corrections des compteurs), avec le prénom du compte. Les +1/-1 tapés au stand ne sont pas listés. L’export contient tout le journal ; le pseudo des participants y est remplacé par « participant ».'),
    el(
      'div',
      { class: 'carte filtres' },
      el('select', { 'aria-label': 'Filtrer par membre', onchange: changer('auteur') },
        el('option', { value: '' }, 'Tous les membres'),
        disponibles.auteurs.map((a) => el('option', { value: a, selected: filtresJournal.auteur === a }, a))),
      el('select', { 'aria-label': 'Filtrer par action', onchange: changer('action') },
        el('option', { value: '' }, 'Toutes les actions'),
        disponibles.actions.map((a) => el('option', { value: a, selected: filtresJournal.action === a }, LIBELLES_ACTIONS[a] ?? a))),
      el('label', {}, 'Du ', el('input', { type: 'date', value: filtresJournal.du, max: filtresJournal.au || undefined, onchange: changer('du') })),
      el('label', {}, 'Au ', el('input', { type: 'date', value: filtresJournal.au, min: filtresJournal.du || undefined, onchange: changer('au') })),
      filtreActif
        ? el('button', { class: 'secondaire', type: 'button', onclick: () => { Object.keys(filtresJournal).forEach((k) => { filtresJournal[k] = ''; }); afficherJournal(zone); } }, 'Effacer les filtres')
        : null,
      exporter,
    ),
    el('p', { class: 'aide' }, `${actions.length}${actions.length === 200 ? ' (maximum affiché)' : ''} action(s)`),
    actions.length
      ? tableau(
          el('thead', {}, el('tr', {}, ['Date', 'Par', 'Action', 'Cible', 'Détails'].map((t) => el('th', {}, t)))),
          el('tbody', {}, actions.map((a) => el('tr', {},
            el('td', {}, date(a.createdAt)), el('td', {}, a.auteur), el('td', {}, LIBELLES_ACTIONS[a.action] ?? a.action), el('td', {}, a.cible),
            el('td', {}, a.details ? detailsLisibles(a.details) : ''),
          ))))
      : el('p', { class: 'aide' }, filtreActif ? 'Aucune action ne correspond à ces filtres.' : 'Aucune action pour le moment.'),
  );
}
