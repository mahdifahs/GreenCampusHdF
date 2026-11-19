import { useEffect, useState } from 'react'
import type { ReactNode } from 'react'
import { siteEnMaintenance, surMaintenance } from '../lib/maintenance'
import styles from './Maintenance.module.css'

const VERIFICATION_MS = 30_000

// Enveloppe tout le site : vérifie l'état au chargement et dès qu'un appel à l'API répond
// « maintenance ». Pendant la maintenance, seule la page dédiée s'affiche ; elle revérifie toutes
// les 30 s et recharge le site quand il est de nouveau disponible (état de l'app repris à zéro).
export function Maintenance({ children }: { children: ReactNode }) {
  const [enMaintenance, setEnMaintenance] = useState(false)

  useEffect(() => {
    siteEnMaintenance()
      .then((m) => m && setEnMaintenance(true))
      .catch(() => {}) // API injoignable : les pages afficheront leurs propres erreurs
    return surMaintenance(() => setEnMaintenance(true))
  }, [])

  useEffect(() => {
    if (!enMaintenance) return
    const minuteur = setInterval(() => {
      siteEnMaintenance()
        .then((m) => !m && window.location.reload())
        .catch(() => {})
    }, VERIFICATION_MS)
    return () => clearInterval(minuteur)
  }, [enMaintenance])

  if (!enMaintenance) return children

  return (
    <main className={styles.page}>
      <div className={styles.carte}>
        <p className={styles.marque}>
          Green<span>Campus</span>
        </p>
        <h1>Site en maintenance</h1>
        <p>
          On règle un petit souci, le site revient dans quelques minutes. Pas besoin de recharger : cette page
          se mettra à jour toute seule dès que tout sera rentré dans l'ordre.
        </p>
        <p className={styles.note}>Ton compte et tes réponses sont conservés.</p>
      </div>
    </main>
  )
}
