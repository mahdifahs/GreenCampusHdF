import { el, nombre, remplir } from './outils.js';

// ---------- Graphiques (SVG dessiné à la main : aucune bibliothèque, compatible avec la CSP) ----------

const SVG_NS = 'http://www.w3.org/2000/svg';
function svg(tag, attributs = {}, ...enfants) {
  const e = document.createElementNS(SVG_NS, tag);
  for (const [k, v] of Object.entries(attributs)) {
    if (v === undefined || v === null || v === false) continue;
    if (k.startsWith('on')) e.addEventListener(k.slice(2), v);
    else e.setAttribute(k, v);
  }
  for (const enfant of enfants.flat(Infinity)) {
    if (enfant === null || enfant === undefined || enfant === false) continue;
    e.append(enfant instanceof Node ? enfant : String(enfant));
  }
  return e;
}

const JOUR_MS = 86_400_000;
const dateCourte = (iso) => new Date(`${iso}T12:00:00Z`).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' });
export const dateLongue = (iso) => new Date(`${iso}T12:00:00Z`).toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' });

// L'API ne renvoie que les jours avec de l'activité : on comble les trous avec des zéros pour que
// l'axe du temps soit régulier (un jour = même largeur), lu de gauche à droite.
export function joursContinus(quotidien) {
  const tries = [...quotidien].sort((a, b) => a.date.localeCompare(b.date));
  if (!tries.length) return [];
  const parDate = new Map(tries.map((j) => [j.date.slice(0, 10), j]));
  const jours = [];
  for (let t = Date.parse(`${tries[0].date.slice(0, 10)}T00:00:00Z`); t <= Date.parse(`${tries.at(-1).date.slice(0, 10)}T00:00:00Z`); t += JOUR_MS) {
    const date = new Date(t).toISOString().slice(0, 10);
    jours.push(parDate.get(date) ?? { date, inscriptions: 0, bilans: 0, engagements: 0, defisValides: 0, co2EviteKg: 0 });
  }
  return jours;
}

export const cumuler = (valeurs) => {
  let total = 0;
  return valeurs.map((v) => (total += v));
};

// Maximum « rond » de l'axe et ses graduations (0, 5, 10… ou 0, 20, 40…).
function echelle(max) {
  if (max <= 0) return { haut: 4, pas: 1 };
  const brut = max / 4;
  const puissance = 10 ** Math.floor(Math.log10(brut));
  const pas = [1, 2, 2.5, 5, 10].map((m) => m * puissance).find((p) => p >= brut);
  return { haut: pas * Math.ceil(max / pas), pas };
}

