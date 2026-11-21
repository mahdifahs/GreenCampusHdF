# Frontend GreenCampus HdF

Interface étudiante : page d'accueil publique (évènements), connexion anonyme (avec QR code de
reconnexion), bilan carbone avec estimation en direct, défis hebdomadaires, suivi J+7/J+14 et
rappels par notification, tableau de bord collectif, espace IA responsable (guide + quiz),
gestion de son compte, page de protection des données et page équipe. React + Vite + TypeScript.

Démarrage, architecture de déploiement et détail de l'API consommée : voir
[`backend/README.md`](../backend/README.md), sections 2 (« Démarrer en local ») et 5
(« Ce que l'infra doit faire »). Ce fichier ne duplique pas cette doc.

## Démarrage rapide

```bash
npm install
npm run dev   # http://localhost:5173, nécessite le backend lancé sur :4000
```

## Structure

```
src/
├── components/   Button, Badge, Card, Field (CSS Modules) + Layout, ProtectedRoute, Rappels,
│                  Maintenance (page de maintenance qui enveloppe tout le site),
│                  Annonce (bandeau d'information publié depuis l'admin)
├── lib/           client API (api.ts), contexte d'authentification (AuthContext.tsx), annees.ts,
│                  push.ts (abonnement Web Push), maintenance.ts
├── pages/         un écran par fichier : Accueil, Connexion, Bilan, Defis, Suivi, TableauDeBord,
│                  IaResponsable, MonCompte, ProtectionDonnees, Equipe, Sources, Installer
├── styles/        tokens.css (identité : couleurs, typo, rayons) + base.css (reset)
├── App.tsx        routage (React Router)
└── main.tsx       point d'entrée, imports des polices auto-hébergées
public/
├── sw.js          service worker : affiche les rappels push, ouvre /suivi au clic
├── favicon.svg, icone-192.png, icone-512.png, manifest.webmanifest
│                  (le manifeste permet l'ajout à l'écran d'accueil, requis pour le push sur iPhone)
```

Identité visuelle : [charte graphique](https://claude.ai/artifact/8TXAdKZXBFRKRc94AGTESE).
Depuis le 13/11/2026, les boutons et textes corail utilisent un **corail « brique »** (`--brand: #b33a26`)
plus foncé que celui de la charte, pour être lisibles (contraste ≥ 4,5:1, norme WCAG AA, vérifié sur
toutes les pages en clair et en sombre). Le logo garde le corail vif (`--logo`). Le texte posé sur le
corail passe par `--sur-brand` (clair en thème clair, foncé en thème sombre) : ne jamais écrire de
couleur en dur pour un texte sur fond `--brand`.

## Parcours automatiques (Playwright)

`npm run test:e2e` pilote un vrai Chromium sur le site complet (API, base dédiée `greencampus_e2e` vidée à
chaque lancement, front construit) : inscription, bilan, défi, reconnexion, suppression du compte,
administration et mode maintenance. Lancés aussi en CI. Détail et prérequis : [e2e/README.md](e2e/README.md).

## Routage

`/` est la page d'accueil publique (`Accueil`, aucune session requise). La connexion
(inscription/reconnexion) est sur `/connexion`, pas sur `/`. `/mon-compte` (protégé) permet
de modifier sa filière/année ou de supprimer son compte, accessible en cliquant sur son
pseudo dans l'en-tête. `/confidentialite` (public) est la page de protection des données,
accessible depuis le pied de page et depuis la case de consentement de l'inscription.
`/equipe` (public) liste les développeurs et les autres membres du groupe (prénom seul +
initiale du nom), accessible depuis le pied de page.
`/installer` (public) : comment installer l'application sur iPhone (Safari, iOS 16.4+, obligatoire pour les rappels) ou Android (bouton d'installation direct quand le navigateur le propose, astuce Xiaomi), avec l'onglet du téléphone détecté ouvert d'office ; lien depuis la carte « Rappels » de la page Suivi.
`/ia-responsable` (public) : quiz anonyme puis guide sourcé (`GET /api/guide-ia`, `/api/quiz`).
`/sources` (public, lien en pied de page) : d'où viennent les chiffres (ADEME / Nos Gestes Climat, Ecobalyse) et leurs limites ; le bilan, les défis et le tableau de bord y renvoient par une courte mention (`components/MentionSource`). Le tableau de bord affiche aussi la collecte de vêtements (`GET /api/vetements/collecte`) dès qu'une quantité est saisie.

## Comportements à connaître

- **Bilan** : à l'ouverture du formulaire puis 600 ms après la dernière saisie, `POST
  /api/bilans/estimation` renvoie le total estimé (bandeau fixé en bas) et les questions encore
  applicables ; les autres sont masquées et ne sont pas envoyées à l'enregistrement. Champs
  « nombre » bornés par `min`/`max` de l'API : hors bornes, message sous le champ et bouton
  d'enregistrement désactivé ; compteur « Repas renseignés : x / 14 » après les plats (rouge au-delà).
  Questions et bornes réglées dans l'onglet admin *Questionnaire*. Carte « Questions de l'équipe »
  (`GET /api/bilans/questions-information`) : facultatives, hors calcul, envoyées dans `informations`.
- **Code de récupération** : le QR code contient `/connexion#code=…` ; le code reste dans le
  fragment de l'URL (jamais envoyé au serveur ni journalisé), puis est effacé de la barre
  d'adresse après connexion.
- **Rappels push** : carte affichée sur Suivi seulement si l'API a des clés VAPID. Le navigateur
  est désabonné à la déconnexion et à la suppression du compte (tablette partagée au stand).
- **Tableau de bord** : rafraîchi toutes les 20 s, uniquement quand l'onglet est visible.
- **Message d'information** : bandeau sous la barre d'onglets de toutes les pages (`Annonce`,
  placé dans `Layout`), publié depuis l'onglet admin « Message du site ». Relu à chaque changement
  de page et toutes les minutes (`GET /api/annonce`). Couleur selon le niveau (Info vert, Attention
  orange, Important rouge), toujours accompagnée du libellé. Le bouton × le masque (version gardée
  dans `localStorage` : un message modifié réapparaît) ; un message Important ne se masque pas.
- **Maintenance** : activée depuis `/admin/` (bouton « Passer en maintenance »). Au chargement, le
  site lit `GET /api/statut` ; tout appel qui reçoit un 503 `MAINTENANCE` le signale aussi
  (`lib/maintenance.ts`). Le composant `Maintenance` affiche alors une page au texte fixe à la
  place de toutes les routes, revérifie toutes les 30 s et recharge le site quand il revient.
