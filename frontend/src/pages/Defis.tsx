import { useEffect, useState } from 'react'
import { Badge } from '../components/Badge'
import { Button } from '../components/Button'
import { Card } from '../components/Card'
import {
  abandonnerEngagement,
  ApiError,
  catalogueDefis,
  mesEngagements,
  monImpact,
  repondreEngagement,
  sEngager,
} from '../lib/api'
import type { Catalogue, Engagement, Impact } from '../lib/api'
import styles from './Defis.module.css'
import { MentionSource } from '../components/MentionSource'

// Miroir de MAX_DEFIS_PAR_SEMAINE côté backend (src/modules/defis/service.ts) — seulement
// pour désactiver les boutons par avance ; le serveur reste la seule source de vérité.
const MAX_DEFIS_PAR_SEMAINE = 3

const LIBELLES_CATEGORIES: Record<string, string> = {
  TRANSPORT: 'Transport',
  ALIMENTATION: 'Alimentation',
  LOGEMENT: 'Logement',
  DIVERS: 'Divers',
  NUMERIQUE: 'Numérique',
}

// Écart toléré entre l'horloge du serveur et celle de l'appareil pour griser « Tenu ».
const MARGE_HORLOGE_MS = 5_000

const BADGE_STATUT: Record<Engagement['statut'], { variant: 'neutral' | 'eco' | 'alerte'; libelle: string }> = {
  EN_COURS: { variant: 'neutral', libelle: 'En cours' },
  VALIDE: { variant: 'eco', libelle: 'Validé' },
  NON_TENU: { variant: 'alerte', libelle: 'Non tenu' },
}

const kg = (v: number) => `${v.toLocaleString('fr-FR', { maximumFractionDigits: 1 })} kg`

// « jeudi à 14:05 » (jour de la semaine suffit : le délai ne dépasse pas une semaine).
const quand = (d: Date) =>
  `${d.toLocaleDateString('fr-FR', { weekday: 'long' })} à ${d.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}`

