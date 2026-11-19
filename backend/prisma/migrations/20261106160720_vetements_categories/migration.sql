-- AlterTable
ALTER TABLE "CompteurJour" DROP COLUMN "vetementsDonnes",
DROP COLUMN "vetementsRecuperes";

-- CreateTable
CREATE TABLE "TypeVetement" (
    "id" SERIAL NOT NULL,
    "nom" TEXT NOT NULL,
    "poidsMoyenGrammes" INTEGER,
    "actif" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TypeVetement_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Matiere" (
    "id" SERIAL NOT NULL,
    "nom" TEXT NOT NULL,
    "facteurEmissionKgCo2ParKg" DOUBLE PRECISION,
    "source" TEXT,
    "actif" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Matiere_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "QuantiteVetement" (
    "date" DATE NOT NULL,
    "typeId" INTEGER NOT NULL,
    "matiereId" INTEGER NOT NULL,
    "recuperes" INTEGER NOT NULL DEFAULT 0,
    "donnes" INTEGER NOT NULL DEFAULT 0,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "QuantiteVetement_pkey" PRIMARY KEY ("date","typeId","matiereId")
);

-- CreateIndex
CREATE UNIQUE INDEX "TypeVetement_nom_key" ON "TypeVetement"("nom");

-- CreateIndex
CREATE UNIQUE INDEX "Matiere_nom_key" ON "Matiere"("nom");

-- AddForeignKey
ALTER TABLE "QuantiteVetement" ADD CONSTRAINT "QuantiteVetement_typeId_fkey" FOREIGN KEY ("typeId") REFERENCES "TypeVetement"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "QuantiteVetement" ADD CONSTRAINT "QuantiteVetement_matiereId_fkey" FOREIGN KEY ("matiereId") REFERENCES "Matiere"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
