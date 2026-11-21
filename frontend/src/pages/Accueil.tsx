import { useEffect, useState } from 'react'
import { Badge } from '../components/Badge'
import { Card } from '../components/Card'
import { ApiError, listerEvenements } from '../lib/api'
import type { Evenement } from '../lib/api'
import styles from './Accueil.module.css'

const jour = (d: Date) => d.toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' })
const heure = (d: Date) => d.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })

// « samedi 22 novembre, de 10:00 à 17:00 » ; sur plusieurs jours, « du … au … ».
// L'heure de fin est affichée pour que personne ne vienne après la fermeture.
function formatPeriode(debutIso: string, finIso: string | null) {
  const debut = new Date(debutIso)
  if (!finIso) return `${jour(debut)} à ${heure(debut)}`
  const fin = new Date(finIso)
  if (debut.toDateString() === fin.toDateString()) return `${jour(debut)}, de ${heure(debut)} à ${heure(fin)}`
  return `du ${jour(debut)} ${heure(debut)} au ${jour(fin)} ${heure(fin)}`
}

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
                {e.dateDebut && <Badge variant="pop" className={styles.periode}>{formatPeriode(e.dateDebut, e.dateFin)}</Badge>}
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
