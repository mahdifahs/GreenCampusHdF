import { api, confirmer, el, nombre, notifier, remplir, tableau } from './outils.js';

// ---------- Questionnaire du bilan ----------
// Questions du modèle ADEME (comptées dans l'empreinte) et questions « information » de l'équipe
// (hors calcul, statistiques anonymes). Ouvert à tous les comptes admin, pas aux bénévoles.

const GROUPES = [
  ['transport', 'Transport'],
  ['alimentation', 'Alimentation'],
  ['logement', 'Logement'],
  ['divers', 'Divers'],
  ['services sociétaux', 'Services sociétaux'],
  ['information', 'Questions d’information (hors calcul)'],
];
// Limite technique de l'API quand le modèle ne fixe pas de plafond (VALEUR_MAX dans lib/ngc.ts).
const SANS_MAXIMUM = 10_000_000;
const nomGroupe = (categorie) => GROUPES.find(([id]) => id === categorie)?.[1] ?? categorie;

let enEdition = null; // id de la question en cours de modification
let typeAjout = 'ADEME';
let recherche = '';
let resultats = null; // résultats de la dernière recherche dans le modèle

const nombreOuVide = (v) => (v === '' || v === null ? undefined : Number(v));
const lignesChoix = (texte) => texte.split('\n').map((c) => c.trim()).filter(Boolean);

function texteBornes(q) {
  if (q.format === 'nombre') return `${nombre(q.min ?? 0)} à ${nombre(q.max ?? 0)}${q.unite ? ` ${q.unite}` : ''}`;
  if (q.format === 'oui-non') return 'Oui / Non';
  return q.choix.join(' · ');
}

function texteStatistiques(s) {
  if (!s) return null;
  if (!s.repondants) return 'Aucune réponse pour le moment.';
  if (s.type === 'nombre') {
    return `${s.repondants} répondant(s) · moyenne ${nombre(s.moyenne)} · médiane ${nombre(s.mediane)} · de ${nombre(s.min)} à ${nombre(s.max)}`;
  }
  return `${s.repondants} répondant(s) · ${s.repartition.map((r) => `${r.valeur} : ${r.nombre}`).join(' · ')}`;
}

async function agir(zone, action, succes) {
  try {
    await action();
    if (succes) notifier(succes, 'info');
  } catch (e) {
    notifier(e.message);
  }
  await afficherQuestionnaire(zone);
}

// ---------- Formulaire d'ajout ----------

