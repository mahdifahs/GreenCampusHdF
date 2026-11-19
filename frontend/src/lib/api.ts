// Client API minimal : chemins relatifs (proxy Vite en dev, même origine en prod).
// La session vit dans un cookie HttpOnly posé par l'API (gc_session, 60 jours) : le JavaScript
// de la page ne voit jamais le jeton, une faille XSS ne pourrait donc pas le voler.

import { signalerMaintenance } from './maintenance'

export type Annee =
  | 'L1'
  | 'L2'
  | 'L3'
  | 'BUT1'
  | 'BUT2'
  | 'BUT3'
  | 'M1'
  | 'M2'
  | 'INGE1'
  | 'INGE2'
  | 'INGE3'
  | 'INGE4'
  | 'INGE5'
  | 'DOCTORAT'
  | 'AUTRE'

export type Filiere = { id: number; slug: string; libelle: string }

export type Categorie = 'transport' | 'alimentation' | 'logement' | 'divers' | 'servicesSocietaux'

export type Question = {
  dottedName: string
  question: string
  categorie: string
  type: 'nombre' | 'choix' | 'oui-non'
  unite: string | null
  possibilites: { valeur: string; titre: string }[]
}

export type Bilan = {
  id: string
  type: 'STAND' | 'COMPLET'
  totalKg: number
  parCategorie: Record<Categorie, number>
  categorieDominante: 'transport' | 'alimentation' | 'logement' | 'divers'
  nbReponses: number
  createdAt: string
}

export type BilanDetail = Bilan & { situation: Record<string, number | string> }

export type CategorieDefi = 'TRANSPORT' | 'ALIMENTATION' | 'LOGEMENT' | 'DIVERS' | 'NUMERIQUE'

export type Defi = {
  id: number
  slug: string
  titre: string
  description: string
  categorie: CategorieDefi
  co2EviteKgSemaine: number
  source: string
  recommande: boolean
}

export type Catalogue = {
  categorieDominante: 'transport' | 'alimentation' | 'logement' | 'divers' | null
  defis: Defi[]
}

export type StatutEngagement = 'EN_COURS' | 'VALIDE' | 'NON_TENU'

export type Engagement = {
  id: string
  defi: { id: number; slug: string; titre: string; categorie: CategorieDefi }
  semaine: string
  co2EviteKgSemaine: number
  statut: StatutEngagement
  createdAt: string
  reponduAt: string | null
  // « Tenu » n'est accepté qu'à partir de cette date (délai minimum après le choix du défi).
  validableAt: string
}

export type Impact = { co2EviteKg: number; defisValides: number; defisEnCours: number; defisNonTenus: number }

export type EtapeSuivi = 'J7' | 'J14'

export type QuestionSuivi =
  | { id: string; question: string; type: 'choix'; options: { valeur: string; libelle: string }[] }
  | { id: string; question: string; type: 'echelle'; min: number; max: number; libelleMin: string; libelleMax: string }

export type EtapeAFaire = {
  etape: EtapeSuivi
  disponibleLe: string
  disponible: boolean
  questions: QuestionSuivi[]
}

export type SuivisAFaire = { jourZero: string | null; etapes: EtapeAFaire[] }

export type Participant = {
  id: string
  pseudo: string
  filiere: { id: number; libelle: string }
  annee: Annee
  createdAt: string
}

export type TableauDeBord = {
  seuilAnonymat: number
  participants: number
  participantsAvecBilan: number
  empreinteMoyenneKg: number | null
  parCategorieMoyenne: Record<string, number> | null
  co2EviteKg: number
  defisValides: number
  defisEnCours: number
  defisNonTenus: number
  defisPopulaires: { titre: string; engagements: number }[]
  classementFilieres: {
    rang: number
    filiere: { id: number; libelle: string }
    participants: number
    bilans: number
    empreinteMoyenneKg: number | null
    co2EviteKg: number
    co2EviteKgParParticipant: number
    defisValides: number
  }[]
  filieresMasquees: number
  suivis: { reponsesJ7: number; reponsesJ14: number; changementDeclareJ14: Record<string, number> }
  quiz: { parties: number; tauxReussite: number | null }
  misAJourA: string
}

