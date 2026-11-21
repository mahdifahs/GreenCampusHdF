import type { ReactNode } from 'react'
import styles from './Badge.module.css'

type BadgeProps = {
  variant?: 'eco' | 'pop' | 'neutral' | 'alerte'
  children: ReactNode
  className?: string
}

export function Badge({ variant = 'neutral', children, className }: BadgeProps) {
  return <span className={[styles.badge, styles[variant], className].filter(Boolean).join(' ')}>{children}</span>
}
