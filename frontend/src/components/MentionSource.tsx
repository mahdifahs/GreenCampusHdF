import type { ReactNode } from 'react'
import { Link } from 'react-router-dom'
import styles from './MentionSource.module.css'

// Courte ligne de source sous un chiffre, avec un lien vers la page qui détaille la méthode.
export function MentionSource({ children, ancre }: { children: ReactNode; ancre?: string }) {
  return (
    <p className={styles.mention}>
      {children} <Link to={ancre ? `/sources#${ancre}` : '/sources'}>Sources et méthode</Link>
    </p>
  )
}