export type Evenement = {
  id: string
  titre: string
  description: string | null
  lieu: string | null
  dateDebut: string
  dateFin: string | null
}

// Simple indicateur (pas un secret) : évite d'appeler /api/me à chaque visite d'une personne
// qui n'a jamais ouvert de session. La vraie preuve de session reste le cookie.
const CLE_SESSION = 'greencampus-session'

export function sessionProbable(): boolean {
  try {
    // Ancien stockage du jeton (avant le cookie HttpOnly) : on l'efface au passage.
    localStorage.removeItem('greencampus-token')
    return localStorage.getItem(CLE_SESSION) === '1'
  } catch {
    // stockage indisponible (navigation privée stricte) : on vérifie auprès de l'API.
    return true
  }
}

function marquerSession(ouverte: boolean) {
  try {
    if (ouverte) localStorage.setItem(CLE_SESSION, '1')
    else localStorage.removeItem(CLE_SESSION)
  } catch {
    // stockage indisponible : sans conséquence, voir sessionProbable().
  }
}

export class ApiError extends Error {
  statusCode: number
  code: string
  details?: { champ: string; message: string }[]

  constructor(statusCode: number, code: string, message: string, details?: { champ: string; message: string }[]) {
    super(message)
    this.statusCode = statusCode
    this.code = code
    this.details = details
  }
}

async function apiFetch<T>(path: string, options: RequestInit = {}): Promise<T> {
  const reponse = await fetch(`/api${path}`, {
    ...options,
    // Valeur par défaut, explicitée : le cookie de session part avec chaque appel au même site.
    credentials: 'same-origin',
    headers: {
      ...(options.body ? { 'content-type': 'application/json' } : {}),
      ...options.headers,
    },
  })

  if (reponse.status === 401) marquerSession(false)

  if (!reponse.ok) {
    const corps = await reponse.json().catch(() => null)
    if (reponse.status === 503 && corps?.code === 'MAINTENANCE') signalerMaintenance()
    throw new ApiError(
      reponse.status,
      corps?.code ?? 'ERREUR_INCONNUE',
      corps?.message ?? `Erreur ${reponse.status}`,
      corps?.details,
    )
  }

  if (reponse.status === 204) return undefined as T
  return reponse.json() as Promise<T>
}

export const listerFilieres = () => apiFetch<Filiere[]>('/filieres')

export const listerEvenements = () => apiFetch<Evenement[]>('/evenements')

export type NiveauAnnonce = 'INFO' | 'ATTENTION' | 'IMPORTANT'

// Message d'information publié depuis l'admin (bandeau en haut de toutes les pages).
// `version` change à chaque modification : sert à réafficher un message masqué puis modifié.
export type Annonce = { texte: string; niveau: NiveauAnnonce; fin: string | null; version: string }

export const lireAnnonce = () => apiFetch<{ annonce: Annonce | null }>('/annonce')

export const tableauDeBord = () => apiFetch<TableauDeBord>('/tableau-de-bord')

export type CollecteVetements = {
  nombreRecuperes: number
  nombreDonnes: number
  poidsRecupereKg: number
  poidsDonneKg: number
  co2EviteDonneKg: number
  co2EviteRecupereKg: number
  donneesIncompletes: boolean
}

export const collecteVetements = () => apiFetch<CollecteVetements>('/vetements/collecte')

export type SourceIa = { titre: string; url: string; date: string }

export type GuideIa = {
  titre: string
  miseAJour: string
  introduction: string
  chiffresCles: { valeur: string; libelle: string; source: SourceIa }[]
  ordreDeGrandeur: { texte: string; source: SourceIa }
  conseils: { titre: string; explication: string; source: SourceIa }[]
  ideesRecues: { idee: string; realite: string; source: SourceIa }[]
  outils: { nom: string; description: string; url: string }[]
  sources: SourceIa[]
}

export type QuestionQuiz = {
  id: string
  theme: string
  question: string
  choix: { id: string; texte: string }[]
}

export type CorrectionQuiz = {
  score: number
  total: number
  corrections: {
    questionId: string
    question: string
    choix: string
    correct: boolean
    bonneReponse: string
    explication: string
    source: SourceIa
    tauxReussite: number
  }[]
}

