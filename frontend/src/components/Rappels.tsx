import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { activerRappels, desactiverRappels, etatRappels } from '../lib/push'
import type { EtatRappels } from '../lib/push'
import { Button } from './Button'
import { Card } from './Card'
import styles from './Rappels.module.css'

export function Rappels() {
  const [etat, setEtat] = useState<EtatRappels | null>(null)
  const [clePublique, setClePublique] = useState<string | null>(null)
  const [enCours, setEnCours] = useState(false)
  const [erreur, setErreur] = useState<string | null>(null)

  useEffect(() => {
    etatRappels()
      .then((r) => {
        setEtat(r.etat)
        setClePublique(r.clePublique)
      })
      .catch(() => setEtat('desactive-serveur'))
  }, [])

  // Clés VAPID absentes côté serveur : la fonctionnalité n'existe pas, inutile d'en parler.
  if (!etat || etat === 'desactive-serveur') return null

  async function changer(activer: boolean) {
    setEnCours(true)
    setErreur(null)
    try {
      if (activer && clePublique) setEtat(await activerRappels(clePublique))
      else {
        await desactiverRappels()
        setEtat('inactif')
      }
    } catch {
      setErreur('Impossible de modifier les rappels sur cet appareil. Réessaie dans un instant.')
    } finally {
      setEnCours(false)
    }
  }

  return (
    <Card className={styles.carte}>
      <h2 className={styles.titre}>Rappels sur ce téléphone</h2>
      <p>
        Une notification 7 jours puis 14 jours après ton premier bilan, pour répondre au suivi et valider tes
        défis. Deux messages au total, sans aucune donnée personnelle.
      </p>

      {etat === 'actif' && (
        <div className={styles.ligne}>
          <span className={styles.actif}>Rappels activés sur cet appareil.</span>
          <Button variant="secondary" onClick={() => changer(false)} disabled={enCours}>
            Désactiver
          </Button>
        </div>
      )}

      {etat === 'inactif' && (
        <div className={styles.ligne}>
          <Button onClick={() => changer(true)} disabled={enCours}>
            {enCours ? 'Activation…' : 'Activer les rappels'}
          </Button>
        </div>
      )}

      {etat === 'refuse' && (
        <p className={styles.note}>
          Les notifications sont bloquées pour ce site. Pour recevoir les rappels, autorise-les dans les réglages
          du site de ton navigateur, puis recharge la page.
        </p>
      )}

      {etat === 'indisponible' && (
        <p className={styles.note}>
          Ton navigateur ne gère pas les rappels ici. Sur iPhone, il faut d'abord installer l'application sur ton
          écran d'accueil et l'ouvrir depuis l'icône.
        </p>
      )}

      {etat !== 'actif' && (
        <p className={styles.note}>
          <Link to="/installer">Comment installer l'application sur iPhone ou Android</Link>
        </p>
      )}

      {erreur && <p className={styles.erreur}>{erreur}</p>}
    </Card>
  )
}
