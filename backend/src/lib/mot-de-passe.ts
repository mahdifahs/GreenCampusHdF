import { randomInt } from 'node:crypto';

// Mot de passe aléatoire pour un compte admin (création ou réinitialisation), au format
// XXXX-XXXX-XXXX-XXXX, même alphabet que les codes de récupération participant (base32 de
// Crockford, sans I/L/O/U : lisible sans ambiguïté). Affiché une seule fois à la création,
// jamais stocké en clair (seul son hash argon2 l'est, voir modules/admin/comptes.ts).
const ALPHABET = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';
const LONGUEUR = 16;

export function genererMotDePasse(): string {
  let brut = '';
  for (let i = 0; i < LONGUEUR; i++) brut += ALPHABET[randomInt(ALPHABET.length)];
  return brut.match(/.{4}/g)!.join('-');
}
