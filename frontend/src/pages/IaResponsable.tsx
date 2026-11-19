import { useEffect, useRef, useState } from 'react'
import { Badge } from '../components/Badge'
import { Button } from '../components/Button'
import { Card } from '../components/Card'
import { ApiError, corrigerQuiz, guideIa, questionsQuiz } from '../lib/api'
import type { CorrectionQuiz, GuideIa, QuestionQuiz, SourceIa } from '../lib/api'
import styles from './IaResponsable.module.css'

function LienSource({ source }: { source: SourceIa }) {
  return (
    <a className={styles.source} href={source.url} target="_blank" rel="noreferrer">
      Source : {source.titre} ({source.date})
    </a>
  )
}

function Quiz({ questions }: { questions: QuestionQuiz[] }) {
  const [reponses, setReponses] = useState<Record<string, string>>({})
  const [resultat, setResultat] = useState<CorrectionQuiz | null>(null)
  const [erreur, setErreur] = useState<string | null>(null)
  const [envoi, setEnvoi] = useState(false)
  const haut = useRef<HTMLDivElement>(null)

  // Le bouton est en bas des 6 questions : on remonte au score, sinon on arrive sur la dernière correction.
  const resultatPrecedent = useRef(resultat)
  useEffect(() => {
    if (resultatPrecedent.current === resultat) return
    resultatPrecedent.current = resultat
    haut.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }, [resultat])

  const complet = questions.every((q) => reponses[q.id])
  const texteChoix = (questionId: string, choixId: string) =>
    questions.find((q) => q.id === questionId)?.choix.find((c) => c.id === choixId)?.texte ?? choixId

  async function valider() {
    setEnvoi(true)
    setErreur(null)
    try {
      setResultat(await corrigerQuiz(reponses))
    } catch (e) {
      setErreur(e instanceof ApiError ? e.message : 'Impossible d’envoyer tes réponses.')
    } finally {
      setEnvoi(false)
    }
  }

  function rejouer() {
    setReponses({})
    setResultat(null)
  }

  if (resultat) {
    return (
      <div className={styles.quiz} ref={haut}>
        <Card className={styles.score}>
          <strong>
            {resultat.score} / {resultat.total}
          </strong>
          <span>
            {resultat.score === resultat.total
              ? 'Sans faute, bravo !'
              : resultat.score >= resultat.total / 2
                ? 'Bien joué ! Les explications ci-dessous complètent ce que tu sais déjà.'
                : 'Pas facile : les explications ci-dessous valent le détour.'}
          </span>
        </Card>
        {resultat.corrections.map((c, i) => (
          <Card key={c.questionId} className={styles.correction}>
            <div className={styles.enteteQuestion}>
              <span className={styles.numero}>{i + 1}</span>
              <Badge variant={c.correct ? 'eco' : 'alerte'}>{c.correct ? 'Bonne réponse' : 'Raté'}</Badge>
            </div>
            <h3>{c.question}</h3>
            {!c.correct && <p className={styles.tonChoix}>Ta réponse : {texteChoix(c.questionId, c.choix)}</p>}
            <p className={styles.bonne}>Réponse : {texteChoix(c.questionId, c.bonneReponse)}</p>
            <p>{c.explication}</p>
            <p className={styles.taux}>{c.tauxReussite} % des joueurs ont trouvé.</p>
            <LienSource source={c.source} />
          </Card>
        ))}
        <div>
          <Button variant="secondary" onClick={rejouer}>
            Rejouer
          </Button>
        </div>
      </div>
    )
  }

  return (
    <div className={styles.quiz} ref={haut}>
      {questions.map((q, i) => (
        <Card key={q.id}>
          <fieldset className={styles.question}>
            <legend>
              <span className={styles.numero}>{i + 1}</span> {q.question}
            </legend>
            <div className={styles.choix}>
              {q.choix.map((c) => (
                <label key={c.id} className={`${styles.option}${reponses[q.id] === c.id ? ` ${styles.choisie}` : ''}`}>
                  <input
                    type="radio"
                    name={q.id}
                    value={c.id}
                    checked={reponses[q.id] === c.id}
                    onChange={() => setReponses((r) => ({ ...r, [q.id]: c.id }))}
                  />
                  {c.texte}
                </label>
              ))}
            </div>
          </fieldset>
        </Card>
      ))}
      {erreur && <p className={styles.erreur}>{erreur}</p>}
      <div className={styles.actions}>
        <Button onClick={valider} disabled={!complet || envoi}>
          {envoi ? 'Correction…' : 'Voir mes résultats'}
        </Button>
        {!complet && (
          <span className={styles.aide}>
            {Object.keys(reponses).length} / {questions.length} questions répondues
          </span>
        )}
      </div>
    </div>
  )
}