// Graphique en lignes : une ou plusieurs séries sur un même axe (même unité), légende et
// étiquettes en bout de courbe au-delà d'une série, ligne verticale + infobulle au survol
// (souris, doigt ou flèches du clavier). Redessiné à la largeur réelle de son cadre.
export function graphiqueLignes({ titre, jours, series, format = nombre }) {
  const cadre = el('div', { class: 'graphique' });
  const infobulle = el('div', { class: 'infobulle', role: 'status' });
  const plusieurs = series.length > 1;

  const dessiner = () => {
    const largeur = Math.max(280, cadre.clientWidth);
    const etroit = largeur < 520;
    const hauteur = etroit ? 220 : 260;
    const marge = { haut: 12, droite: plusieurs && !etroit ? 110 : 16, bas: 28, gauche: 44 };
    const l = largeur - marge.gauche - marge.droite;
    const h = hauteur - marge.haut - marge.bas;
    const n = jours.length;
    const { haut, pas } = echelle(Math.max(...series.flatMap((s) => s.valeurs)));
    const x = (i) => marge.gauche + (n === 1 ? l / 2 : (i * l) / (n - 1));
    const y = (v) => marge.haut + h - (v / haut) * h;

    const graduations = [];
    for (let v = 0; v <= haut + 1e-9; v += pas) {
      graduations.push(
        svg('line', { class: 'grille', x1: marge.gauche, x2: marge.gauche + l, y1: y(v), y2: y(v) }),
        svg('text', { class: 'axe', x: marge.gauche - 8, y: y(v), 'text-anchor': 'end', 'dominant-baseline': 'middle' }, format(v)),
      );
    }
    // Au plus 6 dates sous l'axe, réparties régulièrement (la première et la dernière toujours).
    const nbDates = Math.min(n, etroit ? 3 : 6);
    const indicesDates = n === 1 ? [0] : [...new Set(Array.from({ length: nbDates }, (_, k) => Math.round((k * (n - 1)) / Math.max(1, nbDates - 1))))];
    const dates = indicesDates.map((i) =>
      svg('text', { class: 'axe', x: x(i), y: hauteur - 8, 'text-anchor': n === 1 ? 'middle' : i === 0 ? 'start' : i === n - 1 ? 'end' : 'middle' }, dateCourte(jours[i].date)),
    );

    const avecPoints = n <= 20;
    const courbes = series.map((s) =>
      svg('g', { class: `serie ${s.classe}` },
        n > 1 ? svg('path', { d: s.valeurs.map((v, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)},${y(v).toFixed(1)}`).join(' ') }) : null,
        avecPoints || n === 1 ? s.valeurs.map((v, i) => svg('circle', { cx: x(i), cy: y(v), r: 4 })) : null,
      ),
    );

    // Étiquettes en bout de courbe, écartées d'au moins 15 px pour ne pas se chevaucher.
    let etiquettes = null;
    if (plusieurs && !etroit) {
      const positions = series.map((s) => ({ s, y: y(s.valeurs.at(-1)) })).sort((a, b) => a.y - b.y);
      for (let k = 1; k < positions.length; k++) positions[k].y = Math.max(positions[k].y, positions[k - 1].y + 15);
      const debordement = positions.at(-1).y - (marge.haut + h);
      if (debordement > 0) positions.forEach((p) => { p.y -= debordement; });
      etiquettes = positions.map((p) =>
        svg('text', { class: 'etiquette', x: x(n - 1) + 10, y: p.y, 'dominant-baseline': 'middle' }, `${p.s.libelle} ${format(p.s.valeurs.at(-1))}`),
      );
    }

    const repere = svg('line', { class: 'repere', y1: marge.haut, y2: marge.haut + h, visibility: 'hidden' });
    const marques = svg('g', { visibility: 'hidden' }, series.map((s) => svg('circle', { class: `marque ${s.classe}`, r: 5 })));

    let courant = null;
    const montrer = (i) => {
      courant = Math.max(0, Math.min(n - 1, i));
      repere.setAttribute('x1', x(courant));
      repere.setAttribute('x2', x(courant));
      repere.setAttribute('visibility', 'visible');
      marques.setAttribute('visibility', 'visible');
      [...marques.children].forEach((c, k) => { c.setAttribute('cx', x(courant)); c.setAttribute('cy', y(series[k].valeurs[courant])); });
      remplir(infobulle,
        el('div', { class: 'date' }, dateLongue(jours[courant].date)),
        series.map((s) => el('div', { class: 'ligne-infobulle' },
          plusieurs ? el('span', { class: `cle ${s.classe}` }) : null,
          el('strong', {}, format(s.valeurs[courant])),
          el('span', {}, s.libelle))));
      infobulle.classList.add('visible');
      const gauche = x(courant) + 12;
      const largeurBulle = infobulle.offsetWidth;
      infobulle.style.left = `${gauche + largeurBulle > largeur ? x(courant) - 12 - largeurBulle : gauche}px`;
      infobulle.style.top = `${marge.haut}px`;
    };
    const cacher = () => {
      courant = null;
      repere.setAttribute('visibility', 'hidden');
      marques.setAttribute('visibility', 'hidden');
      infobulle.classList.remove('visible');
    };
    const indiceSous = (ev) => {
      const r = zoneSurvol.getBoundingClientRect();
      const px = ((ev.clientX - r.left) / r.width) * largeur;
      return n === 1 ? 0 : Math.round(((px - marge.gauche) / l) * (n - 1));
    };
    const zoneSurvol = svg('rect', {
      class: 'survol', x: 0, y: 0, width: largeur, height: hauteur, tabindex: 0,
      'aria-label': `${titre} : survole ou utilise les flèches pour lire les valeurs jour par jour`,
      onpointermove: (ev) => montrer(indiceSous(ev)),
      onpointerdown: (ev) => montrer(indiceSous(ev)),
      onpointerleave: cacher,
      onblur: cacher,
      onfocus: () => montrer(n - 1),
      onkeydown: (ev) => {
        if (ev.key === 'ArrowLeft' || ev.key === 'ArrowRight') {
          ev.preventDefault();
          montrer((courant ?? n - 1) + (ev.key === 'ArrowLeft' ? -1 : 1));
        } else if (ev.key === 'Escape') cacher();
      },
    });

    remplir(cadre,
      svg('svg', { width: largeur, height: hauteur, viewBox: `0 0 ${largeur} ${hauteur}`, role: 'img', 'aria-label': titre },
        graduations, dates, courbes, etiquettes, repere, marques, zoneSurvol),
      infobulle);
  };

  // Redessiné quand la largeur change (rotation du téléphone, fenêtre redimensionnée).
  let derniereLargeur = 0;
  new ResizeObserver(() => {
    if (cadre.clientWidth !== derniereLargeur) {
      derniereLargeur = cadre.clientWidth;
      dessiner();
    }
  }).observe(cadre);

  return el('figure', { class: 'figure-graphique' },
    el('figcaption', {}, el('h4', {}, titre),
      plusieurs ? el('ul', { class: 'legende' }, series.map((s) => el('li', {}, el('span', { class: `cle ${s.classe}` }), s.libelle))) : null),
    cadre);
}
