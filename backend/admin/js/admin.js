import { api, confirmer, contenu, el, estBenevole, etat, libelleRole, notifier, remplir } from './outils.js';
import { afficherAnnonce } from './vue-annonce.js';
import { afficherComptesAdmin } from './vue-comptes.js';
import { afficherTableau } from './vue-ensemble.js';
import { afficherEvenements } from './vue-evenements.js';
import { afficherJournal } from './vue-journal.js';
import { afficherParticipants } from './vue-participants.js';
import { afficherQuestionnaire } from './vue-questionnaire.js';
import { afficherSecurite } from './vue-securite.js';
import { afficherStand } from './vue-stand.js';
import { afficherVetements } from './vue-vetements.js';

// Interface d'administration de l'équipe GreenCampus (point d'entrée) : session, navigation entre
// les onglets et mode maintenance. Chaque onglet vit dans son module vue-*.js ; les outils communs
// (DOM, dialogues, appels API, état de la session) dans outils.js.

async function seDeconnecter() {
  etat.connecte = false;
  etat.moi = null;
  // Seule l'API peut effacer un cookie HttpOnly. En cas d'échec réseau, le cookie (sans durée)
  // disparaîtra à la fermeture du navigateur, et le jeton expire de toute façon après 12 h.
  await fetch('/api/admin/session', { method: 'DELETE' }).catch(() => {});
  afficherConnexion();
}

function afficherSession() {
  remplir(
    document.getElementById('session'),
    etat.connecte
      ? [
          etat.moi ? el('span', { class: 'aide' }, `${etat.moi.prenom} (${libelleRole(etat.moi.role).toLowerCase()})`) : null,
          el('button', { onclick: () => void seDeconnecter() }, 'Se déconnecter'),
        ]
      : null,
  );
}

function afficherConnexion(message) {
  afficherSession();
  const erreur = el('div');
  const form = el(
    'form',
    {
      class: 'carte',
      onsubmit: async (ev) => {
        ev.preventDefault();
        try {
          const donnees = new FormData(ev.target);
          await api('POST', '/session', { motDePasse: donnees.get('motDePasse'), nom: donnees.get('nom') });
          etat.connecte = true;
          await afficherApp();
        } catch (e) {
          remplir(erreur, el('div', { class: 'alerte erreur' }, e.message));
        }
      },
    },
    el('h2', {}, 'Connexion'),
    message ? el('div', { class: 'alerte attention' }, message) : null,
    erreur,
    el('label', {}, 'Ton prénom'),
    el('input', { name: 'nom', autocomplete: 'username', required: true, minlength: 2, maxlength: 40 }),
    el('label', {}, 'Ton mot de passe personnel'),
    el('input', { type: 'password', name: 'motDePasse', autocomplete: 'current-password', required: true }),
    el('div', { class: 'actions' }, el('button', {}, 'Se connecter')),
  );
  remplir(contenu, form);
}

// ---------- Navigation ----------

const VUES_BASE = [
  ['ensemble', 'Vue d’ensemble'],
  ['evenements', 'Évènements'],
  ['annonce', 'Message du site'],
  ['questionnaire', 'Questionnaire'],
  ['stand', 'Jour J'],
  ['vetements', 'Vêtements'],
  ['participants', 'Participants'],
  ['journal', 'Journal'],
  ['securite', 'Sécurité'],
];
// Onglet gardé dans l'adresse (#vetements…) : recharger la page ne ramène plus à la Vue d'ensemble.
let vueCourante = location.hash.slice(1) || 'ensemble';
// Un bénévole ne voit que la saisie du stand (le serveur refuse de toute façon le reste).
const VUES_BENEVOLE = [
  ['stand', 'Jour J'],
  ['vetements', 'Vêtements'],
];
const onglets = () => {
  if (estBenevole()) return VUES_BENEVOLE;
  return etat.moi?.role === 'SUPER_ADMIN' ? [...VUES_BASE, ['comptes-admin', 'Comptes admin']] : VUES_BASE;
};

