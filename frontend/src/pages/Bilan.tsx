import { useEffect, useMemo, useRef, useState } from 'react'
import { Badge } from '../components/Badge'
import { Button } from '../components/Button'
import { Card } from '../components/Card'
import { ApiError, dernierBilan, enregistrerBilan, estimerBilan, questionsInformation, questionsStand } from '../lib/api'
import type { Bilan as BilanData, BilanDetail, Categorie, Estimation, Question, QuestionInformation } from '../lib/api'
import styles from './Bilan.module.css'
import { MentionSource } from '../components/MentionSource'

const LIBELLES_CATEGORIES: Record<string, string> = {
  transport: 'Transport',
  alimentation: 'Alimentation',
  logement: 'Logement',
  divers: 'Divers',
  servicesSocietaux: 'Services sociétaux',
}

const kg = (v: number) => `${v.toLocaleString('fr-FR', { maximumFractionDigits: v < 100 ? 1 : 0 })} kg`

// Les valeurs « choix » reviennent au format interne de publicodes (une chaîne y est une
// constante entre quotes simples, ex. "'appartement'") : on les déquote pour matcher les <option>.
const dequoter = (v: number | string) => (typeof v === 'string' ? v.replace(/^'(.*)'$/, '$1') : String(v))

function grouper(questions: Question[]) {
  const groupes = new Map<string, Question[]>()
  for (const q of questions) {
    if (!groupes.has(q.categorie)) groupes.set(q.categorie, [])
    groupes.get(q.categorie)!.push(q)
  }
  return [...groupes.entries()]
}

// Hors des bornes renvoyées par l'API, la réponse serait refusée à l'enregistrement.
function horsBornes(q: Pick<Question, 'type' | 'min' | 'max'>, valeur: string | undefined) {
  if (q.type !== 'nombre' || valeur === undefined || valeur === '') return false
  const n = Number(valeur)
  return !Number.isFinite(n) || n < (q.min ?? 0) || (q.max !== null && n > q.max)
}

// Les plats se comptent sur 14 repas par semaine (midi et soir) : l'API refuse un total plus élevé.
const REPAS_MAX_SEMAINE = 14
const estPlat = (q: Question) => q.dottedName.startsWith('alimentation . plats . ')

// Réponses du formulaire → situation envoyée à l'API (champs vides ou hors bornes ignorés).
function versSituation(questions: Question[], reponses: Record<string, string>, garder?: (q: Question) => boolean) {
  const situation: Record<string, number | string> = {}
  for (const q of questions) {
    const valeur = reponses[q.dottedName]
    if (valeur === undefined || valeur === '' || (garder && !garder(q))) continue
    if (q.type === 'nombre') {
      if (horsBornes(q, valeur)) continue
      situation[q.dottedName] = Number(valeur)
    } else {
      situation[q.dottedName] = valeur
    }
  }
  return situation
}

// Réponses aux questions « information » (hors calcul) : vides ou hors bornes ignorées.
function versInformations(questions: QuestionInformation[], reponses: Record<string, string>) {
  const informations: Record<string, number | string> = {}
  for (const q of questions) {
    const valeur = reponses[q.id]
    if (valeur === undefined || valeur === '' || horsBornes(q, valeur)) continue
    informations[q.id] = q.type === 'nombre' ? Number(valeur) : valeur
  }
  return informations
}

const DELAI_ESTIMATION_MS = 600

