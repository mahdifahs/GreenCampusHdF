# Processus d'audit de sécurité avant mise en ligne

Ce document décrit **la méthode à suivre** pour conduire l'audit de sécurité complet de
GreenCampus HdF avant la mise en production réelle (hébergement public, vraies données
d'étudiants). Il répond à la question « comment on s'y prend ? ».

Il est complémentaire de [`SECURITY.md`](SECURITY.md), qui décrit **l'état actuel** (mesures en
place catégorie par catégorie, risques déjà acceptés, checklist de mise en prod) : ce document-ci
sert à **vérifier** que cet état est réel et à jour, pas à le redécrire. Ne pas dupliquer son
contenu ici.

Référentiels suivis : **OWASP Top 10 (édition 2025)** et **OWASP Web Security Testing Guide
(WSTG)** pour le volet applicatif, **RGPD** (recommandations CNIL) pour le volet données
personnelles, **ANSSI** pour les recommandations d'hygiène informatique générales (TLS, mots de
passe, cloisonnement).

---

## 1. Avant de commencer

- **Cadrage écrit** : périmètre exact (API `backend/`, `frontend/`, `admin/`,
  infrastructure Docker/reverse proxy), ce qui est explicitement **hors périmètre** (ex. : le
  modèle ADEME Nos Gestes Climat lui-même, maintenu par un tiers), et la fenêtre de temps prévue.
- **Autorisation explicite** de toute l'équipe avant de lancer des outils de scan actifs (DAST,
  scanner de ports) même sur un environnement de test — ça reste un principe à respecter en
  interne, pas seulement pour un prestataire externe.
- **Jamais sur la production avec de vraies données** : l'audit actif (scans, tentatives
  d'exploitation) se fait sur un environnement de test dédié, avec des données générées (voir
  `backend/scripts/demo-data.ts`), jamais sur la base réelle des étudiants.
- **Geler le périmètre** : figer une branche/un tag précis pour toute la durée de l'audit, pour
  que chaque constat renvoie à un état de code identifiable (éviter d'auditer une cible qui bouge).

## 2. Revue documentaire et modélisation des menaces

Point de départ, pas à refaire de zéro : `SECURITY.md` section 1 contient déjà un modèle de
menaces (biens à protéger, acteurs, scénarios). Pour l'audit :

1. Relire ce modèle de menaces et vérifier qu'il correspond toujours au code réel (nouvelles
   fonctionnalités depuis la dernière mise à jour ? nouveaux types de données collectées ?).
2. Cartographier les flux de données : qui envoie quoi, à qui, stocké où, pour combien de temps
   — s'appuyer sur `backend/prisma/schema.prisma` (modèles) et la section 7 de
   `backend/README.md` (RGPD) plutôt que de redéfinir ce schéma à la main.
3. Identifier les **points d'entrée** exposés publiquement (toutes les routes `/api/*`, `/admin/`
   si activée, `/api/dev/*` si activée, `/docs` si activée) : lister leur statut en production
   (`ADMIN_ENABLED`, `DOCS_ENABLED`, `DEMO_ENABLED` — doivent être désactivées sauf besoin
   explicite, voir `backend/README.md` section 5).
4. Pour chaque flux sensible, appliquer rapidement une grille **STRIDE** (Spoofing, Tampering,
   Repudiation, Information disclosure, Denial of service, Elevation of privilege) — formalise
   ce que la section 1 de `SECURITY.md` couvre déjà de façon plus narrative.

## 3. Analyse statique du code (SAST) et des dépendances (SCA)

