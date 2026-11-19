import { api, date, el, remplir, tableau, telecharger } from './outils.js';

// ---------- Sécurité (OWASP A09) ----------

const LIBELLES_EVENEMENTS = {
  ADMIN_CONNEXION: 'Connexion admin',
  ADMIN_ECHEC_CONNEXION: 'Échec de connexion admin',
  ADMIN_VERROUILLE: 'Connexion admin verrouillée',
  ADMIN_ACCES_REFUSE: 'Accès admin refusé',
  ADMIN_ACCES_SUPER_REFUSE: 'Accès à la gestion des comptes refusé (pas super-admin)',
  ADMIN_ACCES_BENEVOLE_REFUSE: 'Accès refusé à un compte bénévole',
  ADMIN_COMPTE_BLOQUE_TENTATIVE: 'Tentative d’un compte admin bloqué',
  CODE_INVALIDE: 'Code de récupération invalide',
  TROP_DE_REQUETES: 'Limite de débit atteinte',
  COMPTE_BLOQUE_TENTATIVE: 'Tentative d’un compte bloqué',
  ADMIN_SESSION_FERMEE: 'Session admin déjà fermée réutilisée',
  ORIGINE_REFUSEE: 'Requête venue d’un autre site refusée',
};
const filtreSecurite = { type: '', page: 1 };

export function bandeauAlertes(alertes) {
  return alertes.length
    ? el('div', { class: 'alerte erreur' }, el('strong', {}, 'Alertes de sécurité (dernière heure)'), el('ul', {}, alertes.map((a) => el('li', {}, a.message))))
    : null;
}

export async function afficherSecurite(zone) {
  const params = new URLSearchParams({ page: String(filtreSecurite.page), parPage: '50' });
  if (filtreSecurite.type) params.set('type', filtreSecurite.type);
  const s = await (await api('GET', `/securite?${params}`)).json();
  const pages = Math.max(1, Math.ceil(s.total / s.parPage));
  const exporter = el('button', { class: 'secondaire' }, 'Exporter le journal (CSV)');
  exporter.addEventListener('click', () => telecharger('securite', exporter));

  remplir(
    zone,
    el('h2', {}, 'Sécurité'),
    el('p', { class: 'aide' }, 'Événements de sécurité enregistrés par l’API. Ils contiennent des adresses IP et sont supprimés automatiquement après 30 jours.'),
    bandeauAlertes(s.alertes) ?? el('div', { class: 'alerte info' }, 'Aucune alerte active sur la dernière heure.'),
    el('div', { class: 'carte' },
      el('h3', {}, 'Dernières 24 heures'),
      tableau(
        el('thead', {}, el('tr', {}, el('th', {}, 'Événement'), el('th', {}, 'Niveau'), el('th', { class: 'nombre' }, 'Nombre'))),
        el('tbody', {}, s.dernieres24h.map((t) => el('tr', {},
          el('td', {}, LIBELLES_EVENEMENTS[t.type] ?? t.type),
          el('td', {}, el('span', { class: `statut niveau-${t.niveau}` }, t.niveau)),
          el('td', { class: 'nombre' }, t.nombre),
        ))),
      ),
    ),
    el('div', { class: 'carte' },
      el('div', { class: 'actions' },
        el('select', { onchange: (ev) => { filtreSecurite.type = ev.target.value; filtreSecurite.page = 1; afficherSecurite(zone); } },
          el('option', { value: '' }, 'Tous les événements'),
          Object.entries(LIBELLES_EVENEMENTS).map(([v, t]) => el('option', { value: v, selected: filtreSecurite.type === v }, t))),
        exporter,
      ),
      el('p', { class: 'aide' }, `${s.total} événement(s)`),
      tableau(
        el('thead', {}, el('tr', {}, ['Date', 'Événement', 'Niveau', 'IP', 'Détails'].map((t) => el('th', {}, t)))),
        el('tbody', {}, s.evenements.map((e) => el('tr', {},
          el('td', {}, date(e.createdAt)),
          el('td', {}, LIBELLES_EVENEMENTS[e.type] ?? e.type),
          el('td', {}, el('span', { class: `statut niveau-${e.niveau}` }, e.niveau)),
          el('td', {}, e.ip ?? '—'),
          el('td', {}, e.details ? Object.entries(e.details).map(([k, v]) => `${k} : ${v}`).join(' · ') : ''),
        ))),
      ),
      el('div', { class: 'actions' },
        el('button', { class: 'secondaire', disabled: filtreSecurite.page <= 1, onclick: () => { filtreSecurite.page--; afficherSecurite(zone); } }, 'Page précédente'),
        el('span', { class: 'aide' }, `Page ${filtreSecurite.page} / ${pages}`),
        el('button', { class: 'secondaire', disabled: filtreSecurite.page >= pages, onclick: () => { filtreSecurite.page++; afficherSecurite(zone); } }, 'Page suivante'),
      ),
    ),
  );
}
