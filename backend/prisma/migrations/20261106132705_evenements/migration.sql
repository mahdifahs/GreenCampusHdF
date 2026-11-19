-- CreateEnum
CREATE TYPE "StatutEvenement" AS ENUM ('BROUILLON', 'PUBLIE');

-- CreateTable
CREATE TABLE "Evenement" (
    "id" UUID NOT NULL,
    "titre" TEXT NOT NULL,
    "description" TEXT,
    "lieu" TEXT,
    "dateDebut" TIMESTAMP(3) NOT NULL,
    "dateFin" TIMESTAMP(3),
    "statut" "StatutEvenement" NOT NULL DEFAULT 'BROUILLON',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Evenement_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Evenement_statut_dateDebut_idx" ON "Evenement"("statut", "dateDebut");
