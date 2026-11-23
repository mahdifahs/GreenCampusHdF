<div align="center">

# 🌱 GreenCampus HdF

### L'application qui aide les étudiants à mesurer et réduire leur empreinte carbone
### Infrastructure cloud conçue, déployée et sécurisée sur AWS

[![Site en ligne](https://img.shields.io/badge/Site-en%20ligne-2ea44f?style=for-the-badge)](https://13-63-106-251.sslip.io)

![AWS](https://img.shields.io/badge/AWS-232F3E?style=flat-square&logo=amazonwebservices&logoColor=white)
![Terraform](https://img.shields.io/badge/Terraform-844FBA?style=flat-square&logo=terraform&logoColor=white)
![Docker](https://img.shields.io/badge/Docker-2496ED?style=flat-square&logo=docker&logoColor=white)
![Nginx](https://img.shields.io/badge/Nginx-009639?style=flat-square&logo=nginx&logoColor=white)
![PostgreSQL](https://img.shields.io/badge/PostgreSQL%2017-4169E1?style=flat-square&logo=postgresql&logoColor=white)
![Linux](https://img.shields.io/badge/Amazon%20Linux%202023-FCC624?style=flat-square&logo=linux&logoColor=black)
![Let's Encrypt](https://img.shields.io/badge/HTTPS-Let's%20Encrypt-003A70?style=flat-square&logo=letsencrypt&logoColor=white)
![RGPD](https://img.shields.io/badge/RGPD-h%C3%A9berg%C3%A9%20dans%20l'UE-0052B4?style=flat-square)

</div>

---

## 🌍 Le projet

**GreenCampus HdF** est une application web destinée aux étudiants des Hauts-de-France. Elle leur permet de :

| | Fonctionnalité |
|---|---|
| 🧮 | **Calculer leur bilan carbone** en quelques minutes, à partir du modèle *Nos Gestes Climat* de l'ADEME |
| 🎯 | **Relever des défis hebdomadaires** pour réduire concrètement leur impact (transport, alimentation, numérique…) |
| 📊 | **Suivre un tableau de bord collectif** : l'impact de toute la communauté étudiante, de façon anonyme |
| 📅 | **Découvrir les événements** écologiques du campus |
| 🔔 | **Recevoir des notifications** pour ne pas rater un défi |

### Pourquoi c'est important

Le climat est l'affaire de tous, mais **on ne réduit bien que ce que l'on mesure**. Les étudiants veulent agir sans toujours savoir par où commencer : GreenCampus transforme un sujet abstrait en chiffres concrets et en petites actions faciles à tenir.

Le projet a aussi été pensé **respectueux de la vie privée** : **aucun compte, aucune donnée personnelle**. Les résultats collectifs sont anonymes, et toute l'infrastructure est hébergée **dans l'Union européenne**.

---

## 👨‍💻 Mon rôle : l'ingénieur cloud de l'équipe

> Mes coéquipiers ont développé l'application (API Node.js et front React).
> **J'ai conçu, construit, sécurisé et déployé toute l'infrastructure qui la fait tourner en production sur AWS.**

```mermaid
flowchart LR
    A["🧠 Conception<br/>architecture, budget,<br/>sécurité, RGPD"] --> B["🌐 Réseau<br/>VPC, sous-réseaux,<br/>routage"]
    B --> C["🔐 Sécurité<br/>pare-feu, IAM,<br/>secrets"]
    C --> D["⚙️ Terraform<br/>serveur, base,<br/>droits"]
    D --> E["🚀 Déploiement<br/>Docker, Nginx,<br/>HTTPS"]
    E --> F["📈 Exploitation<br/>logs, sauvegardes,<br/>mises à jour"]
```

---

## 🏗️ Architecture

```mermaid
flowchart TB
    U(["👥 Étudiants"]) -->|"HTTPS"| IGW["Internet Gateway"]

    subgraph AWS["☁️ AWS · eu-north-1 (Stockholm, UE)"]
        subgraph VPC["VPC 10.0.0.0/16"]
            subgraph PUB["🟢 Sous-réseau public · 10.0.1.0/24"]
                EC2["🖥️ EC2 t3.small<br/>Nginx + HTTPS<br/>API dans Docker"]
            end
            subgraph PRA["🔒 Sous-réseau privé · 10.0.11.0/24"]
                RDS[("🐘 RDS PostgreSQL 17<br/>privée et chiffrée")]
            end
            subgraph PRB["🔒 Sous-réseau privé · 10.0.12.0/24"]
                RES["Réservé<br/>(haute disponibilité)"]
            end
        end
        SSM["🔑 Systems Manager<br/>accès admin + secrets"]
        S3["📦 S3<br/>script de déploiement"]
        CW["📜 CloudWatch<br/>journaux"]
    end

    IGW --> EC2
    EC2 -->|"5432 · TLS"| RDS
    EC2 -.-> SSM
    EC2 -.-> S3
    EC2 -.-> CW
```

### Le chemin d'une requête

```mermaid
sequenceDiagram
    actor E as Étudiant
    participant N as Nginx (HTTPS)
    participant A as API (Docker)
    participant D as PostgreSQL (privée)

    E->>N: https://… (port 443)
    Note over N: Certificat Let's Encrypt<br/>limitation de débit
    alt Page du site
        N-->>E: Fichiers React
    else Appel /api
        N->>A: 127.0.0.1:4000 (interne)
        A->>D: Requête SQL chiffrée (TLS)
        D-->>A: Résultat
        A-->>N: JSON
        N-->>E: Réponse
    end
```

### Le réseau en détail

| Élément | Valeur | Rôle |
|---|---|---|
| **VPC** | `10.0.0.0/16` | Réseau privé et isolé du projet |
| **Sous-réseau public** | `10.0.1.0/24` · zone a | Le serveur, seule porte d'entrée depuis Internet |
| **Sous-réseau privé A** | `10.0.11.0/24` · zone a | La base de données |
| **Sous-réseau privé B** | `10.0.12.0/24` · zone b | Exigé par RDS (2 zones), prêt pour la haute disponibilité |
| **Table de routage publique** | `0.0.0.0/0 → Internet Gateway` | Le serveur peut joindre Internet |
| **Table de routage privée** | `local` uniquement | **La base n'a aucune route vers Internet** |

---

## 🔐 Sécurité

La sécurité est construite **en couches** : même si une protection tombe, les autres tiennent.

```mermaid
flowchart LR
    I["🌐 Internet"] --> L1["1️⃣ Pare-feu<br/>seuls 80 et 443"]
    L1 --> L2["2️⃣ Nginx<br/>HTTPS + limitation<br/>de débit"]
    L2 --> L3["3️⃣ API<br/>joignable seulement<br/>en interne"]
    L3 --> L4["4️⃣ Base<br/>sous-réseau privé,<br/>accès depuis la VM seule"]
```

| Mesure | Ce que ça apporte |
|---|---|
| 🚫 **Aucun port SSH ouvert** | L'administration passe par **AWS Session Manager** : pas de clé à voler, chaque accès est tracé |
| 🧱 **Security Groups chaînés** | La base accepte **uniquement** le groupe du serveur, pas une adresse IP |
| 🔑 **Secrets dans SSM Parameter Store** | Chiffrés, jamais dans Git ni dans l'image Docker |
| 👤 **IAM au moindre privilège** | Le serveur ne lit que *ses* secrets, *son* bucket, et n'écrit que *ses* journaux |
| 🔒 **Chiffrement partout** | HTTPS pour les visiteurs, TLS vers la base, disques et base chiffrés au repos |
| 🛡️ **IMDSv2 obligatoire** | Protège les identifiants du serveur contre les attaques de type SSRF |

---

## 🧩 Infrastructure as Code

Le réseau a d'abord été construit **à la main dans la console**, pour comprendre chaque brique. Tout le reste est décrit en **Terraform**, découpé en **4 étapes indépendantes** :

```mermaid
flowchart LR
    R["🌐 Réseau<br/>(console)"] -.->|"retrouvé par son nom"| S
    S["01 · Sécurité<br/>Security Groups"] --> DB["02 · Base<br/>RDS PostgreSQL"]
    DB --> VM["03 · Serveur<br/>EC2, IAM, Elastic IP"]
    VM --> DEP["04 · Déploiement<br/>S3, secrets, droits"]
```

```bash
cd infra/01-security   && terraform init && terraform apply
cd ../02-rds           && terraform init && terraform apply
cd ../03-vm            && terraform init && terraform apply
cd ../04-deploiement   && terraform init && terraform apply
```

> Les fichiers `terraform.tfstate` contiennent des secrets : ils restent en local et ne sont **jamais** envoyés sur Git.

---

## 🚀 Déploiement

Un **script unique et relançable** installe l'application ou la met à jour, en une commande, depuis Session Manager :

```mermaid
flowchart LR
    A["📸 Snapshot<br/>de la base"] --> B["📥 Code<br/>depuis GitHub"]
    B --> C["🐳 Build<br/>Docker + React"]
    C --> D["🔑 Secrets<br/>depuis SSM"]
    D --> E["🔒 Nginx<br/>+ certificat HTTPS"]
    E --> F["▶️ Lancement<br/>+ migrations"]
    F --> G["✅ Vérifications"]
```

Le certificat HTTPS **se renouvelle tout seul**, l'API **redémarre seule** en cas de crash, et **un snapshot de la base est pris avant chaque mise à jour** pour pouvoir revenir en arrière.

---

## 🎓 Compétences mises en œuvre

| Domaine | Ce que j'ai fait concrètement |
|---|---|
| ☁️ **Cloud AWS** | VPC, sous-réseaux, Internet Gateway, EC2, Elastic IP, RDS, S3, IAM, Systems Manager, CloudWatch |
| 🌐 **Réseau** | Découpage CIDR, sous-réseaux public/privé, tables de routage, répartition sur 2 zones de disponibilité |
| 🔐 **Sécurité** | Pare-feu par Security Groups, moindre privilège IAM, gestion des secrets, chiffrement, aucun SSH |
| 🧩 **Infrastructure as Code** | Terraform modulaire en 4 étapes, data sources, remote state, génération de mot de passe |
| 🐳 **Conteneurs et serveur web** | Docker, Nginx en reverse proxy, HTTPS Let's Encrypt avec renouvellement automatique |
| 🐧 **Linux et scripting** | Amazon Linux 2023, Bash, systemd, swap, rotation des journaux |
| 🚀 **Mise en production** | Script de déploiement idempotent, migrations, mises à jour sans perte de données, tests après déploiement |
| 📈 **Exploitation** | Journaux centralisés (30 jours), snapshots, diagnostic et correction en production |
| ⚖️ **RGPD** | Hébergement dans l'UE, conservation limitée des journaux, plan de suppression en fin de projet |
| 💰 **Maîtrise des coûts** | Architecture dimensionnée pour un budget de 100 $ : choix argumentés (pas de load balancer ni de NAT) |
| 🤝 **Travail en équipe** | Échanges avec les développeurs, déploiement de leurs mises à jour, documentation |

### Des choix argumentés

| Décision | Pourquoi |
|---|---|
| **Pas de load balancer ni de NAT Gateway** | ~55 $/mois à eux deux, soit plus de la moitié du budget. L'API garde un état en mémoire : une seule instance est de toute façon nécessaire. |
| **Serveur public, base privée** | La base n'a jamais besoin d'Internet ; le serveur, si (certificat, notifications, mises à jour). |
| **Session Manager plutôt que SSH** | Zéro port d'administration exposé, accès tracés par IAM. |
| **Région Stockholm** | Dans l'UE pour le RGPD. |

---

## ✅ Résultats

<div align="center">

| 🌐 En ligne | 🔒 HTTPS | 🚫 Port SSH | 💰 Coût | 🇪🇺 Données |
|:---:|:---:|:---:|:---:|:---:|
| **En production** | **Let's Encrypt** | **0 ouvert** | **~40 $/mois** | **100 % UE** |

</div>



---

## 🔭 Et ensuite ?

- [ ] Réseau aussi en Terraform, avec un state distant sur S3
- [ ] CI/CD avec GitHub Actions (authentification OIDC, sans clé)
- [ ] Serveurs en sous-réseau privé derrière un load balancer, avec plusieurs instances
- [ ] Base en Multi-AZ et sauvegardes sur 7 jours
- [ ] WAF et alarmes CloudWatch

---

<div align="center">

**Infrastructure : Mahdi FAHS** · [Portfolio](https://mahdifahs.github.io/mahdifahs/)

*Application développée en équipe · code de l'API dans [`backend/`](backend/), du front dans [`frontend/`](frontend/)*

</div>
