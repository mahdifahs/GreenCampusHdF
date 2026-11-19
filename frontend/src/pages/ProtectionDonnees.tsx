import { Link } from 'react-router-dom'
import { Card } from '../components/Card'
import styles from './ProtectionDonnees.module.css'

const CONTACT = 'greencampus.hdf@gmail.com'

export function ProtectionDonnees() {
  return (
    <main className="page">
      <h1>Protection des données</h1>
      <p style={{ color: 'var(--muted)', marginTop: 'var(--sp-2)' }}>
        GreenCampus HdF est un projet étudiant du module « Agir pour modifier son empreinte
        écologique » (UPHF / INSA Hauts-de-France). Cette page explique simplement quelles
        données sont utilisées, pourquoi, et comment les contrôler.
      </p>

      <div className={styles.sections}>
        <Card>
          <h2>Qui est responsable</h2>
          <p>
            Les données sont gérées par l'équipe étudiante du projet GreenCampus HdF, dans le
            cadre du module encadré par l'UPHF / INSA Hauts-de-France. Pour toute question sur
            tes données : <a href={`mailto:${CONTACT}`}>{CONTACT}</a>.
          </p>
        </Card>

        <Card>
          <h2>Aucune donnée d'identité</h2>
          <p>
            Ton compte n'est associé à aucun nom, email ou numéro de téléphone. À l'inscription,
            un pseudo et un code de récupération sont générés automatiquement : c'est tout ce qui
            t'identifie. L'équipe du projet ne connaît pas ton identité réelle et ne cherche pas
            à la retrouver. Seule exception technique : en cas d'incident de sécurité, l'adresse
            IP de la connexion est notée pendant 30 jours (voir « Sécurité du service »).
          </p>
        </Card>

        <Card>
          <h2>Ce qui est utilisé</h2>
          <ul className={styles.liste}>
            <li>Pseudo et code de récupération (générés, pas choisis ; le code est enregistré
              sous une forme protégée que personne ne peut relire)</li>
            <li>Filière et année d'études</li>
            <li>Dates d'inscription et de dernière visite</li>
            <li>Réponses à ton bilan carbone et à tes questionnaires de suivi</li>
            <li>Les défis auxquels tu t'engages et leur résultat</li>
          </ul>
          <p>
            Le questionnaire de suivi ne comporte aucun champ de texte libre : seulement des
            choix et des échelles, pour qu'il reste impossible d'y écrire une information
            personnelle par mégarde.
          </p>
        </Card>

        <Card>
          <h2>Pourquoi</h2>
          <p>
            Ces données servent uniquement à te proposer un bilan et des défis personnalisés, et
            à construire les statistiques collectives et anonymes affichées sur le{' '}
            <Link to="/tableau-de-bord">tableau de bord</Link>, sans aucune revente, aucun usage
            publicitaire, aucun traceur ni outil de mesure d'audience.
          </p>
          <p>
            Ces données sont utilisées avec ton accord, donné en cochant la case à l'inscription.
            Tu peux le retirer à tout moment en supprimant ton compte.
          </p>
        </Card>

        <Card>
          <h2>Sécurité du service</h2>
          <p>
            Pour protéger le site contre les attaques (essais de mots de passe ou de codes au
            hasard, envois massifs de requêtes), certains évènements de sécurité sont notés avec
            l'adresse IP de la connexion et leur date. Ce journal sert uniquement à bloquer les
            abus, n'est consulté que par l'équipe et est effacé automatiquement au bout de
            30 jours.
          </p>
          <p>
            Ton navigateur garde ta session de connexion dans un cookie, pour que tu n'aies pas à te
            reconnecter à chaque visite (pendant 60 jours au plus, ou jusqu'à ce que tu te
            déconnectes). Ce cookie est indispensable au fonctionnement et ne sert à rien d'autre :
            il n'y a ni cookie publicitaire ni traceur.
          </p>
        </Card>

        <Card>
          <h2>Rappels (facultatifs)</h2>
          <p>
            Si tu actives les rappels sur la page Suivi, ton navigateur fournit une adresse technique de
            notification, enregistrée avec ton compte. Les deux messages (7 et 14 jours après ton premier bilan)
            passent par le service de notification de ton navigateur (Google, Mozilla ou Apple selon l'appareil),
            qui peut être situé hors de l'Union européenne. Ils ne contiennent aucune donnée personnelle ni aucun
            résultat de bilan. Tu peux les désactiver à tout moment ; ils le sont aussi automatiquement quand tu te
            déconnectes ou supprimes ton compte.
          </p>
        </Card>

        <Card>
          <h2>Où sont stockées tes données</h2>
          <p>
            Le site et sa base de données sont hébergés par Amazon Web Services (AWS), dans un
            centre de données situé à Stockholm (Suède), dans l'Union européenne. AWS agit
            uniquement comme prestataire technique et n'utilise pas ces données pour son propre
            compte. Les sauvegardes quotidiennes de la base restent dans la même région et sont
            gardées 7 jours.
          </p>
        </Card>

        <Card>
          <h2>Qui y a accès</h2>
          <p>
            L'équipe du projet peut consulter les pseudos et l'activité des comptes dans
            l'administration, uniquement pour repérer et limiter les abus (réponses en rafale,
            triche sur les défis). Ces données restent pseudonymes : l'équipe ne voit jamais ton
            identité réelle, qu'elle ne connaît pas.
          </p>
        </Card>

        <Card>
          <h2>Anonymat du tableau de bord</h2>
          <p>
            Le classement public par filière n'affiche une moyenne qu'à partir d'un nombre
            minimum de participants. En dessous de ce seuil, rien n'est affiché, pour qu'une
            moyenne ne puisse jamais être rattachée à une poignée de personnes identifiables.
          </p>
        </Card>

        <Card>
          <h2>Combien de temps</h2>
          <p>
            Les données sont conservées le temps du projet, jusqu'au 21 décembre 2026, puis
            supprimées de la base et de ses sauvegardes. Le journal de sécurité et les journaux
            techniques du serveur, eux, sont effacés au bout de 30 jours.
          </p>
        </Card>

        <Card>
          <h2>Tes droits</h2>
          <p>
            Tu n'as besoin de contacter personne : depuis{' '}
            <Link to="/mon-compte">Mon compte</Link>, tu peux à tout moment consulter ton profil,
            modifier ta filière ou ton année, ou supprimer définitivement ton compte et toutes
            tes données, immédiatement.
          </p>
          <p>
            Pour toute autre question ou demande, écris à{' '}
            <a href={`mailto:${CONTACT}`}>{CONTACT}</a>. Si tu estimes que tes droits ne sont pas
            respectés, tu peux aussi adresser une réclamation à la CNIL
            (<a href="https://www.cnil.fr" target="_blank" rel="noreferrer">cnil.fr</a>).
          </p>
        </Card>
      </div>
    </main>
  )
}
