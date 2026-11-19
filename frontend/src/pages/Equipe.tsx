import { Card } from '../components/Card'
import styles from './Equipe.module.css'

interface Developpeur {
  prenom: string
  nom: string
}

const DEVELOPPEURS: Developpeur[] = [
  { prenom: 'Ethan', nom: 'Bastien' },
  { prenom: 'Ethan', nom: 'Joets' },
  { prenom: 'Mahdi', nom: 'Fahs' },
]

interface AutreMembre {
  prenom: string
  initiale: string
}

const AUTRES_MEMBRES: AutreMembre[] = [
  { prenom: 'Gyhane', initiale: 'E' },
  { prenom: 'Yanis', initiale: 'H' },
  { prenom: 'Conscience Fredlain', initiale: 'N' },
  { prenom: 'Evan', initiale: 'A' },
  { prenom: 'Romain', initiale: 'B' },
  { prenom: 'Thea', initiale: 'H' },
  { prenom: 'Theo', initiale: 'H' },
  { prenom: 'Nathan', initiale: 'M' },
  { prenom: 'Lilou', initiale: 'T' },
  { prenom: 'Léo', initiale: 'V' },
  { prenom: 'Vicky', initiale: 'D' },
  { prenom: 'Kessy', initiale: 'D' },
  { prenom: 'Noa', initiale: 'G' },
  { prenom: 'Glodie', initiale: 'K' },
  { prenom: 'Samia', initiale: 'K' },
  { prenom: 'Mélissande', initiale: 'M' },
  { prenom: 'Ayoub', initiale: 'M' },
  { prenom: 'Oceane', initiale: 'H' },
  { prenom: 'Florian', initiale: 'K' },
  { prenom: 'Pierre', initiale: 'L' },
  { prenom: 'Pauline', initiale: 'L' },
  { prenom: 'Valentin', initiale: 'R' },
  { prenom: 'Victor', initiale: 'S' },
  { prenom: 'Arthur', initiale: 'X' },
]

export function Equipe() {
  return (
    <main className="page">
      <h1>L'équipe</h1>
      <p className={styles.intro}>
        GreenCampus HdF est un projet étudiant du module polytechnique « Agir pour modifier son
        empreinte écologique » (UPHF / INSA Hauts-de-France).
      </p>

      <div className={styles.sections}>
        <Card>
          <h2>Développeurs</h2>
          <p className={styles.legende}>Conception et développement de l'application.</p>
          <ul className={styles.liste}>
            {DEVELOPPEURS.map((d) => (
              <li key={`${d.prenom}-${d.nom}`}>
                {d.prenom} {d.nom}
              </li>
            ))}
          </ul>
        </Card>

        <Card>
          <h2>Autres membres du groupe</h2>
          <p className={styles.legende}>Contenu, questions du stand, animation le jour J.</p>
          <ul className={styles.liste}>
            {AUTRES_MEMBRES.map((m) => (
              <li key={m.prenom}>
                {m.prenom} {m.initiale}.
              </li>
            ))}
          </ul>
        </Card>
      </div>
    </main>
  )
}
