import { useEffect, useState } from 'react'
import { useLocation } from 'react-router-dom'
import { lireAnnonce, type Annonce as AnnonceApi, type NiveauAnnonce } from '../lib/api'
import styles from './Annonce.module.css'

// Bandeau d'information publié depuis l'admin (onglet « Message du site »), sous la barre
// d'onglets de toutes les pages. Un seul message à la fois, texte simple (React l'échappe).

const NIVEAUX: Record<NiveauAnnonce, { libelle: string; symbole: string }> = {
  INFO: { libelle: 'Info', symbole: 'i' },
  ATTENTION: { libelle: 'Attention', symbole: '!' },
  IMPORTANT: { libelle: 'Important', symbole: '!' },
}

const RAFRAICHISSEMENT_MS = 60_000
// Version du message masqué : s'il est modifié ensuite, sa version change et il réapparaît.
const CLE_MASQUEE = 'greencampus-annonce-masquee'

function lireMasquee(): string | null {
  try {
    return localStorage.getItem(CLE_MASQUEE)
  } catch {
    return null
  }
}

export function Annonce() {
  const { pathname } = useLocation()
  const [annonce, setAnnonce] = useState<AnnonceApi | null>(null)
  const [masquee, setMasquee] = useState(lireMasquee)

  // Relu à chaque changement de page, et toutes les minutes si l'onglet reste ouvert.
  useEffect(() => {
    let actif = true
    const charger = () =>
      lireAnnonce()
        .then((r) => actif && setAnnonce(r.annonce))
        // Sans réseau ou en maintenance : on garde le dernier message connu, sans erreur à l'écran.
        .catch(() => {})
    void charger()
    const minuteur = setInterval(() => {
      if (document.visibilityState === 'visible') void charger()
    }, RAFRAICHISSEMENT_MS)
    return () => {
      actif = false
      clearInterval(minuteur)
    }
  }, [pathname])

  if (!annonce) return null
  // Un message « Important » ne se masque pas.
  const masquable = annonce.niveau !== 'IMPORTANT'
  if (masquable && masquee === annonce.version) return null

  const masquer = () => {
    try {
      localStorage.setItem(CLE_MASQUEE, annonce.version)
    } catch {
      // stockage indisponible : masqué jusqu'au rechargement de la page seulement.
    }
    setMasquee(annonce.version)
  }

  const niveau = NIVEAUX[annonce.niveau]
  return (
    <div className={`${styles.bandeau} ${styles[annonce.niveau]}`} role="status">
      <div className={styles.contenu}>
        <span className={styles.pictogramme} aria-hidden="true">
          {niveau.symbole}
        </span>
        <p className={styles.texte}>
          <strong>{niveau.libelle} : </strong>
          {annonce.texte}
        </p>
        {masquable && (
          <button type="button" className={styles.fermer} onClick={masquer} aria-label="Masquer ce message">
            ×
          </button>
        )}
      </div>
    </div>
  )
}
