// Service worker : affiche les rappels de suivi (J+7, J+14) envoyés par l'API.
// Pas de cache hors ligne : il ne sert qu'aux notifications push.

// Nouvelle version active tout de suite, et prend le contrôle des pages déjà ouvertes
// (sinon une page chargée avant l'abonnement ne peut pas être redirigée au clic).
self.addEventListener('install', () => self.skipWaiting())
self.addEventListener('activate', (event) => event.waitUntil(self.clients.claim()))

self.addEventListener('push', (event) => {
  let data = { titre: 'GreenCampus', corps: '', url: '/suivi' }
  try {
    if (event.data) data = { ...data, ...event.data.json() }
  } catch {
    // message non JSON : on garde le texte par défaut
  }
  event.waitUntil(
    self.registration.showNotification(data.titre, {
      body: data.corps,
      icon: '/icone-192.png',
      // Petite icône de la barre d'état Android : la feuille seule, en blanc sur transparent.
      badge: '/badge-96.png',
      data: { url: data.url },
    }),
  )
})

// Au clic : ramène au premier plan une fenêtre du site déjà ouverte et l'envoie sur la page
// demandée, sinon en ouvre une nouvelle. Le focus passe en premier (le navigateur ne l'autorise
// que pendant le clic) ; navigate() échoue sur une page non contrôlée, d'où le repli par message
// (écouté dans main.tsx).
self.addEventListener('notificationclick', (event) => {
  event.notification.close()
  const cible = new URL(event.notification.data?.url ?? '/suivi', self.location.origin)
  event.waitUntil(
    (async () => {
      const fenetres = await self.clients.matchAll({ type: 'window', includeUncontrolled: true })
      const ouverte = fenetres.find((f) => new URL(f.url).origin === self.location.origin)
      if (!ouverte) return self.clients.openWindow(cible.href)
      await ouverte.focus().catch(() => {})
      if (new URL(ouverte.url).pathname === cible.pathname) return
      try {
        await ouverte.navigate(cible.href)
      } catch {
        ouverte.postMessage({ type: 'naviguer', chemin: cible.pathname })
      }
    })(),
  )
})
