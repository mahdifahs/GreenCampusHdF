# Backend GreenCampus HdF

API REST de l'application GreenCampus HdF : bilan carbone basé sur le modèle **Nos Gestes Climat** de l'ADEME, défis hebdomadaires, relances à J+7 et J+14, tableau de bord collectif anonyme, et un espace **IA responsable** (guide sourcé et quiz).

**Stack** : Node.js 22, TypeScript, Fastify 5, Prisma 6, PostgreSQL 17, Zod 4, publicodes, Vitest.

---

## Sommaire

1. [État d'avancement](#1-état-davancement)
2. [Démarrer en local](#2-démarrer-en-local)
3. [Parcours utilisateur et routes](#3-parcours-utilisateur-et-routes)
4. [Ce que le front doit faire](#4-ce-que-le-front-doit-faire)
5. [Ce que l'infra doit faire](#5-ce-que-linfra-doit-faire)
6. [Fonctionnement détaillé](#6-fonctionnement-détaillé)
7. [Sécurité et RGPD](#7-sécurité-et-rgpd)
8. [Tests](#8-tests)
9. [Organisation du code](#9-organisation-du-code)
10. [Reste à faire et limites connues](#10-reste-à-faire-et-limites-connues)

---

## 1. État d'avancement

| Fonctionnalité | État | Vérifié par |
|---|---|---|
| Inscription anonyme (pseudo et code de récupération) | Fonctionnel | Tests automatiques, essai manuel |
| Reconnexion par code, profil, suppression du compte (RGPD) | Fonctionnel | Tests automatiques, essai manuel |
| Bilan carbone avec le modèle Nos Gestes Climat, recalculé côté serveur | Fonctionnel | Tests automatiques, essai manuel, test de charge (30 bilans simultanés) |
| Version courte du bilan pour le stand (29 questions) | Fonctionnel | Tests automatiques |
| Catalogue de 22 défis, gains de CO2 calculés par le modèle de l'ADEME | Fonctionnel | Tests automatiques, essai manuel |
| Engagements (3 par semaine), validation, impact personnel | Fonctionnel | Tests automatiques, essai manuel |
| Questionnaires de suivi J+7 et J+14 | Fonctionnel | Tests automatiques, essai manuel |
| Notifications de relance Web Push | Fonctionnel | Tests automatiques avec un faux envoyeur ; réception réelle vérifiée le 12/11/2026 sur Android (navigateur Brave, site installé sur l'écran d'accueil) et le 17/11/2026 sur iPhone (Safari, site ajouté à l'écran d'accueil, via un tunnel HTTPS) |
| Tableau de bord collectif (seuil d'anonymat, classement des filières) | Fonctionnel | Tests automatiques, essai manuel |
| Documentation interactive de l'API (Swagger / OpenAPI) | Fonctionnel | `/docs` |
| Interface étudiante (`frontend/`, React) : accueil, connexion, bilan, défis, suivi, tableau de bord, mon compte, protection des données | Fonctionnel | Parcours Playwright automatiques en CI (`frontend/e2e/`) : inscription, bilan, défi, reconnexion, suppression, admin, maintenance |
| Image Docker de production | Écrite, compilation vérifiée | À faire : image pas encore construite ni déployée |
| Interface d'administration `/admin/` (statistiques, activation des défis, 9 exports CSV), même identité visuelle que le site public | Fonctionnel | Tests automatiques, essai manuel |
| Gestion des vêtements (jour J) : types et matières admin-gérables, quantités récupérées/données par jour, bilan CO2 chiffré | Fonctionnel, mais poids moyens et facteurs d'émission pas encore renseignés | Tests automatiques, essai manuel ; voir section 6 |
| Modération : liste et fiche des participants, alertes de triche, exclusion des statistiques, blocage, suppression, annulation de défis, journal des actions | Fonctionnel | Tests automatiques, essai manuel |
| Guide « IA responsable » (chiffres clés, 8 conseils, idées reçues, outils, 9 sources) | Fonctionnel | Tests automatiques, essai manuel |
| Quiz IA du stand (6 questions sourcées, réponses anonymes, taux de réussite) | Fonctionnel | Tests automatiques, essai manuel |
| Question « usage de l'IA » dans le questionnaire J+14 | Fonctionnel | Tests automatiques |
| Sécurité (OWASP Top 10 2025, priorités 1 et 2) : journal d'événements, alertes, verrouillage anti-brute-force, CI | Fonctionnel | Tests automatiques, essai manuel ; voir `SECURITY.md` |
| Page d'accueil publique (évènements) et publication côté admin | Fonctionnel | Tests automatiques, essai manuel |
| Page « Mon compte » (modifier filière/année, suppression RGPD) | Fonctionnel | Essai manuel (captures d'écran Playwright) |
| Page « Protection des données » (`/confidentialite`) | Fonctionnel | Essai manuel (captures d'écran Playwright) |
| Page « Équipe » (`/equipe`) | Fonctionnel | Essai manuel (captures d'écran Playwright) |
| Comptes admin nominatifs (prénom + mot de passe généré, gestion par un super-admin : créer/bloquer/réinitialiser/supprimer) | Fonctionnel | Tests automatiques, essai manuel |

**243 tests automatiques** passent (unitaires et intégration sur une vraie base PostgreSQL).

---

## 2. Démarrer en local

Prérequis : **Node.js 22+** et **Docker Desktop** (lancé).

### Option rapide (Windows) : `scripts/dev.ps1`

Depuis la racine du dépôt :

```powershell
./scripts/dev.ps1
```

Le script vérifie la position git (branche, retard/avance sur `origin`), démarre Postgres
(`docker compose up -d db`), applique les migrations, régénère le client Prisma, lance le seed,
puis ouvre le backend et le frontend chacun dans sa propre fenêtre. Il ne configure pas
l'administration (voir ci-dessous) : à faire une fois à la main, même avec ce script.

### Option manuelle (tous systèmes)

```bash
# Depuis la racine du dépôt : base PostgreSQL de développement (crée aussi les bases de test)
docker compose up -d

cd backend
npm install
cp .env.example .env          # puis remplacer JWT_SECRET (commande indiquée dans le fichier)
npx prisma migrate deploy     # crée les tables
npm run db:seed               # insère les 16 filières et les 22 défis
npm run dev                   # API sur http://localhost:4000
```

Base vide (juste les filières/défis) : le tableau de bord, le classement des filières, la
liste des participants en admin, etc. n'auront rien à afficher. Pour voir un rendu réaliste en
développement, `npm run db:seed-demo` (voir section « Scripts » plus bas) crée des participants,
bilans, défis et suivis de test — à relancer à volonté, repart de zéro chaque fois.

### Activer l'administration et créer le premier compte

L'interface `/admin/` est désactivée par défaut. Pour l'activer et créer ton premier compte
(super-admin), avant de lancer `npm run db:seed` :

1. Dans `.env`, mettre `ADMIN_ENABLED=true` et définir `ADMIN_SUPER_PRENOM` (ton prénom) +
   `ADMIN_SUPER_MOT_DE_PASSE` (12 caractères minimum, un mot de passe temporaire choisi par toi).
2. Lancer `npm run db:seed` (ou relancer `scripts/dev.ps1`, qui l'exécute aussi) : le compte
   super-admin est créé **uniquement si aucun compte admin n'existe encore en base** — relancer
   le seed ensuite ne recrée rien et n'écrase rien.
3. Se connecter sur http://localhost:4000/admin/ avec ce prénom et ce mot de passe.
4. Depuis l'onglet **« Comptes admin »**, cliquer sur « Réinitialiser le mot de passe » de ton
   propre compte pour ne plus dépendre du mot de passe temporaire de l'`.env`, puis retirer
   `ADMIN_SUPER_MOT_DE_PASSE` du `.env` (il ne sert plus et ne doit pas traîner en clair).
5. Les comptes suivants (coéquipiers) se créent ensuite depuis cet onglet, pas depuis l'`.env` —
   voir section 7 pour le détail (rôles, blocage, limite de comptes).

| Adresse | Contenu |
|---|---|
| http://localhost:5173 | **Interface étudiante** (React, `frontend/`) : accueil, compte, mon compte, bilan, défis, suivi, tableau de bord, protection des données, équipe |
| http://localhost:4000/admin/ | Interface d'administration de l'équipe (comptes nominatifs, voir ci-dessus) |
| http://localhost:4000/docs | Documentation interactive de l'API (Swagger), avec un bouton « Try it out » sur chaque route |
| http://localhost:4000/docs/json | Spécification OpenAPI brute, pour générer les types côté front |
| `npx prisma studio` | Interface pour parcourir la base sur http://localhost:5555 |

### Frontend (`frontend/`)

Nécessite le backend déjà lancé (`npm run dev` ci-dessus) : le serveur Vite relaie les
appels `/api/...` vers `http://localhost:4000` (voir `frontend/vite.config.ts`), donc le
code du front peut toujours utiliser des chemins relatifs.

```bash
cd frontend
npm install
npm run dev                   # Front sur http://localhost:5173
```

⚠️ `/admin/` reste uniquement sur `:4000` — le serveur Vite ne sert que l'interface React,
le proxy ne couvre que `/api`. Pour l'administration, toujours passer par
`http://localhost:4000/admin/`.

### Scripts

| Commande | Rôle |
|---|---|
| `npm run dev` | Serveur avec rechargement automatique |
| `npm test` | Tests unitaires et d'intégration (base `greencampus_test`) |
| `npm run typecheck` | Vérification des types (src, tests, prisma) |
| `npm run build` puis `npm start` | Compilation dans `dist/`, puis démarrage en production |
| `npm run db:migrate` | Nouvelle migration après une modification de `prisma/schema.prisma` (terminal interactif) |
| `npm run db:deploy` | Applique les migrations existantes sans prompt (`prisma migrate deploy`), utilisé par `scripts/dev.ps1` et le Dockerfile |
| `npm run db:seed` | (Ré)insère les filières et le catalogue de défis, sans doublon ; crée les matières et types de vêtements de référence en complétant seulement les champs vides (voir section 6) ; amorce aussi le premier compte super-admin si `CompteAdmin` est vide (voir « Activer l'administration » ci-dessus) |
| `npm run db:seed-demo` | Remplit la base de **dev** avec des données réalistes pour voir le rendu du site (classement des filières au tableau de bord, participants, défis, suivis, quiz) : vide d'abord `Participant` et `QuizReponse` (repart de zéro à chaque exécution), puis recrée tout via l'API réelle (`app.inject`, comme les tests) — donc le vrai moteur NGC et les vraies règles métier, rien d'inventé à la main. Ne touche jamais aux comptes admin, évènements, vêtements ni au référentiel filières/défis. **Jamais en production** (le script refuse de démarrer si `NODE_ENV=production`) |
| `npm run db:suppression-finale` | **Fin du projet (21/12)** : vide toutes les tables de la base de `DATABASE_URL`. Sans option, affiche seulement ce qui serait effacé ; suppression réelle avec `-- --confirmer <nom de la base>`. En production, dans le conteneur : `node dist/outils/suppression-finale.js`. Procédure complète (sauvegardes, VM…) dans `RGPD.md` §6 |

> Sous Windows avec Git Bash, `curl` envoie mal les accents passés en ligne de commande (erreur « Content-Length »). Pour tester à la main, utiliser le site (`frontend/`) ou `/docs`.

---

## 3. Parcours utilisateur et routes

### Le parcours prévu

```
Stand (J0)                          Chez soi                       J+7 / J+14
──────────                          ────────                       ──────────
1. Scanne le QR code                5. Se reconnecte avec son code 8. Reçoit une notification
2. Crée un compte anonyme           6. Complète son bilan          9. Valide ses défis
   → garde son code                 7. Valide ses défis de la      10. Répond au questionnaire
3. Bilan version courte (5-7 min)      semaine
4. Choisit 1 à 3 défis
                  ↘ Le tableau de bord du stand se met à jour en direct ↙
```

### Toutes les routes

« participant » = session de participant obligatoire, « admin » = session d'administration obligatoire. Le navigateur envoie la session dans un cookie `HttpOnly` posé par l'API (`gc_session` pour un participant, `gc_admin` pour l'administration) ; l'API accepte aussi le même jeton en `Authorization: Bearer <jeton>` (tests, scripts). Toute requête qui modifie des données avec un cookie de session doit porter un en-tête `Origin` du site (sinon `403 ORIGINE_REFUSEE`, protection CSRF).

| Méthode | Route | Rôle |
|---|---|---|
| **Site** | | |
| GET | `/api/annonce` | `{ annonce }` : message d'information en cours (texte, niveau `INFO`/`ATTENTION`/`IMPORTANT`, fin, version), ou `null`. Affiché en bandeau sur toutes les pages du site |
| GET | `/api/statut` | `{ maintenance }` : le site est-il en maintenance ? Seule route publique encore joignable pendant une maintenance |
| **Compte** | | |
| GET | `/api/filieres` | Liste des filières pour le formulaire d'inscription |
| POST | `/api/participants` | Inscription anonyme : `{ filiereId, annee, consentement: true }` → pseudo, code de récupération (affiché une seule fois) ; ouvre la session (cookie `gc_session`, 60 jours) |
| POST | `/api/sessions` | Reconnexion : `{ codeRecuperation }` → profil ; ouvre la session (cookie `gc_session`) |
| DELETE | `/api/sessions` | Déconnexion : ferme la session en base (le jeton, même recopié, ne vaut plus rien ; les autres appareils restent connectés) et efface le cookie. Sans session requise, ouverte aussi pendant une maintenance |
| GET (participant) | `/api/me` | Mon profil |
| PATCH (participant) | `/api/me` | Modifier filière ou année |
| DELETE (participant) | `/api/me` | Supprimer mon compte et **toutes** mes données (efface aussi le cookie de session) |
| **Bilan** | | |
| GET | `/api/bilans/questions-stand` | Questions du bilan comptées dans le calcul (modèle ADEME), dans l'ordre réglé dans l'admin : texte, type, unité, bornes `min`/`max`, choix possibles (29 au départ) |
| GET | `/api/bilans/questions-information` | Questions « information » de l'équipe, hors calcul (nombre borné ou choix) |
| POST (participant) | `/api/bilans` | Enregistrer un bilan : `{ type: "STAND" \| "COMPLET", situation: { "<question>": <réponse> }, informations?: { "<id question information>": <réponse> } }` |
| POST (participant) | `/api/bilans/estimation` | Estimation en direct pendant la saisie, **sans rien enregistrer** : `{ situation }` → `{ totalKg, parCategorie, applicables }` (questions du stand qui ont encore un sens avec ces réponses) |
| GET (participant) | `/api/bilans` | Historique de mes bilans |
| GET (participant) | `/api/bilans/dernier` | Mon dernier bilan **avec mes réponses** (`situation` et `informations`, pour le reprendre) ; 404 s'il n'y en a pas |
| **Défis** | | |
| GET (participant) | `/api/defis` | Catalogue personnalisé selon mon bilan, avec 3 défis recommandés |
| POST (participant) | `/api/engagements` | M'engager sur un défi cette semaine : `{ defiId }` |
| GET (participant) | `/api/engagements?periode=semaine\|tout` | Mes défis |
| PATCH (participant) | `/api/engagements/:id` | `{ statut: "VALIDE" \| "NON_TENU" }` |
| DELETE (participant) | `/api/engagements/:id` | Retirer un défi encore en cours |
| GET (participant) | `/api/me/impact` | CO2 évité grâce à mes défis validés |
| **Suivi et relances** | | |
| GET (participant) | `/api/suivis/a-faire` | Mes questionnaires J+7 / J+14 non remplis, avec leurs questions et leur date |
| POST (participant) | `/api/suivis` | Répondre : `{ etape: "J7" \| "J14", reponses: { ... } }` |
| GET | `/api/push/cle-publique` | Clé publique pour s'abonner aux notifications (`null` si désactivées) |
| POST (participant) | `/api/push/abonnement` | Enregistrer l'abonnement du navigateur (`subscription.toJSON()`) |
| DELETE (participant) | `/api/push/abonnement` | Désactiver les notifications : `{ endpoint }` |
| **IA responsable** (public) | | |
| GET | `/api/guide-ia` | Tout le contenu de la page « Utiliser l'IA de façon responsable », chaque chiffre avec sa source |
| GET | `/api/quiz` | Questions du quiz, sans les réponses |
| POST | `/api/quiz/reponses` | `{ reponses: { "<question>": "<choix>" } }` → score, corrections, explications, sources, taux de réussite des autres joueurs |
| **Tableau de bord** | | |
| GET | `/api/tableau-de-bord` | Statistiques collectives anonymes (public) |
| GET | `/api/vetements/collecte` | Totaux de la collecte de vêtements : pièces, kilos et CO2 évité (public, aucun détail par jour) |
| **Page d'accueil** (public) | | |
| GET | `/api/evenements` | Évènements publiés : ceux sans date (simple message) d'abord, puis par date de début |
| **Administration** (si `ADMIN_ENABLED=true`) | | |
| POST | `/api/admin/session` | `{ motDePasse, nom }` (prénom = identifiant du compte) → 204 et cookie `gc_admin` (limité à `/api/admin`, sans durée : effacé à la fermeture du navigateur ; jeton valable 12 h). Compte inconnu/bloqué/mauvais mot de passe → même erreur générique. 5 essais par minute et par IP, verrou de 15 min après 20 échecs sur un même prénom |
| DELETE | `/api/admin/session` | Déconnexion : ferme la session en base et efface le cookie `gc_admin` |
| GET (admin, bénévole) | `/api/admin/moi` | Prénom et rôle (`ADMIN`/`SUPER_ADMIN`/`BENEVOLE`) du compte connecté |
| GET / POST (admin) | `/api/admin/questionnaire` | Questionnaire du bilan (toutes les questions, nombre de bilans qui y ont répondu, statistiques des questions « information ») / ajouter une question : `{ type: "ADEME", dottedName, texte?, min?, max? }` ou `{ type: "INFORMATION", texte, format: "NOMBRE" \| "CHOIX", min, max, unite? \| choix }`. Fermé aux bénévoles, journalisé |
| GET (admin) | `/api/admin/questionnaire/modele?recherche=` | Questions du modèle ADEME pas encore dans le questionnaire (20 au plus) |
| PATCH / DELETE (admin) | `/api/admin/questionnaire/:id` | Modifier (texte, bornes, unité, choix, `actif`) / supprimer (409 `QUESTION_DEJA_REPONDUE` si des bilans y ont répondu : désactiver) |
| POST (admin) | `/api/admin/questionnaire/:id/deplacer` | `{ sens: "haut" \| "bas" }` : monter ou descendre dans sa catégorie |
| GET / PUT (admin) | `/api/admin/annonce` | Message d'information du site / l'enregistrer, le publier ou le retirer (`{ texte, niveau, publiee, fin? }`, 300 caractères max, un seul message à la fois, fermé aux bénévoles, journalisé) |
| GET / PUT (admin) | `/api/admin/maintenance` | État du mode maintenance / l'activer ou le couper (`{ actif }`, tout compte admin, journalisé) |
| GET (super-admin) | `/api/admin/comptes-admin` | Liste des comptes admin |
| POST (super-admin) | `/api/admin/comptes-admin` | `{ prenom, role? }` → crée un compte, mot de passe généré renvoyé **une seule fois**. Refusé (409) au-delà de `ADMIN_LIMITE_COMPTES` (admins) ou `ADMIN_LIMITE_BENEVOLES` (bénévoles), ou si le prénom existe déjà |
| PATCH (super-admin) | `/api/admin/comptes-admin/:id` | `{ bloque }` : bloquer/débloquer un compte (sauf soi-même, et sauf le dernier super-admin actif) |
| POST (super-admin) | `/api/admin/comptes-admin/:id/reinitialiser-mot-de-passe` | Nouveau mot de passe généré, renvoyé une seule fois |
| DELETE (super-admin) | `/api/admin/comptes-admin/:id` | Supprime définitivement un compte (sauf soi-même, et sauf le dernier super-admin actif) |
| GET (admin) | `/api/admin/stats` | Activité jour par jour, statistiques par défi, répartition des réponses au suivi, rappels (abonnés, relances envoyées par étape) et résumé de l'évènement (personnes venues, vêtements, CO2 évité) |
| PATCH (admin) | `/api/admin/defis/:id` | `{ actif }` : retirer ou remettre un défi dans le catalogue |
| GET (admin) | `/api/admin/participants` | Liste filtrable (`recherche`, `filtre=tous\|suspects\|exclus\|bloques`, `tri=recents\|alertes\|co2\|bilans`, `page`) avec activité et alertes |
| GET (admin) | `/api/admin/participants/:id` | Fiche : bilans, défis (avec dates de choix et de validation), suivis, alertes |
| PATCH (admin) | `/api/admin/participants/:id` | `{ exclu?, bloque? }` : exclure des statistiques, bloquer (ou annuler) |
| DELETE (admin) | `/api/admin/participants/:id` | Supprimer le compte et ses données, `{ motif? }` |
| DELETE (admin) | `/api/admin/engagements/:id` | Annuler un défi (validation frauduleuse), `{ motif? }` |
| GET (admin) | `/api/admin/journal` | 200 dernières actions de l'équipe (qui, quoi, quand, motif). Filtres : `?auteur=&action=&du=AAAA-MM-JJ&au=AAAA-MM-JJ` (journées en heure de Paris) |
| GET (admin) | `/api/admin/journal/filtres` | Auteurs et actions présents dans le journal (listes des filtres) |
| GET (admin) | `/api/admin/securite` | Journal de sécurité (OWASP A09) : alertes actives, compteurs des dernières 24 h, événements paginés (`type?`, `page`, `parPage`) |
| GET (admin) | `/api/admin/export/:jeu` | CSV : `quotidien`, `bilans`, `questionnaire` (réponses aux questions « information »), `engagements`, `suivis`, `participants`, `quiz`, `stand`, `vetements`, `securite`, `journal` (tout le journal ; le pseudo d'un participant visé par une modération y est remplacé par `participant`) |
| GET (admin) | `/api/admin/evenements` | Tous les évènements de la page d'accueil, brouillons compris |
| POST (admin) | `/api/admin/evenements` | Créer un évènement (`BROUILLON` par défaut) : `{ titre, description?, lieu?, dateDebut?, dateFin?, statut? }`. Sans `dateDebut`, c'est un simple message (ex. « version de test ») ; `dateFin` exige `dateDebut` |
| PATCH (admin) | `/api/admin/evenements/:id` | Modifier un évènement, y compris `statut` (publier/dépublier) |
| DELETE (admin) | `/api/admin/evenements/:id` | Supprimer définitivement un évènement |
| **Jour J** (admin) | | |
| GET (admin) | `/api/admin/compteurs` | Historique des personnes venues, du plus récent au plus ancien |
| GET (admin) | `/api/admin/compteurs/:date` | Personnes venues d'une journée (0 si rien saisi) |
| POST (admin) | `/api/admin/compteurs/:date/incrementer` | `{ delta: 1 \| -1 }` |
| PATCH (admin) | `/api/admin/compteurs/:date` | Saisir directement le total : `{ valeur }` |
| **Vêtements (jour J)** (admin) | | |
| GET/POST (admin) | `/api/admin/vetements/types` | Catalogue des types de vêtements (CRUD) : `{ nom, poidsMoyenGrammes? }` |
| PATCH/DELETE (admin) | `/api/admin/vetements/types/:id` | Modifier (y compris `actif`) ou supprimer (refusé si déjà utilisé) un type |
| GET/POST (admin) | `/api/admin/vetements/matieres` | Catalogue des matières (CRUD) : `{ nom, facteurEmissionKgCo2ParKg?, source? }` |
| PATCH/DELETE (admin) | `/api/admin/vetements/matieres/:id` | Modifier (y compris `actif`) ou supprimer (refusé si déjà utilisée) une matière |
| GET (admin) | `/api/admin/vetements/quantites/:date` | Quantités récupérées/données d'une journée, par type et matière |
| POST (admin) | `/api/admin/vetements/quantites/:date/incrementer` | Ajouter/retirer une quantité : `{ typeId, matiereId, sens: "recuperes" \| "donnes", delta }` |
| PATCH (admin) | `/api/admin/vetements/quantites/:date` | Corriger directement une quantité : `{ typeId, matiereId, sens, valeur }` |
| GET (admin) | `/api/admin/vetements/bilan` | Bilan CO2 cumulé (kg et CO2 évité, par matière) ; `donneesIncompletes` si un poids/facteur manque |
| **Développement uniquement** (absent en production) | | |
| POST (participant) | `/api/dev/vieillir-bilans` | Reculer mes bilans de N jours : `{ jours }` |
| POST | `/api/dev/relances` | Envoyer les notifications tout de suite |

Le détail des corps de requête et des réponses est dans **`/docs`**.

### Format des erreurs

Toutes les erreurs ont la même forme, avec un **message en français affichable tel quel** :

```json
{ "code": "SITUATION_INVALIDE", "message": "Certaines réponses ne sont pas valides.",
  "details": [{ "champ": "logement . type", "message": "Valeur attendue parmi : maison, appartement, autre." }] }
```

| Code | Statut | Quand |
|---|---|---|
| `REQUETE_INVALIDE` | 400 | Champ manquant ou mal formé (avec `details`), JSON invalide |
| `FILIERE_INCONNUE` | 400 | Filière inexistante |
| `SITUATION_INVALIDE` | 400 | Réponse de bilan invalide (avec `details`) |
| `REPONSES_INVALIDES` | 400 | Réponse de suivi invalide (avec `details`) |
| `CODE_INVALIDE` | 401 | Mauvais code de récupération |
| `IDENTIFIANTS_INVALIDES`, `SESSION_ADMIN_INVALIDE` | 401 | Administration : prénom/mot de passe incorrect, session absente ou expirée |
| `ACCES_REFUSE` | 403 | Jeton de participant sur une route d'administration, ou compte admin sans le rôle super-admin requis |
| `COMPTE_BLOQUE` | 403 | Compte suspendu par l'équipe (sur toutes les routes du participant et à la reconnexion) |
| `ORIGINE_REFUSEE` | 403 | Requête qui modifie des données avec un cookie de session, sans en-tête `Origin` du site (protection CSRF, journalisée) |
| `COMPTE_ADMIN_BLOQUE` | 403 | Compte admin bloqué par un super-admin (revérifié à chaque requête, pas seulement à la connexion) |
| `PARTICIPANT_INCONNU` | 404 | Administration : participant inexistant ou supprimé |
| `MAINTENANCE` | 503 | Site en maintenance (activé depuis l'admin) : toute l'API sauf `/api/statut`, `/api/admin/*` et la déconnexion (`DELETE /api/sessions`), avec `Retry-After`. Le front affiche alors sa page de maintenance |
| `SESSION_INVALIDE` | 401 | Session absente, expirée, ou compte supprimé → renvoyer vers la reconnexion |
| `AUCUN_BILAN`, `DEFI_INCONNU`, `ENGAGEMENT_INCONNU`, `EVENEMENT_INCONNU`, `TYPE_INCONNU`, `MATIERE_INCONNUE`, `COMPTE_ADMIN_INCONNU`, `INTROUVABLE` | 404 | Ressource absente |
| `LIMITE_DEFIS`, `DEJA_ENGAGE`, `DEFI_NON_PERTINENT`, `ENGAGEMENT_TERMINE`, `VALIDATION_TROP_TOT` | 409 | Règle des défis non respectée (`VALIDATION_TROP_TOT` : « Tenu » avant `validableAt`) |
| `NOM_DEJA_UTILISE`, `TYPE_UTILISE`, `MATIERE_UTILISEE` | 409 | Type/matière de vêtement : nom déjà pris, ou suppression refusée car déjà utilisé (désactiver plutôt) |
| `PRENOM_DEJA_UTILISE`, `LIMITE_COMPTES_ATTEINTE`, `ACTION_SUR_SOI_MEME`, `DERNIER_SUPER_ADMIN` | 409 | Comptes admin : prénom déjà pris, `ADMIN_LIMITE_COMPTES` ou `ADMIN_LIMITE_BENEVOLES` atteinte, auto-blocage/auto-suppression refusé, dernier super-admin actif |
| `DATE_PASSEE` | 400 | Message d'information publié avec une date de fin déjà passée |
| `BORNES_REQUISES`, `BORNES_INVALIDES`, `BORNES_HORS_MODELE`, `BORNES_SANS_OBJET`, `CHOIX_REQUIS`, `CHOIX_EN_DOUBLE`, `CHOIX_TROP_NOMBREUX`, `CHOIX_SANS_OBJET`, `UNITE_SANS_OBJET`, `QUESTION_INCONNUE` (400) ; `QUESTION_DEJA_PRESENTE`, `QUESTION_DEJA_REPONDUE`, `CHOIX_DEJA_REPONDU` (409) | 400 / 409 | Questionnaire (admin) : bornes manquantes, min > max ou hors des limites du modèle ADEME ; choix invalides ; question déjà présente ; suppression d'une question déjà répondue ; retrait d'un choix déjà répondu |
| `DATES_INCOHERENTES` | 400 | Évènement dont la fin est avant le début, ou qui a une fin sans début (création ou modification) |
| `SUIVI_PAS_ENCORE_DISPONIBLE`, `SUIVI_DEJA_REMPLI` | 409 | Questionnaire trop tôt ou déjà rempli |
| `TROP_DE_REQUETES` | 429 | Limite de débit atteinte |
| `ADMIN_VERROUILLE` | 429 | Connexion admin verrouillée après trop d'échecs (15 minutes) |
| `ERREUR_INTERNE` | 500 | Erreur serveur (détail dans les logs uniquement) |

---

## 4. Ce que le front doit faire

> **État réel (2026-11-12)** : `frontend/` (React) couvre tout ce qui est décrit ci-dessous :
> Accueil (évènements), Connexion (inscription/reconnexion, QR code de reconnexion), Bilan
> (questions applicables et estimation en direct via `POST /api/bilans/estimation`), Défis
> (confirmation avant Tenu / Non tenu), Suivi (questionnaires et rappels Web Push), Tableau de
> bord (rafraîchi toutes les 20 s), IA responsable (guide + quiz), Mon compte, Protection des
> données et Équipe. Seul écart avec ce qui suit : l'applicabilité des questions et l'estimation
> sont calculées par l'API plutôt qu'avec `publicodes` dans le navigateur (moins de code à
> charger sur téléphone, un seul moteur à maintenir).

Le code de `frontend/` montre un exemple qui fonctionne pour chaque point ci-dessous.

### Configuration
- Le front tourne sur `http://localhost:5173` (Vite) : c'est l'origine autorisée par défaut (`CORS_ORIGIN`). Pour une autre adresse, l'ajouter dans `.env` (plusieurs origines séparées par des virgules).
- Générer les types TypeScript depuis `http://localhost:4000/docs/json` (par exemple avec `openapi-typescript`) pour rester synchronisé avec l'API.

### Page d'accueil
- C'est la route `/` : remplace l'ancien écran de connexion direct. Accessible **sans compte**.
  Affiche les évènements publiés (`GET /api/evenements`, public, triés par date de début) et un
  bouton vers `/connexion` (inscription/reconnexion) — et vers l'espace participant si déjà connecté.
- Chaque évènement affiche sa période : « mercredi 2 décembre, de 09:00 à 17:00 » (heure de fin
  montrée pour que personne ne vienne après la fermeture), « du … au … » sur plusieurs jours.
  Un évènement sans date (simple message) s'affiche sans badge de date, en tête de liste.
- Pas de évènement publié : afficher un message neutre, pas une erreur (la liste peut être vide).
- Publication côté équipe : un évènement créé en brouillon (`/admin/`, onglet « Évènements »)
  n'apparaît sur cette page qu'une fois son statut passé à `publié`.

### Compte et session
- **Afficher le code de récupération une seule fois**, en grand, avec un **QR code** (bibliothèque côté front, par exemple `qrcode`) et un bouton « copier ». L'API ne le renverra jamais. Insister pour qu'il soit gardé (capture d'écran).
- **Ne rien stocker** : l'API pose la session dans un cookie `HttpOnly; SameSite=Strict` (`gc_session`, `Secure` en production), que le navigateur renvoie tout seul sur `/api`. Le JavaScript ne voit jamais le jeton (protection contre le vol de session par XSS). Le front garde seulement un indicateur non secret (`greencampus-session` dans `localStorage`) pour ne pas appeler `/api/me` chez quelqu'un qui ne s'est jamais connecté.
- Appeler l'API en chemins relatifs, **depuis le même site** : le cookie n'est pas envoyé à un autre domaine, et les requêtes qui modifient des données doivent porter l'en-tête `Origin` du site (le navigateur l'ajoute).
- Se déconnecter avec `DELETE /api/sessions` : seule l'API peut effacer un cookie `HttpOnly`, et elle ferme aussi la session en base (une copie du cookie devient inutilisable).
- Sur une erreur `401 SESSION_INVALIDE` : oublier la session et proposer la reconnexion par code.
- Sur une erreur `403 COMPTE_BLOQUE` : afficher le message renvoyé (compte suspendu par l'équipe) et ne pas proposer de reconnexion.
- La case de consentement est obligatoire (`consentement: true`), liée à la page `/confidentialite` (voir [section 7](#7-sécurité-et-rgpd)).

### Bilan carbone : point important
- `GET /api/bilans/questions-stand` donne la liste, les textes, les types (`nombre`, `choix`, `oui-non`), les unités, les bornes `min`/`max` des questions « nombre » et les libellés des choix.
- **Bornes des réponses** (depuis le 2026-11-20) : une réponse « nombre » hors de `min`/`max` est refusée (`400 SITUATION_INVALIDE`, « Valeur attendue : un nombre entre X et Y »). Les bornes viennent du modèle ADEME (`plancher`/`plafond` : 0 à 21 repas par type de plat, 0 à 10 cafés par jour, 1 à 99 999 km en voiture…) ; le projet ajoute 0 à 40 h/semaine pour le bus et le métro/tram, que le modèle ne borne pas (`BORNES_PROJET` dans `src/lib/ngc.ts`). Les 6 types de plats sont en plus plafonnés à **14 repas par semaine au total** (champ d'erreur `alimentation . plats`). Les bilans déjà enregistrés ne sont pas revalidés. Les bornes se règlent ensuite question par question dans l'onglet admin *Questionnaire* (toujours à l'intérieur des limites du modèle).
- **Une question non posée vaut la moyenne française.** Par exemple, sans réponse à « km en voiture », le calcul compte 11 849 km/an, ce qui gonfle le transport d'un étudiant. Le front doit donc :
  1. **savoir quelles questions sont applicables** selon les réponses précédentes : `POST /api/bilans/estimation` renvoie la liste `applicables` (c'est ce que fait `frontend/`). Exemple : « motorisation » et « km » seulement si la personne utilise une voiture ; « heures de bus » seulement si elle prend le bus ;
  2. poser toutes les sous-questions applicables ;
  3. afficher une **estimation en direct** pendant la saisie (même route, appelée après une pause de frappe). Le résultat officiel reste celui de `POST /api/bilans`, et les réponses devenues non applicables ne sont pas enregistrées.
- Les 6 questions `alimentation . plats . … . nombre` forment un seul écran (« Combien de repas de chaque type par semaine ? », total d'environ 14).
- Format des réponses : nombre, `"oui"` / `"non"` (ou `true` / `false`), ou la `valeur` d'un choix (`"appartement"`). Ne jamais envoyer de formule.
- Pour reprendre un bilan chez soi : `GET /api/bilans/dernier` renvoie `situation`. Les choix y sont entre apostrophes (`"'appartement'"`), à retirer pour pré-remplir.
- La version complète (`type: "COMPLET"`) peut utiliser **toutes** les questions du modèle, pas seulement les 29.

### Résultat et défis
- Afficher `totalKg` (en tonnes : ÷ 1000), le détail `parCategorie` et `categorieDominante`. Repères utiles : moyenne française ≈ 8,3 t, objectif 2050 ≈ 2 t.
- `GET /api/defis` renvoie les défis déjà triés : les 3 premiers ont `recommande: true`. Afficher la `source` de chaque défi (crédibilité, et argument pour la vidéo).
- Gérer les 409 avec le `message` renvoyé (3 défis maximum par semaine, défi déjà choisi, défi non pertinent).
- La validation est **déclarative** (« Tenu » / « Non tenu ») : le dire clairement à l'utilisateur.

### Suivi et notifications
- `GET /api/suivis/a-faire` décrit tout le formulaire : `choix` → boutons radio, `echelle` → curseur ou liste de `min` à `max`. Si `disponible: false`, afficher la date `disponibleLe`.
- **Notifications** : il faut un **service worker** (exemple : `frontend/public/sw.js`) qui affiche la notification reçue (`{ titre, corps, url }`). Ensuite :
  1. `GET /api/push/cle-publique` ;
  2. `registration.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: clePublique })` ;
  3. `POST /api/push/abonnement` avec `abonnement.toJSON()`.
- Attention : sur iPhone, les notifications ne fonctionnent que si l'application est **ajoutée à l'écran d'accueil** (PWA avec un `manifest.json`). Sur Android et sur ordinateur, ça fonctionne directement. Il faut donc toujours garder la relance par affiches ou QR code en parallèle.

### Page « IA responsable » : à mettre en avant
C'est une **page à part entière** (par exemple `/ia`), accessible **sans compte**, et mise en avant :
- un **lien visible dans le menu principal** et sur la page d'accueil ;
- un **bandeau d'appel** après le résultat du bilan, et sur l'écran du stand ;
- un **QR code dédié** sur l'affiche ou le stand, pour faire le quiz même sans faire le bilan.

Contenu à afficher, dans l'ordre de `GET /api/guide-ia` :
1. titre et introduction, avec la date de mise à jour ;
2. `chiffresCles` en grandes cartes (`valeur` en gros, `libelle` dessous) ;
3. `ordreDeGrandeur` dans un encadré : c'est le message honnête (« l'IA, surtout une affaire d'habitudes »), à ne pas omettre ;
4. `conseils` (8 gestes) ;
5. `ideesRecues` en « vrai ou faux » dépliables ;
6. le **quiz** (`GET /api/quiz`, puis `POST /api/quiz/reponses`) : afficher la correction, l'explication, la source et « X % des joueurs ont trouvé » ;
7. `outils` et la liste des `sources`.

**Chaque chiffre affiché doit garder son lien vers la source** (champ `source` : titre, URL, date). C'est ce qui rend la page crédible.

### Tableau de bord (écran du stand)
- `GET /api/tableau-de-bord` est public et mis en cache 10 s côté serveur : rafraîchir toutes les 10 à 30 s suffit. Il inclut aussi `quiz` (parties jouées, taux de bonnes réponses).
- Sous le seuil d'anonymat, `empreinteMoyenneKg`, `parCategorieMoyenne` et l'empreinte moyenne d'une filière valent `null` : afficher « — » ou « pas encore assez de participants ».

---

## 5. Ce que l'infra doit faire

### Variables d'environnement (`.env.example`)

| Variable | Production | Rôle |
|---|---|---|
| `NODE_ENV` | `production` | Active les garde-fous de production (voir ci-dessous), désactive par défaut `/docs` et `/api/dev/*` |
| `TRUST_PROXY` | ne pas définir (`1` par défaut en production) | Nombre de relais devant l'API : Nginx seul sur la VM = 1. À passer à `2` seulement si un load balancer est ajouté devant Nginx |
| `DATABASE_URL` | obligatoire | Connexion PostgreSQL. Sur AWS RDS, terminer par `?sslmode=require` |
| `JWT_SECRET` | obligatoire, ≥ 32 caractères, **secret** | Signature des sessions |
| `CORS_ORIGIN` | URL du front | Origines autorisées (séparées par des virgules) |
| `VAPID_PUBLIC_KEY` / `VAPID_PRIVATE_KEY` | à générer, la clé privée est **secrète** | Notifications (`npx web-push generate-vapid-keys`). Vide = notifications désactivées |
| `VAPID_SUJET` | `mailto:` d'un contact du groupe | Exigé par le protocole Web Push |
| `DEMO_ENABLED` | ne pas définir (désactivé par défaut) | Routes de test `/api/dev/*` (jamais actives en production) |
| `ADMIN_ENABLED` | `true` pour activer | Active `/admin/` et `/api/admin/*`. Les comptes eux-mêmes vivent en base (`CompteAdmin`), pas dans l'env |
| `ADMIN_LIMITE_COMPTES` | `3` | Nombre maximum de comptes admin simultanés (`ADMIN` + `SUPER_ADMIN`) |
| `ADMIN_LIMITE_BENEVOLES` | `5` | Nombre maximum de comptes bénévoles (saisie au stand), comptés à part |
| `ADMIN_RATE_LIMIT_CONNEXION_PAR_MIN` | `5` | Tentatives de connexion admin autorisées par minute et par IP |
| `ADMIN_SUPER_PRENOM` / `ADMIN_SUPER_MOT_DE_PASSE` | à retirer après le premier `db:seed` | Amorce le tout premier compte (`SUPER_ADMIN`), lu une seule fois si la table `CompteAdmin` est vide |
| `ADMIN_SESSION_TTL` | `12h` | Durée d'une session d'administration |
| `DOCS_ENABLED` | ne pas définir (désactivé par défaut) | Swagger sur `/docs` |
| `SEUIL_ANONYMAT` | `5` | Seuil d'affichage des filières |
| `DEFI_DELAI_VALIDATION_HEURES` | `24` (défaut) | Délai entre le choix d'un défi et l'acceptation de « Tenu » (0 = aucun) |
| `TOKEN_TTL`, `RATE_LIMIT_*`, `RELANCE_INTERVALLE_MIN`, `TABLEAU_CACHE_SECONDES` | valeurs par défaut | Réglages fins |

### Déploiement
**Architecture retenue (17/11/2026) : AWS, région Stockholm (eu-north-1)**, procédure complète et configuration Nginx dans [`deploiement/`](../deploiement/README.md).

- **Image Docker** : `backend/Dockerfile` (multi-étapes, Node 22 Alpine, utilisateur non root). Au démarrage, elle applique les migrations (`prisma migrate deploy`), puis le seed compilé (`node dist/seed/seed.js` : filières, défis, valeurs des vêtements si vides, premier super-admin si aucun compte), puis lance l'API sur le **port 4000**. Elle inclut l'interface `/admin/`.
- **Reverse proxy** : Nginx sur la VM, seul point d'entrée (HTTPS avec un certificat Let's Encrypt, pas de load balancer pour tenir le budget). **Le HTTPS est indispensable** pour les notifications et le service worker. Avec `NODE_ENV=production`, l'API lit l'IP réelle dans `X-Forwarded-For` pour la limitation de débit.
- **Une seule instance** de l'API : la limitation de débit, le cache du tableau de bord et le minuteur des relances sont en mémoire. Avec plusieurs instances, les relances partiraient en double.
- **Sauvegardes** quotidiennes de PostgreSQL (RDS : 7 jours, même région).
- **Supervision** : `GET /health` vérifie la base de données. Réponse `200 { "status": "ok", "base": "ok" }`, ou `503 { "status": "indisponible" }` si la base ne répond pas sous 2 s. À utiliser comme sonde de santé du conteneur.
- **Garde-fous de production** : avec `NODE_ENV=production`, l'API **refuse de démarrer** si `JWT_SECRET` est la valeur d'exemple, ou si une origine CORS n'est pas en `https://`. `*` est refusé partout.
- **CSP du front** : la CSP de l'API ne s'applique qu'à ce qu'elle sert (`/admin/`, JSON). Le serveur qui héberge le front (Nginx, `deploiement/nginx/greencampus/entetes-front.conf`) envoie la même politique : `default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; font-src 'self'; connect-src 'self'; object-src 'none'; base-uri 'self'; form-action 'self'; frame-ancestors 'none'; upgrade-insecure-requests`. Les polices du front sont déjà auto-hébergées, donc compatibles.
- **Ressources** : environ 150 Mo de RAM. Le modèle Nos Gestes Climat est chargé une fois au démarrage (environ 0,2 s).
- `docker-compose.yml` à la racine ne sert qu'au **développement** (PostgreSQL seul).

### Déploiement du frontend (`frontend/`)

Décision (2026-10-16) : le front (React + Vite) est déployé **séparément** de l'image Docker
du backend, mais sous le **même nom de domaine**, via le reverse proxy déjà prévu ci-dessus
(Nginx sur la VM AWS depuis le 17/11/2026, voir `deploiement/`).
Même origine pour les deux ⇒ **pas de CORS à gérer en production**, et chaque partie se
redéploie indépendamment (changer le front ne redémarre pas l'API, et inversement).

- **Build** : `npm run build` dans `frontend/` → fichiers statiques dans `frontend/dist/`.
  Pas de Dockerfile nécessaire pour le front : c'est juste un dossier à copier sur le serveur
  (ou dans l'image du reverse proxy) à chaque redéploiement.
- **Routage chez le reverse proxy** (Nginx, `deploiement/nginx/greencampus.conf`) : les chemins
  `/api/*`, `/admin*` et `/health` partent vers le backend (`127.0.0.1:4000`), tout le reste sert
  les fichiers de `frontend/dist/` avec un repli sur `index.html` (obligatoire : React Router gère
  des routes comme `/bilan` ou `/defis` qui ne sont pas de vrais fichiers — sans ce repli,
  actualiser la page sur un de ces chemins renverrait une 404 du serveur statique). `sw.js`,
  `manifest.webmanifest` et `index.html` ne sont jamais mis en cache, `/assets/` l'est un an.
- Le code du front appelle toujours l'API en **chemins relatifs**
  (`fetch('/api/...')`, voir `frontend/src/lib/api.ts`) — rien à configurer côté front pour
  que ça fonctionne une fois derrière ce même reverse proxy, pas de variable d'URL d'API à
  renseigner au build.
- Conséquence sur `CORS_ORIGIN` (tableau ci-dessus) : comme front et API partagent le même
  domaine en production, ce réglage devient surtout un garde-fou contre un accès direct à
  l'API depuis un autre site, plutôt qu'une condition pour que le front fonctionne.

---

## 6. Fonctionnement détaillé

### Identité anonyme
- **Pseudo** généré (`LoutreAgile42`) et **code de récupération** `XXXX-XXXX-XXXX-XXXX` (alphabet de Crockford, sans I, L, O, U).
- Motif **sélecteur / vérificateur** : les 6 premiers caractères (sélecteur) sont stockés en clair pour retrouver le compte, les 10 suivants (vérificateur) sont **hachés avec argon2**. Une fuite de la base ne permet pas de se connecter à la place de quelqu'un.
- La saisie tolère minuscules, espaces et confusions O/0, I/1. Le temps de réponse est le même que le code existe ou non.
- Session : jeton JWT valable 60 jours (`TOKEN_TTL`, aussi durée du cookie `gc_session`), dans un cookie `HttpOnly` (voir [section 4](#compte-et-session)).

### Bilan carbone (Nos Gestes Climat)
- Modèle officiel de l'ADEME (`@incubateur-ademe/nosgestesclimat`, France, en français), exécuté avec `publicodes`. Chargé une fois au démarrage, environ 60 à 140 ms par calcul.
- **Le résultat est toujours recalculé côté serveur** : un total envoyé par le navigateur est ignoré, ce qui garantit un classement fiable.
- Résultat : `totalKg` (kg CO2e/an), `parCategorie` (transport, alimentation, logement, divers, servicesSocietaux) et `categorieDominante` (la plus forte des 4 catégories sur lesquelles on peut agir).
- **Questionnaire géré dans l'admin** (onglet *Questionnaire*, depuis le 2026-11-20, table `QuestionBilan`). Au premier usage, la table vide est remplie avec les 29 questions de `src/modules/bilans/questions-stand.ts` (ordre et bornes par défaut) ; ensuite seule la base fait foi. Deux types :
  - **ADEME** : choisie dans le modèle (recherche), comptée dans le calcul. Texte affiché, bornes (à l'intérieur des limites du modèle) et ordre modifiables. Sans réponse : moyenne française du modèle.
  - **Information** : question de l'équipe, **hors calcul** (ne change pas l'empreinte), pour des statistiques anonymes : nombre borné (min et max obligatoires) ou choix dans une liste (2 à 20). Jamais de texte libre (RGPD). Réponses dans `ReponseQuestion`, supprimées avec le bilan (donc avec le compte).
  - **Question déjà répondue** : la désactiver (plus posée, réponses et totaux gardés, réactivable) ; suppression refusée. Type et format non modifiables (créer une nouvelle question). Une réponse déjà choisie ne peut pas être retirée des choix. Les bilans enregistrés ne sont **jamais recalculés** (sinon le classement bougerait tout seul).
  - Statistiques d'une question « information » : dernière réponse de chaque participant, comptes exclus mis à part. Questionnaire public en cache 10 s (vidé à chaque modification).
  - Prévu (étape 2) : questions « personnalisées » comptées dans le calcul avec un facteur d'émission sourcé (sans source fiable : comptées 0).

### Défis
- Le CO2 évité **n'est pas saisi à la main** : chaque défi (`prisma/defis.ts`) est relié à une **action du modèle Nos Gestes Climat**, dont le gain est calculé avec le dernier bilan de la personne (gain annuel ÷ 52 pour une semaine).
- Exemple : « Viande à 2 repas maximum » vaut environ 11 kg/semaine pour un profil moyen, et 0 pour une personne végétarienne. Les défis à 0 ne sont pas proposés, et l'API refuse qu'on s'y engage.
- Recommandations : le meilleur défi de la catégorie la plus émettrice, puis les plus gros gains toutes catégories confondues.
- Une semaine va du lundi au dimanche, heure de Paris. 3 défis maximum par semaine. Le gain est **figé** au moment de l'engagement, pour que les statistiques restent stables.
- **Ajouter un défi** : ajouter une entrée dans `prisma/defis.ts` avec une action du modèle (règle `actions`, consultable sur https://nosgestesclimat.fr/documentation), puis `npm run db:seed`. Un test vérifie que chaque action existe.

### Suivi et relances
- Jour zéro = **premier bilan**. Questionnaire J+7 (3 questions) et J+14 (4 questions), uniquement des choix et des échelles (`src/modules/suivis/questionnaire.ts`).
- Toutes les `RELANCE_INTERVALLE_MIN` minutes : notification aux abonnés dont une étape est arrivée et pas encore remplie. Chaque étape n'est notifiée **qu'une fois** (table `Relance`). En cas de retard, seule l'étape la plus récente est notifiée. Les abonnements expirés (404 ou 410) sont supprimés.

### Tableau de bord
- Classement des filières par **CO2 évité par participant** (le classement n'est pas fondé sur l'empreinte, pour éviter de stigmatiser).
- Une filière n'apparaît qu'à partir de `SEUIL_ANONYMAT` participants, et une moyenne n'est affichée qu'à partir de ce nombre de bilans.
- Inclut les défis les plus choisis et les réponses au suivi (changements déclarés à J+14), utiles pour la vidéo.

### Vêtements (jour J)
Le projet se déroule sur deux journées distinctes : une **journée de récolte** (vêtements
récupérés) et une **journée de don** (vêtements donnés), chacune identifiée par sa date réelle
(pas de champ dédié « type de journée »).

- **Types de vêtements** (t-shirt, jean, …) et **matières** (coton, polyester, …) sont des
  référentiels **gérés en admin** (onglet « Vêtements »), pas codés en dur — créer, modifier,
  activer/désactiver, supprimer (refusé si des quantités y sont déjà rattachées, pour ne pas
  perdre l'historique : désactiver à la place).
- Chaque type a un **poids moyen** (grammes) et chaque matière un **facteur d'émission** (kg
  CO2e par kg de matière) avec sa **source**. Les deux restent facultatifs en base : jamais de
  valeur inventée, et l'admin peut les corriger (par exemple après une vraie pesée).
- **Valeurs de départ** : `npm run db:seed` crée les 12 matières et 7 types ci-dessous
  (`prisma/vetements.ts`). Il ne remplit que les champs vides et n'écrase jamais une valeur déjà
  saisie ; il affiche celles qui diffèrent des chiffres prévus. Relançable sans risque. Pas de
  sous-vêtements (chaussettes, caleçons, boxers, slips) ni de maillots de bain : refusés à la
  collecte pour raison d'hygiène.

  | Matière | kg CO2e/kg | | Type | Poids moyen |
  |---|---|---|---|---|
  | Coton | 17,79 | | T-shirt / Polo | 150 g |
  | Coton biologique | 11,25 | | Chemise | 250 g |
  | Coton recyclé | 12,01 | | Jupe / Robe | 300 g |
  | Polyester | 15,31 | | Jean | 450 g |
  | Polyester recyclé | 12,19 | | Pantalon / Short | 450 g |
  | Nylon | 27,38 | | Pull | 550 g |
  | Acrylique | 25,43 | | Manteau / Veste | 950 g |
  | Élasthanne | 20,73 | | | |
  | Viscose | 18,85 | | | |
  | Laine | 57,32 | | | |
  | Lin | 11,03 | | | |
  | Chanvre | 10,12 | | | |

  Sources : facteurs = simulateur [Ecobalyse](https://ecobalyse.beta.gouv.fr) (outil
  gouvernemental), t-shirt 170 g 100 % de la matière, fabriqué en France, nov. 2026 ; **ils
  incluent la fabrication du vêtement, pas seulement la fibre** (à formuler ainsi dans le
  rapport). Poids = vêtements de référence d'Ecobalyse (`public/data/textile/examples.json` du
  dépôt MTES-MCT/ecobalyse, commit `a241f44` du 08/09/2026), souvent leur « majorant par
  défaut » : à remplacer par une pesée réelle si l'équipe en fait une à la récolte.
- Les quantités sont saisies par **jour × type × matière**, séparément pour récupéré et donné
  (`GET/POST/PATCH /api/admin/vetements/quantites/...`).
- **Bilan CO2** (`GET /api/admin/vetements/bilan`) : `kg = quantité × poids moyen du type`,
  `CO2 évité = kg × facteur d'émission de la matière`, cumulé sur toute la collecte et détaillé
  par matière. Si le poids ou le facteur d'un type/matière utilisé est manquant, cette ligne est
  ignorée dans le calcul (jamais une valeur inventée) et `donneesIncompletes: true` le signale —
  le bilan est alors **sous-estimé**, pas faux.
- **Pourquoi Ecobalyse** : une recherche de blogs donnait des facteurs très dispersés (coton
  entre 8 et 16,3 kg CO2e/kg selon la source). Les chiffres ont été récupérés une seule fois avec
  un jeton d'API personnel ; le site n'appelle jamais Ecobalyse et n'a pas besoin de ce jeton.
  Limite : un jean en coton n'aurait pas exactement le même facteur qu'un t-shirt en coton.

### Administration
- **Accès** : comptes nominatifs (`CompteAdmin` : prénom unique + mot de passe généré aléatoirement
  par l'application, jamais choisi par la personne). Connexion `{ motDePasse, nom }` → cookie
  `HttpOnly` `gc_admin` (limité à `/api/admin`, effacé à la fermeture du navigateur) contenant un jeton
  portant le rôle `admin` + le rôle du compte (`ADMIN`/`SUPER_ADMIN`), valable 12 h. Un jeton
  admin n'ouvre pas les routes des participants, et inversement (403). Comparaison toujours à
  temps constant (argon2 + hash factice si le prénom est inconnu, pour ne pas laisser deviner
  les prénoms par le temps de réponse), 5 essais par minute et par IP, verrou applicatif de
  15 min après 20 échecs sur un même prénom (`VerrouEchecs`, un par prénom). Un compte revérifié
  à **chaque requête** (pas seulement à la connexion) : un compte bloqué perd l'accès
  immédiatement, même avec un jeton encore valide.
- **Mode maintenance** (bandeau en haut de `/admin/`, visible depuis tous les onglets, **tout compte
  admin** peut basculer) : « Passer en maintenance » (avec confirmation) remplace tout le site par une
  page « Site en maintenance » au texte fixe, l'API publique et participant répond 503 (`MAINTENANCE`)
  et les relances push sont suspendues ; l'administration reste utilisable pour réparer. Bascule
  immédiate, sans redémarrer l'API (état en base, table `Maintenance` à une seule ligne, lu avec un
  cache de 5 s). Chaque bascule est journalisée (qui, quand). Une fois le site remis en ligne, les
  pages de maintenance déjà ouvertes reviennent toutes seules en 30 s au plus.
- **Comptes admin** (onglet « Comptes admin », visible seulement par un `SUPER_ADMIN`) : un
  super-admin peut créer un compte (prénom + rôle, mot de passe généré affiché **une seule
  fois**), le bloquer/débloquer, réinitialiser son mot de passe (nouveau mot de passe affiché
  une seule fois) ou le supprimer définitivement. Nombre de comptes limité par
  `ADMIN_LIMITE_COMPTES` (défaut 3) pour les admins et `ADMIN_LIMITE_BENEVOLES` (défaut 5) pour les
  bénévoles, deux limites séparées. Garde-fous : un super-admin ne peut ni se bloquer ni se
  supprimer lui-même, et il est impossible de bloquer/supprimer le dernier super-admin actif
  (sinon plus personne ne pourrait gérer les comptes). Le tout premier compte (super-admin)
  s'amorce via `npm run db:seed` et `ADMIN_SUPER_PRENOM`/`ADMIN_SUPER_MOT_DE_PASSE` (voir
  section 5) : les comptes suivants se créent ensuite depuis cet onglet, pas depuis l'env.
- **Rôle bénévole** (`BENEVOLE`, depuis le 17/11/2026) : pour les personnes qui saisissent au
  stand. Elles ne voient que les onglets *Jour J* et *Vêtements* (saisie des quantités ; catalogue
  des types et matières en lecture seule). Côté serveur, une **liste blanche** (`ROUTES_BENEVOLE`
  dans `modules/admin/routes.ts`) n'ouvre que ces routes : toute autre route d'administration,
  y compris une route ajoutée plus tard, renvoie 403 et est notée au journal de sécurité
  (`ADMIN_ACCES_BENEVOLE_REFUSE`, alerte au-delà de 5 par heure). Leurs corrections de compteurs
  figurent au journal avec leur prénom, comme pour les admins.
- **Page `/admin/`**, par onglet : *Vue d'ensemble* (chiffres clés, résumé de l'évènement — personnes venues, vêtements récupérés et donnés, CO2 évité —, rappels — participants abonnés, relances envoyées et questionnaires remplis par étape —, bilans par jour, tableau des défis — choisis, validés, non tenus, CO2 évité — avec une case pour les activer ou désactiver, répartition des réponses aux questionnaires J+7 / J+14, boutons d'export) ; *Évènements* (créer/publier/dépublier/supprimer les évènements affichés sur la page d'accueil publique) ; *Questionnaire* (questions du bilan : ajouter depuis le modèle ADEME ou une question d'information hors calcul, reformuler, régler les bornes, ordonner, désactiver ; statistiques des questions d'information) ; *Message du site* (bandeau d'information en haut de toutes les pages publiques : texte de 300 caractères maximum, type Info / Attention / Important, date de fin facultative, aperçu ; un seul message à la fois ; un message Important ne peut pas être masqué par les visiteurs) ; *Jour J* (nombre de personnes venues) ; *Vêtements* (catégories, quantités récupérées/données, bilan CO2 — voir ci-dessous) ; *Participants* (modération) ; *Journal* (actions de l'équipe, y compris la gestion des comptes admin, filtrables par membre, action et période, export CSV) ; *Sécurité* (journal et alertes, OWASP A09) ; *Comptes admin* (super-admin seulement, voir ci-dessus). Même identité visuelle que le site public (`admin/style.css`, `admin/fonts/`).
- **Navigation** (depuis le 2026-11-20) : sur PC, tous les onglets autorisés pour le rôle sont visibles (sur plusieurs lignes si besoin, jamais de défilement horizontal), l'onglet ouvert est mis en évidence (`aria-current="page"`) et garde le focus clavier. Sur téléphone (760 px de large ou moins), un bouton « ☰ Menu · page courante » (`aria-expanded`) ouvre la liste des pages ; Échap ou un clic à côté la referment.
- **Utilisation au stand (téléphone)** : l'onglet ouvert reste dans l'adresse (`/admin/#vetements`), donc recharger la page ne fait pas changer d'onglet. Les tableaux larges défilent dans leur cadre. Dans *Vêtements*, chaque combinaison type et matière déjà saisie dans la journée a ses boutons −1 / +1 (récupérés et donnés), et « Corriger » modifie les deux totaux ensemble. La journée proposée par défaut est celle du jour en heure locale, recalculée à chaque affichage. Les confirmations et saisies passent par une fenêtre intégrée à la page (Échap ou « Annuler » n'exécutent rien), les erreurs par un message en haut de l'écran.
- **Exports CSV** pour Excel ou LibreOffice en français : séparateur `;`, virgule décimale, BOM UTF-8, dates à l'heure de Paris. Les cellules commençant par `= + - @` sont neutralisées (**injection de formules**). Les participants n'y figurent que par leur identifiant aléatoire (ni pseudo, ni code) : ce sont des données pseudonymes, à ne pas publier telles quelles.

| Export | Contenu |
|---|---|
| `quotidien` | Par jour : inscriptions, bilans, engagements, défis validés, CO2 évité (graphiques de la vidéo) |
| `bilans` | Un bilan par ligne : filière, année, type, date, total et détail par poste |
| `engagements` | Un engagement par ligne : défi, catégorie, semaine, statut, CO2 évité |
| `suivis` | Réponses J+7 / J+14, une colonne par question |
| `participants` | Filière, année, inscription, nombre de bilans, d'engagements et de suivis |
| `quiz` | Une réponse par ligne : partie (identifiant aléatoire), question, choix, bonne ou mauvaise réponse |
| `stand` | Par jour : nombre de personnes venues |
| `vetements` | Par jour/type/matière : quantités récupérées/données, poids moyen et facteur d'émission utilisés |
| `securite` | Événements de sécurité des 30 derniers jours (contient des adresses IP : ne pas diffuser) |

### IA responsable
- **Guide** (`src/modules/guide-ia/contenu.ts`) : contenu statique et versionné, avec une date de mise à jour. Toutes les sources sont centralisées dans `sources.ts`, et chaque chiffre y renvoie (vérifié par les tests).
- **Message honnête** : une requête texte simple consomme peu (0,24 à 0,3 Wh). Les vrais leviers sont le mode raisonnement (environ 30 fois plus), les longs documents (environ 8 fois plus à 10 000 tokens), les images et vidéos, et la répétition. L'IA locale est présentée pour la confidentialité et l'électricité française, **sans** la présenter comme plus économe en énergie.
- **Quiz** (`src/modules/quiz/questions.ts`) : 6 questions, chacune avec sa bonne réponse, une explication et une source. Les réponses sont enregistrées **anonymement** (table `QuizReponse`, sans lien avec un participant) pour les statistiques de la vidéo (« X % pensaient que… »).
- **Suivi** : la question `usage-ia` du questionnaire J+14 mesure le changement d'usage de l'IA.
- Pour **mettre à jour un chiffre** : modifier `contenu.ts` (et `questions.ts` si besoin), mettre à jour la source dans `sources.ts` et la date `miseAJour`.

### Modération (lutte contre la triche)
Ce qui est déjà **empêché par l'API** : 3 défis maximum par semaine et par compte, un défi ne peut être pris qu'une fois par semaine, le CO2 évité est toujours calculé par le serveur, et le modèle Nos Gestes Climat **plafonne** certaines réponses (100 000 km ou 5 000 000 km de voiture donnent le même résultat, environ 24 t).

Ce qui reste possible, et que l'équipe peut **repérer et corriger** dans `/admin/` (onglet Participants) :

| Alerte | Déclenchée quand | Seuil (`SEUILS` dans `src/modules/admin/moderation.ts`) |
|---|---|---|
| `VALIDATION_RAPIDE` | Un défi hebdomadaire est validé peu après avoir été choisi | moins de 12 h |
| `BILANS_EN_RAFALE` | Beaucoup de bilans sur 24 h glissantes | plus de 5 |
| `BILAN_INVRAISEMBLABLE` | Empreinte hors de la plage plausible pour un étudiant | moins de 2,5 t ou plus de 20 t par an |
| `GAIN_ANORMAL` | Défi au gain très élevé (bilan gonflé) | plus de 50 kg CO2e par semaine |

Les alertes ne sont que des **indices** : l'équipe vérifie la fiche avant d'agir. Actions possibles :
- **Exclure des statistiques** : le compte fonctionne toujours, mais ne compte plus dans le tableau de bord public, le classement des filières, les statistiques ni les compteurs de l'admin. Ses données sont conservées (colonne `exclu` dans les exports). Réversible ;
- **Bloquer** : le compte ne peut plus rien faire (403 `COMPTE_BLOQUE`), même avec son code. Réversible ;
- **Annuler un défi** : supprime l'engagement (par exemple une validation frauduleuse) ;
- **Supprimer le compte** et toutes ses données.

Chaque action est inscrite au **journal** (onglet « Journal », `GET /api/admin/journal`) avec le prénom du compte admin, la date, le participant et le motif éventuel. Le journal trace aussi le mode maintenance (activation, remise en ligne), les comptes admin (création, blocage, réinitialisation, suppression), les évènements (création, modification, suppression), le catalogue des vêtements et les **corrections** des compteurs du jour J et des quantités de vêtements, avec l'ancienne et la nouvelle valeur. Les +1/−1 tapés au stand n'y figurent pas : une ligne par personne comptée noierait le reste.

Le tableau de bord public étant mis en cache 10 s, une exclusion y apparaît au plus tard 10 s après.

### Modèle de données (`prisma/schema.prisma`)

| Table | Contenu |
|---|---|
| `Filiere` | Filières proposées à l'inscription |
| `Participant` | Pseudo, sélecteur et hash du code, filière, année, date de consentement, indicateurs `exclu` et `bloque` |
| `Bilan` | Réponses (situation), total et détail par catégorie, type STAND/COMPLET |
| `Defi` | Catalogue, avec l'action Nos Gestes Climat associée |
| `Engagement` | Participant, défi, semaine, gain figé, statut |
| `Suivi` | Réponses aux questionnaires J7 / J14 |
| `PushAbonnement` | Abonnements aux notifications |
| `Relance` | Notifications déjà envoyées |
| `QuizReponse` | Réponses anonymes au quiz (partie, question, choix, correct) |
| `ActionAdmin` | Journal des actions de l'équipe (auteur, action, cible, détails) : modération, comptes admin, évènements, vêtements, corrections des compteurs, mode maintenance |
| `CompteurJour` | Compteur manuel du stand (jour J) : nombre de personnes venues |
| `TypeVetement` | Référentiel admin-gérable des types de vêtements, avec poids moyen (grammes) |
| `Matiere` | Référentiel admin-gérable des matières, avec facteur d'émission (kg CO2e/kg) et sa source |
| `QuantiteVetement` | Quantités récupérées/données, par jour × type × matière |
| `Session` | Sessions ouvertes (participant **ou** compte admin, contrainte `CHECK`) : l'id est repris dans le jeton (`jti`). Déconnexion = ligne supprimée, donc un cookie recopié ne vaut plus rien. Aucune IP ni navigateur. Effacées avec le compte, et à la réinitialisation d'un mot de passe admin ; lignes expirées purgées automatiquement (au plus une fois par heure) |
| `EvenementSecurite` | Journal des événements de sécurité (OWASP A09), contient des IP, purgé à 30 jours |
| `Evenement` | Évènements de la page d'accueil publique, statut brouillon/publié |
| `QuestionBilan` | Questionnaire du bilan géré en admin : type ADEME (dottedName, texte affiché, bornes) ou INFORMATION (texte, format nombre/choix, unité, bornes ou choix), ordre, actif |
| `ReponseQuestion` | Réponse d'un bilan à une question « information » (nombre ou choix), supprimée avec le bilan |
| `Annonce` | Message d'information du site (une seule ligne : texte, niveau, publié ou non, date de fin facultative, modifié par qui), géré depuis l'admin |
| `Maintenance` | Mode maintenance du site (une seule ligne : actif, depuis quand, activé par qui), basculé depuis l'admin |

Toutes les données d'un participant sont supprimées en cascade avec son compte.

---

## 7. Sécurité et RGPD

**Sécurité** (modèle de menaces, état de chaque catégorie du Top 10 OWASP 2025 et checklist de production : [`SECURITY.md`](../SECURITY.md))
- **Journal de sécurité** (onglet Sécurité de l'admin, `GET /api/admin/securite`, export `securite`) : connexions et échecs admin, verrouillage, accès admin refusés, codes invalides, dépassements de limite, tentatives de comptes bloqués. Alertes automatiques sur la dernière heure. Conservation de 30 jours (adresses IP) (A09).
- **Dépendances** : `npm audit` sans vulnérabilité. L'`override` de `deepmerge-ts` (version 8) dans `package.json` corrige une faille de la CLI Prisma 6 ; à retirer lors du passage à Prisma 7 (A03).
- **Versions volontairement bloquées** (règles `ignore` de `.github/dependabot.yml`, décision du 12/11/2026) : le modèle **Nos Gestes Climat est figé en `4.10.4`** car la 4.18 a renommé les actions des 22 défis (`prisma/defis.ts`), malgré un numéro de version mineure, et même le correctif 4.10.5 exige Node 24. Une montée de version se fait à la main : remapper chaque `actionNgc`, relancer `npm test` (le test « trouve toutes les actions du catalogue de défis dans le modèle » le détecte), revoir les gains affichés. **Prisma reste en 6** (Prisma 7 est une vraie migration), **web-push reste en 3.6.7** (la 4.0 passe en ESM et réécrit le code ; montée reportée après l'évènement, à valider par une vraie notification reçue sur un téléphone) et l'image Docker reste en **Node 22** (même version que la CI, maintenue jusqu'en avril 2027). Après toute modification des dépendances, régénérer `package-lock.json` avec **npm 10 / Node 22**, la version de la CI (indiquée dans `.nvmrc` ; avec nvm-windows : `nvm install 22` puis `nvm use 22`) : un lockfile écrit par npm 11 peut omettre des paquets optionnels, et `npm ci` échoue alors en CI (vécu le 12/11/2026).
- **CSP stricte** sur tout ce que sert l'API : uniquement des ressources de l'application, aucun script ni style en ligne, pas d'intégration en iframe (A02, A05). Les pages `/admin/` n'utilisent que le CSSOM pour leurs styles dynamiques.
- **IP du client fiable** : seuls les `TRUST_PROXY` derniers intermédiaires sont crus dans `X-Forwarded-For`. Un client ne peut donc pas inventer son IP pour contourner la limitation de débit (A02, A07).
- **Connexion admin** : 5 essais par minute et par IP, plus un **verrou par prénom** (20 échecs en 15 minutes sur un même prénom, toutes IP confondues, entraînent 15 minutes de verrou de ce compte, erreur `429 ADMIN_VERROUILLE` ; les autres comptes restent utilisables). La table des verrous, gardée en mémoire, oublie les prénoms inactifs au-delà de 1 000 entrées, pour que des essais avec des prénoms inventés ne la fassent pas grossir sans fin. Chaque échec est journalisé avec l'IP (A07, A09). Attention : un attaquant qui connaît un prénom peut volontairement verrouiller ce compte. Les sessions déjà ouvertes ne sont pas affectées.
- **Taille des requêtes** limitée à 256 Ko (A10).
- Codes de récupération hachés (argon2), comparaison à temps constant.
- Administration par comptes nominatifs (prénom + mot de passe généré par l'application, haché argon2, comparaison à temps constant même pour un prénom inconnu), avec un rôle distinct de celui des participants.
- Exports CSV protégés contre l'injection de formules.
- Modération : alertes de triche, exclusion des statistiques, blocage et journal des actions de l'équipe.
- **Pas d'injection publicodes** : en publicodes, une chaîne est une formule. Seules les questions connues du modèle sont acceptées, avec des valeurs contrôlées (nombre dans les bornes du modèle, oui/non, choix prévus).
- Toutes les entrées sont validées par des schémas Zod. Les champs inconnus sont ignorés.
- Limitation de débit sur l'inscription, la connexion et le calcul de bilan. Les limites sont larges, car tout le campus peut sortir par une seule IP.
- En-têtes de sécurité (Helmet), CORS limité au front.
- Un participant ne peut ni voir ni modifier les engagements d'un autre (404 identique dans les deux cas).

**RGPD** (repris dans la page `/confidentialite` du front, `frontend/src/pages/ProtectionDonnees.tsx` ; registre des traitements, décision sur l'analyse d'impact et points à régler avant la mise en ligne : [`RGPD.md`](../RGPD.md))
- **Responsable et contact** : l'équipe étudiante du projet, dans le cadre du module encadré par l'UPHF / INSA Hauts-de-France ; greencampus.hdf@gmail.com.
- **Journal de sécurité** : IP notée lors des évènements de sécurité seulement, effacée au bout de 30 jours (intérêt légitime : protéger le service).
- **Données collectées** : pseudo et code générés, filière, année, réponses au bilan et au suivi, défis. **Aucune donnée personnelle** : ni nom, ni email, ni téléphone. Le suivi n'a pas de champ de texte libre.
- **Finalité** : sensibilisation et mesure de l'impact de l'action GreenCampus (module UPHF).
- **Droits** : consultation (`GET /api/me`), modification (`PATCH /api/me`) et effacement immédiat (`DELETE /api/me`).
- **Conservation** : jusqu'à la fin du projet (21/12/2026), puis suppression de la base (tâche prévue dans le Gantt).
- **Anonymat statistique** : seuil de 5 personnes sur le tableau de bord.
- **Modération** : l'équipe voit dans `/admin/` les pseudos et l'activité des comptes (données pseudonymes, sans identité réelle), uniquement pour lutter contre les abus. À mentionner dans la page de mentions.
- **Aucun traceur** ni outil de mesure d'audience.

**Licence du modèle** : Nos Gestes Climat est open source (MIT), mais certains facteurs d'émission issus d'ecoinvent ont des conditions de réutilisation particulières (voir les mentions légales de Nos Gestes Climat). On utilise le modèle pour calculer, sans republier ces données.

---

## 8. Tests

```bash
npm test
```

> **Windows** : si **tous** les fichiers échouent avec « Vitest failed to find the runner », le
> terminal est dans un chemin dont la lettre de lecteur est en minuscule (`c:\Users\…`, fréquent dans
> le terminal de VS Code). Vitest charge alors ses modules deux fois. Se placer dans le même dossier
> avec `C:` en majuscule (`cd C:\Users\…\backend` dans PowerShell) puis relancer `npm test`.

243 tests, répartis en 24 fichiers :

| Fichier | Ce qui est testé |
|---|---|
| `recovery-code.test.ts` | Format, tolérance de saisie et unicité des codes ; pseudos |
| `participants.test.ts` | Inscription, consentement, reconnexion, profil, suppression, limitation de débit, erreurs en français |
| `ngc.test.ts` | Calcul du bilan, validation et normalisation des réponses, **refus des injections**, bornes des réponses et plafond de 14 repas, questions du stand, existence des actions des défis, personnalisation des gains, calcul des semaines |
| `bilans-defis.test.ts` | Bilans de bout en bout, bornes exposées et réponses hors bornes refusées, catalogue, recommandations, cycle complet d’un engagement, changement d’avis sans réécrire la date de 1re réponse, isolation entre participants, suppression en cascade complète (bilans, défis, suivis, abonnements push, relances, session) |
| `tableau-relances.test.ts` | Seuil d'anonymat, cumul du CO2 évité, questionnaires J+7 / J+14, abonnements, envoi unique des relances, abonnements expirés |
| `ia.test.ts` | Guide (chaque chiffre a une source), quiz (aucune réponse divulguée avant de jouer, correction, refus des choix inconnus, anonymat), tableau de bord, admin et export du quiz, question J+14 |
| `moderation.test.ts` | Détection des alertes, liste filtrée et recherche, fiche, exclusion (effet sur le tableau de bord public), blocage (session et reconnexion), annulation de défi, suppression, journal avec auteur et motif |
| `admin.test.ts` | Format CSV et **neutralisation des formules**, connexion (bon/mauvais mot de passe, prénom inconnu), séparation des rôles, statistiques, activation des défis, exports sans pseudo ni code |
| `comptes-admin.test.ts` | Accès réservé aux super-admins, création (mot de passe affiché une fois, prénom unique, limite de comptes), blocage (perte d'accès immédiate), garde-fous anti-auto-action et dernier super-admin, réinitialisation de mot de passe, suppression |
| `compteurs.test.ts` | Jour J (personnes venues) : auth, valeur par défaut, incrément/décrément sans descendre sous zéro, saisie manuelle, historique, export CSV |
| `vetements.test.ts` | Types/matières (CRUD, noms uniques, suppression refusée si utilisé), quantités par jour (incrément, correction), bilan CO2 (calcul exact, `donneesIncompletes`), totaux publics de la collecte (sans session, sans détail), export CSV |
| `seed-vetements.test.ts` | Chiffres de référence des vêtements : 12 matières et 7 types sourcés, création de ce qui manque, champs vides complétés, valeur déjà saisie jamais écrasée, relance sans doublon |
| `securite.test.ts` | Limitation de débit, verrou admin après trop d'échecs (et oubli des verrous inactifs), comparaisons à temps constant, en-têtes de sécurité |
| `defis-delai.test.ts` | Délai minimum avant « Tenu » : `validableAt` renvoyé, refus 409 sans rien modifier, « Non tenu » toujours accepté, validation acceptée une fois le délai passé, changement d'avis soumis au délai ; sans délai (`0`), validation acceptée même si l'horloge de la base est en avance sur celle de l'API |
| `suppression.test.ts` | Script de fin de projet : nom de la base lu dans `DATABASE_URL`, mot de passe jamais affiché, rien de supprimé sans `--confirmer` |
| `session-cookie.test.ts` | Cookies de session participant et admin (`HttpOnly`, `SameSite=Strict`, chemin, durée, `Secure` en production), aucun jeton dans le corps des réponses, déconnexion et suppression qui effacent le cookie, rôles séparés, **révocation côté serveur** (cookie recopié refusé après déconnexion, autres appareils non touchés, jeton sans session ou à session expirée/d'un autre compte refusé, sessions effacées avec le compte et à la réinitialisation d'un mot de passe admin, tentative journalisée), **protection CSRF** par l'en-tête `Origin` (même site et `CORS_ORIGIN` acceptés, autre site ou absence refusés et journalisés, Bearer non concerné) |
| `rotation-jwt.test.ts` | Changement de `JWT_SECRET` : anciennes sessions participant et admin refusées, reconnexion par code de récupération avec les données intactes |
| `maintenance.test.ts` | Mode maintenance : coupé par défaut, activable par un admin simple, 503 sur l'API publique et participant (même sur une route inconnue), admin et `/health` toujours joignables, remise en ligne, journal (une ligne par bascule réelle), session admin exigée |
| `benevoles-stats.test.ts` | Rôle bénévole (routes ouvertes, refus en 403 journalisés avant même la validation du corps, liste blanche cohérente avec les routes), limite séparée des bénévoles, statistiques des rappels et de l'évènement, filtres du journal (membre, action, période), export CSV du journal sans pseudo |
| `journal-admin.test.ts` | Journal des actions de l'équipe : évènements, saisie directe des compteurs (avec l'ancienne valeur, sans les +1/−1), catalogue et quantités de vêtements, suppression refusée non journalisée, consultation via `/journal` |
| `journal-securite.test.ts` | Journalisation des connexions/échecs admin, codes invalides, accès refusés, comptes bloqués, alertes par seuil, purge à 30 jours, consultation et export admin |
| `questionnaire.test.ts` | Questionnaire admin : 29 questions de départ, fermé aux bénévoles, ajout depuis le modèle (recherche, bornes dans les limites, doublon refusé), bornes admin appliquées aux bilans et à l'estimation, désactivation d'une question répondue (suppression refusée), suppression sans réponse, déplacement ; questions « information » : validations, réponses hors calcul, reprise du bilan, statistiques, export CSV, choix répondus non retirables, désactivation, effacement RGPD |
| `annonce.test.ts` | Message d'information : brouillon invisible, publication sans authentification, un seul message (le nouveau remplace l'ancien, version qui change), retrait, date de fin (retrait automatique malgré le cache), date passée / texte vide ou trop long / niveau inconnu refusés, journal, fermé aux bénévoles |
| `evenements.test.ts` | Page d'accueil : un brouillon reste invisible du public, apparaît une fois publié et plus après dépublication, tri par date, évènement sans date (en tête de liste), fin avant le début ou sans début refusée, CRUD admin, 404, auth requise |

Les tests utilisent la base `greencampus_test`. Ils y appliquent les migrations puis vident ses tables, et **refusent de tourner sur une base dont le nom ne finit pas par `_test`**.

---

## 9. Organisation du code

```
backend/
├── prisma/
│   ├── schema.prisma          modèle de données
│   ├── migrations/            migrations SQL versionnées (init, défis, relances)
│   ├── filieres.ts, defis.ts  données initiales (catalogue de défis)
│   ├── seed.ts
│   └── seed-super-admin.ts    amorce le premier compte admin (ADMIN_SUPER_PRENOM/MOT_DE_PASSE)
├── src/
│   ├── server.ts              point d'entrée
│   ├── app.ts                 assemblage (plugins, routes, démo)
│   ├── config.ts              variables d'environnement validées
│   ├── lib/                   modèle Nos Gestes Climat (ngc.ts), codes de récupération, mots de
│   │                           passe admin générés, pseudos, semaines, erreurs
│   ├── plugins/               Prisma, authentification JWT, modèle NGC, minuteur des relances
│   └── modules/<domaine>/     routes.ts (HTTP et schémas Zod) + service.ts (logique métier)
│       ├── participants/  filieres/  bilans/  defis/  evenements/
│       ├── suivis/  tableau-de-bord/  admin/  securite/
│       │   (admin/ : routes.ts = connexion et contrôle d'accès, puis routes-general, -moderation,
│       │    -comptes, -stand, -evenements par thème, aides communes dans routes-commun.ts)
│       ├── guide-ia/  quiz/   IA responsable (contenu, sources, quiz)
│       └── dev/               outils de test (hors production)
├── admin/                     interface d'administration servie sur /admin/ (HTML, CSS, polices)
│   └── js/                    modules ES sans étape de build : admin.js (session, onglets,
│                               maintenance), outils.js (DOM, dialogues, API), graphiques.js,
│                               un vue-*.js par onglet
├── test/                      tests Vitest
└── Dockerfile
```

Pour ajouter une route : créer ou compléter un dossier dans `src/modules/`, puis l'enregistrer dans `src/app.ts`. Les schémas Zod servent à la fois à la validation et à la documentation `/docs`.

---

## 10. Reste à faire et limites connues

**À faire côté backend**
- [x] **Script de suppression des données** au 21/12 : `npm run db:suppression-finale` (fait le 12/11/2026, procédure dans `RGPD.md` §6 ; commandes de l'hébergeur à ajouter une fois la VM connue).
- [x] Vérifier la **réception réelle d'une notification** sur Android (fait le 12/11/2026 : relances J+7 et J+14 reçues, app fermée comprise ; l'appui ouvre la page Suivi).
- [x] La vérifier aussi sur **iPhone** (fait le 17/11/2026 : relance J+7 reçue, l'appui ouvre la page Suivi). Test fait avant la mise en ligne grâce à un tunnel HTTPS (`cloudflared tunnel --url http://localhost:5173`, Vite lancé avec `__VITE_ADDITIONAL_SERVER_ALLOWED_HOSTS=.trycloudflare.com`), site ajouté à l'écran d'accueil depuis Safari, et `VAPID_SUJET` réglé sur une vraie adresse `mailto:`.
- Astuce pour tester depuis un téléphone avant la mise en ligne : lancer Vite avec `--host`, puis dans Chrome Android activer `chrome://flags/#unsafely-treat-insecure-origin-as-secure` pour `http://<IP du PC>:5173` (les notifications exigent HTTPS sinon). Sur les téléphones **Xiaomi** (MIUI/HyperOS), deux réglages du navigateur sont nécessaires (Paramètres, Applications, <navigateur>) : « Raccourcis sur l'écran d'accueil » pour installer le site, et **« Démarrage automatique » + économiseur de batterie « Aucune restriction »** pour recevoir les rappels quand le navigateur est fermé. Sans ce dernier réglage, Android jette les notifications reçues pendant que l'app est fermée, sans erreur côté serveur (vécu le 12/11/2026). À rappeler sur l'affiche ou au stand.
- [ ] Construire et tester l'**image Docker** sur le serveur choisi (avec Mahdi).
- [ ] Choisir, avec le groupe, les **questions définitives du stand** et les éventuelles questions complémentaires.
- [ ] Optionnel : faire relire le catalogue de défis et leurs libellés par le groupe ou le partenaire.
- [ ] Faire relire le guide et le quiz IA par le groupe, et vérifier les chiffres juste avant le stand (le sujet évolue vite).
- [ ] Rédiger la **charte d'usage de l'IA du groupe** (piste E), si le groupe le souhaite, pour la vidéo.
- [x] **Délai minimum avant validation d'un défi** (fait le 12/11/2026) : « Tenu » n'est accepté que
      `DEFI_DELAI_VALIDATION_HEURES` (24 h par défaut) après le choix du défi (409 `VALIDATION_TROP_TOT`
      sinon) ; « Non tenu » reste possible à tout moment. Chaque engagement renvoie `validableAt`, et le site
      grise « Tenu » jusque-là avec la date affichée. L'alerte de modération « validation rapide » reste
      en place (elle repère aussi un « Non tenu » suivi d'un changement d'avis).
- [x] **Poids moyens et facteurs d'émission des vêtements** : valeurs Ecobalyse insérées par
      `npm run db:seed` (voir section 6). À remplacer dans l'admin si l'équipe pèse de vrais vêtements.

**Limites connues**
- La validation des défis est **déclarative** : le CO2 évité est une estimation.
- Une empreinte globale bouge peu en 2 semaines : l'impact se mesure surtout par les défis validés et les réponses au suivi (voir le résumé du projet).
- Une seule instance de l'API (état en mémoire, voir [section 5](#5-ce-que-linfra-doit-faire)).
- Notifications sur iPhone : seulement si l'application est installée sur l'écran d'accueil.
- `prisma migrate dev` demande un terminal interactif. Prisma 7 changera la configuration (`package.json#prisma` → `prisma.config.ts`), sans urgence.