export function IaResponsable() {
  const [guide, setGuide] = useState<GuideIa | null>(null)
  const [questions, setQuestions] = useState<QuestionQuiz[] | null>(null)
  const [erreur, setErreur] = useState<string | null>(null)

  useEffect(() => {
    Promise.all([guideIa(), questionsQuiz()])
      .then(([g, q]) => {
        setGuide(g)
        setQuestions(q)
      })
      .catch((e) => setErreur(e instanceof ApiError ? e.message : 'Impossible de charger la page.'))
  }, [])

  if (erreur) return <main className="page">{erreur}</main>
  if (!guide || !questions) return <main className="page">Chargement…</main>

  const miseAJour = new Date(guide.miseAJour).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' })

  return (
    <main className={`page ${styles.page}`}>
      <div>
        <h1>{guide.titre}</h1>
        <p className={styles.intro}>{guide.introduction}</p>
        <p className={styles.miseAJour}>Mis à jour le {miseAJour}. Chaque chiffre renvoie à sa source.</p>
      </div>

      <section>
        <h2>Teste tes connaissances</h2>
        <p className={styles.sousTitre}>
          {questions.length} questions, sans compte : tes réponses sont enregistrées de façon anonyme, juste pour
          afficher le taux de réussite des autres joueurs.
        </p>
        <Quiz questions={questions} />
      </section>

      <section>
        <h2>Les chiffres à retenir</h2>
        <div className={styles.chiffres}>
          {guide.chiffresCles.map((c) => (
            <Card key={c.valeur} className={styles.chiffre}>
              <strong>{c.valeur}</strong>
              <span>{c.libelle}</span>
              <LienSource source={c.source} />
            </Card>
          ))}
        </div>
        <Card className={styles.ordre}>
          <p>{guide.ordreDeGrandeur.texte}</p>
          <LienSource source={guide.ordreDeGrandeur.source} />
        </Card>
      </section>

      <section>
        <h2>Les bons réflexes</h2>
        <div className={styles.grille}>
          {guide.conseils.map((c, i) => (
            <Card key={c.titre}>
              <h3>
                <span className={styles.numero}>{i + 1}</span> {c.titre}
              </h3>
              <p>{c.explication}</p>
              <LienSource source={c.source} />
            </Card>
          ))}
        </div>
      </section>

      <section>
        <h2>Idées reçues</h2>
        <div className={styles.grille}>
          {guide.ideesRecues.map((i) => (
            <Card key={i.idee}>
              <h3 className={styles.idee}>{i.idee}</h3>
              <p>{i.realite}</p>
              <LienSource source={i.source} />
            </Card>
          ))}
        </div>
      </section>

      <section>
        <h2>Des outils pour aller plus loin</h2>
        <div className={styles.grille}>
          {guide.outils.map((o) => (
            <Card key={o.nom}>
              <h3>
                <a href={o.url} target="_blank" rel="noreferrer">
                  {o.nom}
                </a>
              </h3>
              <p>{o.description}</p>
            </Card>
          ))}
        </div>
      </section>

      <section>
        <h2>Toutes les sources</h2>
        <ul className={styles.sources}>
          {guide.sources.map((s) => (
            <li key={s.url}>
              <a href={s.url} target="_blank" rel="noreferrer">
                {s.titre}
              </a>{' '}
              ({s.date})
            </li>
          ))}
        </ul>
      </section>
    </main>
  )
}