function formulaireAjout(zone) {
  const choixType = el(
    'div',
    { class: 'bascule', role: 'group', 'aria-label': 'Type de question' },
    [
      ['ADEME', 'Question du modèle ADEME'],
      ['INFORMATION', 'Question d’information'],
    ].map(([id, titre]) =>
      el('button', { type: 'button', class: id === typeAjout ? 'actif' : null, 'aria-pressed': String(id === typeAjout), onclick: () => { typeAjout = id; afficherQuestionnaire(zone); } }, titre),
    ),
  );

  if (typeAjout === 'ADEME') {
    const form = el(
      'form',
      {
        onsubmit: async (ev) => {
          ev.preventDefault();
          recherche = new FormData(ev.target).get('recherche').trim();
          try {
            resultats = await (await api('GET', `/questionnaire/modele?recherche=${encodeURIComponent(recherche)}`)).json();
          } catch (e) {
            notifier(e.message);
          }
          afficherQuestionnaire(zone);
        },
      },
      el('label', { for: 'recherche-modele' }, 'Chercher dans le modèle (mots du texte ou du nom technique)'),
      el('div', { class: 'ligne-recherche' }, el('input', { id: 'recherche-modele', name: 'recherche', maxlength: 100, value: recherche, placeholder: 'ex. vélo, thé, vacances' }), el('button', {}, 'Chercher')),
    );
    return el(
      'div',
      { class: 'carte' },
      el('h3', {}, 'Ajouter une question'),
      choixType,
      el('p', { class: 'aide' }, 'Comptée dans l’empreinte avec les chiffres de l’ADEME. Sans réponse, elle prend la moyenne française du modèle. Tu pourras ensuite reformuler le texte et resserrer les bornes.'),
      form,
      resultats === null
        ? null
        : resultats.length
          ? tableau(
              el('thead', {}, el('tr', {}, ['Question du modèle', 'Catégorie', 'Réponses possibles', ''].map((t) => el('th', {}, t)))),
              el(
                'tbody',
                {},
                resultats.map((r) =>
                  el(
                    'tr',
                    {},
                    el('td', {}, r.question, el('small', { class: 'source' }, r.dottedName)),
                    el('td', {}, nomGroupe(r.categorie)),
                    el('td', {}, texteBornes({ format: r.type, min: r.min, max: r.max, unite: r.unite, choix: r.choix })),
                    el(
                      'td',
                      {},
                      el('button', {
                        type: 'button',
                        onclick: () => agir(zone, async () => {
                          await api('POST', '/questionnaire', { type: 'ADEME', dottedName: r.dottedName });
                          resultats = resultats.filter((x) => x.dottedName !== r.dottedName);
                        }, 'Question ajoutée à la fin de sa catégorie.'),
                      }, 'Ajouter'),
                    ),
                  ),
                ),
              ),
            )
          : el('p', { class: 'aide' }, 'Aucune question du modèle ne correspond (ou elles sont déjà toutes dans le questionnaire).'),
    );
  }

  const form = el(
    'form',
    {
      onsubmit: (ev) => {
        ev.preventDefault();
        const d = new FormData(ev.target);
        const format = d.get('format');
        const corps = { type: 'INFORMATION', texte: d.get('texte').trim(), format };
        if (format === 'NOMBRE') Object.assign(corps, { unite: d.get('unite').trim() || null, min: nombreOuVide(d.get('min')), max: nombreOuVide(d.get('max')) });
        else corps.choix = lignesChoix(d.get('choix'));
        agir(zone, () => api('POST', '/questionnaire', corps), 'Question ajoutée à la fin des questions d’information.');
      },
    },
    el('label', { for: 'info-texte' }, 'Question'),
    el('input', { id: 'info-texte', name: 'texte', required: true, minlength: 3, maxlength: 300 }),
    el('label', { for: 'info-format' }, 'Réponse attendue'),
    el(
      'select',
      {
        id: 'info-format',
        name: 'format',
        onchange: (ev) => {
          const nombreChoisi = ev.target.value === 'NOMBRE';
          form.querySelector('.champs-nombre').hidden = !nombreChoisi;
          form.querySelector('.champs-choix').hidden = nombreChoisi;
        },
      },
      el('option', { value: 'NOMBRE' }, 'Un nombre'),
      el('option', { value: 'CHOIX' }, 'Un choix dans une liste'),
    ),
    el(
      'div',
      { class: 'grille champs-nombre' },
      el('div', {}, el('label', { for: 'info-min' }, 'Minimum'), el('input', { id: 'info-min', name: 'min', type: 'number', min: 0, step: 'any', value: 0 })),
      el('div', {}, el('label', { for: 'info-max' }, 'Maximum'), el('input', { id: 'info-max', name: 'max', type: 'number', min: 0, step: 'any' })),
      el('div', {}, el('label', { for: 'info-unite' }, 'Unité (facultative)'), el('input', { id: 'info-unite', name: 'unite', maxlength: 30, placeholder: 'ex. h/semaine' })),
    ),
    el(
      'div',
      { class: 'champs-choix', hidden: true },
      el('label', { for: 'info-choix' }, 'Réponses possibles (une par ligne, 2 à 20)'),
      el('textarea', { id: 'info-choix', name: 'choix', rows: 4 }),
    ),
    el('div', { class: 'actions' }, el('button', {}, 'Ajouter la question')),
  );
  return el(
    'div',
    { class: 'carte' },
    el('h3', {}, 'Ajouter une question'),
    choixType,
    el('p', { class: 'aide' }, 'Ne change pas l’empreinte : les réponses servent seulement aux statistiques anonymes du projet (ci-dessous et export CSV). Pas de réponse libre, pour ne pas recueillir de données personnelles.'),
    form,
  );
}

// ---------- Formulaire de modification ----------

