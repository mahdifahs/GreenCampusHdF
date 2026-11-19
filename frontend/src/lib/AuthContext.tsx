import { createContext, useContext, useEffect, useState } from 'react'
import type { ReactNode } from 'react'
import * as api from './api'
import type { Annee, Participant } from './api'
import { desactiverRappels } from './push'

type AuthState = {
  participant: Participant | null
  chargement: boolean
  inscrire: (data: { filiereId: number; annee: Annee }) => Promise<{ codeRecuperation: string }>
  connecter: (codeRecuperation: string) => Promise<void>
  deconnecter: () => Promise<void>
  modifierProfil: (data: { filiereId?: number; annee?: Annee }) => Promise<void>
  supprimerCompte: () => Promise<void>
}

const AuthContext = createContext<AuthState | null>(null)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [participant, setParticipant] = useState<Participant | null>(null)
  const [chargement, setChargement] = useState(true)

  useEffect(() => {
    if (!api.sessionProbable()) {
      setChargement(false)
      return
    }
    api
      .monProfil()
      .then(setParticipant)
      .catch(() => setParticipant(null))
      .finally(() => setChargement(false))
  }, [])

  const value: AuthState = {
    participant,
    chargement,
    async inscrire({ filiereId, annee }) {
      const resultat = await api.inscrire({ filiereId, annee, consentement: true })
      setParticipant(resultat.participant)
      return { codeRecuperation: resultat.codeRecuperation }
    },
    async connecter(codeRecuperation) {
      const resultat = await api.connecter(codeRecuperation)
      setParticipant(resultat.participant)
    },
    async deconnecter() {
      // Appareil partagé (tablette du stand) : on ne veut plus recevoir les rappels de ce compte.
      // Désabonnement avant de fermer la session, l'API en a besoin pour retirer l'abonnement.
      await desactiverRappels()
      await api.deconnecter()
      setParticipant(null)
    },
    async modifierProfil(data) {
      const resultat = await api.modifierProfil(data)
      setParticipant(resultat)
    },
    async supprimerCompte() {
      await desactiverRappels()
      await api.supprimerCompte()
      setParticipant(null)
    },
  }

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth() {
  const contexte = useContext(AuthContext)
  if (!contexte) throw new Error('useAuth doit être utilisé à l’intérieur de <AuthProvider>.')
  return contexte
}
