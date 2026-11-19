import { Component } from 'react'
import type { ErrorInfo, ReactNode } from 'react'
import { Button } from './Button'
import styles from './ErreurInattendue.module.css'

// Filet de sécurité : si une page plante pendant l'affichage, on montre un message et un moyen de
// repartir au lieu d'un écran blanc. Le compte et les réponses déjà enregistrées ne sont pas touchés.
// (React n'offre ce mécanisme qu'avec un composant classe.)
export class ErreurInattendue extends Component<{ children: ReactNode }, { erreur: boolean }> {
  state = { erreur: false }

  static getDerivedStateFromError() {
    return { erreur: true }
  }

  componentDidCatch(erreur: Error, info: ErrorInfo) {
    console.error('Erreur inattendue dans une page', erreur, info.componentStack)
  }

  render() {
    if (!this.state.erreur) return this.props.children
    return (
      <main className={styles.page} role="alert">
        <div className={styles.carte}>
          <p className={styles.marque}>
            Green<span>Campus</span>
          </p>
          <h1>Oups, cette page a rencontré un problème</h1>
          <p>
            Ton compte et tes réponses déjà enregistrées ne sont pas touchés. Recharge la page pour réessayer, ou
            reviens à l'accueil.
          </p>
          <div className={styles.actions}>
            <Button onClick={() => window.location.reload()}>Recharger la page</Button>
            <a className={styles.lien} href="/">
              Revenir à l'accueil
            </a>
          </div>
        </div>
      </main>
    )
  }
}
