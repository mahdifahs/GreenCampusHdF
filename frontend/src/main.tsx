import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'

// Polices auto-hébergées (Fontsource) : pas de dépendance à Google Fonts le jour de l'événement.
import '@fontsource/unbounded/500.css'
import '@fontsource/unbounded/700.css'
import '@fontsource/unbounded/900.css'
import '@fontsource/plus-jakarta-sans/400.css'
import '@fontsource/plus-jakarta-sans/500.css'
import '@fontsource/plus-jakarta-sans/500-italic.css'
import '@fontsource/plus-jakarta-sans/600.css'
import '@fontsource/plus-jakarta-sans/700.css'
import '@fontsource/ibm-plex-mono/400.css'
import '@fontsource/ibm-plex-mono/500.css'

import './styles/tokens.css'
import './styles/base.css'
import App from './App.tsx'

// Clic sur une notification alors que le site est déjà ouvert : le service worker demande d'aller
// sur la page du rappel (voir public/sw.js). Seuls les chemins internes sont acceptés.
if ('serviceWorker' in navigator) {
  navigator.serviceWorker.addEventListener('message', (event) => {
    const { type, chemin } = (event.data ?? {}) as { type?: string; chemin?: string }
    if (type === 'naviguer' && typeof chemin === 'string' && /^\/(?!\/)/.test(chemin)) {
      window.location.assign(chemin)
    }
  })
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
