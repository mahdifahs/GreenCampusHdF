import { api, confirmer, date, dialogue, el, kg, notifier, remplir, tableau } from './outils.js';

// ---------- Participants et modération ----------

const filtres = { recherche: '', filtre: 'tous', tri: 'recents', page: 1 };

function badges(p) {
  return [
    p.bloque ? el('span', { class: 'statut NON_TENU' }, 'bloqué') : null,
    p.exclu ? el('span', { class: 'statut EN_COURS' }, 'exclu des stats') : null,
    p.alertes.length ? el('span', { class: 'statut alerte', title: p.alertes.map((a) => a.message).join('\n') }, `${p.alertes.length} alerte(s)`) : null,
  ];
}

export async function afficherParticipants(zone) {
  const params = new URLSearchParams({ filtre: filtres.filtre, tri: filtres.tri, page: String(filtres.page), parPage: '50' });
  if (filtres.recherche) params.set('recherche', filtres.recherche);
  const r = await (await api('GET', `/participants?${params}`)).json();
  const pages = Math.max(1, Math.ceil(r.total / r.parPage));

  const choix = (nom, options) =>
    el('select', { onchange: (ev) => { filtres[nom] = ev.target.value; filtres.page = 1; afficherParticipants(zone); } },
      options.map(([v, t]) => el('option', { value: v, selected: filtres[nom] === v }, t)));

  remplir(
    zone,
    el('h2', {}, 'Participants'),
    el('p', { class: 'aide' }, 'Les alertes signalent un comportement inhabituel (défi validé juste après avoir été choisi, bilans en rafale, réponses invraisemblables, gain de CO2 anormal). Ce ne sont que des indices : à vérifier dans la fiche avant d’agir.'),
    el(
      'form',
      {
        class: 'carte filtres',
        onsubmit: (ev) => { ev.preventDefault(); filtres.recherche = new FormData(ev.target).get('recherche').trim(); filtres.page = 1; afficherParticipants(zone); },
      },
      el('input', { name: 'recherche', placeholder: 'Rechercher un pseudo', value: filtres.recherche }),
      choix('filtre', [['tous', 'Tous'], ['suspects', 'Avec alertes'], ['exclus', 'Exclus des stats'], ['bloques', 'Bloqués']]),
      choix('tri', [['recents', 'Plus récents'], ['alertes', 'Plus d’alertes'], ['co2', 'Plus de CO2 évité'], ['bilans', 'Plus de bilans']]),
      el('button', {}, 'Rechercher'),
    ),
    el('p', { class: 'aide' }, `${r.total} participant(s)`),
    tableau(
      el('thead', {}, el('tr', {}, ['Pseudo', 'Filière', 'Inscrit le', 'Bilans', 'Dernier bilan', 'Défis validés', 'CO2 évité', 'État', ''].map((t, i) => el('th', { class: [3, 4, 5, 6].includes(i) ? 'nombre' : null }, t)))),
      el('tbody', {}, r.participants.map((p) =>
        el(
          'tr',
          {},
          el('td', {}, p.pseudo),
          el('td', {}, `${p.filiere} (${p.annee})`),
          el('td', {}, date(p.createdAt)),
          el('td', { class: 'nombre' }, p.nbBilans),
          el('td', { class: 'nombre' }, p.dernierBilanKg === null ? '—' : `${(p.dernierBilanKg / 1000).toLocaleString('fr-FR', { maximumFractionDigits: 1 })} t`),
          el('td', { class: 'nombre' }, `${p.defisValides} / ${p.nbEngagements}`),
          el('td', { class: 'nombre' }, kg(p.co2EviteKg)),
          el('td', {}, badges(p)),
          el('td', {}, el('button', { class: 'secondaire', onclick: () => afficherFiche(p.id, zone) }, 'Fiche')),
        ),
      )),
    ),
    el(
      'div',
      { class: 'actions' },
      el('button', { class: 'secondaire', disabled: filtres.page <= 1, onclick: () => { filtres.page--; afficherParticipants(zone); } }, 'Page précédente'),
      el('span', { class: 'aide' }, `Page ${filtres.page} / ${pages}`),
      el('button', { class: 'secondaire', disabled: filtres.page >= pages, onclick: () => { filtres.page++; afficherParticipants(zone); } }, 'Page suivante'),
    ),
  );
}

