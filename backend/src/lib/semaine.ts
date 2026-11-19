// Les défis sont hebdomadaires : une semaine est identifiée par la date de son lundi, à l'heure de Paris.
const formatParis = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'Europe/Paris',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
});

export function lundiDeLaSemaine(instant: Date = new Date()): Date {
  const jour = new Date(`${formatParis.format(instant)}T00:00:00Z`);
  jour.setUTCDate(jour.getUTCDate() - ((jour.getUTCDay() + 6) % 7));
  return jour;
}

export function versDateIso(date: Date): string {
  return date.toISOString().slice(0, 10);
}
