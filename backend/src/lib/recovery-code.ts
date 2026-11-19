import { randomInt } from 'node:crypto';

// Code de récupération au format XXXX-XXXX-XXXX-XXXX (alphabet base32 de Crockford, sans I, L, O, U).
// Les 6 premiers caractères forment le sélecteur (stocké en clair pour retrouver le participant),
// les 10 suivants le vérificateur (stocké haché), selon le motif « selector / verifier ».
const ALPHABET = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';
const LONGUEUR = 16;
const LONGUEUR_SELECTEUR = 6;

export type CodeDecoupe = { selecteur: string; verificateur: string };

export function genererCode(): { code: string } & CodeDecoupe {
  let brut = '';
  for (let i = 0; i < LONGUEUR; i++) brut += ALPHABET[randomInt(ALPHABET.length)];
  return { code: formater(brut), ...decouper(brut) };
}

function formater(brut: string): string {
  return brut.match(/.{4}/g)!.join('-');
}

function decouper(brut: string): CodeDecoupe {
  return { selecteur: brut.slice(0, LONGUEUR_SELECTEUR), verificateur: brut.slice(LONGUEUR_SELECTEUR) };
}

// Tolère les saisies approximatives : minuscules, espaces, tirets, O/0 et I/L/1 confondus.
export function analyserCode(saisie: string): CodeDecoupe | null {
  const brut = saisie
    .toUpperCase()
    .replace(/[\s-]/g, '')
    .replace(/O/g, '0')
    .replace(/[IL]/g, '1');
  if (brut.length !== LONGUEUR || [...brut].some((c) => !ALPHABET.includes(c))) return null;
  return decouper(brut);
}
