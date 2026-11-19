import { api, confirmer, date, el, notifier, remplir, tableau, versDatetimeLocal } from './outils.js';

// ---------- Évènements (page d'accueil publique) ----------

let evenementEnEdition = null;

export async function afficherEvenements(zone) {
  const liste = await (await api('GET', '/evenements')).json();
  const edition = evenementEnEdition ? liste.find((e) => e.id === evenementEnEdition) : null;

  const form = el(
    'form',
    {
      class: 'carte',
      onsubmit: async (ev) => {
        ev.preventDefault();
        const donnees = new FormData(ev.target);
        const debut = donnees.get('dateDebut');
        const fin = donnees.get('dateFin');
        const corps = {
          titre: donnees.get('titre').trim(),
          description: donnees.get('description').trim() || undefined,
          lieu: donnees.get('lieu').trim() || undefined,
          dateDebut: debut ? new Date(debut).toISOString() : undefined,
          dateFin: fin ? new Date(fin).toISOString() : null,
        };
        try {
          if (edition) await api('PATCH', `/evenements/${edition.id}`, corps);
          else await api('POST', '/evenements', corps);
          evenementEnEdition = null;
          await afficherEvenements(zone);
        } catch (e) {
          notifier(e.message);
        }
      },
    },
    el('h3', {}, edition ? `Modifier « ${edition.titre} »` : 'Nouvel évènement'),
    el('label', {}, 'Titre'),
    el('input', { name: 'titre', required: true, maxlength: 200, value: edition?.titre ?? '' }),
    el('label', {}, 'Description (facultative)'),
    el('textarea', { name: 'description', maxlength: 2000 }, edition?.description ?? ''),
    el('label', {}, 'Lieu (facultatif)'),
    el('input', { name: 'lieu', maxlength: 200, value: edition?.lieu ?? '' }),
    el('label', {}, 'Début'),
    el('input', { type: 'datetime-local', name: 'dateDebut', required: true, value: versDatetimeLocal(edition?.dateDebut) }),
    el('label', {}, 'Fin (facultative)'),
    el('input', { type: 'datetime-local', name: 'dateFin', value: versDatetimeLocal(edition?.dateFin) }),
    el(
      'div',
      { class: 'actions' },
      el('button', {}, edition ? 'Enregistrer' : 'Créer'),
      edition
        ? el('button', { type: 'button', class: 'secondaire', onclick: () => { evenementEnEdition = null; afficherEvenements(zone); } }, 'Annuler')
        : null,
    ),
  );

  remplir(
    zone,
    el('h2', {}, 'Évènements'),
    el('p', { class: 'aide' }, 'Un évènement n’apparaît sur la page d’accueil publique qu’une fois publié ; un brouillon reste invisible du public.'),
    form,
    el(
      'div',
      { class: 'carte' },
      liste.length
        ? tableau(
            el('thead', {}, el('tr', {}, ['Titre', 'Début', 'Fin', 'Lieu', 'Statut', ''].map((t) => el('th', {}, t)))),
            el(
              'tbody',
              {},
              liste.map((e) =>
                el(
                  'tr',
                  {},
                  el('td', {}, e.titre),
                  el('td', {}, date(e.dateDebut)),
                  el('td', {}, date(e.dateFin)),
                  el('td', {}, e.lieu ?? '—'),
                  el('td', {}, el('span', { class: e.statut === 'PUBLIE' ? 'statut' : 'statut EN_COURS' }, e.statut === 'PUBLIE' ? 'publié' : 'brouillon')),
                  el(
                    'td',
                    { class: 'actions' },
                    el(
                      'button',
                      {
                        class: 'secondaire',
                        onclick: async () => {
                          try {
                            await api('PATCH', `/evenements/${e.id}`, { statut: e.statut === 'PUBLIE' ? 'BROUILLON' : 'PUBLIE' });
                            await afficherEvenements(zone);
                          } catch (err) {
                            notifier(err.message);
                          }
                        },
                      },
                      e.statut === 'PUBLIE' ? 'Dépublier' : 'Publier',
                    ),
                    el('button', { class: 'secondaire', onclick: () => { evenementEnEdition = e.id; afficherEvenements(zone); } }, 'Modifier'),
                    el(
                      'button',
                      {
                        class: 'danger',
                        onclick: async () => {
                          if (!(await confirmer(`Supprimer « ${e.titre} » ?`, 'Il disparaît aussi de la page d’accueil. C’est définitif.', 'Supprimer'))) return;
                          try {
                            await api('DELETE', `/evenements/${e.id}`);
                            await afficherEvenements(zone);
                          } catch (err) {
                            notifier(err.message);
                          }
                        },
                      },
                      'Supprimer',
                    ),
                  ),
                ),
              ),
            ),
          )
        : el('p', { class: 'aide' }, 'Aucun évènement pour le moment.'),
    ),
  );
}
