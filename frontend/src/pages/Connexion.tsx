import { useEffect, useRef, useState } from 'react'
import QRCode from 'qrcode'
import { Link, Navigate, useNavigate } from 'react-router-dom'
import { Badge } from '../components/Badge'
import { Button } from '../components/Button'
import { Card } from '../components/Card'
import { Field } from '../components/Field'
import { ApiError, listerFilieres } from '../lib/api'
import type { Annee, Filiere } from '../lib/api'
import { ANNEES } from '../lib/annees'
import { useAuth } from '../lib/AuthContext'
import styles from './Connexion.module.css'

const lienDeReconnexion = (code: string) => `${location.origin}/connexion#code=${encodeURIComponent(code)}`

function lireCodeDuLien(): string | null {
  const code = new URLSearchParams(location.hash.slice(1)).get('code')
  return code && code.length <= 40 ? code : null
}

export function Connexion() {
  const { participant, inscrire, connecter } = useAuth()
  const navigate = useNavigate()
  const [mode, setMode] = useState<'inscription' | 'connexion'>('inscription')
  const [filieres, setFilieres] = useState<Filiere[]>([])
  const [erreur, setErreur] = useState<string | null>(null)
  const [enCours, setEnCours] = useState(false)
  const [codeAMemoriser, setCodeAMemoriser] = useState<string | null>(null)
  const [copie, setCopie] = useState(false)
  const [qrCode, setQrCode] = useState<string | null>(null)
  const [codeDuLien] = useState(lireCodeDuLien)
  const lienTraite = useRef(false)

  useEffect(() => {
    listerFilieres().then(setFilieres).catch(() => setErreur('Impossible de charger les filières.'))
  }, [])

  // Lien de reconnexion (QR code scanné sur un autre appareil) : le code est dans le fragment (#),
  // jamais envoyé au serveur ; on l'efface de l'adresse dès qu'il est lu.
  useEffect(() => {
    if (!codeDuLien || lienTraite.current) return
    lienTraite.current = true
    history.replaceState(null, '', location.pathname)
    connecter(codeDuLien)
      .then(() => navigate('/bilan', { replace: true }))
      .catch((e) => {
        setMode('connexion')
        setErreur(e instanceof ApiError ? e.message : 'Ce lien de reconnexion ne fonctionne pas.')
      })
  }, [codeDuLien, connecter, navigate])

  useEffect(() => {
    if (!codeAMemoriser) return
    QRCode.toDataURL(lienDeReconnexion(codeAMemoriser), { margin: 1, width: 220, errorCorrectionLevel: 'M' })
      .then(setQrCode)
      .catch(() => setQrCode(null))
  }, [codeAMemoriser])

  if (codeDuLien && !erreur) return <main className="page">Reconnexion…</main>
  if (participant && !codeAMemoriser) return <Navigate to="/bilan" replace />

  async function soumettreInscription(ev: React.FormEvent<HTMLFormElement>) {
    ev.preventDefault()
    setErreur(null)
    setEnCours(true)
    const donnees = new FormData(ev.currentTarget)
    try {
      const { codeRecuperation } = await inscrire({
        filiereId: Number(donnees.get('filiereId')),
        annee: donnees.get('annee') as Annee,
      })
      setCodeAMemoriser(codeRecuperation)
    } catch (e) {
      setErreur(e instanceof ApiError ? e.message : 'Une erreur est survenue.')
    } finally {
      setEnCours(false)
    }
  }

  async function soumettreConnexion(ev: React.FormEvent<HTMLFormElement>) {
    ev.preventDefault()
    setErreur(null)
    setEnCours(true)
    const donnees = new FormData(ev.currentTarget)
    try {
      await connecter(String(donnees.get('codeRecuperation')))
      navigate('/bilan')
    } catch (e) {
      setErreur(e instanceof ApiError ? e.message : 'Une erreur est survenue.')
    } finally {
      setEnCours(false)
    }
  }

  async function copierCode() {
    if (!codeAMemoriser) return
    try {
      await navigator.clipboard.writeText(codeAMemoriser)
      setCopie(true)
    } catch {
      // copie indisponible : le code reste affiché et sélectionnable à la main.
    }
  }

  if (codeAMemoriser) {
    return (
      <main className="page">
        <Card>
          <Badge variant="pop">À conserver précieusement</Badge>
          <h1>Ton code de récupération</h1>
          <p style={{ color: 'var(--muted)' }}>
            Ce code ne sera plus jamais affiché. Note-le ou copie-le : il te permettra de retrouver ton
            compte si tu changes d'appareil ou effaces tes données de navigation.
          </p>
          <p className={styles.code}>{codeAMemoriser}</p>
          {qrCode && (
            <div className={styles.qr}>
              <img src={qrCode} alt="QR code de reconnexion" width={220} height={220} />
              <p>
                Scanne ce QR code avec ton téléphone : tu y retrouveras ton compte directement. Tu peux aussi en
                faire une capture d'écran pour le garder.
              </p>
            </div>
          )}
          <div style={{ display: 'flex', gap: 'var(--sp-3)', flexWrap: 'wrap' }}>
            <Button variant="secondary" onClick={copierCode}>
              {copie ? 'Copié ✓' : 'Copier le code'}
            </Button>
            <Button variant="primary" onClick={() => navigate('/bilan')}>
              C'est noté, continuer
            </Button>
          </div>
        </Card>
      </main>
    )
  }

  return (
    <main className="page">
      <Link to="/" className={styles.retour}>
        ← Retour à l'accueil
      </Link>

      <div className={styles.centre}>
        <img src="/favicon.svg" alt="" width={72} height={72} className={styles.icone} />
        <h1>
          Green<span style={{ color: 'var(--logo)' }}>Campus</span>
        </h1>
        <p style={{ color: 'var(--muted)', marginTop: 'var(--sp-2)' }}>
          Ton bilan carbone étudiant, tes défis de la semaine, en totale anonymité.
        </p>

        <div className={styles.onglets}>
          <button
            type="button"
            className={mode === 'inscription' ? styles.actif : undefined}
            onClick={() => setMode('inscription')}
          >
            Créer un compte
          </button>
          <button
            type="button"
            className={mode === 'connexion' ? styles.actif : undefined}
            onClick={() => setMode('connexion')}
          >
            J'ai déjà un code
          </button>
        </div>

        {erreur && (
          <p role="alert" className={styles.erreur}>
            {erreur}
          </p>
        )}

        {mode === 'inscription' ? (
          <form onSubmit={soumettreInscription} className={styles.form}>
            <label className={styles.label} htmlFor="filiereId">
              Filière
            </label>
            <select id="filiereId" name="filiereId" required className={styles.select}>
              <option value="">Choisis ta filière</option>
              {filieres.map((f) => (
                <option key={f.id} value={f.id}>
                  {f.libelle}
                </option>
              ))}
            </select>

            <label className={styles.label} htmlFor="annee">
              Année
            </label>
            <select id="annee" name="annee" required className={styles.select}>
              <option value="">Choisis ton année</option>
              {ANNEES.map((a) => (
                <option key={a.valeur} value={a.valeur}>
                  {a.libelle}
                </option>
              ))}
            </select>

            <label className={styles.consentement}>
              <input type="checkbox" name="consentement" required />
              <span>
                J'accepte que mes réponses anonymes servent aux statistiques collectives du
                campus (voir la{' '}
                <Link to="/confidentialite" target="_blank" rel="noopener noreferrer">
                  protection des données
                </Link>
                ).
              </span>
            </label>

            <Button type="submit" disabled={enCours}>
              {enCours ? 'Création...' : 'Créer mon compte'}
            </Button>
          </form>
        ) : (
          <form onSubmit={soumettreConnexion} className={styles.form}>
            <Field label="Code de récupération" name="codeRecuperation" placeholder="XXXX-XXXX-XXXX-XXXX" required />
            <Button type="submit" disabled={enCours}>
              {enCours ? 'Connexion...' : 'Me reconnecter'}
            </Button>
          </form>
        )}
      </div>
    </main>
  )
}