| Étape | Outil suggéré | Commande |
|---|---|---|
| Audit des dépendances npm | `npm audit` (déjà en CI, voir `.github/workflows/ci.yml`) | `npm audit --audit-level=high` dans `backend/` et `frontend/` |
| Audit approfondi des dépendances | [OSV-Scanner](https://google.github.io/osv-scanner/) ou Dependabot (déjà actif) | `osv-scanner -r .` |
| Analyse statique du code | [Semgrep](https://semgrep.dev/) avec les règles communautaires `p/owasp-top-ten` et `p/javascript` | `semgrep --config p/owasp-top-ten --config p/javascript backend/src frontend/src` |
| Secrets committés par erreur | `git log` complet avec [gitleaks](https://github.com/gitleaks/gitleaks) ou `trufflehog` | `gitleaks detect --source . --log-opts="--all"` |
| Image Docker | [Trivy](https://aquasecurity.github.io/trivy/) | `trivy image <image-greencampus>` |

Noter chaque alerte dans le registre de constats (section 7), même les faux positifs — avec la
raison du classement en faux positif, pour qu'un autre membre de l'équipe n'ait pas à refaire
l'analyse.

## 4. Tests dynamiques (DAST) sur l'environnement de test

1. Démarrer l'application en configuration proche de la production (`NODE_ENV=production`,
   `ADMIN_ENABLED=true`, base de test remplie via `npm run db:seed-demo`).
2. Scanner avec [OWASP ZAP](https://www.zaproxy.org/) (mode automatisé puis, si besoin, mode
   assisté/manuel pour les routes authentifiées) : `zap-baseline.py -t http://localhost:4000`.
3. Vérifier les en-têtes HTTP avec [Mozilla Observatory](https://developer.mozilla.org/en-US/observatory)
   ou `securityheaders.com` (CSP, HSTS, `X-Content-Type-Options`, etc. — déjà listés dans
   `SECURITY.md` section 5, à revérifier en conditions réelles de déploiement, pas juste en local).
4. Vérifier la configuration TLS du reverse proxy avec
   [testssl.sh](https://testssl.sh/) une fois un vrai certificat posé (protocoles obsolètes,
   suites de chiffrement faibles, HSTS effectif).
5. Vérifier le comportement de la limitation de débit en conditions réelles (pas seulement dans
   les tests unitaires) : scripter des rafales de requêtes sur `/api/participants`,
   `/api/sessions` et `/admin/session`, confirmer les codes 429 et les verrous attendus.

## 5. Tests manuels ciblés, catégorie par catégorie (OWASP Top 10 2025)

Pour chaque catégorie, vérifier par un test manuel réel (pas seulement relire le code) — la
colonne « Déjà couvert par les tests automatisés » indique où regarder dans `backend/test/` pour
ne pas dupliquer un test existant, l'objectif de l'audit est de vérifier que ces tests couvrent
vraiment le risque, pas de les réécrire :

| Catégorie | Test manuel à faire | Déjà couvert par les tests automatisés |
|---|---|---|
| A01 Contrôle d'accès | Essayer d'accéder aux données d'un autre participant en changeant un identifiant dans l'URL/le payload (IDOR) ; essayer un jeton participant sur une route admin et inversement | `participants.test.ts`, `admin.test.ts` |
| A02 Mauvaise configuration | Vérifier qu'aucune route de debug (`/api/dev/*`, `/docs`) n'est accessible en configuration production ; relire `.env.example` pour un secret par défaut oublié | `securite.test.ts` |
| A03 Chaîne d'approvisionnement | Voir section 3 (SCA) | CI (`npm audit`) |
| A04 Cryptographie | Vérifier la longueur réelle de `JWT_SECRET` en production, l'absence de secret par défaut, le format HTTPS forcé | `config.test.ts` |
| A05 Injection | Tenter d'injecter une formule publicodes dans un champ de bilan (`=`, un `dottedName` inventé) ; tenter une injection de formule dans un export CSV (`=1+1`, `@SUM(...)`) | `ngc.test.ts` |
| A06 Conception non sécurisée | Vérifier qu'aucun total CO2 envoyé par le client n'est jamais utilisé tel quel (toujours recalculé serveur) | `bilans.test.ts` |
| A07 Authentification | Tenter un brute force sur `/admin/session` et sur `/api/sessions`, vérifier le verrou et le temps constant de réponse (identifiants inconnus vs. mauvais mot de passe doivent prendre le même temps) | `securite.test.ts`, `comptes-admin.test.ts` |
| A08 Intégrité des données | Vérifier que la CI bloque bien une PR si les tests ou l'audit échouent (tester volontairement avec une PR qui casse un test) | `.github/workflows/ci.yml` |
| A09 Journalisation | Provoquer volontairement les événements attendus (échec de connexion, dépassement de débit) et vérifier qu'ils apparaissent bien dans le journal de sécurité admin | `journal-securite.test.ts` |
| A10 Gestion des erreurs | Couper la base de données et vérifier que `/health` répond 503 sans détail technique exposé ; envoyer un JSON invalide et vérifier la réponse générique | `securite.test.ts` |

## 6. Volet RGPD

1. **Nécessité d'une analyse d'impact (AIPD/PIA)** : appliquer la grille d'auto-évaluation CNIL
   (3 critères : traitement à grande échelle, profilage/évaluation, catégories de données
   sensibles). Documenter explicitement la conclusion (probablement non requise ici, vu
   l'absence de données d'identité et le volume limité à quelques centaines d'étudiants) — une
   conclusion écrite et justifiée, pas une absence de réponse.
2. **Registre des traitements** : formaliser dans un tableau simple (finalité, données
   collectées, base légale — consentement explicite à l'inscription —, durée de conservation,
   destinataires, mesures de sécurité) en reprenant `backend/README.md` section 7 et
   `SECURITY.md` section 7 comme matière première.
3. **Droits des personnes** : vérifier en conditions réelles que `GET`/`PATCH`/`DELETE /api/me`
   fonctionnent bien et suppriment réellement toutes les données liées (cascade Prisma — voir
   le commentaire RGPD dans `backend/prisma/schema.prisma`), pas seulement en lisant le code.
4. **Minimisation** : vérifier qu'aucun champ ajouté depuis la dernière revue ne collecte une
   donnée d'identité non nécessaire.
5. **Durées de conservation** : vérifier qu'une procédure réelle existe pour supprimer les
   données à la date annoncée (21/12/2026 dans `SECURITY.md` section 7) — pas seulement une
   ligne dans un tableau, un geste concret (script, rappel calendaire) prévu pour cette date.
6. **Sous-traitants et hébergement** : lister les tiers qui traitent des données (hébergeur,
   service d'envoi de notifications push le cas échéant) et vérifier qu'ils sont basés dans
   l'UE ou offrent des garanties équivalentes (clauses contractuelles types).
7. **Information des personnes** : vérifier que `/confidentialite` reste exacte et à jour par
   rapport au traitement réel (pas un copier-coller figé pendant que le code évolue).

## 7. Registre des constats

Consigner chaque constat dans un tableau partagé (fichier séparé, ex. `AUDIT_CONSTATS.md`, non
versionné s'il contient des détails exploitables avant correction — ajouter au `.gitignore` le
temps de l'audit, le réintégrer une fois tout corrigé) avec au minimum :

| Champ | Exemple |
|---|---|
| Identifiant | `AUDIT-2026-11-01` |
| Catégorie | OWASP A05 / RGPD art. 17 / ... |
| Description | Ce qui a été observé, avec les étapes pour reproduire |
| Preuve | Capture d'écran, requête HTTP, extrait de log |
| Sévérité | Critique / Élevée / Moyenne / Faible (idéalement un score CVSS pour les failles techniques) |
| Recommandation | Ce qu'il faudrait changer |
| Statut | Ouvert / En cours / Corrigé / Risque accepté (si accepté, renvoyer vers `SECURITY.md` section 3) |
| Responsable | Qui corrige |

## 8. Remédiation, retest et validation finale

1. Corriger par ordre de sévérité (Critique et Élevée avant toute mise en ligne, sans exception).
2. **Retester** chaque correction avec le même scénario que celui qui a révélé le problème (pas
   seulement relire le diff) — ajouter un test automatisé de non-régression quand c'est possible
   (dans `backend/test/`), pour que le problème ne puisse pas revenir silencieusement.
3. Mettre à jour `SECURITY.md` (nouvelles mesures, nouveaux risques acceptés avec leur
   justification) : c'est le document qui reste la référence de l'état courant.
4. **Critère de sortie avant mise en ligne** : zéro constat Critique ou Élevé encore ouvert, et
   tout constat Moyen/Faible restant explicitement accepté par le groupe (pas juste oublié) —
   même format que la section 3 existante de `SECURITY.md`.
5. Cocher la checklist de mise en production déjà présente dans `SECURITY.md` section 5 en
   dernière étape, une fois l'audit lui-même terminé.

## 9. Fréquence

Un audit complet (sections 3 à 6) avant la mise en ligne initiale, puis une repasse légère
(sections 3 et 4 uniquement, SAST/SCA/DAST automatisables) à chaque changement notable de
l'authentification, des permissions admin, ou de ce qui est collecté comme donnée personnelle —
pas nécessairement à chaque petite PR.
