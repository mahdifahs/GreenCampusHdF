import { api, confirmer, date, el, etat, libelleRole, notifier, remplir, tableau } from './outils.js';

// ---------- Comptes admin (réservé aux super-admins) ----------

// Mot de passe généré par une création/réinitialisation, affiché une seule fois puis effacé.
let motDePasseGenere = null;

function bandeauMotDePasse(zone) {
  if (!motDePasseGenere) return null;
  const { prenom, motDePasse } = motDePasseGenere;
  return el(
    'div',
    { class: 'alerte info' },
    el('strong', {}, `Mot de passe de « ${prenom} » : `),
    el('code', {}, motDePasse),
    '. Note-le maintenant : il ne sera plus affiché.',
    el(
      'div',
      { class: 'actions' },
      el('button', {
        type: 'button',
        onclick: async () => {
          // L'API presse-papiers n'existe qu'en HTTPS (ou sur localhost) : sinon on le dit.
          try {
            await navigator.clipboard.writeText(motDePasse);
            notifier('Mot de passe copié.', 'info');
          } catch {
            notifier('Copie impossible ici : sélectionne le mot de passe et copie-le à la main.');
          }
        },
      }, 'Copier'),
      el('button', { type: 'button', class: 'secondaire', onclick: () => { motDePasseGenere = null; afficherComptesAdmin(zone); } }, 'C’est noté'),
    ),
  );
}

export async function afficherComptesAdmin(zone) {
  const comptes = await (await api('GET', '/comptes-admin')).json();

  const form = el(
    'form',
    {
      class: 'carte',
      onsubmit: async (ev) => {
        ev.preventDefault();
        const donnees = new FormData(ev.target);
        try {
          const compte = await (await api('POST', '/comptes-admin', { prenom: donnees.get('prenom').trim(), role: donnees.get('role') })).json();
          motDePasseGenere = { prenom: compte.prenom, motDePasse: compte.motDePasse };
          await afficherComptesAdmin(zone);
        } catch (e) {
          notifier(e.message);
        }
      },
    },
    el('h3', {}, 'Nouveau compte'),
    el('label', {}, 'Prénom'),
    el('input', { name: 'prenom', required: true, minlength: 2, maxlength: 40 }),
    el('label', {}, 'Rôle'),
    el('select', { name: 'role' },
      el('option', { value: 'ADMIN', selected: true }, 'Admin'),
      el('option', { value: 'SUPER_ADMIN' }, 'Super-admin'),
      el('option', { value: 'BENEVOLE' }, 'Bénévole (Jour J et vêtements seulement)')),
    el('p', { class: 'aide' }, 'Un bénévole saisit les personnes venues et les vêtements au stand, rien d’autre : pas de statistiques, de participants, de journal ni de catalogue. Les comptes bénévoles ont leur propre limite, séparée de celle des admins.'),
    el('div', { class: 'actions' }, el('button', {}, 'Créer')),
  );

  remplir(
    zone,
    el('h2', {}, 'Comptes admin'),
    el('p', { class: 'aide' }, `${comptes.filter((c) => c.role !== 'BENEVOLE').length} compte(s) admin et ${comptes.filter((c) => c.role === 'BENEVOLE').length} bénévole(s). Un compte bloqué perd l’accès immédiatement, même avec une session déjà ouverte.`),
    bandeauMotDePasse(zone),
    form,
    el(
      'div',
      { class: 'carte' },
      tableau(
        el('thead', {}, el('tr', {}, ['Prénom', 'Rôle', 'Bloqué', 'Créé le', 'Dernière connexion', ''].map((t) => el('th', {}, t)))),
        el(
          'tbody',
          {},
          comptes.map((c) => {
            const soiMeme = c.prenom === etat.moi?.prenom;
            return el(
              'tr',
              {},
              el('td', {}, c.prenom),
              el('td', {}, libelleRole(c.role)),
              el(
                'td',
                {},
                el('input', {
                  type: 'checkbox',
                  checked: c.bloque,
                  disabled: soiMeme,
                  title: soiMeme ? 'Impossible de se bloquer soi-même' : undefined,
                  'aria-label': `Bloquer ${c.prenom}`,
                  onchange: async (ev) => {
                    try {
                      await api('PATCH', `/comptes-admin/${c.id}`, { bloque: ev.target.checked });
                      await afficherComptesAdmin(zone);
                    } catch (e) {
                      ev.target.checked = !ev.target.checked;
                      notifier(e.message);
                    }
                  },
                }),
              ),
              el('td', {}, date(c.createdAt)),
              el('td', {}, date(c.derniereConnexionAt)),
              el(
                'td',
                { class: 'actions' },
                el(
                  'button',
                  {
                    class: 'secondaire',
                    onclick: async () => {
                      const texte = soiMeme
                        ? 'Ton mot de passe actuel ne marchera plus et tes autres sessions (autres appareils) seront fermées ; celle-ci reste ouverte. Note bien le nouveau, affiché une seule fois.'
                        : `L’ancien mot de passe de ${c.prenom} ne marchera plus. Il faudra lui transmettre le nouveau, affiché une seule fois.`;
                      if (!(await confirmer(`Réinitialiser le mot de passe de « ${c.prenom} » ?`, texte, 'Réinitialiser'))) return;
                      try {
                        const res = await (await api('POST', `/comptes-admin/${c.id}/reinitialiser-mot-de-passe`)).json();
                        motDePasseGenere = { prenom: c.prenom, motDePasse: res.motDePasse };
                        await afficherComptesAdmin(zone);
                      } catch (e) {
                        notifier(e.message);
                      }
                    },
                  },
                  'Réinitialiser le mot de passe',
                ),
                soiMeme
                  ? null
                  : el(
                      'button',
                      {
                        class: 'danger',
                        onclick: async () => {
                          if (!(await confirmer(`Supprimer le compte de « ${c.prenom} » ?`, 'Cette personne ne pourra plus se connecter. C’est définitif ; son nom reste dans le journal.', 'Supprimer'))) return;
                          try {
                            await api('DELETE', `/comptes-admin/${c.id}`);
                            await afficherComptesAdmin(zone);
                          } catch (e) {
                            notifier(e.message);
                          }
                        },
                      },
                      'Supprimer',
                    ),
              ),
            );
          }),
        ),
      ),
    ),
  );
}
