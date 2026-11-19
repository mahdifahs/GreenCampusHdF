// Génération de CSV lisibles directement par Excel en français : séparateur « ; », virgule décimale,
// BOM UTF-8 (pour les accents) et fins de ligne CRLF.
const SEPARATEUR = ';';
const BOM = '﻿';

export type ValeurCsv = string | number | boolean | Date | null | undefined;

const formatDate = new Intl.DateTimeFormat('fr-FR', {
  timeZone: 'Europe/Paris',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
});

function cellule(valeur: ValeurCsv): string {
  if (valeur === null || valeur === undefined) return '';
  if (valeur instanceof Date) return formatDate.format(valeur);
  if (typeof valeur === 'number') return Number.isFinite(valeur) ? String(valeur).replace('.', ',') : '';
  if (typeof valeur === 'boolean') return valeur ? 'oui' : 'non';
  let texte = valeur;
  // Injection de formule : une cellule commençant par = + - @ serait exécutée par le tableur.
  if (/^[=+\-@\t\r]/.test(texte)) texte = `'${texte}`;
  return /[";\r\n]/.test(texte) ? `"${texte.replace(/"/g, '""')}"` : texte;
}

export function versCsv(colonnes: string[], lignes: ValeurCsv[][]): string {
  return BOM + [colonnes, ...lignes].map((ligne) => ligne.map(cellule).join(SEPARATEUR)).join('\r\n') + '\r\n';
}
