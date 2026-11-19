import { api, aujourdhui, dialogue, el, notifier, remplir } from './outils.js';

// ---------- Jour J : personnes venues ----------

// Journée affichée : celle choisie dans le sélecteur, sinon aujourd'hui (recalculé à chaque
// affichage, pour qu'un onglet resté ouvert depuis la veille passe bien au jour suivant).
let standDateChoisie = null;

export async function afficherStand(zone) {
  const standDate = standDateChoisie ?? aujourdhui();
  const c = await (await api('GET', `/compteurs/${standDate}`)).json();

  const agir = async (promesse) => {
    try {
      await promesse();
      await afficherStand(zone);
    } catch (e) {
      notifier(e.message);
    }
  };

  remplir(
    zone,
    el('h2', {}, 'Jour J : personnes venues'),
    el(
      'div',
      { class: 'carte' },
      el('label', {}, 'Journée'),
      el('input', {
        type: 'date',
        value: standDate,
        max: aujourdhui(),
        onchange: (ev) => { standDateChoisie = ev.target.value === aujourdhui() ? null : ev.target.value; afficherStand(zone); },
      }),
    ),
    el(
      'div',
      { class: 'carte' },
      el('h3', {}, 'Personnes venues'),
      el('div', { class: 'gros-chiffre' }, c.personnesVenues),
      el(
        'div',
        { class: 'actions' },
        el('button', {
          class: 'secondaire',
          disabled: c.personnesVenues <= 0,
          onclick: () => agir(() => api('POST', `/compteurs/${standDate}/incrementer`, { delta: -1 })),
        }, '−1'),
        el('button', { onclick: () => agir(() => api('POST', `/compteurs/${standDate}/incrementer`, { delta: 1 })) }, '+1'),
        el('button', {
          class: 'secondaire',
          onclick: async () => {
            const r = await dialogue({
              titre: 'Modifier le total',
              champs: [{ nom: 'valeur', libelle: 'Nombre de personnes venues', type: 'number', min: 0, step: 1, requis: true, valeur: c.personnesVenues }],
              valider: 'Enregistrer',
            });
            if (r) agir(() => api('PATCH', `/compteurs/${standDate}`, { valeur: Number(r.valeur) }));
          },
        }, 'Modifier le total'),
      ),
    ),
  );
}
