// Fonctions pures du script de suppression de fin de projet (src/outils/suppression-finale.ts),
// séparées pour être testées sans lancer le script.

export function nomDeLaBase(url: string): string {
  return decodeURIComponent(new URL(url).pathname.replace(/^\//, ''));
}

// Hôte et base seulement : jamais le mot de passe à l'écran.
export function cibleLisible(url: string): string {
  const u = new URL(url);
  return `${u.hostname}${u.port ? `:${u.port}` : ''}/${nomDeLaBase(url)}`;
}

export function confirmationDemandee(args: readonly string[]): string | null {
  const i = args.indexOf('--confirmer');
  return i >= 0 ? (args[i + 1] ?? '') : null;
}