export function Bilan() {
  const [questions, setQuestions] = useState<Question[] | null>(null)
  const [dernier, setDernier] = useState<BilanDetail | null>(null)
  const [vue, setVue] = useState<'chargement' | 'formulaire' | 'resultat'>('chargement')
  const [reponses, setReponses] = useState<Record<string, string>>({})
  const [infos, setInfos] = useState<QuestionInformation[]>([])
  const [reponsesInfo, setReponsesInfo] = useState<Record<string, string>>({})
  const [resultat, setResultat] = useState<BilanData | null>(null)
  const [erreur, setErreur] = useState<string | null>(null)
  const [enCours, setEnCours] = useState(false)
  const [estimation, setEstimation] = useState<Estimation | null>(null)
  const derniereDemande = useRef(0)
  const premiereEstimation = useRef(true)

  // Estimation en direct : immédiate à l'ouverture du formulaire, puis après une pause de saisie.
  // Toutes les réponses sont envoyées (même devenues non applicables) pour qu'une question qui
  // réapparaît retrouve sa valeur ; une réponse arrivée en retard est ignorée.
  useEffect(() => {
    if (vue !== 'formulaire' || !questions) {
      premiereEstimation.current = true
      return
    }
    const delai = premiereEstimation.current ? 0 : DELAI_ESTIMATION_MS
    premiereEstimation.current = false
    const minuteur = setTimeout(() => {
      const id = ++derniereDemande.current
      estimerBilan(versSituation(questions, reponses))
        .then((e) => {
          if (id === derniereDemande.current) setEstimation(e)
        })
        .catch(() => {}) // on garde la dernière estimation, l'enregistrement signalera une vraie erreur
    }, delai)
    return () => clearTimeout(minuteur)
  }, [vue, questions, reponses])

  const applicables = useMemo(() => (estimation ? new Set(estimation.applicables) : null), [estimation])
  const estApplicable = (q: Question) => !applicables || applicables.has(q.dottedName)

  useEffect(() => {
    Promise.all([questionsStand(), questionsInformation(), dernierBilan()])
      .then(([q, i, d]) => {
        setQuestions(q)
        setInfos(i)
        setDernier(d)
        if (d) {
          setResultat(d)
          setReponses(Object.fromEntries(Object.entries(d.situation).map(([k, v]) => [k, dequoter(v)])))
          setReponsesInfo(Object.fromEntries(Object.entries(d.informations ?? {}).map(([k, v]) => [k, String(v)])))
          setVue('resultat')
        } else {
          setVue('formulaire')
        }
      })
      .catch((e) => setErreur(e instanceof ApiError ? e.message : 'Impossible de charger le bilan.'))
  }, [])

  const groupes = useMemo(() => (questions ? grouper(questions) : []), [questions])

  const repas = (questions ?? [])
    .filter((q) => estPlat(q) && estApplicable(q) && !horsBornes(q, reponses[q.dottedName]))
    .reduce((somme, q) => somme + (Number(reponses[q.dottedName]) || 0), 0)
  const tropDeRepas = repas > REPAS_MAX_SEMAINE
  const reponsesInvalides =
    tropDeRepas ||
    (questions ?? []).some((q) => estApplicable(q) && horsBornes(q, reponses[q.dottedName])) ||
    infos.some((q) => horsBornes(q, reponsesInfo[q.id]))

  async function soumettre() {
    setErreur(null)
    if (reponsesInvalides) {
      setErreur('Corrige les réponses signalées en rouge avant d’enregistrer.')
      return
    }
    setEnCours(true)
    // Une réponse devenue sans objet (ex. km en voiture alors qu'on n'en prend jamais) n'est pas enregistrée.
    const situation = versSituation(questions ?? [], reponses, estApplicable)
    try {
      const bilan = await enregistrerBilan(situation, versInformations(infos, reponsesInfo))
      setResultat(bilan)
      setVue('resultat')
    } catch (e) {
      setErreur(e instanceof ApiError ? e.message : 'Une erreur est survenue.')
    } finally {
      setEnCours(false)
    }
  }

  if (erreur && vue === 'chargement') return <main className="page">{erreur}</main>
  if (vue === 'chargement') return <main className="page">Chargement…</main>

  if (vue === 'resultat' && resultat) {
    return (
      <main className="page" style={{ display: 'flex', flexDirection: 'column', gap: 'var(--sp-5)' }}>
        <h1>Ton bilan</h1>
        <Card>
          <Badge variant="eco">{LIBELLES_CATEGORIES[resultat.categorieDominante]} en tête</Badge>
          <strong style={{ fontFamily: 'var(--font-display)', fontSize: '2.2rem' }}>{kg(resultat.totalKg)} CO2e / an</strong>
          <div className={styles.repartition}>
            {(Object.entries(resultat.parCategorie) as [Categorie, number][]).map(([cat, valeur]) => (
              <div key={cat} className={styles.ligneCategorie}>
                <span className={styles.nomCategorie}>{LIBELLES_CATEGORIES[cat] ?? cat}</span>
                <div className={styles.piste}>
                  <div
                    className={styles.remplissage}
                    style={{ width: `${Math.min(100, (100 * valeur) / resultat.totalKg)}%` }}
                  />
                </div>
                <span className={styles.valeurCategorie}>{kg(valeur)}</span>
              </div>
            ))}
          </div>
          <MentionSource ancre="bilan">Calcul : modèle Nos Gestes Climat de l'ADEME.</MentionSource>
        </Card>
        {erreur && <p className={styles.erreur}>{erreur}</p>}
        <Button variant="secondary" onClick={() => setVue('formulaire')} style={{ width: 'fit-content' }}>
          Reprendre et compléter mes réponses
        </Button>
      </main>
    )
  }

  return (
    <main className="page" style={{ display: 'flex', flexDirection: 'column', gap: 'var(--sp-5)' }}>
      <div>
        <h1>Bilan carbone</h1>
        <p style={{ color: 'var(--muted)', marginTop: 'var(--sp-2)' }}>
          Réponds aux questions qui te concernent, les autres gardent la valeur moyenne française.
        </p>
      </div>

      {erreur && <p className={styles.erreur}>{erreur}</p>}

      {groupes.map(([categorie, toutes]) => {
        const qs = toutes.filter(estApplicable)
        if (qs.length === 0) return null
        return (
        <Card key={categorie}>
          <h2 style={{ fontSize: '1.1rem' }}>{LIBELLES_CATEGORIES[categorie] ?? categorie}</h2>
          <div className={styles.questions}>
            {qs.map((q) => (
              <div key={q.dottedName} className={styles.champ}>
                <label className={styles.label} htmlFor={q.dottedName}>
                  {q.question}
                </label>
                {q.type === 'nombre' ? (
                  <div className={styles.nombreAvecUnite}>
                    <input
                      id={q.dottedName}
                      type="number"
                      min={q.min ?? 0}
                      max={q.max ?? undefined}
                      className={styles.input}
                      aria-invalid={horsBornes(q, reponses[q.dottedName]) || undefined}
                      aria-describedby={horsBornes(q, reponses[q.dottedName]) ? `${q.dottedName}-erreur` : undefined}
                      value={reponses[q.dottedName] ?? ''}
                      onChange={(ev) => setReponses((r) => ({ ...r, [q.dottedName]: ev.target.value }))}
                    />
                    {q.unite && <span className={styles.unite}>{q.unite}</span>}
                  </div>
                ) : (
                  <select
                    id={q.dottedName}
                    className={styles.input}
                    value={reponses[q.dottedName] ?? ''}
                    onChange={(ev) => setReponses((r) => ({ ...r, [q.dottedName]: ev.target.value }))}
                  >
                    <option value="">Ne pas répondre</option>
                    {q.possibilites.map((p) => (
                      <option key={p.valeur} value={p.valeur}>
                        {p.titre}
                      </option>
                    ))}
                  </select>
                )}
                {horsBornes(q, reponses[q.dottedName]) && (
                  <span id={`${q.dottedName}-erreur`} className={styles.aideErreur}>
                    Entre {q.min ?? 0} et {q.max}{q.unite ? ` ${q.unite}` : ''}.
                  </span>
                )}
                {q === qs.filter(estPlat).at(-1) && (
                  <p className={tropDeRepas ? styles.compteurErreur : styles.compteur} aria-live="polite">
                    Repas renseignés : {repas} / {REPAS_MAX_SEMAINE} par semaine (midi et soir)
                    {tropDeRepas && '. Retire des repas pour revenir à 14 au plus.'}
                  </p>
                )}
              </div>
            ))}
          </div>
        </Card>
        )
      })}

      {infos.length > 0 && (
        <Card>
          <h2 style={{ fontSize: '1.1rem' }}>Questions de l’équipe</h2>
          <p className={styles.aideCarte}>
            Facultatives. Elles ne changent pas ton empreinte : les réponses servent seulement aux statistiques
            anonymes du projet.
          </p>
          <div className={styles.questions}>
            {infos.map((q) => {
              const id = `info-${q.id}`
              const invalide = horsBornes(q, reponsesInfo[q.id])
              const changer = (valeur: string) => setReponsesInfo((r) => ({ ...r, [q.id]: valeur }))
              return (
                <div key={q.id} className={styles.champ}>
                  <label className={styles.label} htmlFor={id}>
                    {q.question}
                  </label>
                  {q.type === 'nombre' ? (
                    <div className={styles.nombreAvecUnite}>
                      <input
                        id={id}
                        type="number"
                        min={q.min ?? 0}
                        max={q.max ?? undefined}
                        className={styles.input}
                        aria-invalid={invalide || undefined}
                        aria-describedby={invalide ? `${id}-erreur` : undefined}
                        value={reponsesInfo[q.id] ?? ''}
                        onChange={(ev) => changer(ev.target.value)}
                      />
                      {q.unite && <span className={styles.unite}>{q.unite}</span>}
                    </div>
                  ) : (
                    <select id={id} className={styles.input} value={reponsesInfo[q.id] ?? ''} onChange={(ev) => changer(ev.target.value)}>
                      <option value="">Ne pas répondre</option>
                      {q.possibilites.map((p) => (
                        <option key={p.valeur} value={p.valeur}>
                          {p.titre}
                        </option>
                      ))}
                    </select>
                  )}
                  {invalide && (
                    <span id={`${id}-erreur`} className={styles.aideErreur}>
                      Entre {q.min ?? 0} et {q.max}{q.unite ? ` ${q.unite}` : ''}.
                    </span>
                  )}
                </div>
              )
            })}
          </div>
        </Card>
      )}

      <div className={styles.bandeau}>
        <div className={styles.estimation} aria-live="polite">
          <span>Estimation</span>
          <strong>{estimation ? `${kg(estimation.totalKg)} CO2e / an` : '…'}</strong>
        </div>
        <div className={styles.actions}>
        {dernier && (
          <Button variant="secondary" onClick={() => setVue('resultat')}>
            Annuler
          </Button>
        )}
        <Button onClick={soumettre} disabled={enCours || !questions || reponsesInvalides}>
          {enCours ? 'Calcul en cours…' : 'Enregistrer mon bilan'}
        </Button>
        </div>
      </div>
    </main>
  )
}
