import { BrowserRouter, Route, Routes } from 'react-router-dom'
import { ErreurInattendue } from './components/ErreurInattendue'
import { Layout } from './components/Layout'
import { Maintenance } from './components/Maintenance'
import { ProtectedRoute } from './components/ProtectedRoute'
import { AuthProvider } from './lib/AuthContext'
import { Accueil } from './pages/Accueil'
import { Bilan } from './pages/Bilan'
import { Connexion } from './pages/Connexion'
import { Defis } from './pages/Defis'
import { Equipe } from './pages/Equipe'
import { IaResponsable } from './pages/IaResponsable'
import { Installer } from './pages/Installer'
import { MonCompte } from './pages/MonCompte'
import { PageIntrouvable } from './pages/PageIntrouvable'
import { ProtectionDonnees } from './pages/ProtectionDonnees'
import { Sources } from './pages/Sources'
import { Suivi } from './pages/Suivi'
import { TableauDeBord } from './pages/TableauDeBord'

function App() {
  return (
    <ErreurInattendue>
      <Maintenance>
        <AuthProvider>
          <BrowserRouter>
            <Routes>
              <Route path="/connexion" element={<Connexion />} />
              <Route element={<Layout />}>
                <Route path="/" element={<Accueil />} />
                <Route path="/tableau-de-bord" element={<TableauDeBord />} />
                <Route path="/confidentialite" element={<ProtectionDonnees />} />
                <Route path="/equipe" element={<Equipe />} />
                <Route path="/ia-responsable" element={<IaResponsable />} />
                <Route path="/sources" element={<Sources />} />
                <Route path="/installer" element={<Installer />} />
                <Route element={<ProtectedRoute />}>
                  <Route path="/bilan" element={<Bilan />} />
                  <Route path="/defis" element={<Defis />} />
                  <Route path="/suivi" element={<Suivi />} />
                  <Route path="/mon-compte" element={<MonCompte />} />
                </Route>
                <Route path="*" element={<PageIntrouvable />} />
              </Route>
            </Routes>
          </BrowserRouter>
        </AuthProvider>
      </Maintenance>
    </ErreurInattendue>
  )
}

export default App
