// Outils communs de l'interface d'administration : état de la session, construction du DOM,
// messages et fenêtres de dialogue, appels à l'API, petits formats d'affichage.

// État partagé entre les modules (un module ne peut pas réaffecter une variable importée).
// connecte : une session est ouverte (le jeton lui-même est dans un cookie HttpOnly, invisible ici).
// moi : identité du compte connecté ({ prenom, role }), chargée une fois après la connexion.
// surSessionExpiree : appelé par api() sur un 401, branché par admin.js sur l'écran de connexion.
export const etat = { connecte: false, moi: null, surSessionExpiree: null };

export const NOMS_CATEGORIES = { TRANSPORT: 'Transport', ALIMENTATION: 'Alimentation', LOGEMENT: 'Logement', DIVERS: 'Divers', NUMERIQUE: 'Numérique' };

const LIBELLES_ROLES = { SUPER_ADMIN: 'Super-admin', ADMIN: 'Admin', BENEVOLE: 'Bénévole' };
export const libelleRole = (role) => LIBELLES_ROLES[role] ?? role;

export function el(tag, attributs = {}, ...enfants) {
  const e = document.createElement(tag);
  for (const [k, v] of Object.entries(attributs)) {
    if (v === undefined || v === null || v === false) continue;
    if (k.startsWith('on')) e.addEventListener(k.slice(2), v);
    else if (k === 'class') e.className = v;
    // Via le CSSOM : autorisé par la CSP, contrairement à un attribut style en ligne.
    else if (k === 'style') e.style.cssText = v;
    else e.setAttribute(k, v === true ? '' : v);
  }
  for (const enfant of enfants.flat(Infinity)) {
    if (enfant === null || enfant === undefined || enfant === false) continue;
    e.append(enfant instanceof Node ? enfant : String(enfant));
  }
  return e;
}
export const remplir = (zone, ...enfants) => zone.replaceChildren(...enfants.flat(Infinity).filter((x) => x !== null && x !== undefined && x !== false));
export const kg = (v) => `${v.toLocaleString('fr-FR', { maximumFractionDigits: v < 100 ? 1 : 0 })} kg`;
export const nombre = (v) => v.toLocaleString('fr-FR', { maximumFractionDigits: 2 });
export const contenu = document.getElementById('contenu');

// Date du jour à l'heure locale (et non UTC : entre minuit et 1 h, toISOString() donnait la veille).
export function aujourdhui() {
  const d = new Date();
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

// Tableau dans un conteneur qui défile horizontalement : sur téléphone, les tableaux larges ne
// font plus déborder toute la page.
export const tableau = (...enfants) => el('div', { class: 'defilement' }, el('table', {}, ...enfants));

// ---------- Messages et fenêtres de dialogue (à la place de alert/confirm/prompt) ----------

const zoneNotifications = el('div', { class: 'notifications', role: 'status', 'aria-live': 'polite' });
document.body.append(zoneNotifications);

export function notifier(message, genre = 'erreur') {
  const n = el('div', { class: `alerte ${genre}` }, el('span', {}, message), el('button', { type: 'button', class: 'fermer', 'aria-label': 'Fermer', onclick: () => n.remove() }, '×'));
  zoneNotifications.append(n);
  setTimeout(() => n.remove(), genre === 'erreur' ? 8000 : 4000);
}

// Fenêtre modale : renvoie les valeurs des champs (objet), ou null si la personne annule
// (bouton Annuler, touche Échap). Aucun champ : renvoie {} pour « confirmé ».
export function dialogue({ titre, texte, champs = [], valider = 'Valider', annuler = 'Annuler', danger = false }) {
  return new Promise((resoudre) => {
    let resultat = null;
    const form = el(
      'form',
      {
        method: 'dialog',
        onsubmit: (ev) => {
          ev.preventDefault();
          resultat = Object.fromEntries(new FormData(ev.target));
          boite.close();
        },
      },
      el('h3', {}, titre),
      texte ? el('p', { class: 'aide' }, texte) : null,
      champs.map((c) => [
        el('label', { for: `dlg-${c.nom}` }, c.libelle),
        el('input', { id: `dlg-${c.nom}`, name: c.nom, type: c.type ?? 'text', value: c.valeur ?? '', min: c.min, max: c.max, step: c.step, required: c.requis, maxlength: c.maxlength }),
      ]),
      el(
        'div',
        { class: 'actions' },
        el('button', { class: danger ? 'danger' : null }, valider),
        el('button', { type: 'button', class: 'secondaire', onclick: () => boite.close() }, annuler),
      ),
    );
    const boite = el('dialog', { class: 'dialogue', onclose: () => { boite.remove(); resoudre(resultat); } }, form);
    document.body.append(boite);
    boite.showModal();
    (boite.querySelector('input') ?? boite.querySelector('button.secondaire')).focus();
  });
}

export const confirmer = async (titre, texte, valider, danger = true) => (await dialogue({ titre, texte, valider, danger })) !== null;

export async function api(methode, url, corps) {
  const reponse = await fetch(`/api/admin${url}`, {
    method: methode,
    headers: {
      ...(corps !== undefined && { 'content-type': 'application/json' }),
    },
    body: corps !== undefined ? JSON.stringify(corps) : undefined,
  });
  if (reponse.status === 401 && etat.connecte) {
    etat.connecte = false;
    etat.moi = null;
    etat.surSessionExpiree?.('Session expirée, reconnecte-toi.');
    throw new Error('Session expirée');
  }
  if (!reponse.ok) {
    const json = await reponse.json().catch(() => null);
    throw new Error(json?.message ?? `Erreur ${reponse.status}`);
  }
  return reponse;
}

export function barre(libelle, valeur, max, texte) {
  return el(
    'div',
    { class: 'barre' },
    el('span', {}, libelle),
    el('div', { class: 'jauge' }, el('div', { style: `width:${max ? (100 * valeur) / max : 0}%` })),
    el('span', { class: 'valeur' }, texte ?? valeur),
  );
}

export async function telecharger(jeu, bouton) {
  bouton.disabled = true;
  try {
    const reponse = await api('GET', `/export/${jeu}`);
    const nom = /filename="([^"]+)"/.exec(reponse.headers.get('content-disposition') ?? '')?.[1] ?? `${jeu}.csv`;
    const lien = el('a', { href: URL.createObjectURL(await reponse.blob()), download: nom });
    lien.click();
    URL.revokeObjectURL(lien.href);
  } catch (e) {
    notifier(e.message);
  } finally {
    bouton.disabled = false;
  }
}

// Identité et rôle du compte connecté.
export const estBenevole = () => etat.moi?.role === 'BENEVOLE';
// Valeur d'un <input type="datetime-local"> (heure locale du navigateur).
export function versDatetimeLocal(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export const date = (d) => (d ? new Date(d).toLocaleString('fr-FR', { dateStyle: 'short', timeStyle: 'short' }) : '—');

export const chiffre = (valeur, libelle) => el('div', { class: 'kpi' }, el('strong', {}, valeur), el('span', {}, libelle));
