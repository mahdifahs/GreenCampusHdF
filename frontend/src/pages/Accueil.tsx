import { useEffect, useState } from 'react'
import { Badge } from '../components/Badge'
import { Card } from '../components/Card'
import { ApiError, listerEvenements } from '../lib/api'
import type { Evenement } from '../lib/api'
import styles from './Accueil.module.css'

const formatDate = (iso: string) =>
  new Date(iso).toLocaleString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit' })

export function Accueil() {
  const [evenements, setEvenements] = useState<Evenement[] | null>(null)
  const [erreur, setErreur] = useState<string | null>(null)

  useEffect(() => {
    listerEvenements()
      .then(setEvenements)
      .catch((e) => setErreur(e instanceof ApiError ? e.message : 'Impossible de charger les évènements.'))
  }, [])

  return (
    <main className="page">
      <h1>
        Green<span style={{ color: 'var(--logo)' }}>Campus</span>
      </h1>
      <p style={{ color: 'var(--muted)', marginTop: 'var(--sp-2)' }}>
        Ton bilan carbone étudiant, tes défis de la semaine, en totale anonymité.
      </p>

      <section className={styles.evenements}>
        <h2>Prochains évènements</h2>

        {erreur && <p className={styles.erreur}>{erreur}</p>}

        {!erreur && !evenements && <p style={{ color: 'var(--muted)' }}>Chargement…</p>}

        {evenements && evenements.length === 0 && (
          <p style={{ color: 'var(--muted)' }}>Aucun évènement programmé pour le moment.</p>
        )}

        {evenements && evenements.length > 0 && (
          <div className={styles.liste}>
            {evenements.map((e) => (
              <Card key={e.id} className={styles.carte}>
                <Badge variant="pop">{formatDate(e.dateDebut)}</Badge>
                <h3>{e.titre}</h3>
                {e.lieu && <p className={styles.lieu}>{e.lieu}</p>}
                {e.description && <p>{e.description}</p>}
              </Card>
            ))}
          </div>
        )}
      </section>
    </main>
  )
}