export const guideIa = () => apiFetch<GuideIa>('/guide-ia')

export const questionsQuiz = () => apiFetch<QuestionQuiz[]>('/quiz')

export const corrigerQuiz = (reponses: Record<string, string>) =>
  apiFetch<CorrectionQuiz>('/quiz/reponses', { method: 'POST', body: JSON.stringify({ reponses }) })

export async function inscrire(data: { filiereId: number; annee: Annee; consentement: true }) {
  const resultat = await apiFetch<{ participant: Participant; codeRecuperation: string }>('/participants', {
    method: 'POST',
    body: JSON.stringify(data),
  })
  marquerSession(true)
  return resultat
}

export async function connecter(codeRecuperation: string) {
  const resultat = await apiFetch<{ participant: Participant }>('/sessions', {
    method: 'POST',
    body: JSON.stringify({ codeRecuperation }),
  })
  marquerSession(true)
  return resultat
}

export const monProfil = () => apiFetch<Participant>('/me')

export const modifierProfil = (data: { filiereId?: number; annee?: Annee }) =>
  apiFetch<Participant>('/me', { method: 'PATCH', body: JSON.stringify(data) })

// L'API efface aussi le cookie de session.
export async function supprimerCompte() {
  await apiFetch<void>('/me', { method: 'DELETE' })
  marquerSession(false)
}

// Le cookie est HttpOnly : seule l'API peut l'effacer. Même si l'appel échoue (réseau coupé),
// on oublie la session côté page ; le cookie restant expirera de lui-même.
export async function deconnecter() {
  marquerSession(false)
  await apiFetch<void>('/sessions', { method: 'DELETE' }).catch(() => undefined)
}

export const questionsStand = () => apiFetch<Question[]>('/bilans/questions-stand')

export async function dernierBilan(): Promise<BilanDetail | null> {
  try {
    return await apiFetch<BilanDetail>('/bilans/dernier')
  } catch (e) {
    if (e instanceof ApiError && e.statusCode === 404) return null
    throw e
  }
}

export const enregistrerBilan = (situation: Record<string, number | string>) =>
  apiFetch<Bilan>('/bilans', { method: 'POST', body: JSON.stringify({ type: 'STAND', situation }) })

export type Estimation = { totalKg: number; parCategorie: Record<Categorie, number>; applicables: string[] }

// Calcul en direct pendant la saisie, rien n'est enregistré.
export const estimerBilan = (situation: Record<string, number | string>) =>
  apiFetch<Estimation>('/bilans/estimation', { method: 'POST', body: JSON.stringify({ situation }) })

export const catalogueDefis = () => apiFetch<Catalogue>('/defis')

export const mesEngagements = (periode: 'semaine' | 'tout' = 'semaine') =>
  apiFetch<Engagement[]>(`/engagements?periode=${periode}`)

export const sEngager = (defiId: number) =>
  apiFetch<Engagement>('/engagements', { method: 'POST', body: JSON.stringify({ defiId }) })

export const repondreEngagement = (id: string, statut: 'VALIDE' | 'NON_TENU') =>
  apiFetch<Engagement>(`/engagements/${id}`, { method: 'PATCH', body: JSON.stringify({ statut }) })

export const abandonnerEngagement = (id: string) => apiFetch<void>(`/engagements/${id}`, { method: 'DELETE' })

export const monImpact = () => apiFetch<Impact>('/me/impact')

export const suivisAFaire = () => apiFetch<SuivisAFaire>('/suivis/a-faire')

export const repondreSuivi = (etape: EtapeSuivi, reponses: Record<string, string | number>) =>
  apiFetch<{ etape: EtapeSuivi; createdAt: string }>('/suivis', { method: 'POST', body: JSON.stringify({ etape, reponses }) })

export const clePubliquePush = () => apiFetch<{ clePublique: string | null }>('/push/cle-publique')

export const enregistrerAbonnementPush = (abonnement: PushSubscription) =>
  apiFetch<void>('/push/abonnement', { method: 'POST', body: JSON.stringify(abonnement.toJSON()) })

export const supprimerAbonnementPush = (endpoint: string) =>
  apiFetch<void>('/push/abonnement', { method: 'DELETE', body: JSON.stringify({ endpoint }) })