async function afficherFiche(id, zone) {
  const p = await (await api('GET', `/participants/${id}`)).json();
  const agir = async (action) => {
    try {
      await action();
      await afficherFiche(id, zone);
    } catch (e) {
      notifier(e.message);
    }
  };
  // confirmation : [titre, texte, bouton] ; absente pour les actions qui annulent une sanction.
  const basculer = (champ, valeur, confirmation) => async () => {
    if (confirmation && !(await confirmer(...confirmation))) return;
    agir(() => api('PATCH', `/participants/${id}`, { [champ]: valeur }));
  };

  remplir(
    zone,
    el('div', { class: 'actions' }, el('button', { class: 'secondaire', onclick: () => afficherParticipants(zone) }, 'Retour à la liste')),
    el(
      'div',
      { class: 'carte' },
      el('h2', {}, p.pseudo, ' ', badges(p)),
      el('p', { class: 'aide' }, `${p.filiere}, ${p.annee}. Inscrit le ${date(p.createdAt)}, dernière visite le ${date(p.lastSeenAt)}. ${p.nbSuivis} questionnaire(s) de suivi rempli(s).`),
      p.alertes.length
        ? el('div', { class: 'alerte attention' }, el('strong', {}, 'Alertes'), el('ul', {}, p.alertes.map((a) => el('li', {}, a.message))))
        : el('div', { class: 'alerte info' }, 'Aucune alerte pour ce participant.'),
      el(
        'div',
        { class: 'actions' },
        p.exclu
          ? el('button', { class: 'secondaire', onclick: basculer('exclu', false) }, 'Réintégrer dans les statistiques')
          : el('button', { class: 'secondaire', onclick: basculer('exclu', true, ['Exclure des statistiques ?', 'Ce compte ne compte plus dans le tableau de bord ni le classement. Ses données sont conservées et la décision est réversible.', 'Exclure']) }, 'Exclure des statistiques'),
        p.bloque
          ? el('button', { class: 'secondaire', onclick: basculer('bloque', false) }, 'Débloquer')
          : el('button', { class: 'danger', onclick: basculer('bloque', true, ['Bloquer ce compte ?', 'Il ne pourra plus se connecter ni rien faire. Réversible avec « Débloquer ».', 'Bloquer']) }, 'Bloquer'),
        el('button', {
          class: 'danger',
          onclick: async () => {
            // Une seule fenêtre : Annuler arrête tout (avant, annuler la saisie du motif supprimait quand même).
            const r = await dialogue({
              titre: `Supprimer ${p.pseudo} ?`,
              texte: 'Le compte et toutes ses données (bilans, défis, suivis) sont effacés définitivement.',
              champs: [{ nom: 'motif', libelle: 'Motif (facultatif, enregistré dans le journal)', maxlength: 200 }],
              valider: 'Supprimer définitivement',
              danger: true,
            });
            if (!r) return;
            try {
              await api('DELETE', `/participants/${id}`, { motif: r.motif.trim() || undefined });
              await afficherParticipants(zone);
            } catch (e) {
              notifier(e.message);
            }
          },
        }, 'Supprimer le compte'),
      ),
    ),
    el(
      'div',
      { class: 'carte' },
      el('h3', {}, `Bilans (${p.bilans.length})`),
      tableau(
        el('thead', {}, el('tr', {}, ['Date', 'Type', 'Réponses', 'Empreinte', ''].map((t) => el('th', {}, t)))),
        el('tbody', {}, p.bilans.map((b) => el('tr', {},
          el('td', {}, date(b.createdAt)), el('td', {}, b.type), el('td', {}, b.nbReponses),
          el('td', {}, `${(b.totalKg / 1000).toLocaleString('fr-FR', { maximumFractionDigits: 1 })} t/an`),
          el('td', {}, b.invraisemblable ? el('span', { class: 'statut alerte' }, 'invraisemblable') : null),
        ))),
      ),
    ),
    el(
      'div',
      { class: 'carte' },
      el('h3', {}, `Défis (${p.engagements.length})`),
      tableau(
        el('thead', {}, el('tr', {}, ['Défi', 'Semaine', 'Choisi le', 'Répondu le', 'Statut', 'CO2', ''].map((t) => el('th', {}, t)))),
        el('tbody', {}, p.engagements.map((e) => el('tr', {},
          el('td', {}, e.defi), el('td', {}, new Date(e.semaine).toLocaleDateString('fr-FR')), el('td', {}, date(e.createdAt)),
          el('td', {}, date(e.reponduAt), e.validationRapide ? el('span', { class: 'statut alerte' }, 'rapide') : null),
          el('td', {}, el('span', { class: `statut ${e.statut}` }, e.statut.replace('_', ' ').toLowerCase())),
          el('td', {}, kg(e.co2EviteKgSemaine)),
          el('td', {}, el('button', {
            class: 'danger',
            onclick: async () => {
              const r = await dialogue({
                titre: `Annuler le défi « ${e.defi} » ?`,
                texte: 'Il sera retiré des résultats (CO2 évité, classement).',
                champs: [{ nom: 'motif', libelle: 'Motif (facultatif, enregistré dans le journal)', maxlength: 200 }],
                valider: 'Annuler le défi',
                annuler: 'Garder le défi',
                danger: true,
              });
              if (!r) return;
              agir(() => api('DELETE', `/engagements/${e.id}`, { motif: r.motif.trim() || undefined }));
            },
          }, 'Annuler')),
        ))),
      ),
    ),
  );
}
