// Mode maintenance (activé depuis l'admin) : l'API répond 503 { code: 'MAINTENANCE' } partout sauf
// sur GET /api/statut. Tout appel qui reçoit cette réponse le signale ici, et le composant
// Maintenance remplace alors le site par sa page dédiée.

type Ecouteur = () => void
const ecouteurs = new Set<Ecouteur>()

export function signalerMaintenance() {
  for (const e of ecouteurs) e()
}

export function surMaintenance(ecouteur: Ecouteur) {
  ecouteurs.add(ecouteur)
  return () => {
    ecouteurs.delete(ecouteur)
  }
}

// fetch direct (et non apiFetch) : cette route reste joignable pendant la maintenance.
export async function siteEnMaintenance(): Promise<boolean> {
  const reponse = await fetch('/api/statut', { cache: 'no-store' })
  if (!reponse.ok) throw new Error(`Erreur ${reponse.status}`)
  return ((await reponse.json()) as { maintenance: boolean }).maintenance
}
