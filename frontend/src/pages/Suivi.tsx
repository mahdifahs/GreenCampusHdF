import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { Button } from '../components/Button'
import { Card } from '../components/Card'
import { Rappels } from '../components/Rappels'
import { ApiError, repondreSuivi, suivisAFaire } from '../lib/api'
import type { EtapeAFaire, QuestionSuivi, SuivisAFaire } from '../lib/api'
import styles from './Suivi.module.css'

const LIBELLES_ETAPES: Record<string, string> = { J7: 'Suivi à J+7', J14: 'Suivi à J+14' }

function Question({
  question,
  valeur,
  onChange,
}: {
  question: QuestionSuivi
  valeur: string | number | undefined
  onChange: (valeur: string | number) => void
}) {
  if (question.type === 'choix') {
    return (
      <div className={styles.champ}>
        <label className={styles.label}>{question.question}</label>
        <select className={styles.select} value={valeur ?? ''} onChange={(ev) => onChange(ev.target.value)}>
          <option value="" disabled>
            Choisis une réponse
          </option>
          {question.options.map((o) => (
            <option key={o.valeur} value={o.valeur}>
              {o.libelle}
            </option>
          ))}
        </select>
      </div>
    )
  }

  const echelle = Array.from({ length: question.max - question.min + 1 }, (_, i) => question.min + i)
  return (
    <div className={styles.champ}>
      <label className={styles.label}>{question.question}</label>
      <div className={styles.echelle}>
        {echelle.map((n) => (
          <button
            key={n}
            type="button"
            className={`${styles.cran}${valeur === n ? ` ${styles.cranActif}` : ''}`}
            onClick={() => onChange(n)}
          >
            {n}
          </button>
        ))}
      </div>
      <div className={styles.legendeEchelle}>
        <span>{question.libelleMin}</span>
        <span>{question.libelleMax}</span>
      </div>
    </div>
  )
}

function FormulaireEtape({ etape, onTermine }: { etape: EtapeAFaire; onTermine: () => void }) {
  const [reponses, setReponses] = useState<Record<string, string | number>>({})
  const [enCours, setEnCours] = useState(false)
  const [erreur, setErreur] = useState<string | null>(null)

  const complet = etape.questions.every((q) => reponses[q.id] !== undefined)

  async function soumettre() {
    setErreur(null)
    setEnCours(true)
    try {
      await repondreSuivi(etape.etape, reponses)
      onTermine()
    } catch (e) {
      setErreur(e instanceof ApiError ? e.message : 'Une erreur est survenue.')
    } finally {
      setEnCours(false)
    }
  }

  return (
    <Card>
      <h2 style={{ fontSize: '1.1rem' }}>{LIBELLES_ETAPES[etape.etape] ?? etape.etape}</h2>
      <div className={styles.questions}>
        {etape.questions.map((q) => (
          <Question
            key={q.id}
            question={q}
            valeur={reponses[q.id]}
            onChange={(v) => setReponses((r) => ({ ...r, [q.id]: v }))}
          />
        ))}
      </div>
      {erreur && <p className={styles.erreur}>{erreur}</p>}
      <Button onClick={soumettre} disabled={!complet || enCours} style={{ width: 'fit-content', marginTop: 'var(--sp-3)' }}>
        {enCours ? 'Envoi…' : 'Envoyer mes réponses'}
      </Button>
    </Card>
  )
}

export function Suivi() {
  const [donnees, setDonnees] = useState<SuivisAFaire | null>(null)
  const [erreur, setErreur] = useState<string | null>(null)

  function charger() {
    suivisAFaire()
      .then(setDonnees)
      .catch((e) => setErreur(e instanceof ApiError ? e.message : 'Impossible de charger le suivi.'))
  }

  useEffect(charger, [])

  if (erreur) return <main className="page">{erreur}</main>
  if (!donnees) return <main className="page">Chargement…</main>

  if (!donnees.jourZero) {
    return (
      <main className="page" style={{ display: 'flex', flexDirection: 'column', gap: 'var(--sp-5)' }}>
        <div>
          <h1>Suivi</h1>
          <p style={{ color: 'var(--muted)', marginTop: 'var(--sp-3)' }}>
            Les questionnaires de suivi se débloquent 7 puis 14 jours après ton premier bilan.{' '}
            <Link to="/bilan">Fais ton bilan</Link> pour les activer.
          </p>
        </div>
        <Rappels />
      </main>
    )
  }

  if (donnees.etapes.length === 0) {
    return (
      <main className="page">
        <h1>Suivi</h1>
        <p style={{ color: 'var(--muted)', marginTop: 'var(--sp-3)' }}>
          Tu as répondu à tous les questionnaires de suivi disponibles. Merci !
        </p>
      </main>
    )
  }

  return (
    <main className="page" style={{ display: 'flex', flexDirection: 'column', gap: 'var(--sp-5)' }}>
      <h1>Suivi</h1>
      <Rappels />
      {donnees.etapes.map((etape) =>
        etape.disponible ? (
          <FormulaireEtape key={etape.etape} etape={etape} onTermine={charger} />
        ) : (
          <Card key={etape.etape}>
            <h2 style={{ fontSize: '1.1rem' }}>{LIBELLES_ETAPES[etape.etape] ?? etape.etape}</h2>
            <p style={{ color: 'var(--muted)' }}>
              Disponible le {new Date(etape.disponibleLe).toLocaleDateString('fr-FR')}.
            </p>
          </Card>
        ),
      )}
    </main>
  )
}
