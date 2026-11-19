# Sécurité de GreenCampus HdF

Ce document décrit le modèle de menaces de l'application, les mesures en place pour chaque catégorie du **Top 10 OWASP 2025**, les risques acceptés et la checklist de mise en production. Il est tenu à jour sur la branche `securite`.

Dernière mise à jour : 11/11/2026.

## Signaler une vulnérabilité

Ne pas ouvrir d'issue publique. Prévenir directement un membre de l'équipe (Ethan J. pour le back-end, Ethan B. pour le front, Mahdi pour l'infrastructure), avec les étapes pour reproduire le problème.

---

## 1. Modèle de menaces

### Ce qu'on protège

| Bien | Sensibilité | Pourquoi |
|---|---|---|
| Réponses aux bilans, défis, suivis | Moyenne | Données pseudonymes sur les habitudes de vie (transport, alimentation, logement) |
| Comptes participants (code de récupération, session) | Moyenne | Permettraient d'agir au nom d'un étudiant ou de voir ses réponses |
| Comptes admin (`CompteAdmin` : prénom, hash argon2 du mot de passe, rôle) | Élevée | Donnent accès à toutes les données pseudonymes, à la modération, aux exports ; un super-admin peut en plus créer, bloquer et supprimer des comptes admin |
| Contenu publié sur l'accueil (évènements) | Moyenne | Visible de tous : un compte admin compromis pourrait y afficher un message trompeur |
| Fiabilité des statistiques | Moyenne | Le classement, les chiffres de la vidéo, les compteurs du jour J et le bilan CO2 des vêtements doivent être crédibles |
| Journal de sécurité | Moyenne | Contient des adresses IP (donnée personnelle) |
| Secrets (`JWT_SECRET`, clé privée VAPID, mot de passe temporaire `ADMIN_SUPER_MOT_DE_PASSE` le temps de l'amorçage) | Élevée | Leur fuite compromettrait toute l'application |

L'application ne collecte **aucune donnée d'identité** : pas de nom, d'email ni de téléphone. C'est la première mesure de sécurité : ce qui n'est pas collecté ne peut pas fuiter.

### Qui pourrait attaquer, et comment

| Acteur | Motivation | Scénarios principaux | Réponse |
|---|---|---|---|
| Étudiant « tricheur » | Faire gagner sa filière | Réponses fantaisistes au bilan, validations à la chaîne, multi-comptes | Calcul côté serveur, plafonds du modèle ADEME, 3 défis par semaine, alertes de modération, exclusion des statistiques |
| Curieux ou « troll » | S'amuser, tester | Injection dans les formulaires, XSS, scripts automatisés | Validation stricte (Zod), requêtes paramétrées, échappement, CSP, limitation de débit |
| Attaquant opportuniste | Prendre la main sur un serveur exposé | Scan de ports, force brute de l'admin, dépendances vulnérables | HTTPS, comptes admin nominatifs à mot de passe généré par l'application, verrou par compte, audit des dépendances en CI, image Docker non root |
| Membre de l'équipe distrait | Erreur humaine | Secret commité, mauvaise configuration en production, fusion non relue | `.env` ignoré par Git, garde-fous au démarrage, CI obligatoire, journal des actions admin |

---

## 2. Mesures par catégorie du Top 10 OWASP 2025

État : **Fait** = en place et testé ; **À faire** = prévu ; **Décision** = à trancher par le groupe.

| Catégorie | Mesures | État |
|---|---|---|
| **A01 Contrôle d'accès défaillant** | Chaque requête de participant ne porte que sur ses propres données (filtre systématique par son identifiant ; un engagement d'un autre renvoie 404). Rôles admin et participant séparés : un jeton de participant est refusé sur l'admin, et inversement. Rôle bénévole limité au Jour J et aux vêtements par une liste blanche de routes (tout le reste en 403, journalisé). Un compte bloqué perd tout accès, même avec son code. | Fait (tests `participants`, `bilans-defis`, `admin`, `moderation`) |
| **A02 Mauvaise configuration de sécurité** | CSP stricte (aucun script ni style en ligne, pas d'iframe tierce), en-têtes Helmet (HSTS, nosniff…). `/docs` et `/api/dev/*` désactivés par défaut en production, `/admin/` désactivée par défaut (`ADMIN_ENABLED`). Refus de démarrer avec le secret d'exemple ou une origine CORS non HTTPS ; `*` refusé. Confiance limitée au nombre réel de reverse proxys (`TRUST_PROXY`). | Fait (tests `securite`) |
| | Même CSP sur le serveur qui héberge le front (voir section 5). | Écrite (`deploiement/nginx/`), à installer sur la VM |
| **A03 Défaillances de la chaîne d'approvisionnement** | `package-lock.json` versionnés, installation par `npm ci`. `npm audit` bloquant en CI (niveau « high », script `.github/scripts/audit.mjs`) ; une alerte sans correctif publié ne peut être exemptée qu'individuellement, avec une raison et une date d'expiration, dans `.github/audit-exceptions.json` (au 18/11/2026 : `picomatch` GHSA-fc5q-39xc-vjpf, outils de build et de test uniquement, jusqu'au 05/12/2026). Recherche de secrets dans tout l'historique à chaque poussée (gitleaks, section 6). Dependabot hebdomadaire (npm, GitHub Actions, Docker). Actions GitHub épinglées par empreinte de commit. Vulnérabilité de `deepmerge-ts` (CLI Prisma, GHSA-ggr8-5vv4-36mx) corrigée par un `override` npm vers la version 8 (voir section 3). | Fait |
| | Image de base Docker épinglée par empreinte (`node:22-alpine@sha256:…`), mise à jour chaque semaine par Dependabot. | Fait (12/11/2026) |
| | Alléger l'image (retirer `npm`/`npx` de l'image finale, lancer les migrations autrement). | À faire (priorité 3) |
| **A04 Défaillances cryptographiques** | Codes de récupération : 80 bits d'aléa, dont 50 pour la partie secrète, hachée avec argon2 (deviner un code est irréaliste avec la limitation de débit). Sessions JWT signées (secret de 32 caractères minimum). HTTPS obligatoire en production (HSTS). Mots de passe admin générés par l'application et hachés avec argon2 ; un prénom inconnu est comparé à un hash factice, pour que la réponse prenne le même temps qu'un prénom existant. | Fait |
| | Procédure de changement de `JWT_SECRET` en cas de fuite (section 8, vérifiée par `rotation-jwt.test.ts`). | Fait (12/11/2026) |
| | Sauvegardes de la base chiffrées (dépend de l'hébergeur). | À vérifier : chiffrement RDS activé (les sauvegardes suivent le chiffrement de l'instance) |
| **A05 Injection** | Requêtes SQL paramétrées (Prisma, gabarits `$queryRaw`). Toutes les entrées validées par des schémas Zod. Réponses du bilan filtrées avant le moteur publicodes (une chaîne y serait une formule). Exports CSV protégés contre l'injection de formules. Échappement systématique côté front (React) et dans `/admin/` (`textContent`). | Fait (tests `ngc`, `admin`) |
| **A06 Conception non sécurisée** | Anonymat par conception (aucune donnée d'identité). Calcul du bilan uniquement côté serveur. Règles métier anti-triche (3 défis par semaine, gain figé à l'engagement, seuil d'anonymat de 5 au tableau de bord). Ce document. | Fait |
| **A07 Échecs d'authentification** | Limitation de débit sur l'inscription, la reconnexion et la connexion admin. Comptes admin nominatifs (prénom + mot de passe généré par l'application, jamais choisi) ; verrou par compte (20 échecs en 15 minutes sur un même prénom, pas global), dont la table en mémoire oublie les prénoms inactifs au-delà de 1 000 entrées (des prénoms inventés ne la font pas grossir sans fin). Réponse en temps constant, que le code/prénom existe ou non (hash factice). Sessions admin de 12 heures, revérifiées en base à chaque requête (un compte bloqué perd l'accès immédiatement). | Fait (tests `securite`, `participants`, `comptes-admin`) |
| | Sessions participant et admin dans des cookies `HttpOnly; SameSite=Strict` (`Secure` en production) au lieu du `localStorage`/`sessionStorage`, avec contrôle de l'en-tête `Origin` contre le CSRF (voir section 4). | Fait (18/11/2026, test `session-cookie`) |
| **A08 Défaillances d'intégrité des logiciels et des données** | CI obligatoire (tests, types, audit, image Docker). Actions épinglées par empreinte. Aucune désérialisation de données non fiables (JSON validé uniquement). | Fait |
| | Protéger la branche `main` : pull request et CI verte obligatoires (voir section 6). | À faire (propriétaire du dépôt) |
| **A09 Défaillances de journalisation et d'alerte** | Journal de sécurité en base : connexions et échecs admin, verrouillage, accès admin refusés, codes invalides, dépassements de limite, tentatives de comptes bloqués, requêtes d'un autre site refusées (`ORIGINE_REFUSEE`), réutilisation d'une session admin fermée (`ADMIN_SESSION_FERMEE`). Alertes automatiques sur la dernière heure, affichées dans l'admin (onglet Sécurité et vue d'ensemble). Journal des actions de l'équipe avec leur auteur (`ActionAdmin`) : modération, comptes admin, évènements, catalogue des vêtements, corrections des compteurs du jour J et des quantités (avec l'ancienne valeur). Les +1/−1 tapés au stand ne sont volontairement pas journalisés (une ligne par personne noierait le journal). Conservation de 30 jours (adresses IP). | Fait (tests `journal-securite`, `journal-admin`) |
| **A10 Mauvaise gestion des conditions exceptionnelles** | Gestionnaire d'erreurs global : aucun détail technique renvoyé au client (500 générique). `/health` vérifie la base (503 si elle ne répond pas sous 2 secondes). Taille des requêtes limitée à 256 Ko. Le journal de sécurité ne fait jamais échouer une requête. Authentification « fermée par défaut » (tout échec de vérification refuse l'accès). | Fait (tests `securite`, `journal-securite`) |

---

## 3. Risques acceptés

| Risque | Pourquoi on l'accepte | Mesure de compensation |
|---|---|---|
| Validation des défis **déclarative** | Impossible de vérifier qu'un étudiant a vraiment mangé végétarien | Alertes de modération, exclusion des statistiques, chiffres présentés comme des estimations |
| **Multi-comptes** | Aucune donnée d'identité, donc pas de moyen fiable de lier deux comptes | Seuil d'anonymat, modération, plafonds du modèle |
| **Verrou de l'admin déclenchable** par un attaquant | Un attaquant qui connaît un prénom peut volontairement provoquer 20 échecs pour bloquer la connexion de ce compte 15 minutes (le verrou est par prénom, pas global : les autres comptes restent utilisables) | Les sessions déjà ouvertes continuent de fonctionner ; l'événement est tracé et lève une alerte |
| **Une seule instance** de l'API | Limitation de débit, verrou admin et cache en mémoire | Suffisant pour la charge prévue (quelques centaines d'étudiants) |
| **`override` de `deepmerge-ts`** en version 8 sous Prisma 6 | Évite une migration majeure vers Prisma 7 à quelques semaines de l'événement. Prisma n'utilise que la fonction `deepmerge`, inchangée en version 8 | Validé par `prisma validate`, `generate`, `migrate status` et la suite de tests (144 au 11/11/2026). À retirer lors du passage à Prisma 7 |
| Limite de **3 comptes admin** par défaut (`ADMIN_LIMITE_COMPTES`) | Dimensionnée pour l'équipe actuelle, pas un nombre arbitrairement grand | Configurable ; un super-admin peut bloquer/supprimer un compte inutilisé pour en créer un autre |

---

## 4. Où est gardée la session ? (décidé le 18/11/2026)

**Avant** : le front gardait le jeton participant (valable 60 jours) dans le `localStorage`, et `/admin/` le jeton admin dans le `sessionStorage`. Une faille XSS aurait permis à un script de les lire et de les envoyer ailleurs.

**Maintenant (option B retenue)** : l'API pose la session dans un cookie, que le JavaScript de la page ne peut pas lire.

| | Participant | Administration |
|---|---|---|
| Cookie | `gc_session` | `gc_admin` |
| Attributs | `HttpOnly; SameSite=Strict; Path=/api`, `Secure` en production | `HttpOnly; SameSite=Strict; Path=/api/admin`, `Secure` en production |
| Durée | `TOKEN_TTL` (60 jours) | Cookie de session (effacé à la fermeture du navigateur), jeton valable `ADMIN_SESSION_TTL` (12 h) |
| Déconnexion | `DELETE /api/sessions` (et `DELETE /api/me`) | `DELETE /api/admin/session` |

- **Prérequis** : front et API sur le **même domaine** (Nginx sert le front et transmet `/api` et `/admin`), ce qui est le cas du déploiement AWS. En développement, le proxy Vite donne la même origine.
- **CSRF** : `SameSite=Strict`, plus un contrôle de l'en-tête `Origin` sur toute requête qui modifie des données avec un cookie de session (hook `onRequest` de `plugins/auth.ts`) : il doit correspondre au site lui-même (`Host`) ou à une origine de `CORS_ORIGIN`, sinon `403 ORIGINE_REFUSEE`, journalisé (alerte à partir de 5 par heure).
- **Déconnexion réelle côté serveur** : chaque jeton porte l'id (`jti`) d'une ligne de la table `Session`, revérifiée à chaque requête. Se déconnecter supprime la ligne : un cookie recopié avant la déconnexion (outils de développement, ordinateur partagé du stand) ne vaut plus rien, sans déconnecter les autres appareils du même compte. Les sessions sont aussi effacées avec le compte (cascade) et à la réinitialisation d'un mot de passe admin. Une session admin fermée réutilisée est journalisée (`ADMIN_SESSION_FERMEE`, alerte à partir de 3 par heure). Bloquer un compte coupe l'accès sans fermer ses sessions (le message « compte suspendu » reste affiché) ; le débloquer les rouvre.
- **Bearer toujours accepté** (tests, scripts `db:seed-demo` et d'audit) : un site tiers ne peut pas forger cet en-tête, et le front ne stocke plus aucun jeton à voler. L'API ne renvoie plus le jeton dans le corps des réponses.
- `Secure` n'est posé qu'en production : hors production, le site tourne en `http://` (téléphone sur le réseau local), où un cookie `Secure` ne serait jamais renvoyé.
- Une XSS resterait grave (elle pourrait agir **dans** la page tant qu'elle est ouverte), mais ne pourrait plus emporter une session de 60 jours. La CSP stricte et l'échappement de React restent la première défense.

---|---|---|
| **A. Garder le `localStorage`** | Rien à changer | Vol de session possible en cas de XSS. La CSP stricte et l'échappement de React rendent une XSS peu probable, sans l'exclure |
| **B. Cookie `HttpOnly; Secure; SameSite=Strict`** posé par l'API | Le jeton devient illisible par JavaScript, donc impossible à voler par XSS | Front et API doivent être servis sur le **même domaine** (Nginx sert le front et redirige `/api`). L'API lit le cookie et ajoute une route de déconnexion. Côté front, on retire la gestion du jeton (ce qui simplifie le code). Protection CSRF assurée par `SameSite=Strict` et une vérification de l'en-tête `Origin` |

**Recommandation** : l'option B, si Ethan B. est d'accord et si le déploiement prévoit bien un domaine unique. Côté back, c'est environ une demi-journée de travail, avec ses tests.

---

## 5. Checklist de mise en production

- [ ] `NODE_ENV=production` (active les garde-fous ; l'API refuse de démarrer si la configuration est faible)
- [ ] `JWT_SECRET` généré : `node -e "console.log(require('crypto').randomBytes(48).toString('base64url'))"`
- [ ] `ADMIN_ENABLED=true`, premier compte amorcé via `ADMIN_SUPER_PRENOM`/`ADMIN_SUPER_MOT_DE_PASSE`
      (mot de passe temporaire ≥ 12 caractères) puis `npm run db:seed` **une seule fois** ; ces
      deux variables retirées du `.env` juste après, le compte réinitialisant son propre mot de
      passe depuis l'onglet « Comptes admin »
- [ ] Clés VAPID générées pour la production (`npx web-push generate-vapid-keys`), différentes de celles de développement
- [ ] `CORS_ORIGIN` = l'URL HTTPS du front ; `DOCS_ENABLED` et `DEMO_ENABLED` **non définis**
- [ ] `TRUST_PROXY` non défini (`1` par défaut en production : Nginx seul devant l'API, pas de
      load balancer), et Nginx qui **remplace** `X-Forwarded-For` par l'adresse réelle du client
      (`$remote_addr`, fichier `deploiement/nginx/greencampus/proxy.conf`). Vérifié le 18/11/2026 : un
      faux `X-Forwarded-For` envoyé par le client est ignoré
- [ ] **Port de l'API (4000) joignable uniquement par Nginx**, jamais depuis Internet : publier le
      conteneur sur `127.0.0.1:4000` (pas `-p 4000:4000`), le groupe de sécurité de la VM n'ouvrant
      que les ports 80 et 443 (ni 22, ni 4000). L'API croit les `TRUST_PROXY` derniers relais de `X-Forwarded-For` : si on
      pouvait l'appeler en direct, chacun inventerait son IP et contournerait toutes les limites de
      débit (vérifié pendant l'audit 2026-11, AUDIT-07)
- [ ] Base de données non exposée sur Internet (RDS en sous-réseau privé, port 5432 ouvert à la VM seulement, `?sslmode=require`)
- [ ] Sauvegardes automatiques de la base, testées au moins une fois
- [ ] Une **seule** VM (relances, limitation de débit et verrous en mémoire) ; HTTPS Let's Encrypt avec renouvellement automatique, port 80 qui redirige vers 443 ; surveillance externe éventuelle sur `GET /health` (pas sur `/`)
- [ ] En-têtes de sécurité du front dans Nginx : `deploiement/nginx/greencampus/entetes-front.conf`
      (CSP identique à celle de l'API, HSTS, nosniff, `Referrer-Policy`, `Permissions-Policy`),
      inclus dans chaque `location` statique (un `add_header` de `location` annule ceux du `server`)

- [ ] Vider la base des comptes de test avant le stand : à la main (les deux scripts de dev
      `npm run db:seed-demo` et `npm run db:reset-admin` refusent eux-mêmes de tourner si
      `NODE_ENV=production`, par sécurité, mais `db:seed-demo` **remplit** à nouveau avec de
      fausses données après avoir vidé — ne pas s'en servir pour un vrai nettoyage avant
      l'événement, seulement en développement)
- [ ] Journaux du serveur (Nginx sur la VM, API dans CloudWatch) conservés **30 jours au plus** : ils contiennent
      l'IP de chaque requête (voir `RGPD.md`)
- [x] Hébergeur situé dans l'UE, renseigné dans `RGPD.md` §4 (AWS Stockholm, eu-north-1, 18/11/2026)
- [ ] Après le projet (21/12) : supprimer le site, la base et ses sauvegardes (RGPD). En cas de
      reprise par un autre projet, redemander l'accord des participants dans l'application au
      lieu de simplement les prévenir (voir `RGPD.md` §6)

---

## 6. Protéger la branche `main` et détecter les secrets

**Fait le 12/11/2026** par le propriétaire du dépôt (compte `Ethanbst`) : règle « Protection de main »
(**Settings**, puis **Rules**, puis **Rulesets**) sur la branche par défaut, qui **interdit sa
suppression et les « force push »**. Volontairement, elle n'exige ni pull request ni CI verte
avant une poussée : l'équipe pousse encore directement sur `main`. À durcir si l'équipe passe
aux pull requests (exiger une relecture et les jobs de la CI).

**Secrets commités par erreur** : le *secret scanning* de GitHub est payant pour un dépôt privé.
Il est remplacé par le job **« Secrets (gitleaks) »** de la CI, qui relit **tout l'historique** à
chaque poussée (un secret supprimé dans un commit suivant reste lisible dans git, donc reste
signalé). Les faux positifs connus sont listés un par un, par empreinte, dans `.gitleaksignore`.
En cas d'alerte :
1. **Considérer le secret comme compromis** : le révoquer ou le changer d'abord (`JWT_SECRET`,
   clés VAPID, jeton Ecobalyse, mot de passe de base…), même si le dépôt est privé.
2. Le retirer du code, puis le mettre dans le `.env` (jamais commité).
3. Seulement si c'est un faux positif (valeur factice de test, exemple) : ajouter l'empreinte
   donnée par la CI (`Fingerprint: …`) dans `.gitleaksignore`, avec un commentaire.
Les alertes Dependabot sont activées (**Settings**, puis **Code security**, 12/11/2026).

---

## 7. Données personnelles et conservation

| Données | Durée de conservation |
|---|---|
| Comptes, bilans, défis, suivis (pseudonymes) | Jusqu'à la fin du projet (21/12/2026), puis suppression |
| Réponses au quiz (anonymes) | Jusqu'à la fin du projet |
| Journal de sécurité (adresses IP) | 30 jours, suppression automatique |
| Journal des actions admin | Jusqu'à la fin du projet |
| Journaux du serveur web et de l'API (adresses IP) | 30 jours au plus, à configurer au déploiement |

Chaque participant peut consulter, modifier et supprimer immédiatement son compte et toutes ses données (`GET`, `PATCH`, `DELETE /api/me`).

Registre des traitements, analyse d'impact et sous-traitants : [`RGPD.md`](RGPD.md).

---

## 8. Changer `JWT_SECRET` en cas de fuite

**Pourquoi.** `JWT_SECRET` signe toutes les sessions : celles des participants (60 jours) et celles
des admins (12 h). Quelqu'un qui le connaît peut **fabriquer lui-même un jeton valide**, sans mot de
passe ni code de récupération : se faire passer pour un participant (lire ou supprimer ses données),
ou pour un compte admin (modération, exports CSV, mode maintenance). Le changer rend immédiatement
invalides tous les jetons signés avec l'ancien, y compris ceux qu'un attaquant aurait fabriqués.

**Quand.** Seulement s'il a pu fuiter : alerte gitleaks sur un `.env`, `.env` du serveur copié ou
envoyé par erreur, accès au serveur par quelqu'un qui ne devrait pas, ordinateur perdu contenant le
`.env` de production. Pas de changement « par routine » : chaque changement déconnecte tout le monde.

**Conséquences** (vérifiées par `backend/test/rotation-jwt.test.ts`) :
- tous les participants sont déconnectés et doivent se reconnecter avec leur **code de récupération**
  (ou le QR code). Leurs données sont intactes. **Sans le code, le compte n'est plus accessible** :
  c'est le vrai coût, d'où un changement uniquement en cas de fuite ;
- tous les admins doivent se reconnecter (leurs mots de passe ne changent pas) ;
- les abonnements aux rappels push ne dépendent pas du jeton : ils continuent de fonctionner.

**Procédure** (sur le serveur) :
1. Générer un nouveau secret : `node -e "console.log(require('node:crypto').randomBytes(48).toString('base64url'))"`.
2. Le mettre à la place de l'ancien dans le `.env` du serveur (jamais dans git), puis redémarrer le
   conteneur de l'API. Elle refuse de démarrer si le secret fait moins de 32 caractères ou ressemble à
   la valeur d'exemple.
3. Vérifier : `GET /health` répond `ok`, la connexion admin fonctionne, et une ancienne session est
   renvoyée vers la page de connexion.
4. Chercher ce qu'un attaquant aurait pu faire pendant la période d'exposition : onglet **Journal**
   (actions admin, avec le prénom utilisé) et onglet **Sécurité** de `/admin/`.
5. Prévenir les étudiants si besoin (évènement sur la page d'accueil, depuis `/admin/`) : « reconnecte-toi
   avec ton code de récupération ». Noter la date et la raison du changement dans ce document.