// Barre de navigation. Sur PC : tous les onglets visibles, sur plusieurs lignes si besoin (pas de
// défilement horizontal). Sur téléphone (CSS, max-width 760px) : un bouton « Menu · page courante »
// qui ouvre la liste des pages autorisées pour ce rôle. Échap ou un clic à côté referment la liste.
function navigation(vue) {
  const titreCourant = onglets().find(([id]) => id === vue)?.[1] ?? '';
  const bouton = el(
    'button',
    { type: 'button', class: 'menu-bouton', 'aria-expanded': 'false', 'aria-controls': 'liste-onglets' },
    el('span', { class: 'menu-icone', 'aria-hidden': 'true' }, '☰'),
    'Menu',
    el('span', { class: 'menu-separateur', 'aria-hidden': 'true' }, '·'),
    el('span', { class: 'menu-courant' }, titreCourant),
  );
  const liste = el(
    'ul',
    { id: 'liste-onglets', class: 'liste-onglets' },
    onglets().map(([id, titre]) =>
      el(
        'li',
        {},
        el('button', {
          type: 'button',
          class: id === vue ? 'actif' : null,
          'data-onglet': id,
          'aria-current': id === vue ? 'page' : null,
          onclick: () => {
            fermer(false);
            afficherApp(id, { focusNavigation: true });
          },
        }, titre),
      ),
    ),
  );
  const nav = el('nav', { id: 'onglets', 'aria-label': 'Pages de l’administration' }, bouton, liste);

  function surTouche(ev) {
    if (ev.key === 'Escape') fermer(true);
  }
  function surClic(ev) {
    if (!nav.contains(ev.target)) fermer(false);
  }
  function fermer(rendreFocus) {
    document.removeEventListener('keydown', surTouche);
    document.removeEventListener('click', surClic, true);
    if (!nav.classList.contains('ouvert')) return;
    nav.classList.remove('ouvert');
    bouton.setAttribute('aria-expanded', 'false');
    if (rendreFocus) bouton.focus();
  }
  bouton.addEventListener('click', () => {
    if (nav.classList.contains('ouvert')) return fermer(true);
    nav.classList.add('ouvert');
    bouton.setAttribute('aria-expanded', 'true');
    (liste.querySelector('[aria-current="page"]') ?? liste.querySelector('button')).focus();
    document.addEventListener('keydown', surTouche);
    document.addEventListener('click', surClic, true);
  });
  return nav;
}

// Après un changement de page depuis la navigation, le focus clavier reste sur la navigation : sur
// l'onglet actif (PC) ou sur le bouton Menu (téléphone, liste refermée).
function remettreFocusNavigation() {
  const actif = document.querySelector('#onglets [aria-current="page"]');
  const cible = actif && actif.offsetParent !== null ? actif : document.querySelector('#onglets .menu-bouton');
  cible?.focus();
}

// ---------- Mode maintenance (visible depuis tous les onglets) ----------

async function afficherMaintenance(zone) {
  let etatSite;
  try {
    etatSite = await (await api('GET', '/maintenance')).json();
  } catch {
    return remplir(zone, null);
  }
  const basculer = async (actif) => {
    const question = actif
      ? 'Les étudiants verront une page « Site en maintenance » et ne pourront plus rien faire tant que tu ne l’auras pas remis en ligne. L’administration reste accessible.'
      : 'Le site redevient utilisable pour tout le monde.';
    if (!(await confirmer(actif ? 'Passer en maintenance ?' : 'Remettre le site en ligne ?', question, actif ? 'Passer en maintenance' : 'Remettre en ligne', actif))) return;
    try {
      await api('PUT', '/maintenance', { actif });
    } catch (e) {
      notifier(e.message);
    }
    await afficherMaintenance(zone);
  };
  remplir(
    zone,
    etatSite.actif
      ? el(
          'div',
          { class: 'alerte erreur maintenance' },
          el('span', {}, el('strong', {}, 'Site en maintenance'), ` depuis le ${new Date(etatSite.depuis).toLocaleString('fr-FR', { dateStyle: 'short', timeStyle: 'short' })}${etatSite.par ? ` (activé par ${etatSite.par})` : ''}. Les étudiants ne peuvent rien faire.`),
          el('button', { onclick: () => basculer(false) }, 'Remettre le site en ligne'),
        )
      : el(
          'div',
          { class: 'maintenance en-ligne' },
          el('span', {}, 'Site en ligne.'),
          el('button', { class: 'secondaire', onclick: () => basculer(true) }, 'Passer en maintenance'),
        ),
  );
}

async function afficherApp(vue = vueCourante, { focusNavigation = false } = {}) {
  if (!etat.moi) {
    try {
      etat.moi = await (await api('GET', '/moi')).json();
    } catch {
      etat.moi = null;
    }
  }
  // Onglet inconnu, ou fermé à ce rôle : retour au premier onglet autorisé.
  if (!onglets().some(([id]) => id === vue)) vue = onglets()[0][0];
  vueCourante = vue;
  history.replaceState(null, '', `#${vue}`);
  afficherSession();
  const zone = el('div');
  const zoneMaintenance = el('div');
  remplir(
    contenu,
    zoneMaintenance,
    navigation(vue),
    zone,
  );
  if (focusNavigation) remettreFocusNavigation();
  // Le mode maintenance ne concerne pas les bénévoles (route fermée à leur rôle).
  if (!estBenevole()) void afficherMaintenance(zoneMaintenance);
  try {
    await {
      ensemble: afficherTableau,
      evenements: afficherEvenements,
      annonce: afficherAnnonce,
      questionnaire: afficherQuestionnaire,
      stand: afficherStand,
      vetements: afficherVetements,
      participants: afficherParticipants,
      journal: afficherJournal,
      securite: afficherSecurite,
      'comptes-admin': afficherComptesAdmin,
    }[vue](zone);
  } catch (e) {
    if (etat.connecte) remplir(zone, el('div', { class: 'alerte erreur' }, e.message));
  }
}


// api() renvoie vers l'écran de connexion quand la session a expiré.
etat.surSessionExpiree = afficherConnexion;

// Au chargement, on demande à l'API si le cookie de session est encore valide.
api('GET', '/moi')
  .then(async (r) => {
    etat.moi = await r.json();
    etat.connecte = true;
    await afficherApp();
  })
  .catch(() => afficherConnexion());
