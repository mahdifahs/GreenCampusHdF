# Parcours de bout en bout (Playwright)

Ces tests pilotent un vrai navigateur (Chromium) sur le vrai site : API lancée depuis ses sources, base
PostgreSQL dédiée, front construit puis servi par `vite preview`. Ils complètent les tests du backend
(`backend/test/`), qui vérifient l'API seule.

| Fichier | Parcours |
|---|---|
| `etudiant.spec.ts` | Inscription (cookie de session `HttpOnly`), bilan avec estimation en direct, défi choisi puis « Tenu » avec confirmation, session conservée au rechargement, déconnexion, reconnexion avec le code de récupération, suppression du compte. Tableau de bord public sans compte. |
| `bilan.spec.ts` | Bornes du bilan : heures de bus au-delà de 40 signalées sous le champ, total des plats au-delà de 14 repas signalé, enregistrement bloqué tant que les réponses sont hors bornes. |
| `questionnaire.spec.ts` | Question d'information à choix ajoutée depuis l'onglet admin *Questionnaire*, carte « Questions de l'équipe » côté étudiant, réponse retrouvée à la reprise du bilan, statistiques dans l'admin, suppression impossible puis désactivation (plus posée). |
| `admin.spec.ts` | Super-admin : chaque onglet de `/admin/` s'affiche sans erreur JavaScript. Navigation : sur PC tous les onglets visibles sans défilement (onglet ouvert marqué `aria-current` et gardé visible) ; sur téléphone bouton « Menu · page courante » (`aria-expanded`, Échap, clic à côté, focus clavier). Bénévole créé depuis « Comptes admin » avec le mot de passe généré : Jour J et Vêtements seulement (le reste refusé par l'API). Cookie admin recopié avant une déconnexion : refusé. |
| `maintenance.spec.ts` | Mode maintenance basculé depuis l'admin : page dédiée côté étudiant, puis retour automatique à la remise en ligne (environ 30 s, intervalle de revérification de la page). |

Chaque parcours échoue aussi s'il voit une erreur JavaScript dans la page.

## Lancer en local

Prérequis : la base PostgreSQL de développement (`docker compose up -d db` à la racine) et les dépendances
du backend et du frontend installées (`npm install` dans chacun, `npx prisma generate` dans `backend/`).

```bash
cd frontend
npx playwright install chromium   # la première fois seulement
npm run test:e2e
```

- **Base utilisée** : `greencampus_e2e` sur le serveur de développement, créée si besoin, **entièrement
  vidée** à chaque lancement puis remplie par `npm run db:seed` (filières, défis, vêtements, super-admin
  de test). La base de développement et celle des tests du backend ne sont jamais touchées ; le script
  refuse une base dont le nom ne finit pas par `_e2e` (`E2E_DATABASE_URL` pour en choisir une autre).
- **Ports** : API sur 4100, front sur 4173. Ils peuvent tourner pendant que `npm run dev` occupe 4000 et 5173.
- **Secrets** : `JWT_SECRET` et mot de passe du super-admin de test sont tirés au hasard à chaque lancement.
- Le délai avant « Tenu » est mis à 0 pour valider un défi tout de suite.
- En cas d'échec : capture, trace et contexte dans `test-results/` (`npx playwright show-trace <trace.zip>`).

## Fonctionnement

`playwright.config.ts` démarre deux serveurs (`webServer`) avant les parcours :

1. **API** : `e2e/preparer-base.ts` (migrations, vidage, seed), puis `npx tsx src/server.ts` dans
   `backend/`, avec une configuration complète passée par l'environnement (elle prime sur `backend/.env`).
2. **Front** : `npm run build`, puis `vite preview`, dont le proxy `/api` pointe vers l'API de test
   (`API_URL`, voir `vite.config.ts`).

L'administration est servie par l'API elle-même (`http://127.0.0.1:4100/admin/`). Les parcours tournent
un par un (`workers: 1`) : ils partagent la base, et le mode maintenance concerne tout le site.

En CI, le job « Parcours de bout en bout (Playwright) » (`.github/workflows/ci.yml`) fait la même chose
avec une base PostgreSQL de service.
