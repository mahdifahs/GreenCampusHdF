import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { Button } from '../components/Button'
import { Card } from '../components/Card'
import styles from './Installer.module.css'

type Systeme = 'iphone' | 'android'

// Événement non standard de Chrome/Edge/Samsung Internet sur Android : permet d'afficher la
// fenêtre d'installation depuis un bouton de la page.
interface InvitationInstallation extends Event {
  prompt: () => Promise<void>
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>
}

function detecterSysteme(): Systeme | null {
  const ua = navigator.userAgent
  // Les iPad récents se présentent comme un Mac : on les reconnaît à l'écran tactile.
  if (/iPhone|iPad|iPod/.test(ua) || (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1)) return 'iphone'
  if (/Android/.test(ua)) return 'android'
  return null
}

function dejaInstalle() {
  return (
    window.matchMedia('(display-mode: standalone)').matches ||
    (navigator as Navigator & { standalone?: boolean }).standalone === true
  )
}

export function Installer() {
  const detecte = detecterSysteme()
  const [systeme, setSysteme] = useState<Systeme>(detecte ?? 'iphone')
  const [invitation, setInvitation] = useState<InvitationInstallation | null>(null)
  const [installe, setInstalle] = useState(dejaInstalle)

  useEffect(() => {
    const surInvitation = (ev: Event) => {
      ev.preventDefault()
      setInvitation(ev as InvitationInstallation)
    }
    const surInstallation = () => setInstalle(true)
    window.addEventListener('beforeinstallprompt', surInvitation)
    window.addEventListener('appinstalled', surInstallation)
    return () => {
      window.removeEventListener('beforeinstallprompt', surInvitation)
      window.removeEventListener('appinstalled', surInstallation)
    }
  }, [])

  async function installerDirectement() {
    if (!invitation) return
    await invitation.prompt()
    const { outcome } = await invitation.userChoice
    if (outcome === 'accepted') setInstalle(true)
    setInvitation(null)
  }

  return (
    <main className="page">
      <h1>Installer l'application</h1>
      <p className={styles.intro}>
        GreenCampus s'installe sur ton téléphone comme une application, sans passer par un store : une icône sur
        ton écran d'accueil, et surtout les <strong>rappels</strong> 7 et 14 jours après ton bilan. Sur iPhone,
        l'installation est même obligatoire pour recevoir les rappels.
      </p>

      {installe ? (
        <Card className={styles.installe}>
          <h2>C'est déjà fait !</h2>
          <p>
            Tu utilises GreenCampus depuis l'application installée. Il ne reste qu'à activer les rappels sur la
            page <Link to="/suivi">Suivi</Link>.
          </p>
        </Card>
      ) : (
        <>
          <div className={styles.onglets} role="tablist" aria-label="Ton téléphone">
            {(
              [
                ['iphone', 'iPhone'],
                ['android', 'Android'],
              ] as const
            ).map(([id, libelle]) => (
              <button
                key={id}
                type="button"
                role="tab"
                id={`onglet-${id}`}
                aria-selected={systeme === id}
                aria-controls={`panneau-${id}`}
                className={systeme === id ? styles.ongletActif : styles.onglet}
                onClick={() => setSysteme(id)}
              >
                {libelle}
                {detecte === id && <span className={styles.detecte}> (ton téléphone)</span>}
              </button>
            ))}
          </div>

          {systeme === 'iphone' ? (
            <Card className={styles.panneau}>
              <div role="tabpanel" id="panneau-iphone" aria-labelledby="onglet-iphone">
                <p className={styles.prerequis}>
                  Il faut <strong>iOS 16.4 ou plus récent</strong> (Réglages, Général, Informations, Version
                  d'iOS).
                </p>
                <ol className={styles.etapes}>
                  <li>
                    Ouvre ce site dans <strong>Safari</strong>.
                  </li>
                  <li>
                    Touche le bouton <strong>Partager</strong> (le carré avec une flèche vers le haut), en bas de
                    l'écran.
                  </li>
                  <li>
                    Fais défiler et choisis <strong>« Sur l'écran d'accueil »</strong>, puis touche{' '}
                    <strong>Ajouter</strong>.
                  </li>
                  <li>
                    Ouvre GreenCampus <strong>depuis la nouvelle icône</strong> (pas depuis Safari).
                  </li>
                  <li>
                    Reconnecte-toi avec ton <strong>code de récupération</strong> : sur iPhone, l'application
                    installée ne partage pas la session de Safari.
                  </li>
                  <li>
                    Va sur <Link to="/suivi">Suivi</Link>, touche <strong>Activer les rappels</strong>, puis{' '}
                    <strong>Autoriser</strong>.
                  </li>
                </ol>
              </div>
            </Card>
          ) : (
            <Card className={styles.panneau}>
              <div role="tabpanel" id="panneau-android" aria-labelledby="onglet-android">
                {invitation && (
                  <div className={styles.direct}>
                    <p>Ton navigateur peut installer GreenCampus directement :</p>
                    <Button onClick={installerDirectement}>Installer GreenCampus</Button>
                  </div>
                )}
                <ol className={styles.etapes}>
                  <li>
                    Ouvre ce site dans <strong>Chrome</strong> (ou Brave, Edge, Samsung Internet).
                  </li>
                  <li>
                    Touche le menu <strong>⋮</strong> en haut à droite (en bas sur Samsung Internet).
                  </li>
                  <li>
                    Choisis <strong>« Installer l'application »</strong> ou{' '}
                    <strong>« Ajouter à l'écran d'accueil »</strong>, puis confirme.
                  </li>
                  <li>Ouvre GreenCampus depuis la nouvelle icône.</li>
                  <li>
                    Va sur <Link to="/suivi">Suivi</Link>, touche <strong>Activer les rappels</strong>, puis{' '}
                    <strong>Autoriser</strong>.
                  </li>
                </ol>
                <div className={styles.astuce}>
                  <h2>Xiaomi, Redmi ou POCO</h2>
                  <p>
                    Ces téléphones bloquent les notifications quand le navigateur est fermé. Dans Paramètres,
                    Applications, puis ton navigateur :
                  </p>
                  <ul>
                    <li>
                      autorise les <strong>raccourcis sur l'écran d'accueil</strong> (sinon l'icône n'apparaît
                      pas) ;
                    </li>
                    <li>
                      active le <strong>démarrage automatique</strong> ;
                    </li>
                    <li>
                      dans <strong>Économiseur de batterie</strong>, choisis <strong>Aucune restriction</strong>.
                    </li>
                  </ul>
                </div>
              </div>
            </Card>
          )}

          <p className={styles.note}>
            Sur ordinateur, les rappels marchent directement dans le navigateur, sans rien installer.
          </p>
        </>
      )}
    </main>
  )
}
