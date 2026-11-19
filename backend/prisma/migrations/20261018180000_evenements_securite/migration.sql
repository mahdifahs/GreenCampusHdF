-- CreateTable
CREATE TABLE "EvenementSecurite" (
    "id" UUID NOT NULL,
    "type" TEXT NOT NULL,
    "niveau" TEXT NOT NULL,
    "ip" TEXT,
    "details" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "EvenementSecurite_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "EvenementSecurite_createdAt_idx" ON "EvenementSecurite"("createdAt");

-- CreateIndex
CREATE INDEX "EvenementSecurite_type_createdAt_idx" ON "EvenementSecurite"("type", "createdAt");

