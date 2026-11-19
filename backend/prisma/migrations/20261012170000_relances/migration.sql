-- CreateTable
CREATE TABLE "Relance" (
    "id" UUID NOT NULL,
    "participantId" UUID NOT NULL,
    "etape" "EtapeSuivi" NOT NULL,
    "envoyeeAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Relance_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Relance_participantId_etape_key" ON "Relance"("participantId", "etape");

-- AddForeignKey
ALTER TABLE "Relance" ADD CONSTRAINT "Relance_participantId_fkey" FOREIGN KEY ("participantId") REFERENCES "Participant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

