import { useEffect, useRef } from 'react'
import { Link, NavLink, Outlet, useLocation } from 'react-router-dom'
import { useAuth } from '../lib/AuthContext'
import { Annonce } from './Annonce'
import styles from './Layout.module.css'

const ONGLETS_PARTICIPANT = [
  { to: '/', label: 'Accueil', end: true },
  { to: '/bilan', label: 'Bilan' },
  { to: '/defis', label: 'Défis' },
  { to: '/suivi', label: 'Suivi' },
  { to: '/tableau-de-bord', label: 'Tableau de bord' },
  { to: '/ia-responsable', label: 'IA responsable' },
]

const ONGLETS_PUBLIC = [
  { to: '/', label: 'Accueil', end: true },
  { to: '/tableau-de-bord', label: 'Tableau de bord' },
  { to: '/ia-responsable', label: 'IA responsable' },
]

export function Layout() {
  const { participant, deconnecter } = useAuth()
  const onglets = participant ? ONGLETS_PARTICIPANT : ONGLETS_PUBLIC
  const { pathname } = useLocation()
  const barre = useRef<HTMLElement>(null)

  // Sur mobile la barre d'onglets défile : on ramène l'onglet de la page courante dans la vue.
  useEffect(() => {
    barre.current?.querySelector('[aria-current="page"]')?.scrollIntoView({ block: 'nearest', inline: 'nearest' })
  }, [pathname, participant])

  return (
    <div>
      <header className={styles.header}>
        <Link to="/" className={styles.wordmark}>
          <img src="/favicon.svg" alt="" width={30} height={30} className={styles.icone} />
          <span>
            Green<span style={{ color: 'var(--logo)' }}>Campus</span>
          </span>
        </Link>
        <div className={styles.session}>
          {participant ? (
            <>
              <Link to="/mon-compte" className={styles.pseudo}>
                {participant.pseudo}
              </Link>
              <button type="button" className={styles.deconnexion} onClick={deconnecter}>
                Se déconnecter
              </button>
            </>
          ) : (
            <Link to="/connexion" className={styles.connexion}>
              Se connecter
            </Link>
          )}
        </div>
      </header>
      <nav className={styles.nav} ref={barre}>
        {onglets.map((onglet) => (
          <NavLink
            key={onglet.to}
            to={onglet.to}
            end={onglet.end}
            className={({ isActive }) => `${styles.lien}${isActive ? ` ${styles.actif}` : ''}`}
          >
            {onglet.label}
          </NavLink>
        ))}
      </nav>
      <Annonce />
      <Outlet />
      <footer className={styles.footer}>
        <Link to="/equipe">L'équipe</Link>
        <Link to="/sources">Sources et méthode</Link>
        <Link to="/confidentialite">Protection des données</Link>
      </footer>
    </div>
  )
}
