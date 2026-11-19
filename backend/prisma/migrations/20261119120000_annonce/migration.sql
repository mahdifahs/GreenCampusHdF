-- CreateEnum
CREATE TYPE "NiveauAnnonce" AS ENUM ('INFO', 'ATTENTION', 'IMPORTANT');

-- CreateTable
CREATE TABLE "Annonce" (
    "id" INTEGER NOT NULL DEFAULT 1,
    "texte" TEXT NOT NULL,
    "niveau" "NiveauAnnonce" NOT NULL DEFAULT 'INFO',
    "publiee" BOOLEAN NOT NULL DEFAULT false,
    "fin" TIMESTAMP(3),
    "par" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Annonce_pkey" PRIMARY KEY ("id")
);

-- Une seule ligne possible : un seul message à la fois.
ALTER TABLE "Annonce" ADD CONSTRAINT "Annonce_ligne_unique" CHECK ("id" = 1);
