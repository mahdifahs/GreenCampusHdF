-- CreateEnum
CREATE TYPE "Annee" AS ENUM ('L1', 'L2', 'L3', 'BUT1', 'BUT2', 'BUT3', 'M1', 'M2', 'INGE1', 'INGE2', 'INGE3', 'INGE4', 'INGE5', 'DOCTORAT', 'AUTRE');

-- CreateEnum
CREATE TYPE "TypeBilan" AS ENUM ('STAND', 'COMPLET');

-- CreateEnum
CREATE TYPE "CategorieDefi" AS ENUM ('TRANSPORT', 'ALIMENTATION', 'LOGEMENT', 'DIVERS', 'NUMERIQUE');

-- CreateEnum
CREATE TYPE "StatutEngagement" AS ENUM ('EN_COURS', 'VALIDE', 'NON_TENU');

-- CreateEnum
CREATE TYPE "EtapeSuivi" AS ENUM ('J7', 'J14');

-- CreateTable
CREATE TABLE "Filiere" (
    "id" SERIAL NOT NULL,
    "slug" TEXT NOT NULL,
    "libelle" TEXT NOT NULL,

    CONSTRAINT "Filiere_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Participant" (
    "id" UUID NOT NULL,
    "pseudo" TEXT NOT NULL,
    "codeSelecteur" TEXT NOT NULL,
    "codeVerifHash" TEXT NOT NULL,
    "filiereId" INTEGER NOT NULL,
    "annee" "Annee" NOT NULL,
    "consentementAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Participant_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Bilan" (
    "id" UUID NOT NULL,
    "participantId" UUID NOT NULL,
    "type" "TypeBilan" NOT NULL,
    "situation" JSONB NOT NULL,
    "totalKg" DOUBLE PRECISION NOT NULL,
    "parCategorie" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Bilan_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Defi" (
    "id" SERIAL NOT NULL,
    "slug" TEXT NOT NULL,
    "titre" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "categorie" "CategorieDefi" NOT NULL,
    "co2EviteKgSemaine" DOUBLE PRECISION NOT NULL,
    "source" TEXT NOT NULL,
    "actif" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "Defi_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Engagement" (
    "id" UUID NOT NULL,
    "participantId" UUID NOT NULL,
    "defiId" INTEGER NOT NULL,
    "semaine" DATE NOT NULL,
    "statut" "StatutEngagement" NOT NULL DEFAULT 'EN_COURS',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "reponduAt" TIMESTAMP(3),

    CONSTRAINT "Engagement_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Suivi" (
    "id" UUID NOT NULL,
    "participantId" UUID NOT NULL,
    "etape" "EtapeSuivi" NOT NULL,
    "reponses" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Suivi_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PushAbonnement" (
    "id" UUID NOT NULL,
    "participantId" UUID NOT NULL,
    "endpoint" TEXT NOT NULL,
    "p256dh" TEXT NOT NULL,
    "auth" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PushAbonnement_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Filiere_slug_key" ON "Filiere"("slug");

-- CreateIndex
CREATE UNIQUE INDEX "Participant_pseudo_key" ON "Participant"("pseudo");

-- CreateIndex
CREATE UNIQUE INDEX "Participant_codeSelecteur_key" ON "Participant"("codeSelecteur");

-- CreateIndex
CREATE INDEX "Participant_filiereId_idx" ON "Participant"("filiereId");

-- CreateIndex
CREATE INDEX "Bilan_participantId_createdAt_idx" ON "Bilan"("participantId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "Defi_slug_key" ON "Defi"("slug");

-- CreateIndex
CREATE INDEX "Engagement_defiId_idx" ON "Engagement"("defiId");

-- CreateIndex
CREATE UNIQUE INDEX "Engagement_participantId_defiId_semaine_key" ON "Engagement"("participantId", "defiId", "semaine");

-- CreateIndex
CREATE UNIQUE INDEX "Suivi_participantId_etape_key" ON "Suivi"("participantId", "etape");

-- CreateIndex
CREATE UNIQUE INDEX "PushAbonnement_endpoint_key" ON "PushAbonnement"("endpoint");

-- AddForeignKey
ALTER TABLE "Participant" ADD CONSTRAINT "Participant_filiereId_fkey" FOREIGN KEY ("filiereId") REFERENCES "Filiere"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Bilan" ADD CONSTRAINT "Bilan_participantId_fkey" FOREIGN KEY ("participantId") REFERENCES "Participant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Engagement" ADD CONSTRAINT "Engagement_participantId_fkey" FOREIGN KEY ("participantId") REFERENCES "Participant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Engagement" ADD CONSTRAINT "Engagement_defiId_fkey" FOREIGN KEY ("defiId") REFERENCES "Defi"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Suivi" ADD CONSTRAINT "Suivi_participantId_fkey" FOREIGN KEY ("participantId") REFERENCES "Participant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PushAbonnement" ADD CONSTRAINT "PushAbonnement_participantId_fkey" FOREIGN KEY ("participantId") REFERENCES "Participant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
