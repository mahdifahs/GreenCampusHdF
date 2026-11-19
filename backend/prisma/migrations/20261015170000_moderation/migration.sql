-- AlterTable
ALTER TABLE "Participant" ADD COLUMN     "bloque" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "exclu" BOOLEAN NOT NULL DEFAULT false;

-- CreateTable
CREATE TABLE "ActionAdmin" (
    "id" UUID NOT NULL,
    "auteur" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "cible" TEXT NOT NULL,
    "details" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ActionAdmin_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ActionAdmin_createdAt_idx" ON "ActionAdmin"("createdAt");

