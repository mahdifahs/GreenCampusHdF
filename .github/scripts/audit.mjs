// Audit des dépendances pour la CI : échoue sur toute vulnérabilité « high » ou « critical »,
// sauf celles listées dans .github/audit-exceptions.json (avec une raison et une date d'expiration).
// À lancer depuis backend/ ou frontend/ : node ../.github/scripts/audit.mjs
// Pourquoi pas `npm audit --audit-level=high` seul : npm n'a aucun moyen d'ignorer une alerte précise.
// Quand une faille sans correctif touche un outil de développement, la seule option serait de
// couper l'audit entier ; ici on n'exempte que cet identifiant, et seulement jusqu'à sa date limite.
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const GRAVES = new Set(['high', 'critical']);
const fichierExceptions = fileURLToPath(new URL('../audit-exceptions.json', import.meta.url));
const aujourdhui = new Date().toISOString().slice(0, 10);

const exceptions = JSON.parse(readFileSync(fichierExceptions, 'utf8'));
const actives = new Map();
for (const e of exceptions) {
  if (!e.id || !e.raison || !/^\d{4}-\d{2}-\d{2}$/.test(e.expire ?? '')) {
    console.error(`Exception mal formée dans audit-exceptions.json (id, raison et expire AAAA-MM-JJ obligatoires) : ${JSON.stringify(e)}`);
    process.exit(1);
  }
  if (e.expire < aujourdhui) console.warn(`Exception expirée le ${e.expire}, ignorée : ${e.id}`);
  else actives.set(e.id, e);
}

const npm = spawnSync('npm', ['audit', '--json'], { encoding: 'utf8', shell: process.platform === 'win32', maxBuffer: 64 * 1024 * 1024 });
let rapport;
try {
  rapport = JSON.parse(npm.stdout);
} catch {
  console.error('Réponse illisible de npm audit :', npm.stderr || npm.stdout);
  process.exit(1);
}
if (rapport.error) {
  console.error('npm audit a échoué :', rapport.error.summary ?? rapport.error);
  process.exit(1);
}

// Chaque alerte apparaît dans « via » sous forme d'objet (les chaînes renvoient vers un autre paquet).
const alertes = new Map();
for (const [paquet, v] of Object.entries(rapport.vulnerabilities ?? {})) {
  for (const a of v.via) {
    if (typeof a !== 'object' || !GRAVES.has(a.severity)) continue;
    const id = a.url?.split('/').pop() ?? String(a.source);
    alertes.set(id, { id, paquet, titre: a.title, plage: a.range, gravite: a.severity, url: a.url });
  }
}

const bloquantes = [...alertes.values()].filter((a) => !actives.has(a.id));
for (const a of alertes.values()) {
  if (actives.has(a.id)) console.log(`Exemptée jusqu'au ${actives.get(a.id).expire} : ${a.id} (${a.paquet} ${a.plage}, ${a.gravite}) — ${actives.get(a.id).raison}`);
}
for (const e of actives.values()) {
  if (!alertes.has(e.id)) console.warn(`Exception devenue inutile, à retirer de audit-exceptions.json : ${e.id}`);
}
if (bloquantes.length) {
  console.error(`\n${bloquantes.length} vulnérabilité(s) « high » ou plus :`);
  for (const a of bloquantes) console.error(`- ${a.id} : ${a.paquet} ${a.plage} (${a.gravite}) ${a.titre}\n  ${a.url}`);
  console.error('\nCorriger (npm update / npm audit fix), ou, s’il n’existe aucun correctif et que le paquet ne sert pas en production, ajouter une exception datée dans .github/audit-exceptions.json.');
  process.exit(1);
}
console.log(`Audit OK : aucune vulnérabilité « high » ou plus non exemptée (${alertes.size} exemptée(s)).`);