function formulaireModification(zone, q) {
  const estNombre = q.format === 'nombre';
  const estInfoChoix = q.type === 'INFORMATION' && q.format === 'choix';
  return el(
    'form',
    {
      class: 'carte',
      id: 'form-question',
      onsubmit: (ev) => {
        ev.preventDefault();
        const d = new FormData(ev.target);
        const corps = { texte: d.get('texte').trim() };
        if (estNombre) Object.assign(corps, { min: nombreOuVide(d.get('min')), max: nombreOuVide(d.get('max')) });
        if (estNombre && q.type === 'INFORMATION') corps.unite = d.get('unite').trim() || null;
        if (estInfoChoix) corps.choix = lignesChoix(d.get('choix'));
        agir(zone, async () => {
          await api('PATCH', `/questionnaire/${q.id}`, corps);
          enEdition = null;
        }, 'Question enregistrée.');
      },
    },
    el('h3', {}, 'Modifier la question'),
    q.nbReponses ? el('p', { class: 'aide' }, `${q.nbReponses} bilan(s) y ont déjà répondu : ils gardent leur réponse et leur total. Les changements valent pour les prochains bilans.`) : null,
    el('label', { for: 'q-texte' }, 'Texte affiché'),
    el('input', { id: 'q-texte', name: 'texte', required: true, minlength: 3, maxlength: 300, value: q.texte }),
    q.texteModele && q.texteModele !== q.texte ? el('p', { class: 'aide' }, `Texte d’origine du modèle : « ${q.texteModele} »`) : null,
    estNombre
      ? el(
          'div',
          { class: 'grille' },
          el('div', {}, el('label', { for: 'q-min' }, 'Minimum'), el('input', { id: 'q-min', name: 'min', type: 'number', step: 'any', required: true, min: q.limites?.min ?? 0, max: q.limites?.max, value: q.min ?? 0 })),
          el('div', {}, el('label', { for: 'q-max' }, 'Maximum'), el('input', { id: 'q-max', name: 'max', type: 'number', step: 'any', required: true, min: q.limites?.min ?? 0, max: q.limites?.max, value: q.max ?? '' })),
          q.type === 'INFORMATION' ? el('div', {}, el('label', { for: 'q-unite' }, 'Unité (facultative)'), el('input', { id: 'q-unite', name: 'unite', maxlength: 30, value: q.unite ?? '' })) : null,
        )
      : null,
    estNombre && q.limites
      ? el(
          'p',
          { class: 'aide' },
          q.limites.max >= SANS_MAXIMUM
            ? `Le modèle ADEME ne fixe pas de maximum pour cette question (minimum ${nombre(q.limites.min)}) : choisis une valeur réaliste.`
            : `Le modèle ADEME accepte de ${nombre(q.limites.min)} à ${nombre(q.limites.max)}${q.unite ? ` ${q.unite}` : ''}.`,
        )
      : null,
    estInfoChoix
      ? [
          el('label', { for: 'q-choix' }, 'Réponses possibles (une par ligne)'),
          el('textarea', { id: 'q-choix', name: 'choix', rows: Math.max(4, q.choix.length + 1) }, q.choix.join('\n')),
          el('p', { class: 'aide' }, 'Tu peux ajouter des réponses. Une réponse déjà choisie par des participants ne peut pas être retirée.'),
        ]
      : null,
    !estNombre && !estInfoChoix ? el('p', { class: 'aide' }, 'Les réponses possibles viennent du modèle ADEME et ne se modifient pas.') : null,
    el('p', { class: 'aide' }, 'Pour changer le type de réponse, crée une nouvelle question et désactive celle-ci.'),
    el(
      'div',
      { class: 'actions' },
      el('button', {}, 'Enregistrer'),
      el('button', { type: 'button', class: 'secondaire', onclick: () => { enEdition = null; afficherQuestionnaire(zone); } }, 'Annuler'),
    ),
  );
}

// ---------- Liste ----------

