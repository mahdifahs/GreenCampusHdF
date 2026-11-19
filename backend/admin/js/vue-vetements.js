import { api, aujourdhui, confirmer, dialogue, el, estBenevole, kg, nombre, notifier, remplir, tableau } from './outils.js';

// ---------- Vêtements (récolte et don, par type et matière) ----------

let vetementsDateChoisie = null; // même principe que standDateChoisie
let typeEnEdition = null;
let matiereEnEdition = null;

function bandeauBilanVetements(b) {
  return el(
    'div',
    { class: 'carte' },
    el('h3', {}, 'Bilan CO2 (cumulé depuis le début de la collecte)'),
    b.donneesIncompletes
      ? el('div', { class: 'alerte attention' }, 'Certains types ou matières utilisés n’ont pas encore de poids moyen ou de facteur d’émission renseigné ci-dessous : ce bilan est donc sous-estimé.')
      : null,
    el(
      'div',
      { class: 'chiffres' },
      [
        [kg(b.poidsRecupereKg), 'récupérés (kg)'],
        [kg(b.poidsDonneKg), 'donnés (kg)'],
        [kg(b.co2EviteRecupereKg), 'CO2 évité (récolte)'],
        [kg(b.co2EviteDonneKg), 'CO2 évité (don)'],
      ].map(([v, t]) => el('div', { class: 'carte' }, el('div', { class: 'gros-chiffre' }, v), el('small', {}, t))),
    ),
    b.parMatiere.length
      ? tableau(
          el('thead', {}, el('tr', {}, ['Matière', 'kg récupérés', 'kg donnés', 'CO2 évité'].map((t, i) => el('th', { class: i ? 'nombre' : null }, t)))),
          el('tbody', {}, b.parMatiere.map((m) => el('tr', {},
            el('td', {}, m.matiere), el('td', { class: 'nombre' }, kg(m.kgRecupere)), el('td', { class: 'nombre' }, kg(m.kgDonne)), el('td', { class: 'nombre' }, kg(m.co2EviteKg)),
          ))),
        )
      : el('p', { class: 'aide' }, 'Aucune quantité enregistrée pour le moment.'),
  );
}

function formulaireSaisieQuantite(jour, typesActifs, matieresActives, agir) {
  if (!typesActifs.length || !matieresActives.length) {
    return el('div', { class: 'carte' }, el('p', { class: 'aide' }, 'Crée au moins un type et une matière actifs ci-dessous avant de pouvoir saisir des quantités.'));
  }
  return el(
    'form',
    {
      class: 'carte',
      onsubmit: (ev) => {
        ev.preventDefault();
        const donnees = new FormData(ev.target);
        const typeId = Number(donnees.get('typeId'));
        const matiereId = Number(donnees.get('matiereId'));
        const sens = donnees.get('sens');
        const quantite = Number(donnees.get('quantite'));
        if (!Number.isInteger(quantite) || quantite <= 0) return notifier('Quantité entière positive attendue.');
        agir(() => api('POST', `/vetements/quantites/${jour}/incrementer`, { typeId, matiereId, sens, delta: quantite }));
      },
    },
    el('h3', {}, 'Ajouter une quantité'),
    el('p', { class: 'aide' }, 'Pour une nouvelle combinaison type et matière. Elle apparaît ensuite dans le tableau du jour, avec des boutons −1 et +1 pour aller vite.'),
    el(
      'div',
      { class: 'grille' },
      el('div', {}, el('label', {}, 'Type'), el('select', { name: 'typeId' }, typesActifs.map((t) => el('option', { value: t.id }, t.nom)))),
      el('div', {}, el('label', {}, 'Matière'), el('select', { name: 'matiereId' }, matieresActives.map((m) => el('option', { value: m.id }, m.nom)))),
      el('div', {}, el('label', {}, 'Sens'), el('select', { name: 'sens' }, el('option', { value: 'recuperes' }, 'Récupéré (récolte)'), el('option', { value: 'donnes' }, 'Donné (don)'))),
      el('div', {}, el('label', {}, 'Quantité'), el('input', { type: 'number', name: 'quantite', min: 1, step: 1, required: true })),
    ),
    el('div', { class: 'actions' }, el('button', {}, 'Ajouter')),
  );
}

