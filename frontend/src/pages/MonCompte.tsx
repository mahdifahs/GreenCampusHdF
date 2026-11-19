import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Button } from '../components/Button'
import { Card } from '../components/Card'
import { ApiError, listerFilieres } from '../lib/api'
import type { Annee, Filiere } from '../lib/api'
import { ANNEES } from '../lib/annees'
import { useAuth } from '../lib/AuthContext'
import styles from './MonCompte.module.css'

export function MonCompte() {
  const { participant, modifierProfil, supprimerCompte } = useAuth()
  const navigate = useNavigate()
  const [filieres, setFilieres] = useState<Filiere[]>([])
  const [enregistrement, setEnregistrement] = useState(false)
  const [erreur, setErreur] = useState<string | null>(null)
  const [succes, setSucces] = useState(false)
  const [confirmationSuppression, setConfirmationSuppression] = useState(false)
  const [suppression, setSuppression] = useState(false)
  const [erreurSuppression, setErreurSuppression] = useState<string | null>(null)

  useEffect(() => {
    listerFilieres().then(setFilieres).catch(() => setErreur('Impossible de charger les filières.'))
  }, [])

  if (!participant) return null

  async function soumettre(ev: React.FormEvent<HTMLFormElement>) {
    ev.preventDefault()
    setErreur(null)
    setSucces(false)
    setEnregistrement(true)
    const donnees = new FormData(ev.currentTarget)
    try {
      await modifierProfil({
        filiereId: Number(donnees.get('filiereId')),
        annee: donnees.get('annee') as Annee,
      })
      setSucces(true)
    } catch (e) {
      setErreur(e instanceof ApiError ? e.message : 'Une erreur est survenue.')
    } finally {
      setEnregistrement(false)
    }
  }

  async function confirmerSuppression() {
    setErreurSuppression(null)
    setSuppression(true)
    try {
      await supprimerCompte()
      navigate('/')
    } catch (e) {
      setErreurSuppression(e instanceof ApiError ? e.message : 'Une erreur est survenue.')
      setSuppression(false)
    }
  }

  return (
    <main className="page">
      <h1>Mon compte</h1>
      <p style={{ color: 'var(--muted)', marginTop: 'var(--sp-2)' }}>
        Pseudo : <strong>{participant.pseudo}</strong>. Le pseudo ne peut pas être changé.
      </p>

      <form onSubmit={soumettre} className={styles.form}>
        <label className={styles.label} htmlFor="filiereId">
          Filière
        </label>
        <select id="filiereId" name="filiereId" required className={styles.select} defaultValue={participant.filiere.id}>
          {filieres.map((f) => (
            <option key={f.id} value={f.id}>
              {f.libelle}
            </option>
          ))}
        </select>

        <label className={styles.label} htmlFor="annee">
          Année
        </label>
        <select id="annee" name="annee" required className={styles.select} defaultValue={participant.annee}>
          {ANNEES.map((a) => (
            <option key={a.valeur} value={a.valeur}>
              {a.libelle}
            </option>
          ))}
        </select>

        {erreur && (
          <p role="alert" className={styles.erreur}>
            {erreur}
          </p>
        )}
        {succes && <p className={styles.succes}>Modifications enregistrées.</p>}

        <Button type="submit" disabled={enregistrement}>
          {enregistrement ? 'Enregistrement...' : 'Enregistrer'}
        </Button>
      </form>

      <Card className={styles.danger}>
        <h2>Supprimer mon compte</h2>
        <p style={{ color: 'var(--muted)' }}>
          Action définitive : ton pseudo, tes bilans, tes défis et tes réponses de suivi seront
          supprimés immédiatement et irrémédiablement.
        </p>

        {!confirmationSuppression ? (
          <Button variant="secondary" onClick={() => setConfirmationSuppression(true)}>
            Supprimer mon compte
          </Button>
        ) : (
          <div className={styles.confirmation}>
            <p>
              <strong>Es-tu sûr·e ?</strong> Cette action ne peut pas être annulée.
            </p>
            {erreurSuppression && (
              <p role="alert" className={styles.erreur}>
                {erreurSuppression}
              </p>
            )}
            <div className={styles.boutonsConfirmation}>
              <Button variant="secondary" onClick={() => setConfirmationSuppression(false)} disabled={suppression}>
                Annuler
              </Button>
              <button type="button" className={styles.boutonDanger} onClick={confirmerSuppression} disabled={suppression}>
                {suppression ? 'Suppression...' : 'Oui, supprimer définitivement'}
              </button>
            </div>
          </div>
        )}
      </Card>
    </main>
  )
}