export function Defis() {
  const [catalogue, setCatalogue] = useState<Catalogue | null>(null)
  const [engagements, setEngagements] = useState<Engagement[] | null>(null)
  const [impact, setImpact] = useState<Impact | null>(null)
  const [erreur, setErreur] = useState<string | null>(null)
  const [actionEnCours, setActionEnCours] = useState<string | number | null>(null)
  // Réponse en attente de confirmation : évite un « Tenu »/« Non tenu » involontaire au doigt.
  const [aConfirmer, setAConfirmer] = useState<{ id: string; statut: 'VALIDE' | 'NON_TENU' } | null>(null)
  // Heure courante, rafraîchie chaque minute : « Tenu » se débloque tout seul une fois le délai passé.
  const [maintenant, setMaintenant] = useState(() => Date.now())
  useEffect(() => {
    const minuteur = setInterval(() => setMaintenant(Date.now()), 60_000)
    return () => clearInterval(minuteur)
  }, [])

  async function rafraichirEngagements() {
    const [e, i] = await Promise.all([mesEngagements('semaine'), monImpact()])
    setEngagements(e)
    setImpact(i)
    // Sans cela, un défi tout juste choisi resterait grisé jusqu'au prochain tic de la minute.
    setMaintenant(Date.now())
  }

  useEffect(() => {
    Promise.all([catalogueDefis(), mesEngagements('semaine'), monImpact()])
      .then(([c, e, i]) => {
        setCatalogue(c)
        setEngagements(e)
        setImpact(i)
      })
      .catch((e) => setErreur(e instanceof ApiError ? e.message : 'Impossible de charger les défis.'))
  }, [])

  async function choisir(defiId: number) {
    setErreur(null)
    setActionEnCours(defiId)
    try {
      await sEngager(defiId)
      await rafraichirEngagements()
    } catch (e) {
      setErreur(e instanceof ApiError ? e.message : 'Une erreur est survenue.')
    } finally {
      setActionEnCours(null)
    }
  }

  async function repondre(id: string, statut: 'VALIDE' | 'NON_TENU') {
    setErreur(null)
    setAConfirmer(null)
    setActionEnCours(id)
    try {
      await repondreEngagement(id, statut)
      await rafraichirEngagements()
    } catch (e) {
      setErreur(e instanceof ApiError ? e.message : 'Une erreur est survenue.')
    } finally {
      setActionEnCours(null)
    }
  }

  async function retirer(id: string) {
    setErreur(null)
    setActionEnCours(id)
    try {
      await abandonnerEngagement(id)
      await rafraichirEngagements()
    } catch (e) {
      setErreur(e instanceof ApiError ? e.message : 'Une erreur est survenue.')
    } finally {
      setActionEnCours(null)
    }
  }

  if (!catalogue || !engagements || !impact) {
    return <main className="page">{erreur ?? 'Chargement…'}</main>
  }

  const idsEngages = new Set(engagements.map((e) => e.defi.id))
  const limiteAtteinte = engagements.length >= MAX_DEFIS_PAR_SEMAINE

  return (
    <main className="page" style={{ display: 'flex', flexDirection: 'column', gap: 'var(--sp-6)' }}>
      <div>
        <h1>Défis de la semaine</h1>
        <p style={{ color: 'var(--muted)', marginTop: 'var(--sp-2)' }}>
          Choisis jusqu'à {MAX_DEFIS_PAR_SEMAINE} défis par semaine, personnalisés selon ton bilan.
        </p>
      </div>

      <div className={styles.tuiles}>
        <Card className={styles.tuile}>
          <strong>{kg(impact.co2EviteKg)}</strong>
          <span>CO2 évité au total</span>
        </Card>
        <Card className={styles.tuile}>
          <strong>{impact.defisValides}</strong>
          <span>défis validés</span>
        </Card>
      </div>

      {erreur && <p className={styles.erreur}>{erreur}</p>}

      <section>
        <h2>Mes défis cette semaine</h2>
        {engagements.length === 0 ? (
          <p style={{ color: 'var(--muted)', marginTop: 'var(--sp-2)' }}>Aucun défi choisi pour l'instant.</p>
        ) : (
          <div className={styles.liste}>
            {engagements.map((e) => {
              const badge = BADGE_STATUT[e.statut]
              const validable = new Date(e.validableAt)
              // Marge : validableAt vient de l'horloge du serveur, qui peut avoir quelques secondes
              // d'avance sur celle du téléphone. L'API reste seule juge (409 si vraiment trop tôt).
              const tropTot = validable.getTime() > maintenant + MARGE_HORLOGE_MS
              return (
                <Card key={e.id} className={styles.carteEngagement}>
                  <div className={styles.enteteCarte}>
                    <Badge variant="neutral">{LIBELLES_CATEGORIES[e.defi.categorie] ?? e.defi.categorie}</Badge>
                    <Badge variant={badge.variant}>{badge.libelle}</Badge>
                  </div>
                  <h3 style={{ fontSize: '1.05rem' }}>{e.defi.titre}</h3>
                  <span className={styles.gain}>− {kg(e.co2EviteKgSemaine)} CO2e estimés</span>
                  {e.statut === 'EN_COURS' && aConfirmer?.id === e.id && (
                    <div className={styles.confirmation}>
                      <p>
                        {aConfirmer.statut === 'VALIDE'
                          ? 'Tu confirmes avoir tenu ce défi cette semaine ?'
                          : 'Tu confirmes ne pas avoir tenu ce défi ?'}
                      </p>
                      <div className={styles.actions}>
                        <Button onClick={() => repondre(e.id, aConfirmer.statut)} disabled={actionEnCours === e.id}>
                          {aConfirmer.statut === 'VALIDE' ? 'Oui, je l’ai tenu' : 'Oui, pas tenu'}
                        </Button>
                        <Button variant="secondary" onClick={() => setAConfirmer(null)} disabled={actionEnCours === e.id}>
                          Annuler
                        </Button>
                      </div>
                    </div>
                  )}
                  {e.statut === 'EN_COURS' && aConfirmer?.id !== e.id && (
                    <div className={styles.actions}>
                      <Button
                        onClick={() => setAConfirmer({ id: e.id, statut: 'VALIDE' })}
                        disabled={actionEnCours === e.id || tropTot}
                      >
                        Tenu
                      </Button>
                      <Button
                        variant="secondary"
                        onClick={() => setAConfirmer({ id: e.id, statut: 'NON_TENU' })}
                        disabled={actionEnCours === e.id}
                      >
                        Non tenu
                      </Button>
                      <button
                        type="button"
                        className={styles.retirer}
                        onClick={() => retirer(e.id)}
                        disabled={actionEnCours === e.id}
                      >
                        Retirer
                      </button>
                    </div>
                  )}
                  {e.statut === 'EN_COURS' && tropTot && aConfirmer?.id !== e.id && (
                    <p className={styles.attente}>
                      Laisse-toi un peu de temps pour le tenir : tu pourras le valider à partir de {quand(validable)}.
                    </p>
                  )}
                </Card>
              )
            })}
          </div>
        )}
      </section>

      <section>
        <h2>Catalogue</h2>
        <MentionSource ancre="defis">
          Gains estimés à partir de ton dernier bilan, avec le modèle Nos Gestes Climat de l'ADEME.
        </MentionSource>
        <div className={styles.liste}>
          {catalogue.defis.map((d) => {
            const dejaChoisi = idsEngages.has(d.id)
            return (
              <Card key={d.id} className={styles.carteEngagement}>
                <div className={styles.enteteCarte}>
                  <Badge variant="neutral">{LIBELLES_CATEGORIES[d.categorie] ?? d.categorie}</Badge>
                  {d.recommande && <Badge variant="pop">Recommandé</Badge>}
                </div>
                <h3 style={{ fontSize: '1.05rem' }}>{d.titre}</h3>
                <p style={{ color: 'var(--muted)', fontSize: '.9rem' }}>{d.description}</p>
                <span className={styles.gain}>− {kg(d.co2EviteKgSemaine)} CO2e estimés / semaine</span>
                {dejaChoisi ? (
                  <Badge variant="eco">Déjà choisi cette semaine</Badge>
                ) : (
                  <Button
                    onClick={() => choisir(d.id)}
                    disabled={limiteAtteinte || actionEnCours === d.id}
                    style={{ width: 'fit-content' }}
                  >
                    {limiteAtteinte ? 'Limite atteinte' : 'Choisir ce défi'}
                  </Button>
                )}
              </Card>
            )
          })}
        </div>
      </section>
    </main>
  )
}