function tableQuantitesJour(jour, quantites, agir) {
  if (!quantites.length) return el('p', { class: 'aide' }, 'Rien de saisi pour cette journée.');
  const cle = (q) => ({ typeId: q.typeId, matiereId: q.matiereId });
  // Compteur −1 / valeur / +1 : la saisie la plus courante au stand se fait en un seul clic.
  const compteur = (q, sens, libelle) =>
    el(
      'div',
      { class: 'compteur' },
      el('button', {
        type: 'button',
        class: 'secondaire',
        disabled: q[sens] <= 0,
        'aria-label': `Retirer 1 ${libelle} (${q.type}, ${q.matiere})`,
        onclick: () => agir(() => api('POST', `/vetements/quantites/${jour}/incrementer`, { ...cle(q), sens, delta: -1 })),
      }, '−1'),
      el('span', {}, q[sens]),
      el('button', {
        type: 'button',
        'aria-label': `Ajouter 1 ${libelle} (${q.type}, ${q.matiere})`,
        onclick: () => agir(() => api('POST', `/vetements/quantites/${jour}/incrementer`, { ...cle(q), sens, delta: 1 })),
      }, '+1'),
    );
  const corriger = async (q) => {
    const r = await dialogue({
      titre: `Corriger « ${q.type}, ${q.matiere} »`,
      texte: 'Remplace directement les totaux de cette journée.',
      champs: [
        { nom: 'recuperes', libelle: 'Récupérés', type: 'number', min: 0, step: 1, requis: true, valeur: q.recuperes },
        { nom: 'donnes', libelle: 'Donnés', type: 'number', min: 0, step: 1, requis: true, valeur: q.donnes },
      ],
      valider: 'Enregistrer',
    });
    if (!r) return;
    agir(async () => {
      for (const sens of ['recuperes', 'donnes']) {
        const valeur = Number(r[sens]);
        if (valeur !== q[sens]) await api('PATCH', `/vetements/quantites/${jour}`, { ...cle(q), sens, valeur });
      }
    });
  };
  // Trois colonnes seulement, sans largeur minimale : sur téléphone, les deux compteurs restent
  // visibles sans faire défiler le tableau.
  return el('table', { class: 'quantites' },
    el('thead', {}, el('tr', {}, ['Vêtement', 'Récupérés', 'Donnés'].map((t) => el('th', {}, t)))),
    el('tbody', {}, quantites.map((q) => el('tr', {},
      el('td', {},
        el('strong', {}, q.type), el('small', { class: 'source' }, q.matiere),
        el('button', { type: 'button', class: 'lien', onclick: () => corriger(q) }, 'Corriger'),
      ),
      el('td', {}, compteur(q, 'recuperes', 'récupéré')),
      el('td', {}, compteur(q, 'donnes', 'donné')),
    ))),
  );
}

function formulaireType(edition, agir) {
  return el(
    'form',
    {
      id: 'form-type',
      class: 'carte',
      onsubmit: (ev) => {
        ev.preventDefault();
        const donnees = new FormData(ev.target);
        const corps = { nom: donnees.get('nom').trim(), poidsMoyenGrammes: donnees.get('poids') ? Number(donnees.get('poids')) : null };
        agir(async () => {
          if (edition) await api('PATCH', `/vetements/types/${edition.id}`, corps);
          else await api('POST', '/vetements/types', corps);
          typeEnEdition = null;
        });
      },
    },
    el('h3', {}, edition ? `Modifier « ${edition.nom} »` : 'Nouveau type de vêtement'),
    el('label', {}, 'Nom'),
    el('input', { name: 'nom', required: true, maxlength: 100, value: edition?.nom ?? '' }),
    el('label', {}, 'Poids moyen (grammes, facultatif pour l’instant)'),
    el('input', { type: 'number', name: 'poids', min: 1, max: 20000, step: 1, value: edition?.poidsMoyenGrammes ?? '' }),
    el('div', { class: 'actions' },
      el('button', {}, edition ? 'Enregistrer' : 'Créer'),
      edition ? el('button', { type: 'button', class: 'secondaire', onclick: () => { typeEnEdition = null; agir(async () => {}); } }, 'Annuler') : null,
    ),
  );
}

function formulaireMatiere(edition, agir) {
  return el(
    'form',
    {
      id: 'form-matiere',
      class: 'carte',
      onsubmit: (ev) => {
        ev.preventDefault();
        const donnees = new FormData(ev.target);
        const corps = {
          nom: donnees.get('nom').trim(),
          facteurEmissionKgCo2ParKg: donnees.get('facteur') ? Number(donnees.get('facteur')) : null,
          source: donnees.get('source').trim() || null,
        };
        agir(async () => {
          if (edition) await api('PATCH', `/vetements/matieres/${edition.id}`, corps);
          else await api('POST', '/vetements/matieres', corps);
          matiereEnEdition = null;
        });
      },
    },
    el('h3', {}, edition ? `Modifier « ${edition.nom} »` : 'Nouvelle matière'),
    el('label', {}, 'Nom'),
    el('input', { name: 'nom', required: true, maxlength: 100, value: edition?.nom ?? '' }),
    el('label', {}, 'Facteur d’émission (kg CO2e par kg de matière, facultatif pour l’instant)'),
    // step any : les facteurs Ecobalyse ont deux décimales (17,79), refusées avec un pas de 0,1.
    el('input', { type: 'number', name: 'facteur', min: 0, step: 'any', max: 1000, value: edition?.facteurEmissionKgCo2ParKg ?? '' }),
    el('label', {}, 'Source du chiffre (ex. « Ecobalyse (gouv.), simulation t-shirt 170 g, nov. 2026 »)'),
    el('input', { name: 'source', maxlength: 300, value: edition?.source ?? '' }),
    el('div', { class: 'actions' },
      el('button', {}, edition ? 'Enregistrer' : 'Créer'),
      edition ? el('button', { type: 'button', class: 'secondaire', onclick: () => { matiereEnEdition = null; agir(async () => {}); } }, 'Annuler') : null,
    ),
  );
}

