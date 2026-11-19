import { randomInt } from 'node:crypto';

// Adjectifs identiques au masculin et au féminin, pour s'accorder avec n'importe quel animal.
const ANIMAUX = [
  'Loutre', 'Herisson', 'Renard', 'Chouette', 'Abeille', 'Castor', 'Panda', 'Koala',
  'Ecureuil', 'Mesange', 'Lynx', 'Tortue', 'Dauphin', 'Colibri', 'Blaireau', 'Grenouille',
  'Phoque', 'Faucon', 'Libellule', 'Marmotte', 'Coccinelle', 'Bison', 'Lezard', 'Hibou',
];
const ADJECTIFS = [
  'Agile', 'Calme', 'Rapide', 'Sage', 'Libre', 'Habile', 'Brave', 'Tenace', 'Paisible', 'Fidele',
  'Robuste', 'Sociable', 'Aimable', 'Tranquille', 'Energique', 'Zen', 'Solide', 'Docile', 'Lucide', 'Intrepide',
];

export function genererPseudo(): string {
  const animal = ANIMAUX[randomInt(ANIMAUX.length)];
  const adjectif = ADJECTIFS[randomInt(ADJECTIFS.length)];
  return `${animal}${adjectif}${randomInt(10, 100)}`;
}
