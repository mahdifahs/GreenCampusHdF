import { useEffect } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { Card } from '../components/Card'
import styles from './ProtectionDonnees.module.css'

const NGC = 'https://nosgestesclimat.fr'
const NGC_MODELE = 'https://github.com/incubateur-ademe/nosgestesclimat'
const ECOBALYSE = 'https://ecobalyse.beta.gouv.fr'

function Externe({ href, children }: { href: string; children: string }) {
  return (
    <a href={href} target="_blank" rel="noreferrer">
      {children}
    </a>
  )
}

export function Sources() {
  // Les mentions du site renvoient vers une section précise (/sources#vetements, …).
  const { hash } = useLocation()
  useEffect(() => {
    if (hash) document.getElementById(hash.slice(1))?.scrollIntoView()
  }, [hash])

  return (
    <main className="page">
      <h1>Sources et méthode</h1>
      <p style={{ color: 'var(--muted)', marginTop: 'var(--sp-2)' }}>
        D'où viennent les chiffres affichés sur GreenCampus, comment ils sont calculés, et leurs
        limites. Ce sont des estimations : elles donnent des ordres de grandeur, pas des mesures
        exactes.
      </p>

      <div className={styles.sections}>
        <Card id="bilan">
          <h2>Ton bilan carbone</h2>
          <p>
            Le calcul utilise le modèle <strong>Nos Gestes Climat</strong> de l'ADEME (Agence de la
            transition écologique), le même que sur <Externe href={NGC}>nosgestesclimat.fr</Externe>.
            Le modèle est public (<Externe href={NGC_MODELE}>code source</Externe>, licence MIT) ;
            GreenCampus utilise sa version 4.10.4.
          </p>
          <p>
            Les questions auxquelles tu ne réponds pas gardent la valeur moyenne d'une personne en
            France. Le total est toujours recalculé par notre serveur à partir de tes réponses. Il
            est exprimé en kilos d'équivalent CO2 par an (kg CO2e/an), une unité qui regroupe tous
            les gaz à effet de serre.
          </p>
        </Card>

        <Card id="defis">
          <h2>Le gain des défis</h2>
          <p>
            Pour chaque défi, le modèle Nos Gestes Climat compare ton bilan actuel avec ce même bilan
            si tu appliquais l'action toute l'année. La différence est divisée par 52 pour obtenir un
            gain par semaine. Le gain dépend donc de tes réponses : un défi qui ne change rien à ta
            situation n'est pas proposé.
          </p>
          <p>
            Un défi est validé sur ta parole (« Tenu » ou « Non tenu ») : le CO2 évité affiché est
            une estimation, pas une mesure de ce que tu as réellement fait.
          </p>
        </Card>

        <Card id="tableau">
          <h2>Le tableau de bord</h2>
          <p>
            Le CO2 évité du campus est la somme des gains des défis validés par tous les
            participants. Une filière n'apparaît dans le classement qu'à partir d'un nombre minimum
            de participants, pour que personne ne puisse être reconnu.
          </p>
        </Card>

        <Card id="vetements">
          <h2>La collecte de vêtements</h2>
          <p>
            L'équipe compte les vêtements récupérés puis donnés, par type (t-shirt, jean…) et par
            matière (coton, polyester…). Les kilos sont estimés ainsi : nombre de vêtements × poids
            moyen du type. Le CO2 évité : kilos × facteur d'émission de la matière.
          </p>
          <ul className={styles.liste}>
            <li>
              <strong>Facteurs d'émission</strong> : <Externe href={ECOBALYSE}>Ecobalyse</Externe>,
              l'outil public d'affichage environnemental des vêtements (ministère de la Transition
              écologique), en simulant un t-shirt de 170 g fait à 100 % de chaque matière et
              fabriqué en France (novembre 2026). Exemple : 17,8 kg CO2e par kilo de coton.
            </li>
            <li>
              Ces facteurs comptent la <strong>fabrication complète du vêtement</strong>, pas
              seulement la fibre : c'est ce qu'évite un vêtement réutilisé au lieu d'en acheter un
              neuf.
            </li>
            <li>
              <strong>Poids moyens</strong> : vêtements de référence d'Ecobalyse (par exemple 150 g
              pour un t-shirt, 450 g pour un jean). Ce sont souvent des valeurs hautes ; l'équipe
              peut les remplacer par des pesées réelles.
            </li>
          </ul>
          <p>
            Limite : on suppose que chaque vêtement donné évite la fabrication d'un vêtement neuf.
            Ce n'est pas toujours le cas, le résultat est donc une estimation haute.
          </p>
        </Card>

        <Card id="ia">
          <h2>L'IA responsable</h2>
          <p>
            Chaque chiffre de la page <Link to="/ia-responsable">IA responsable</Link> renvoie à sa
            propre source, listée en bas de cette page.
          </p>
        </Card>
      </div>
    </main>
  )
}
