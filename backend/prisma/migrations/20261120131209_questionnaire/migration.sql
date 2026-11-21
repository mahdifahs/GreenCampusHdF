-- CreateEnum
CREATE TYPE "TypeQuestionBilan" AS ENUM ('ADEME', 'INFORMATION');

-- CreateEnum
CREATE TYPE "FormatQuestion" AS ENUM ('NOMBRE', 'CHOIX');

-- CreateTable
CREATE TABLE "QuestionBilan" (
    "id" UUID NOT NULL,
    "type" "TypeQuestionBilan" NOT NULL,
    "dottedName" TEXT,
    "texte" TEXT NOT NULL,
    "format" "FormatQuestion",
    "unite" TEXT,
    "choix" TEXT[],
    "min" DOUBLE PRECISION,
    "max" DOUBLE PRECISION,
    "ordre" INTEGER NOT NULL,
    "actif" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "QuestionBilan_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ReponseQuestion" (
    "bilanId" UUID NOT NULL,
    "questionId" UUID NOT NULL,
    "valeurNombre" DOUBLE PRECISION,
    "valeurChoix" TEXT,

    CONSTRAINT "ReponseQuestion_pkey" PRIMARY KEY ("bilanId","questionId")
);

-- CreateIndex
CREATE UNIQUE INDEX "QuestionBilan_dottedName_key" ON "QuestionBilan"("dottedName");

-- CreateIndex
CREATE INDEX "QuestionBilan_actif_ordre_idx" ON "QuestionBilan"("actif", "ordre");

-- CreateIndex
CREATE INDEX "ReponseQuestion_questionId_idx" ON "ReponseQuestion"("questionId");

-- AddForeignKey
ALTER TABLE "ReponseQuestion" ADD CONSTRAINT "ReponseQuestion_bilanId_fkey" FOREIGN KEY ("bilanId") REFERENCES "Bilan"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReponseQuestion" ADD CONSTRAINT "ReponseQuestion_questionId_fkey" FOREIGN KEY ("questionId") REFERENCES "QuestionBilan"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Une question ADEME a toujours son dottedName, une question INFORMATION jamais.
ALTER TABLE "QuestionBilan" ADD CONSTRAINT "QuestionBilan_type_check" CHECK (("type" = 'ADEME') = ("dottedName" IS NOT NULL));
