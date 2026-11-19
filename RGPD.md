# Données personnelles (RGPD) de GreenCampus HdF

Registre des traitements, décision sur l'analyse d'impact et points à régler avant la mise en
ligne. Établi pendant l'audit de sécurité de novembre 2026 (méthode : [`AUDIT_SECURITE.md`](AUDIT_SECURITE.md)
section 6), à partir du code réel (`backend/prisma/schema.prisma`) et non de la documentation.

Les mesures techniques de sécurité sont décrites dans [`SECURITY.md`](SECURITY.md) ; l'information
donnée aux participants est la page `/confidentialite` du site
(`frontend/src/pages/ProtectionDonnees.tsx`). Ce document doit rester cohérent avec les deux.

Dernière mise à jour : 11/11/2026.

---

## 1. Responsable du traitement

| | |
|---|---|
| Responsable | L'équipe étudiante du projet GreenCampus HdF, dans le cadre du module encadré par l'UPHF / INSA Hauts-de-France (choix de l'équipe le 11/11/2026, à confirmer avec l'encadrant) |
| Contact pour les questions sur les données | greencampus.hdf@gmail.com (à consulter régulièrement jusqu'au 21/12/2026) |
| Délégué à la protection des données | Celui de l'établissement, si le traitement est rattaché à l'UPHF |

## 2. Registre des traitements

### Traitement 1 : participation à GreenCampus (bilan, défis, suivi)

| Rubrique | Contenu |
|---|---|
| Finalité | Proposer un bilan carbone et des défis personnalisés ; mesurer l'impact collectif de l'action (tableau de bord anonyme, statistiques du projet) ; limiter les abus (modération). |
| Base légale | **Consentement** (art. 6.1.a) : case obligatoire à l'inscription, date enregistrée (`Participant.consentementAt`). Retrait à tout moment = suppression du compte. |
| Personnes concernées | Étudiants qui créent un compte (au stand ou en ligne). |
| Données | Pseudo et code de récupération **générés** (code haché, jamais stocké en clair) ; filière et année ; dates d'inscription et de dernière visite ; réponses au bilan carbone (habitudes de transport, alimentation, logement, numérique, vêtements) ; défis choisis et leur résultat ; réponses aux questionnaires J+7/J+14 (choix et échelles, aucun texte libre) ; abonnement aux notifications push (adresse technique fournie par le navigateur) le cas échéant ; sessions de connexion ouvertes (dates de création et d'expiration seulement, ni IP ni navigateur, supprimées à la déconnexion ou à l'expiration) ; indicateurs de modération (`exclu`, `bloque`). **Aucun nom, email, téléphone ni numéro étudiant.** |
| Destinataires | L'équipe du projet, via l'administration nominative (`/admin/`), pour la modération : elle voit les pseudos et l'activité, jamais d'identité. Statistiques publiques uniquement agrégées, et masquées sous 5 participants par filière (`SEUIL_ANONYMAT`). Exports CSV sans pseudo ni code. |
| Durée | Jusqu'à la fin du projet (21/12/2026), puis suppression de la base. Effacement immédiat à la demande (`DELETE /api/me`, bouton dans « Mon compte »). |
| Transferts hors UE | Aucun, sous réserve de l'hébergeur (section 4) et des services de notification push (section 4). |
| Sécurité | Voir `SECURITY.md` (chiffrement en transit, contrôle d'accès, journalisation, modération). |

### Traitement 2 : sécurité du service (journal de sécurité)

| Rubrique | Contenu |
|---|---|
| Finalité | Détecter et bloquer les attaques (force brute sur l'administration, essais de codes au hasard, abus de débit), tracer les accès à l'administration (OWASP A09). |
| Base légale | **Intérêt légitime** (art. 6.1.f) : protéger le service et les données des participants. |
| Données | Adresse IP, date, type d'événement, et selon le cas : prénom saisi à la connexion admin, identifiant du compte admin, identifiant du participant (tentative d'utilisation d'un compte bloqué), route concernée. Uniquement lors d'un événement de sécurité, pas à chaque visite. |
| Destinataires | Équipe du projet (onglet « Sécurité » de l'administration, export `securite`). |
| Durée | **30 jours**, purge automatique (`modules/securite/service.ts`, `CONSERVATION_JOURS`). |

Les journaux techniques du serveur web (Nginx) et de l'API contiendront aussi des IP : leur durée
de conservation est à fixer lors du déploiement (section 6).

### Traitement 3 : comptes de l'équipe (administration)

| Rubrique | Contenu |
|---|---|
| Finalité | Donner accès à l'administration aux seuls membres de l'équipe, et tracer qui fait quoi (journal `ActionAdmin`). |
| Base légale | Intérêt légitime (organisation du projet). |
| Données | Prénom, rôle (admin, super-admin ou bénévole), mot de passe haché (argon2), état bloqué, dates de création et de dernière connexion ; sessions ouvertes (dates seulement, 12 h au plus) ; journal des actions (auteur, action, cible, détails). La cible d'une action de modération est le pseudo du participant concerné : elle reste dans le journal après la suppression de son compte. |
| Durée | Jusqu'à la fin du projet. |

### Hors périmètre : quiz « IA responsable »

Les réponses au quiz (`QuizReponse`) ne sont reliées à aucun compte, aucune IP ni aucun
identifiant de navigateur : ce sont des données anonymes, hors du champ du RGPD.

## 3. Analyse d'impact (AIPD) : non requise

Grille du CEPD reprise par la CNIL : une AIPD est en principe requise si le traitement remplit au
moins **deux** des neuf critères.

| Critère | Ici | Pourquoi |
|---|---|---|
| Évaluation ou notation (dont profilage) | **Oui, faible** | Le bilan évalue l'empreinte carbone et les défis sont personnalisés selon les réponses. Sans effet sur la personne au-delà de suggestions. |
| Décision automatisée avec effet juridique | Non | Aucune décision ne produit d'effet sur la personne. |
| Surveillance systématique | Non | Pas de suivi de navigation ni de localisation ; le journal de sécurité ne porte que sur des événements d'attaque. |
| Données sensibles ou hautement personnelles | Non | Pas de données de santé, d'opinion, etc. Les habitudes de vie restent pseudonymes et non reliées à une identité. |
| Grande échelle | Non | Quelques centaines d'étudiants, durée de deux mois. |
| Croisement de jeux de données | Non | Aucune source externe. |
| Personnes vulnérables | Non | Étudiants du supérieur, sans lien de subordination avec l'équipe. |
| Usage innovant ou nouvelle technologie | Non | Formulaire web et moteur de calcul de l'ADEME. |
| Traitement empêchant d'exercer un droit ou d'accéder à un service | Non | La participation est facultative et sans conséquence. |

**Conclusion : un seul critère rempli, AIPD non obligatoire.** La pseudonymisation par conception
(aucune donnée d'identité collectée) est la principale mesure qui réduit le risque. Ce choix est à
réexaminer si le projet collecte un jour une donnée d'identité (email pour les relances, par exemple).

## 4. Sous-traitants et transferts

| Prestataire | Rôle | Localisation | État |
|---|---|---|---|
| Amazon Web Services (AWS) | Héberge l'API, le site et la base PostgreSQL (VM EC2, base RDS, journaux CloudWatch, stockage S3 des fichiers de déploiement) | **Suède, région eu-north-1 (Stockholm)**, dans l'Union européenne ; sauvegardes de la base dans la même région, 7 jours | Choisi le 17/11/2026 ; région Stockholm imposée par le projet AWS (Paris indisponible), confirmée le 18/11/2026. Contrat de sous-traitance : avenant de traitement des données d'AWS (inclus dans les conditions de service). Société mère américaine (Cloud Act) : risque accepté, données stockées dans l'UE (Suède) et pseudonymes |
| Services de notification push des navigateurs (Google, Mozilla, Apple) | Acheminent les rappels J+7/J+14 si la personne les active | Hors UE possible (États-Unis pour Google/Apple) | Actif dans le front depuis le 12/11/2026 (page Suivi, opt-in) ; le message ne contient aucune donnée de bilan. Mentionné sur `/confidentialite`. |
| ADEME (modèle Nos Gestes Climat) | Bibliothèque de calcul exécutée **sur notre serveur** | — | Aucune donnée envoyée à l'ADEME |

Pas de police, script ni outil de mesure d'audience chargés depuis un service tiers (polices
auto-hébergées, CSP `default-src 'self'`).

## 5. Droits des personnes

| Droit | Comment | Vérifié |
|---|---|---|
| Accès | « Mon compte » (`GET /api/me`), historique des bilans et défis dans l'application | Oui |
| Rectification | Filière et année modifiables (`PATCH /api/me`) ; un bilan peut être refait | Oui |
| Effacement, retrait du consentement | Suppression immédiate du compte (`DELETE /api/me`) : participant, bilans, défis, suivis, abonnements push et relances effacés en cascade, session invalidée | Oui, test `bilans-defis.test.ts` (audit 11/11/2026) |
| Portabilité | Pas d'export pour le participant (données peu nombreuses, consultables à l'écran) | À décider si demandé |
| Réclamation | Auprès de la CNIL (cnil.fr) | Mentionné sur la page (11/11/2026) |

La session de connexion est gardée dans un cookie `HttpOnly` (`gc_session`, 60 jours ; `gc_admin`
pour l'équipe, effacé à la fermeture du navigateur), et le stockage local (`localStorage`) ne
contient qu'un indicateur « session ouverte » sans valeur secrète. Les deux sont strictement
nécessaires au service : pas de consentement « cookies » requis (pas de bandeau), mais mentionnés
sur `/confidentialite`.

## 6. À régler avant la mise en ligne

- [x] Désigner le **responsable du traitement** et une **adresse de contact**, puis les afficher sur `/confidentialite` (fait le 11/11/2026 ; faire confirmer le responsable par l'encadrant).
- [x] Compléter `/confidentialite` : base légale (consentement), journal de sécurité (IP, 30 jours), date de dernière visite, jeton stocké dans le navigateur, droit de réclamation auprès de la CNIL ; nuancer « personne ne peut relier ton compte à ton identité » (fait le 11/11/2026).
- [x] Renseigner l'**hébergeur** et sa localisation (UE) dans la section 4 et sur la page (AWS Stockholm, 18/11/2026).
- [ ] Fixer la **durée de conservation des journaux** du serveur (Nginx, API) : 30 jours maximum, comme le journal de sécurité. Prévu : CloudWatch à 30 jours (annoncé par l'équipe infra le 17/11/2026)  ; logs Nginx de la VM limités à 30 jours par `logrotate` (`deploiement/README.md` §11).
- [ ] Le **21/12/2026** : supprimer le site, la base et ses sauvegardes. **Responsables désignés
      (12/11/2026) : Ethan Bastien, Ethan Joets et Mahdi Fahs.** Procédure (première version du
      12/11/2026, à compléter avec les commandes de l'hébergeur une fois la VM en place) :
      1. *Avant* : si le groupe veut garder des chiffres pour le rapport, exporter les CSV depuis
         `/admin/` (identifiants aléatoires, pas de pseudo) puis ne garder que des agrégats ; activer
         le mode maintenance (bandeau de `/admin/`) pour que plus personne n'écrive.
      2. Aperçu de ce qui sera effacé : `node dist/outils/suppression-finale.js` dans le conteneur de
         l'API (en local : `npm run db:suppression-finale`). Rien n'est supprimé à cette étape.
      3. Suppression : la même commande avec `--confirmer <nom de la base>` (le nom est retapé pour
         éviter de vider la mauvaise base). Le script vide toutes les tables (participants, bilans,
         défis, suivis, abonnements push, quiz, journaux, comptes admin, vêtements…) puis vérifie
         qu'il ne reste aucune ligne. Essayé le 12/11/2026 sur une base jetable remplie avec les
         données de démo : 645 lignes effacées, 18 tables vides.
      4. Chez AWS (liste détaillée dans `deploiement/README.md` §12) : base RDS **sans instantané
         final et sans conserver les sauvegardes automatisées**, VM et volumes, adresse IP Elastic,
         bucket S3, journaux CloudWatch, paramètres SSM (secrets), nom de domaine.
         Supprimer aussi toute copie locale de secrets ou d'exports CSV.
      5. Noter ici la date et les personnes qui ont effectué la suppression.
      Décision de l'équipe (11/11/2026) : le site sera très probablement **supprimé entièrement** à
      la fin du projet. Seule exception envisagée : si l'application prend de l'ampleur et qu'un
      autre projet la reprend. Dans ce cas, garder les données au-delà du 21/12 change la durée et
      le cadre annoncés au moment du consentement : **informer ne suffit pas, il faut redemander
      l'accord**. Comme aucun moyen de contact n'est collecté, cela passe par un message dans
      l'application (et une notification push si elle est active) proposant explicitement de
      continuer ou de supprimer ses données ; seuls les comptes qui acceptent sont gardés, tous
      les autres sont supprimés au 21/12 comme prévu. Les statistiques agrégées et anonymes (CO2
      évité par filière, etc.) peuvent être conservées sans condition, ce ne sont plus des
      données personnelles. Mettre alors à jour ce document et `/confidentialite`.
- [x] Au moment d'activer le Web Push dans le front : mentionner les services de notification sur la page
      (fait le 12/11/2026, section « Rappels (facultatifs) » de `/confidentialite`). Les rappels se
      désactivent aussi à la déconnexion et à la suppression du compte.