function tableCategories(lignes, colonneValeur, edition, onEditer, onSupprimer, onActif) {
  return tableau(
    el('thead', {}, el('tr', {}, ['Nom', colonneValeur.titre, 'Actif', ''].map((t) => el('th', {}, t)))),
    el('tbody', {}, lignes.map((l) => el('tr', {},
      el('td', {}, l.nom),
      el('td', {}, colonneValeur.texte(l)),
      el('td', {}, el('input', {
        type: 'checkbox',
        checked: l.actif,
        'aria-label': `Activer ${l.nom}`,
        onchange: async (ev) => {
          try {
            await onActif(l, ev.target.checked);
          } catch (e) {
            ev.target.checked = !ev.target.checked;
            notifier(e.message);
          }
        },
      })),
      el('td', { class: 'actions' },
        el('button', { class: 'secondaire', onclick: () => onEditer(l) }, 'Modifier'),
        el('button', { class: 'danger', onclick: () => onSupprimer(l) }, 'Supprimer'),
      ),
    ))),
  );
}

export async function afficherVetements(zone) {
  const jour = vetementsDateChoisie ?? aujourdhui();
  const [bilanData, types, matieres, quantites] = await Promise.all([
    api('GET', '/vetements/bilan').then((r) => r.json()),
    api('GET', '/vetements/types').then((r) => r.json()),
    api('GET', '/vetements/matieres').then((r) => r.json()),
    api('GET', `/vetements/quantites/${jour}`).then((r) => r.json()),
  ]);

  const agir = async (promesse) => {
    try {
      await promesse();
      await afficherVetements(zone);
    } catch (e) {
      notifier(e.message);
    }
  };

  const supprimer = (jeu) => async (l) => {
    if (!(await confirmer(`Supprimer « ${l.nom} » ?`, 'Refusé s’il a déjà servi à une saisie : décoche alors « Actif » pour le masquer.', 'Supprimer'))) return;
    agir(() => api('DELETE', `/vetements/${jeu}/${l.id}`));
  };

  remplir(
    zone,
    el('h2', {}, 'Vêtements : récolte et don'),
    bandeauBilanVetements(bilanData),

    el('h3', {}, 'Saisie du jour'),
    el('div', { class: 'carte' },
      el('label', {}, 'Journée'),
      el('input', { type: 'date', value: jour, max: aujourdhui(), onchange: (ev) => { vetementsDateChoisie = ev.target.value === aujourdhui() ? null : ev.target.value; afficherVetements(zone); } }),
    ),
    formulaireSaisieQuantite(jour, types.filter((t) => t.actif), matieres.filter((m) => m.actif), agir),
    el('div', { class: 'carte' }, tableQuantitesJour(jour, quantites, agir)),

    // Catalogue (types, matières, poids, facteurs) : modifiable par les admins seulement.
    estBenevole() ? null : catalogueVetements(types, matieres, zone, agir, supprimer),
  );
  // Le formulaire de modification est en haut de sa section : on l'amène à l'écran (utile sur téléphone).
  if (typeEnEdition) document.getElementById('form-type')?.scrollIntoView({ block: 'center' });
  if (matiereEnEdition) document.getElementById('form-matiere')?.scrollIntoView({ block: 'center' });
}

function catalogueVetements(types, matieres, zone, agir, supprimer) {
  return [
    el('h3', {}, 'Types de vêtements'),
    formulaireType(typeEnEdition ? types.find((t) => t.id === typeEnEdition) : null, agir),
    el('div', { class: 'carte' }, tableCategories(
      types,
      { titre: 'Poids moyen', texte: (t) => (t.poidsMoyenGrammes == null ? '—' : `${t.poidsMoyenGrammes} g`) },
      typeEnEdition,
      (t) => { typeEnEdition = t.id; afficherVetements(zone); },
      supprimer('types'),
      (t, actif) => api('PATCH', `/vetements/types/${t.id}`, { actif }),
    )),

    el('h3', {}, 'Matières'),
    formulaireMatiere(matiereEnEdition ? matieres.find((m) => m.id === matiereEnEdition) : null, agir),
    el('div', { class: 'carte' }, tableCategories(
      matieres,
      {
        titre: 'Facteur (kg CO2e/kg) et source',
        texte: (m) => [m.facteurEmissionKgCo2ParKg == null ? '—' : nombre(m.facteurEmissionKgCo2ParKg), m.source ? el('small', { class: 'source' }, m.source) : null],
      },
      matiereEnEdition,
      (m) => { matiereEnEdition = m.id; afficherVetements(zone); },
      supprimer('matieres'),
      (m, actif) => api('PATCH', `/vetements/matieres/${m.id}`, { actif }),
    )),
  ];
}
