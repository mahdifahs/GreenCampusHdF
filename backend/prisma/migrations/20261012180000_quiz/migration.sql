-- CreateTable
CREATE TABLE "QuizReponse" (
    "id" UUID NOT NULL,
    "partie" UUID NOT NULL,
    "questionId" TEXT NOT NULL,
    "choix" TEXT NOT NULL,
    "correct" BOOLEAN NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "QuizReponse_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "QuizReponse_questionId_idx" ON "QuizReponse"("questionId");

