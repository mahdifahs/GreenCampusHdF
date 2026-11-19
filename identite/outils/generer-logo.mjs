// Génère tous les fichiers SVG du logo GreenCampus à partir d'une seule géométrie (charte v2, 13/11/2026).
//
// Usage (depuis un dossier où `opentype.js@1.3.4` est installé, pour vectoriser le texte) :
//   node <chemin>/identite/outils/generer-logo.mjs <police Unbounded 700 .woff> <dossier de sortie>
// La police se trouve dans frontend/node_modules/@fontsource/unbounded/files/unbounded-latin-700-normal.woff.
//
// La feuille est une seule forme blanche (règle de remplissage evenodd) : la nervure y est un trou, sans
// masque, pour que tous les logiciels (Canva, Illustrator, Inkscape, Word, imprimeurs) l'affichent pareil.
// Le texte est converti en tracés : aucune police n'est nécessaire pour ouvrir les fichiers.
import { mkdirSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { join } from 'node:path';

const require = createRequire(join(process.cwd(), '/'));
const opentype = require('opentype.js');
const [police, sortie] = process.argv.slice(2);
if (!police || !sortie) throw new Error('Usage : generer-logo.mjs <police .woff> <dossier de sortie>');
mkdirSync(sortie, { recursive: true });

const COULEURS = { haut: '#2fa47f', bas: '#0f4d3b', encre: '#16261e', corailVif: '#ff6b52', blanc: '#ffffff', corailClair: '#ff8268' };

// ---- Feuille : nervure centrale courbe, largeur max vers le premier tiers, miroir pour courber vers la gauche ----
function feuille(taille, centre = [32, 32]) {
  const bez = (p, t) => { const u = 1 - t; return [0, 1].map((k) => u * u * u * p[0][k] + 3 * u * u * t * p[1][k] + 3 * u * t * t * p[2][k] + t * t * t * p[3][k]); };
  const NERVURE = [[16, 50], [20, 36], [30, 18], [50, 15]], LARGEUR = 16, N = 80;
  const pts = [];
  for (let i = 0; i <= N; i++) {
    const t = i / N, [x, y] = bez(NERVURE, t), [x2, y2] = bez(NERVURE, Math.min(1, t + 0.001)), [x1, y1] = bez(NERVURE, Math.max(0, t - 0.001));
    let dx = x2 - x1, dy = y2 - y1; const n = Math.hypot(dx, dy) || 1; dx /= n; dy /= n;
    const w = t === 0 ? 0 : (LARGEUR / 2) * Math.pow(Math.sin(Math.PI * Math.pow(t, 0.75)), 0.9);
    pts.push({ t, x, y, nx: -dy, ny: dx, w });
  }
  const bord = (q, c, w = q.w) => [q.x + q.nx * w * c, q.y + q.ny * w * c];
  const tous = pts.flatMap((q) => [bord(q, 1), bord(q, -1)]);
  const xs = tous.map((q) => q[0]), ys = tous.map((q) => q[1]);
  const cx = (Math.min(...xs) + Math.max(...xs)) / 2, cy = (Math.min(...ys) + Math.max(...ys)) / 2;
  const k = taille / Math.max(Math.max(...xs) - Math.min(...xs), Math.max(...ys) - Math.min(...ys));
  const f = ([x, y]) => `${(centre[0] - (x - cx) * k).toFixed(3)} ${(centre[1] + (y - cy) * k).toFixed(3)}`;
  const contour = `M${pts.map((q) => f(bord(q, 1))).join('L')}L${[...pts].reverse().map((q) => f(bord(q, -1))).join('L')}Z`;
  // Nervure effilée jusqu'à 78 % ; sa demi-largeur ne dépasse jamais celle de la feuille (trou toujours inclus).
  const seg = pts.filter((q) => q.t > 0 && q.t <= 0.78);
  const r = (q) => Math.min(Math.pow(1 - q.t / 0.78, 0.85) * 1.5, q.w * 0.97);
  const nervure = `M${seg.map((q) => f(bord(q, 1, r(q)))).join('L')}L${[...seg].reverse().map((q) => f(bord(q, -1, r(q)))).join('L')}Z`;
  return `${contour}${nervure}`;
}

const degrade = (id) =>
  `<linearGradient id="${id}" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${COULEURS.haut}"/><stop offset="1" stop-color="${COULEURS.bas}"/></linearGradient>`;

// Icône dans un repère 64 × 64 placé en (x, y) à l'échelle s.
function icone({ x = 0, y = 0, s = 1, arrondi = 14, tailleFeuille = 48, id = 'gc-degrade', couleurFeuille = COULEURS.blanc } = {}) {
  return `<g transform="translate(${x} ${y}) scale(${s})"><rect width="64" height="64" rx="${arrondi}" fill="url(#${id})"/><path d="${feuille(tailleFeuille)}" fill="${couleurFeuille}" fill-rule="evenodd"/></g>`;
}

const svg = (largeur, hauteur, titre, contenu, defs = degrade('gc-degrade')) =>
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${largeur} ${hauteur}" width="${largeur}" height="${hauteur}" role="img" aria-label="${titre}">\n<title>${titre}</title>\n<defs>${defs}</defs>\n${contenu}\n</svg>\n`;

// ---- Texte vectorisé ----
const fonte = opentype.loadSync(police);
function texte(chaine, x, ligneDeBase, taille, couleur) {
  const p = fonte.getPath(chaine, x, ligneDeBase, taille);
  return { d: p.toPathData(3), largeur: fonte.getAdvanceWidth(chaine, taille), couleur };
}
function nom(x, ligneDeBase, taille, couleurs) {
  const green = texte('Green', x, ligneDeBase, taille, couleurs[0]);
  const campus = texte('Campus', x + green.largeur, ligneDeBase, taille, couleurs[1]);
  return { svg: `<path d="${green.d}" fill="${green.couleur}"/><path d="${campus.d}" fill="${campus.couleur}"/>`, largeur: green.largeur + campus.largeur };
}
// Hauteur des capitales de la police (pour centrer le texte sur l'icône).
const hauteurCapitales = (taille) => (fonte.tables.os2.sCapHeight / fonte.unitsPerEm) * taille;

const fichiers = {};
fichiers['logo-icone.svg'] = svg(64, 64, 'GreenCampus', icone());
fichiers['logo-icone-carre.svg'] = svg(64, 64, 'GreenCampus', icone({ arrondi: 0, tailleFeuille: 44 }));
fichiers['logo-rond.svg'] = svg(64, 64, 'GreenCampus', icone({ arrondi: 0, tailleFeuille: 36 }));
fichiers['feuille-verte.svg'] = svg(64, 64, 'Feuille GreenCampus', `<path d="${feuille(60)}" fill="url(#gc-degrade)" fill-rule="evenodd"/>`);
fichiers['feuille-blanche.svg'] = svg(64, 64, 'Feuille GreenCampus', `<path d="${feuille(60)}" fill="#ffffff" fill-rule="evenodd"/>`, '');

// Logo horizontal : icône 64 + espace 18 + nom en 34, centré verticalement sur l'icône.
for (const [fichier, couleurs] of [
  ['logo-horizontal.svg', [COULEURS.encre, COULEURS.corailVif]],
  ['logo-horizontal-blanc.svg', [COULEURS.blanc, COULEURS.corailClair]],
]) {
  const taille = 34, base = 32 + hauteurCapitales(taille) / 2;
  const n = nom(64 + 18, base, taille, couleurs);
  fichiers[fichier] = svg(Math.ceil(64 + 18 + n.largeur), 64, 'GreenCampus', `${icone()}${n.svg}`);
}
// Logo vertical : icône 120 au-dessus, nom en 40 centré dessous (texte foncé, ou blanc pour les fonds sombres).
for (const [fichier, couleurs] of [
  ['logo-vertical.svg', [COULEURS.encre, COULEURS.corailVif]],
  ['logo-vertical-blanc.svg', [COULEURS.blanc, COULEURS.corailClair]],
]) {
  const taille = 40, essai = nom(0, 0, taille, ['', '']);
  const largeur = Math.ceil(Math.max(essai.largeur, 120));
  const n = nom((largeur - essai.largeur) / 2, 120 + 24 + hauteurCapitales(taille), taille, couleurs);
  // Hauteur : jusqu'au bas des lettres qui descendent sous la ligne (le « p » de Campus).
  const descente = (-fonte.descender / fonte.unitsPerEm) * taille;
  fichiers[fichier] = svg(largeur, Math.ceil(120 + 24 + hauteurCapitales(taille) + descente), 'GreenCampus', `${icone({ x: (largeur - 120) / 2, s: 120 / 64 })}${n.svg}`);
}

for (const [f, contenu] of Object.entries(fichiers)) writeFileSync(join(sortie, f), contenu);
console.log(Object.keys(fichiers).join('\n'));
