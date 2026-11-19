<#
Démarrage simplifié de l'environnement de dev GreenCampus HdF.

Fait, dans l'ordre :
  1. Vérifie la branche git actuelle et sa position par rapport au dépôt distant
     (sans rien modifier : juste un avertissement si retard/divergence/non commité).
  2. Démarre PostgreSQL via Docker Compose.
  3. Met la BDD backend à jour : migrations (prisma migrate deploy), régénération du
     client Prisma (évite le piège du client périmé, voir CLAUDE.md), seed (idempotent).
  4. Installe les dépendances npm si node_modules manque (backend / frontend).
  5. Lance `npm run dev` du backend et du frontend, chacun dans sa propre fenêtre.

Usage : depuis la racine du repo, `./scripts/dev.ps1` (ou double-clic via
"powershell -File scripts\dev.ps1").
#>

$root = Split-Path -Parent $PSScriptRoot

function Section($titre) {
  Write-Host ""
  Write-Host "== $titre ==" -ForegroundColor Cyan
}

# --- 1. Git : branche actuelle vs dépôt distant -----------------------------
Section "Git"

git fetch --all --prune
$branche = (git -C $root rev-parse --abbrev-ref HEAD).Trim()
Write-Host "Branche actuelle : $branche"

$modifs = git -C $root status --porcelain
if ($modifs) {
  Write-Host "Modifications locales non commitées :" -ForegroundColor Yellow
  git -C $root status --short
} else {
  Write-Host "Arbre de travail propre."
}

$upstream = git -C $root rev-parse --abbrev-ref "$branche@{upstream}"
if ($LASTEXITCODE -eq 0 -and $upstream) {
  $compte = (git -C $root rev-list --left-right --count "$branche...$upstream").Trim() -split '\s+'
  $ahead = [int]$compte[0]
  $behind = [int]$compte[1]
  if ($behind -gt 0) {
    Write-Host "Attention : $branche est en retard de $behind commit(s) sur $upstream (pense a 'git pull')." -ForegroundColor Yellow
  }
  if ($ahead -gt 0) {
    Write-Host "Info : $branche a $ahead commit(s) non poussé(s) sur $upstream." -ForegroundColor DarkYellow
  }
  if ($ahead -eq 0 -and $behind -eq 0) {
    Write-Host "A jour avec $upstream." -ForegroundColor Green
  }
} else {
  Write-Host "Info : pas de branche distante associée a '$branche'." -ForegroundColor DarkYellow
}

# --- 2. Docker : PostgreSQL --------------------------------------------------
Section "Docker (PostgreSQL)"

docker info > $null
if ($LASTEXITCODE -ne 0) {
  Write-Host "Docker ne répond pas. Démarre Docker Desktop puis relance ce script." -ForegroundColor Red
  exit 1
}

Push-Location $root
docker compose up -d db
Pop-Location

Write-Host "Attente que Postgres soit prêt..."
$essais = 0
$pret = $false
while ($essais -lt 30 -and -not $pret) {
  Start-Sleep -Seconds 1
  $etat = docker compose -f "$root\docker-compose.yml" ps db
  if ($etat -match 'healthy') { $pret = $true }
  $essais++
}
if ($pret) {
  Write-Host "Postgres prêt." -ForegroundColor Green
} else {
  Write-Host "Postgres ne répond toujours pas après 30s, vérifie 'docker compose logs db'." -ForegroundColor Red
  exit 1
}

# --- 3. Backend : dépendances + BDD à jour -----------------------------------
Section "Backend"

if (-not (Test-Path "$root\backend\node_modules")) {
  Write-Host "node_modules manquant côté backend, 'npm install'..."
  Push-Location "$root\backend"
  npm install
  Pop-Location
}

Push-Location "$root\backend"

Write-Host "Application des migrations..."
npx prisma migrate deploy
if ($LASTEXITCODE -ne 0) {
  Write-Host "Échec de 'prisma migrate deploy' — corrige l'erreur ci-dessus avant de continuer." -ForegroundColor Red
  Pop-Location
  exit 1
}

Write-Host "Régénération du client Prisma (évite le piège du client périmé)..."
npx prisma generate
if ($LASTEXITCODE -ne 0) {
  Write-Host "Échec de 'prisma generate'. Sous Windows, vérifie qu'aucun 'npm run dev' (tsx watch) ne tourne déjà et ne verrouille pas le fichier .dll — arrête-le puis relance ce script." -ForegroundColor Red
  Pop-Location
  exit 1
}

Write-Host "Seed (filières + défis, upsert donc sans risque de doublon)..."
npm run db:seed

$admin = Select-String -Path "$root\backend\.env" -Pattern '^ADMIN_MOT_DE_PASSE=\s*$' -Quiet
if ($admin) {
  Write-Host "Info : ADMIN_MOT_DE_PASSE est vide dans backend/.env — /admin/ restera inactif." -ForegroundColor DarkYellow
}

Pop-Location

# --- 4. Frontend : dépendances ------------------------------------------------
Section "Frontend"

if (-not (Test-Path "$root\frontend\node_modules")) {
  Write-Host "node_modules manquant côté frontend, 'npm install'..."
  Push-Location "$root\frontend"
  npm install
  Pop-Location
}

# --- 5. Lancement des serveurs de dev, chacun dans sa fenêtre ----------------
Section "Lancement"

$portOccupe4000 = Get-NetTCPConnection -LocalPort 4000 -ErrorAction SilentlyContinue
if ($portOccupe4000) {
  Write-Host "Port 4000 déjà occupé — un backend tourne peut-être déjà, je ne relance pas." -ForegroundColor Yellow
} else {
  Write-Host "Backend  -> http://localhost:4000 (nouvelle fenêtre)"
  Start-Process powershell -ArgumentList '-NoExit', '-Command', 'npm run dev' -WorkingDirectory "$root\backend"
}

$portOccupe5173 = Get-NetTCPConnection -LocalPort 5173 -ErrorAction SilentlyContinue
if ($portOccupe5173) {
  Write-Host "Port 5173 déjà occupé — un frontend tourne peut-être déjà, je ne relance pas." -ForegroundColor Yellow
} else {
  Write-Host "Frontend -> http://localhost:5173 (nouvelle fenêtre)"
  Start-Process powershell -ArgumentList '-NoExit', '-Command', 'npm run dev' -WorkingDirectory "$root\frontend"
}

Section "Prêt"
Write-Host "Backend  : http://localhost:4000  (docs: /docs, admin: /admin/)"
Write-Host "Frontend : http://localhost:5173"
