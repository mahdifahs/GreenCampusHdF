import { api, confirmer, date, el, notifier, remplir, versDatetimeLocal } from './outils.js';

// ---------- Message du site (bandeau d'information sur toutes les pages publiques) ----------

const LONGUEUR_MAX = 300;
export const NIVEAUX = {
  INFO: { libelle: 'Info', symbole: 'i', aide: 'nouveauté, rappel' },
  ATTENTION: { libelle: 'Attention', symbole: '!', aide: 'version de test, changement à connaître' },
  IMPORTANT: { libelle: 'Important', symbole: '!', aide: 'coupure, problème en cours ; ne peut pas être masqué' },
};

// Même rendu que le bandeau du site (frontend/src/components/Annonce.tsx), pour l'aperçu.
const bandeau = (niveau, texte) =>
  el(
    'div',
    { class: `bandeau ${niveau}` },
    el('span', { class: 'pictogramme', 'aria-hidden': 'true' }, NIVEAUX[niveau].symbole),
    el('p', {}, el('strong', {}, `${NIVEAUX[niveau].libelle} : `), texte || '…'),
  );

function etatActuel(a) {
  if (!a) return el('p', { class: 'aide' }, 'Aucun message pour le moment.');
  if (a.expiree) return el('div', { class: 'alerte attention' }, `Date de fin passée (${date(a.fin)}) : le message n’est plus affiché.`);
  if (a.publiee) {
    return el(
      'div',
      { class: 'alerte info' },
      el('strong', {}, 'En ligne'),
      ` sur toutes les pages du site depuis le ${date(a.updatedAt)}${a.par ? ` (par ${a.par})` : ''}${a.fin ? `, jusqu’au ${date(a.fin)}` : ''}.`,
    );
  }
  return el('p', { class: 'aide' }, `Pas en ligne. Dernière modification le ${date(a.updatedAt)}${a.par ? ` par ${a.par}` : ''}.`);
}

export async function afficherAnnonce(zone) {
  const { annonce } = await (await api('GET', '/annonce')).json();
  const enLigne = annonce?.publiee && !annonce.expiree;

  const texte = el('textarea', { name: 'texte', required: true, maxlength: LONGUEUR_MAX }, annonce?.texte ?? '');
  const niveau = el(
    'select',
    { name: 'niveau' },
    Object.entries(NIVEAUX).map(([id, n]) => el('option', { value: id, selected: (annonce?.niveau ?? 'INFO') === id }, `${n.libelle} (${n.aide})`)),
  );
  const fin = el('input', { type: 'datetime-local', name: 'fin', value: annonce?.expiree ? '' : versDatetimeLocal(annonce?.fin) });
  const compteur = el('small', { class: 'aide' });
  const apercu = el('div');
  const rafraichir = () => {
    compteur.textContent = `${texte.value.length} / ${LONGUEUR_MAX} caractères`;
    remplir(apercu, bandeau(niveau.value, texte.value.trim()));
  };
  texte.addEventListener('input', rafraichir);
  niveau.addEventListener('change', rafraichir);
  rafraichir();

  const envoyer = async (publiee) => {
    const corps = {
      texte: texte.value.trim(),
      niveau: niveau.value,
      publiee,
      fin: fin.value ? new Date(fin.value).toISOString() : null,
    };
    if (!corps.texte) return notifier('Écris d’abord le message.');
    if (publiee && !(await confirmer(
      enLigne ? 'Mettre à jour le message ?' : 'Publier ce message ?',
      'Il s’affichera en haut de toutes les pages du site, pour tout le monde. Il remplace le message précédent.',
      enLigne ? 'Mettre à jour' : 'Publier',
      false,
    ))) return;
    try {
      await api('PUT', '/annonce', corps);
      notifier(publiee ? 'Message en ligne.' : enLigne ? 'Message retiré du site.' : 'Message enregistré, pas encore en ligne.', 'info');
      await afficherAnnonce(zone);
    } catch (e) {
      notifier(e.message);
    }
  };

  remplir(
    zone,
    el('h2', {}, 'Message du site'),
    el(
      'p',
      { class: 'aide' },
      'Un bandeau affiché en haut de toutes les pages du site public (pas dans l’administration). Un seul message à la fois : en publier un nouveau remplace l’ancien. Texte simple, sans lien.',
    ),
    etatActuel(annonce),
    el(
      'form',
      { class: 'carte', onsubmit: (ev) => { ev.preventDefault(); envoyer(true); } },
      el('label', {}, 'Message'),
      texte,
      compteur,
      el('label', {}, 'Type'),
      niveau,
      el('label', {}, 'Retirer automatiquement le (facultatif)'),
      fin,
      el('h3', {}, 'Aperçu'),
      apercu,
      el(
        'div',
        { class: 'actions' },
        el('button', {}, enLigne ? 'Mettre à jour' : 'Publier'),
        enLigne
          ? el('button', { type: 'button', class: 'danger', onclick: () => envoyer(false) }, 'Retirer du site')
          : el('button', { type: 'button', class: 'secondaire', onclick: () => envoyer(false) }, 'Enregistrer sans publier'),
      ),
    ),
  );
}
