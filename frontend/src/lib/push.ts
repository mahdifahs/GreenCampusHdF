import { clePubliquePush, enregistrerAbonnementPush, supprimerAbonnementPush } from './api'

export type EtatRappels =
  | 'indisponible' // navigateur sans service worker / Web Push
  | 'desactive-serveur' // l'API n'a pas de clés VAPID
  | 'refuse' // l'utilisateur a bloqué les notifications pour ce site
  | 'inactif'
  | 'actif'

export const pushSupporte = () =>
  typeof window !== 'undefined' && 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window

async function enregistrement() {
  return navigator.serviceWorker.register('/sw.js')
}

// Clé VAPID d'un abonnement existant, au même format (base64url) que celle renvoyée par l'API.
function cleDeLAbonnement(abonnement: PushSubscription): string | null {
  const brute = abonnement.options.applicationServerKey
  if (!brute) return null
  const octets = String.fromCharCode(...new Uint8Array(brute))
  return btoa(octets).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

// Abonnement valable pour la clé actuelle du serveur. Si la clé a changé (nouvelles clés en
// production, par exemple), l'ancien abonnement ne recevrait plus rien sans aucune erreur visible :
// on le remplace. Exige la permission déjà accordée. Les appels sont mis en file : deux vérifications
// simultanées (effet lancé deux fois, deux onglets) créeraient sinon deux abonnements.
let file: Promise<unknown> = Promise.resolve()
function abonnementAJour(sw: ServiceWorkerRegistration, clePublique: string): Promise<PushSubscription> {
  const suivant = file.then(() => remplacerSiBesoin(sw, clePublique))
  file = suivant.catch(() => undefined)
  return suivant
}

async function remplacerSiBesoin(sw: ServiceWorkerRegistration, clePublique: string) {
  const existant = await sw.pushManager.getSubscription()
  if (existant && cleDeLAbonnement(existant) === clePublique) return existant
  if (existant) {
    await supprimerAbonnementPush(existant.endpoint).catch(() => undefined)
    await existant.unsubscribe().catch(() => undefined)
  }
  return sw.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: clePublique })
}

export async function etatRappels(): Promise<{ etat: EtatRappels; clePublique: string | null }> {
  if (!pushSupporte()) return { etat: 'indisponible', clePublique: null }
  const { clePublique } = await clePubliquePush()
  if (!clePublique) return { etat: 'desactive-serveur', clePublique: null }
  if (Notification.permission === 'denied') return { etat: 'refuse', clePublique }
  const sw = await navigator.serviceWorker.getRegistration('/')
  if (!sw || !(await sw.pushManager.getSubscription())) return { etat: 'inactif', clePublique }
  if (Notification.permission !== 'granted') return { etat: 'inactif', clePublique }
  // Réassocie l'abonnement au compte connecté (l'API l'enregistre par appareil, sans doublon),
  // en le renouvelant si la clé du serveur a changé.
  await enregistrerAbonnementPush(await abonnementAJour(sw, clePublique))
  return { etat: 'actif', clePublique }
}

export async function activerRappels(clePublique: string): Promise<EtatRappels> {
  const permission = await Notification.requestPermission()
  if (permission !== 'granted') return permission === 'denied' ? 'refuse' : 'inactif'
  const sw = await enregistrement()
  await navigator.serviceWorker.ready
  await enregistrerAbonnementPush(await abonnementAJour(sw, clePublique))
  return 'actif'
}

// Sans lever d'erreur : appelé aussi à la déconnexion, qui ne doit jamais échouer pour ça.
export async function desactiverRappels(): Promise<void> {
  if (!pushSupporte()) return
  try {
    const sw = await navigator.serviceWorker.getRegistration('/')
    const abonnement = await sw?.pushManager.getSubscription()
    if (!abonnement) return
    await supprimerAbonnementPush(abonnement.endpoint).catch(() => undefined)
    await abonnement.unsubscribe()
  } catch {
    // rien à faire : au pire, l'abonnement expirera côté navigateur
  }
}
