-- CreateEnum
CREATE TYPE "RoleAdmin" AS ENUM ('ADMIN', 'SUPER_ADMIN');

-- CreateTable
CREATE TABLE "CompteAdmin" (
    "id" UUID NOT NULL,
    "prenom" TEXT NOT NULL,
    "motDePasseHash" TEXT NOT NULL,
    "role" "RoleAdmin" NOT NULL DEFAULT 'ADMIN',
    "bloque" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "derniereConnexionAt" TIMESTAMP(3),

    CONSTRAINT "CompteAdmin_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "CompteAdmin_prenom_key" ON "CompteAdmin"("prenom");
