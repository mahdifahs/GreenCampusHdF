import { useEffect, useState } from 'react'
import { Badge } from '../components/Badge'
import { Card } from '../components/Card'
import { MentionSource } from '../components/MentionSource'
import { ApiError, collecteVetements, tableauDeBord } from '../lib/api'
import type { CollecteVetements, TableauDeBord as TableauDeBordData } from '../lib/api'
import styles from './TableauDeBord.module.css'

const kg = (v: number) => `${v.toLocaleString('fr-FR', { maximumFractionDigits: v < 100 ? 1 : 0 })} kg`

function Collecte({ c }: { c: CollecteVetements }) {
  // Avant la journée de don, on montre ce que la collecte permettra d'éviter une fois donnée.
  const dejaDonne = c.nombreDonnes > 0
  return (
    <section>
      <h2>Collecte de vêtements</h2>
      <div className={styles.tuiles} style={{ marginTop: 'var(--sp-3)' }}>
        <Card className={styles.tuile}>
          <strong>{c.nombreRecuperes.toLocaleString('fr-FR')}</strong>
          <span>
            {c.nombreRecuperes > 1 ? "vêtements récupérés" : "vêtement récupéré"}
            {c.poidsRecupereKg > 0 && <> ({kg(c.poidsRecupereKg)})</>}
          </span>
        </Card>
        <Card className={styles.tuile}>
          <strong>{c.nombreDonnes.toLocaleString('fr-FR')}</strong>
          <span>
            {c.nombreDonnes > 1 ? "vêtements donnés" : "vêtement donné"}
            {c.poidsDonneKg > 0 && <> ({kg(c.poidsDonneKg)})</>}
          </span>
        </Card>
        <Card className={styles.tuile}>
          <strong>{kg(dejaDonne ? c.co2EviteDonneKg : c.co2EviteRecupereKg)}</strong>
          <span>{dejaDonne ? 'CO2e évité grâce aux dons' : 'CO2e évitable une fois donnés'}</span>
        </Card>
      </div>
      <div style={{ marginTop: 'var(--sp-2)', display: 'flex', flexDirection: 'column', gap: 'var(--sp-1)' }}>
        {c.donneesIncompletes && (
          <p style={{ color: 'var(--muted)', fontSize: '.85rem' }}>
            Certains vêtements n'ont pas encore de poids ou de matière chiffrés : les kilos et le CO2
            sont sous-estimés.
          </p>
        )}
        <MentionSource ancre="vetements">
          Estimation à partir des poids moyens et facteurs d'émission d'Ecobalyse (outil public).
        </MentionSource>
      </div>
    </section>
  )
}

export function TableauDeBord() {
  const [donnees, setDonnees] = useState<TableauDeBordData | null>(null)
  const [collecte, setCollecte] = useState<CollecteVetements | null>(null)
  const [erreur, setErreur] = useState<string | null>(null)

  // Rafraîchi toutes les 20 s (le serveur garde le résultat en cache quelques secondes), seulement
  // quand l'onglet est visible. Après un premier affichage réussi, une erreur ponctuelle est ignorée.
  useEffect(() => {
    let dejaCharge = false
    const charger = () => {
      if (document.hidden) return
      tableauDeBord()
        .then((d) => {
          dejaCharge = true
          setDonnees(d)
        })
        .catch((e) => {
          if (!dejaCharge) setErreur(e instanceof ApiError ? e.message : 'Impossible de charger le tableau de bord.')
        })
      // Encart secondaire : en cas d'échec, on garde le dernier affichage (ou rien).
      collecteVetements()
        .then(setCollecte)
        .catch(() => {})
    }
    charger()
    const intervalle = setInterval(charger, 20_000)
    document.addEventListener('visibilitychange', charger)
    return () => {
      clearInterval(intervalle)
      document.removeEventListener('visibilitychange', charger)
    }
  }, [])

  if (erreur) return <main className="page">{erreur}</main>
  if (!donnees) return <main className="page">Chargement…</main>

  return (
    <main className="page" style={{ display: 'flex', flexDirection: 'column', gap: 'var(--sp-6)' }}>
      <div>
        <h1>Tableau de bord</h1>
        <p style={{ color: 'var(--muted)', marginTop: 'var(--sp-2)' }}>
          Statistiques collectives et anonymes du campus. Une filière n'apparaît qu'à partir de{' '}
          {donnees.seuilAnonymat} participants.
        </p>
      </div>

      <div className={styles.tuiles}>
        <Card className={styles.tuile}>
          <strong>{donnees.participants}</strong>
          <span>participants</span>
        </Card>
        <Card className={styles.tuile}>
          <strong>{kg(donnees.co2EviteKg)}</strong>
          <span>CO2 évité</span>
        </Card>
        <Card className={styles.tuile}>
          <strong>{donnees.defisValides}</strong>
          <span>défis validés</span>
        </Card>
      </div>
      <MentionSource ancre="tableau">
        CO2 évité : somme des défis validés par les participants (déclaratif), calculée avec le modèle
        Nos Gestes Climat de l'ADEME.
      </MentionSource>

      <section>
        <h2>Classement des filières</h2>
        {donnees.classementFilieres.length === 0 ? (
          <p style={{ color: 'var(--muted)' }}>
            Pas encore assez de participants par filière pour afficher un classement.
          </p>
        ) : (
          <div className={styles.classement}>
            {donnees.classementFilieres.map((f) => (
              <Card key={f.filiere.id} className={styles.ligne}>
                <span className={styles.rang}>#{f.rang}</span>
                <div className={styles.infos}>
                  <strong>{f.filiere.libelle}</strong>
                  <span style={{ color: 'var(--muted)', fontSize: '.85rem' }}>
                    {f.participants} participant{f.participants > 1 ? 's' : ''}
                  </span>
                </div>
                <Badge variant="eco">{kg(f.co2EviteKgParParticipant)} / participant</Badge>
              </Card>
            ))}
          </div>
        )}
        {donnees.filieresMasquees > 0 && (
          <p style={{ color: 'var(--muted)', fontSize: '.85rem', marginTop: 'var(--sp-2)' }}>
            {donnees.filieresMasquees} filière{donnees.filieresMasquees > 1 ? 's' : ''} encore masquée
            {donnees.filieresMasquees > 1 ? 's' : ''} (pas assez de participants).
          </p>
        )}
      </section>

      {collecte && collecte.nombreRecuperes + collecte.nombreDonnes > 0 && <Collecte c={collecte} />}

      {donnees.defisPopulaires.length > 0 && (
        <section>
          <h2>Défis les plus choisis</h2>
          <ul style={{ display: 'flex', flexDirection: 'column', gap: 'var(--sp-2)', marginTop: 'var(--sp-3)' }}>
            {donnees.defisPopulaires.map((d) => (
              <li key={d.titre} style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span>{d.titre}</span>
                <Badge variant="neutral">{d.engagements}</Badge>
              </li>
            ))}
          </ul>
        </section>
      )}
    </main>
  )
}
