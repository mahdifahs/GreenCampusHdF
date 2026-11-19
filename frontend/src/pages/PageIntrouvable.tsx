import { Link, useLocation, useNavigate } from 'react-router-dom'
import { Button } from '../components/Button'
import styles from './PageIntrouvable.module.css'

// Route attrapée par `path="*"` : adresse mal tapée, lien périmé, ancienne page supprimée.
// Affichée dans le Layout pour garder la navigation sous la main.
export function PageIntrouvable() {
  const { pathname } = useLocation()
  const navigate = useNavigate()

  return (
    <main className={`page ${styles.page}`}>
      <p className={styles.code} aria-hidden="true">
        404
      </p>
      <h1>Cette page n'existe pas</h1>
      <p className={styles.texte}>
        L'adresse <code>{pathname}</code> ne correspond à aucune page du site. Elle a peut-être été mal
        tapée, ou le lien n'est plus à jour.
      </p>
      <div className={styles.actions}>
        <Button onClick={() => navigate('/')}>Revenir à l'accueil</Button>
        <Link className={styles.lien} to="/tableau-de-bord">
          Voir le tableau de bord
        </Link>
      </div>
    </main>
  )
}
