# GreenCampus_HdF
Application web étudiante pour mesurer et réduire son empreinte carbone : bilan personnalisé (modèle Nos Gestes Climat de l’ADEME), défis écolo gamifiés et tableau de bord collectif anonyme. Sans compte ni donnée personnelle. Projet du module polytechnique « Agir pour modifier son empreinte écologique », UPHF / INSA HdF.

## Structure du dépôt

| Dossier | Contenu |
|---|---|
| `backend/` | API REST (Node.js, TypeScript, Fastify, Prisma, PostgreSQL) et interface d'administration de l'équipe (`/admin/`) : voir [backend/README.md](backend/README.md) |
| `frontend/` | Application étudiante (React, Vite, TypeScript) : voir [frontend/README.md](frontend/README.md) |
| `deploiement/` | Mise en ligne sur AWS (Stockholm) : configuration Nginx et procédure complète, voir [deploiement/README.md](deploiement/README.md) |
| `docker-compose.yml` | Base PostgreSQL de développement (`docker compose up -d`) |
| `docker/` | Script d'initialisation Postgres (`postgres-init.sql`, crée aussi la base de test) |
| `scripts/dev.ps1` | Démarrage simplifié du dev local (vérifie la position git, lance Postgres, migrations, backend et frontend) |
| `SECURITY.md` | Sécurité : modèle de menaces, Top 10 OWASP 2025, checklist de mise en production |
| `AUDIT_SECURITE.md` | Méthode de l'audit de sécurité à mener avant la mise en ligne (OWASP, RGPD, ANSSI) |
| `RGPD.md` | Données personnelles : registre des traitements, analyse d'impact, sous-traitants, points à régler avant la mise en ligne |
| `identite/` | Logo en SVG et PNG (site, affiches, Instagram) et son générateur : voir `identite/README.md` |
| `.github/` | Intégration continue en 5 jobs : backend (tests, types, audit), frontend (lint, build, audit), parcours de bout en bout dans un vrai navigateur (Playwright, voir `frontend/e2e/README.md`), image Docker de production, recherche de secrets dans tout l'historique (gitleaks, faux positifs dans `.gitleaksignore`). L'audit des dépendances (`scripts/audit.mjs`) bloque toute vulnérabilité « high » ou plus, sauf exception datée et justifiée dans `audit-exceptions.json`. Dependabot chaque semaine (npm, GitHub Actions, Docker) |
