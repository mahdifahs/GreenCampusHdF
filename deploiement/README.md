# Déploiement sur AWS

Procédure de mise en ligne de GreenCampus HdF. **Architecture proposée le 18/11/2026**, adaptée au
projet AWS de l'équipe (région **Stockholm, eu-north-1**, imposée ; Paris indisponible) et au budget
(**100 $ de crédits AWS** jusqu'au 21/12/2026). À confirmer par le coéquipier infra le 19/11.
Complète `backend/README.md` §5 (variables) et `SECURITY.md` §5 (checklist) sans les répéter.

## 1. Architecture

```
Internet --HTTPS 443--> VM EC2 t3.small, Amazon Linux 2023 (adresse IP fixe : Elastic IP)
         --HTTP 80----> │  Nginx :443  ── sert frontend/dist/
                        │               └─ /api, /admin, /health ──> conteneur API sur 127.0.0.1:4000
                        │  Nginx :80   ── Let's Encrypt + redirection vers HTTPS
                        │  Certificat HTTPS gratuit Let's Encrypt, renouvelé automatiquement
                        │
                        │  5432, TLS obligatoire, depuis la VM seulement
                        v
              RDS PostgreSQL 17 db.t4g.micro (aucune IP publique, chiffrée, sauvegardes 7 jours)

Fichiers du site et de l'image (transfert unique) : bucket S3. Accès admin système : Session Manager (pas de SSH).
```

**Pourquoi ni load balancer ni NAT Gateway** (prévus dans la version du 17/11) : à eux deux,
environ 55 $ par mois, soit plus de la moitié du budget. Sans load balancer, Nginx est le seul
relais devant l'API : **`TRUST_PROXY=1`** (valeur par défaut en production). La VM est dans un
sous-réseau public, elle sort donc sur Internet sans NAT (Web Push, mises à jour, Let's Encrypt).

**Coût estimé** (à confirmer sur https://calculator.aws, région Europe (Stockholm)) :

| Élément | Coût/mois (approx.) |
|---|---|
| EC2 t3.small | ~16 $ |
| Elastic IP | ~4 $ |
| Disque EBS 20 Go gp3 | ~2 $ |
| RDS PostgreSQL db.t4g.micro + 20 Go | ~15 $ |
| CloudWatch Logs, S3, SSM | < 1 $ |
| **Total** | **~38 $** (~40 $ jusqu'au 21/12) |

Rester en **x86_64** (t3) : l'image Docker est construite sur un PC Windows/Intel. Une VM ARM (t4g)
demanderait une image ARM.

Fichiers de ce dossier :

| Fichier | Où le mettre sur la VM |
|---|---|
| `nginx/greencampus-http.conf` | `/etc/nginx/conf.d/greencampus-http.conf` |
| `nginx/greencampus.conf` | `/etc/nginx/conf.d/greencampus.conf` (après le certificat, étape 7) |
| `nginx/greencampus/proxy.conf` | `/etc/nginx/conf.d/greencampus/proxy.conf` |
| `nginx/greencampus/entetes-front.conf` | `/etc/nginx/conf.d/greencampus/entetes-front.conf` |

## 2. Avant de créer quoi que ce soit

1. **Alerte de budget** : console AWS, service **Budgets**, « Créer un budget », modèle « Budget de
   coût mensuel », montant 50 $, alertes par e-mail à 50 $ et 80 $. Protège d'une ressource oubliée.
2. **Crédits** : **Facturation > Crédits** : vérifier la date d'expiration et que EC2 et RDS sont
   couverts.
3. **Nom de domaine** : indispensable pour le certificat HTTPS (Let's Encrypt ne signe pas une
   adresse IP seule). Un domaine (~10 $/an) ou un sous-domaine de l'école.

## 3. Créer la base de données (RDS)

Console, **Aurora and RDS > Bases de données > Créer une base de données** :

- Méthode : création standard ; moteur **PostgreSQL**, version **17** ; modèle **Offre gratuite** ou
  « Dev/Test » ;
- identifiant `greencampus-db`, nom d'utilisateur principal `greencampus`, mot de passe généré (le
  noter dans un gestionnaire de mots de passe, il sert à l'étape 5) ;
- classe **db.t4g.micro**, stockage 20 Go gp3, **sans** mise à l'échelle automatique ;
- connectivité : VPC par défaut, **Accès public : Non**, groupe de sécurité nouveau
  `greencampus-db-sg` (règle 5432 réglée à l'étape 4) ;
- configuration supplémentaire : nom de base initiale **`greencampus`**, sauvegardes automatiques
  **7 jours**, **chiffrement activé**, pas de surveillance améliorée (payante).

Une fois la base disponible, noter son **point de terminaison** (onglet « Connectivité et sécurité »).

## 4. Créer la VM (EC2)

1. **Rôle IAM** (service IAM > Rôles > Créer, entité « Service AWS », cas d'utilisation EC2),
   nommé `greencampus-vm`, avec :
   - la politique gérée **`AmazonSSMManagedInstanceCore`** (connexion par Session Manager) ;
   - une politique en ligne qui autorise : `ssm:GetParametersByPath` sur
     `arn:aws:ssm:eu-north-1:<compte>:parameter/greencampus/prod*` ; `s3:GetObject` sur
     `arn:aws:s3:::<bucket>/*` ; `logs:CreateLogGroup`, `logs:CreateLogStream`, `logs:PutLogEvents`
     et `logs:PutRetentionPolicy` sur `arn:aws:logs:eu-north-1:<compte>:log-group:/greencampus/*`.
2. **EC2 > Instances > Lancer une instance** : nom `greencampus-vm`, image **Amazon Linux 2023**
   (x86_64), type **t3.small**, **sans paire de clés** (pas de SSH), VPC par défaut, sous-réseau
   public avec IP publique, disque 20 Go gp3 ; détails avancés : profil d'instance `greencampus-vm`.
3. **Groupe de sécurité de la VM** `greencampus-vm-sg` : entrée **80 et 443** depuis `0.0.0.0/0`,
   **rien d'autre** (ni 22, ni 4000).
4. **Groupe de la base** `greencampus-db-sg` : entrée **5432 depuis le groupe `greencampus-vm-sg`**
   uniquement (source = l'identifiant du groupe, pas une adresse IP).
5. **EC2 > Adresses IP Elastic > Allouer**, puis « Associer » à `greencampus-vm`.
6. **DNS** : chez le fournisseur du domaine, un enregistrement **A** vers l'Elastic IP.

## 5. Secrets et variables de production

Dans **Systems Manager > Parameter Store**, un paramètre **`SecureString`** par variable, sous
`/greencampus/prod/` (ex. `/greencampus/prod/JWT_SECRET`). Gratuit (niveau standard). Jamais de
`.env` versionné ni copié à la main.

| Variable | Valeur |
|---|---|
| `NODE_ENV` | `production` |
| `DATABASE_URL` | `postgresql://greencampus:<mot de passe>@<point de terminaison RDS>:5432/greencampus?sslmode=require` (caractères spéciaux du mot de passe encodés en `%xx`) |
| `JWT_SECRET` | `node -e "console.log(require('crypto').randomBytes(48).toString('base64url'))"` |
| `CORS_ORIGIN` | `https://<domaine>` |
| `VAPID_PUBLIC_KEY` / `VAPID_PRIVATE_KEY` | `npx web-push generate-vapid-keys`, **nouvelles** clés (pas celles de dev) |
| `VAPID_SUJET` | `mailto:greencampus.hdf@gmail.com` : Apple refuse les adresses factices (`403 BadJwtToken`) |
| `ADMIN_ENABLED` | `true` |
| `ADMIN_SUPER_PRENOM` / `ADMIN_SUPER_MOT_DE_PASSE` | pour le **premier** démarrage seulement (étape 9), puis supprimer les deux paramètres |
| `TRUST_PROXY`, `DOCS_ENABLED`, `DEMO_ENABLED` | **ne pas créer** (`TRUST_PROXY` vaut 1 par défaut en production : Nginx seul devant l'API) |

## 6. Préparer les fichiers (sur ton PC)

Depuis la racine du dépôt, à jour sur `main` (CI verte), une commande par ligne (valables dans
PowerShell comme dans Git Bash ; pas de `|` pour l'image : sous PowerShell 5.1, un tube abîme les
données binaires) :

```sh
docker build -t greencampus-api backend
docker save -o greencampus-api.tar greencampus-api
cd frontend
npm ci
npm run build
tar -czf ../greencampus-front.tar.gz -C dist .
cd ..
```

Créer un bucket **S3** privé (ex. `greencampus-deploiement-<initiales>`, région Stockholm, accès
public bloqué) et y déposer les deux archives depuis la console (« Charger »).

## 7. Installer la VM (une seule fois)

Se connecter : **EC2 > Instances > greencampus-vm > Se connecter > Session Manager**. Toutes les
commandes suivantes s'y tapent (`sudo -i` d'abord).

```sh
# Logiciels
dnf install -y docker nginx python3 augeas-libs
systemctl enable --now docker nginx
rm -f /etc/nginx/conf.d/default.conf
# nginx.conf d'Amazon Linux contient déjà un "server" en "listen 80 default_server" : le retirer
# (bloc "server { ... }" de /etc/nginx/nginx.conf), sinon nginx -t refuse deux serveurs par défaut.

# Certbot (client Let's Encrypt), méthode officielle par pip
python3 -m venv /opt/certbot && /opt/certbot/bin/pip install --upgrade pip certbot
ln -sf /opt/certbot/bin/certbot /usr/bin/certbot

# Configuration Nginx du port 80 (copier le contenu des fichiers de deploiement/nginx/)
install -d /etc/nginx/conf.d/greencampus /var/www/certbot /usr/share/nginx/greencampus
nano /etc/nginx/conf.d/greencampus-http.conf          # coller greencampus-http.conf
nano /etc/nginx/conf.d/greencampus/proxy.conf         # coller proxy.conf
nano /etc/nginx/conf.d/greencampus/entetes-front.conf # coller entetes-front.conf
nginx -t && systemctl reload nginx

# Certificat (le DNS doit déjà pointer vers l'Elastic IP)
certbot certonly --webroot -w /var/www/certbot -d <domaine> \
  -m greencampus.hdf@gmail.com --agree-tos --no-eff-email

# Renouvellement automatique (Amazon Linux 2023 n'a pas cron : minuteur systemd)
cat > /etc/systemd/system/certbot-renouvellement.service <<'EOF'
[Service]
Type=oneshot
ExecStart=/usr/bin/certbot renew -q --deploy-hook "systemctl reload nginx"
EOF
cat > /etc/systemd/system/certbot-renouvellement.timer <<'EOF'
[Timer]
OnCalendar=*-*-* 03,15:00
RandomizedDelaySec=1h
Persistent=true
[Install]
WantedBy=timers.target
EOF
systemctl daemon-reload && systemctl enable --now certbot-renouvellement.timer

# Serveur HTTPS
nano /etc/nginx/conf.d/greencampus.conf               # coller greencampus.conf
sed -i 's/DOMAINE/<domaine>/g' /etc/nginx/conf.d/greencampus.conf
nginx -t && systemctl reload nginx
```

## 8. Lancer le site et l'API

```sh
# Front
aws s3 cp s3://<bucket>/greencampus-front.tar.gz - | tar -xz -C /usr/share/nginx/greencampus

# Image de l'API
aws s3 cp s3://<bucket>/greencampus-api.tar - | docker load

# Secrets (droits 600, jamais affichés)
install -d -m 700 /etc/greencampus
aws ssm get-parameters-by-path --region eu-north-1 --path /greencampus/prod/ --with-decryption \
  --query 'Parameters[*].[Name,Value]' --output text \
  | sed 's#^/greencampus/prod/##; s#\t#=#' > /etc/greencampus/api.env
chmod 600 /etc/greencampus/api.env

# API
docker run -d --name greencampus-api --restart unless-stopped \
  -p 127.0.0.1:4000:4000 \
  --env-file /etc/greencampus/api.env \
  --log-driver awslogs \
  --log-opt awslogs-region=eu-north-1 \
  --log-opt awslogs-group=/greencampus/api \
  --log-opt awslogs-create-group=true \
  greencampus-api
aws logs put-retention-policy --region eu-north-1 --log-group-name /greencampus/api --retention-in-days 30
```

- `-p 127.0.0.1:4000:4000` et **pas** `-p 4000:4000` : seul Nginx peut joindre l'API. Un accès
  direct permettrait d'inventer son IP et de contourner la limitation de débit (constat AUDIT-07).
  Le groupe de sécurité bloque aussi 4000 : double protection.
- Au démarrage, le conteneur applique les migrations (`prisma migrate deploy`), puis le **seed**
  (`node dist/seed/seed.js`), puis lance l'API. Le seed est sans risque à chaque redémarrage :
  filières et défis mis à jour, valeurs des vêtements remplies seulement si elles sont vides,
  super-admin créé seulement si aucun compte n'existe. **Une base neuve ne contient aucun compte.**
- **Mise à jour** du site ou de l'API : refaire l'étape 6, puis les commandes concernées de l'étape 8
  (`docker rm -f greencampus-api` avant de relancer le conteneur).

## 9. Premier démarrage : compte super-admin

1. Créer `ADMIN_SUPER_PRENOM` et `ADMIN_SUPER_MOT_DE_PASSE` (12 caractères minimum, temporaire) dans SSM, avant l'étape 8.
2. Les logs du conteneur (`docker logs greencampus-api`) affichent `Compte super-admin « <prénom> » créé`.
3. Se connecter sur `https://<domaine>/admin/`, onglet « Comptes admin », **réinitialiser son propre mot de passe**.
4. Supprimer les deux paramètres de SSM, régénérer `/etc/greencampus/api.env` et relancer le conteneur.

## 10. Vérifications après la mise en ligne

```sh
curl -sI https://<domaine>/            # 200, en-têtes Content-Security-Policy et Strict-Transport-Security
curl -s  https://<domaine>/health      # {"status":"ok","base":"ok"}
curl -sI http://<domaine>/             # 301 vers https://
curl -s  https://<domaine>/api/filieres   # liste des 16 filières (seed appliqué)
curl -s -X POST https://<domaine>/api/dev/relances   # 404 (routes de dev absentes)
curl -s -m 5 http://<Elastic IP>:4000/health   # doit échouer (délai dépassé) : port 4000 fermé
```

- **IP réelle** : faire exprès un échec de connexion sur `/admin/`, puis vérifier dans l'onglet
  Sécurité que l'IP notée est bien la sienne (sinon `proxy.conf` est faux).
- **Surveillance** (facultatif, gratuit) : un service externe qui interroge `https://<domaine>/health`
  toutes les 5 minutes et prévient par e-mail. Sans load balancer, rien ne redémarre la VM toute seule
  si elle tombe (le conteneur, lui, redémarre seul : `--restart unless-stopped`).
- Relancer `backend/scripts/audit-manuel.mts` avec `AUDIT_BASE=https://<domaine>`.
- Tester une notification sur Android et sur iPhone (site ajouté à l'écran d'accueil).
- Vider les éventuels comptes de test avant le stand.

Essai fait en local le 18/11/2026 (image de production + Nginx 1.27 avec ces fichiers + certificat
de test à l'emplacement de Let's Encrypt + base neuve) : redirection 80 vers 443, chemin Let's Encrypt
servi sur le port 80, HTTP/2, migrations et seed sur base neuve (16 filières, super-admin créé,
aucun autre compte), repli React (`/bilan`), en-têtes attendus, cookie de session `Secure`,
`/api/dev/*` en 404, et IP réelle correcte (un faux `X-Forwarded-For` envoyé par le client est ignoré).

## 11. Journaux (30 jours maximum, RGPD)

Ils contiennent les adresses IP :

- groupe CloudWatch de l'API (`/greencampus/api`) : rétention 30 jours (étape 8) ;
- logs Nginx sur la VM (`/var/log/nginx/`) : dans `/etc/logrotate.d/nginx`, `daily` et `rotate 30`
  au plus.

Le journal de sécurité de l'application se purge seul à 30 jours.

## 12. Suppression au 21/12/2026

Les étapes 1 à 3 (export éventuel, mode maintenance, script de suppression) sont dans
`RGPD.md` §6. Sur la VM, via Session Manager :

```sh
docker exec greencampus-api node dist/outils/suppression-finale.js                         # aperçu
docker exec greencampus-api node dist/outils/suppression-finale.js --confirmer greencampus  # suppression
```

Puis, dans la console AWS (responsable : le coéquipier infra) :

1. **RDS** : supprimer l'instance en décochant « Créer un instantané final » et en **décochant
   « Conserver les sauvegardes automatisées »**. Vérifier ensuite qu'il ne reste aucun instantané
   manuel (RDS, Snapshots) ni de sauvegarde dans AWS Backup.
2. **EC2** : résilier la VM, puis vérifier qu'il ne reste ni volume EBS ni instantané.
3. **Elastic IP** : la **libérer** (facturée tant qu'elle existe, même sans VM).
4. Bucket **S3** (archives du site et de l'image), groupes de sécurité, rôle IAM `greencampus-vm`.
5. Groupe de logs CloudWatch `/greencampus/api`, paramètres SSM `/greencampus/prod/`, budget AWS.
6. Enregistrement DNS (et le domaine s'il a été acheté pour le projet).
7. Noter la date et les personnes dans `RGPD.md` §6.