function tableGroupe(zone, questions) {
  return tableau(
    el('thead', {}, el('tr', {}, ['Question', 'Réponses possibles', 'Bilans', 'Statut', ''].map((t, i) => el('th', { class: i === 2 ? 'nombre' : null }, t)))),
    el(
      'tbody',
      {},
      questions.map((q, i) =>
        el(
          'tr',
          { class: q.actif ? null : 'inactive' },
          el(
            'td',
            {},
            q.texte,
            el('small', { class: 'source' }, q.dottedName ?? (q.format === 'choix' ? 'Choix dans une liste' : 'Nombre')),
            q.statistiques ? el('small', { class: 'source' }, texteStatistiques(q.statistiques)) : null,
          ),
          el('td', {}, texteBornes(q)),
          el('td', { class: 'nombre' }, q.nbReponses),
          el(
            'td',
            {},
            q.horsModele
              ? el('span', { class: 'statut NON_TENU' }, 'absente du modèle')
              : el('span', { class: q.actif ? 'statut' : 'statut EN_COURS' }, q.actif ? 'posée' : 'désactivée'),
          ),
          el(
            'td',
            {},
            el(
            'div',
            { class: 'actions-ligne' },
            el('button', { type: 'button', class: 'secondaire', disabled: i === 0, 'aria-label': `Monter « ${q.texte} »`, onclick: () => agir(zone, () => api('POST', `/questionnaire/${q.id}/deplacer`, { sens: 'haut' })) }, '↑'),
            el('button', { type: 'button', class: 'secondaire', disabled: i === questions.length - 1, 'aria-label': `Descendre « ${q.texte} »`, onclick: () => agir(zone, () => api('POST', `/questionnaire/${q.id}/deplacer`, { sens: 'bas' })) }, '↓'),
            el('button', { type: 'button', class: 'secondaire', onclick: () => { enEdition = q.id; afficherQuestionnaire(zone).then(() => document.getElementById('form-question')?.scrollIntoView({ behavior: 'smooth' })); } }, 'Modifier'),
            el(
              'button',
              {
                type: 'button',
                class: 'secondaire',
                onclick: async () => {
                  if (q.actif && !(await confirmer('Désactiver cette question ?', 'Elle ne sera plus posée. Les réponses déjà données sont gardées et les bilans existants ne changent pas. Tu pourras la réactiver.', 'Désactiver', false))) return;
                  agir(zone, () => api('PATCH', `/questionnaire/${q.id}`, { actif: !q.actif }), q.actif ? 'Question désactivée.' : 'Question réactivée.');
                },
              },
              q.actif ? 'Désactiver' : 'Réactiver',
            ),
            el(
              'button',
              {
                type: 'button',
                class: 'danger',
                disabled: q.nbReponses > 0,
                title: q.nbReponses > 0 ? 'Des participants y ont déjà répondu : désactive-la plutôt.' : null,
                onclick: async () => {
                  if (!(await confirmer('Supprimer cette question ?', `« ${q.texte} » sera retirée définitivement du questionnaire.`, 'Supprimer'))) return;
                  agir(zone, () => api('DELETE', `/questionnaire/${q.id}`), 'Question supprimée.');
                },
              },
              'Supprimer',
            ),
            ),
          ),
        ),
      ),
    ),
  );
}

export async function afficherQuestionnaire(zone) {
  const questions = await (await api('GET', '/questionnaire')).json();
  const edition = enEdition ? questions.find((q) => q.id === enEdition) : null;
  const groupes = GROUPES.map(([id, titre]) => [titre, questions.filter((q) => q.categorie === id)]).filter(([, qs]) => qs.length);
  const autres = questions.filter((q) => !GROUPES.some(([id]) => id === q.categorie));
  if (autres.length) groupes.push(['Autres', autres]);

  remplir(
    zone,
    el('h2', {}, 'Questionnaire du bilan'),
    el(
      'p',
      { class: 'aide' },
      'Les changements s’appliquent aux prochains bilans (environ 10 secondes pour apparaître sur le site). Les bilans déjà enregistrés gardent leur total. Une question à laquelle des participants ont répondu ne peut pas être supprimée : désactive-la, ses réponses sont gardées.',
    ),
    edition ? formulaireModification(zone, edition) : formulaireAjout(zone),
    groupes.map(([titre, qs]) =>
      el('div', { class: 'carte' }, el('h3', {}, `${titre} (${qs.filter((q) => q.actif).length} posée(s) sur ${qs.length})`), tableGroupe(zone, qs)),
    ),
  );
}
