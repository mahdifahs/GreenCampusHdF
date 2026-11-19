import { Navigate, Outlet } from 'react-router-dom'
import { useAuth } from '../lib/AuthContext'

export function ProtectedRoute() {
  const { participant, chargement } = useAuth()
  if (chargement) return null
  if (!participant) return <Navigate to="/connexion" replace />
  return <Outlet />
}
