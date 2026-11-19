-- CreateTable
CREATE TABLE "Session" (
    "id" UUID NOT NULL,
    "participantId" UUID,
    "compteAdminId" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Session_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Session_participantId_idx" ON "Session"("participantId");

-- CreateIndex
CREATE INDEX "Session_compteAdminId_idx" ON "Session"("compteAdminId");

-- CreateIndex
CREATE INDEX "Session_expiresAt_idx" ON "Session"("expiresAt");

-- AddForeignKey
ALTER TABLE "Session" ADD CONSTRAINT "Session_participantId_fkey" FOREIGN KEY ("participantId") REFERENCES "Participant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Session" ADD CONSTRAINT "Session_compteAdminId_fkey" FOREIGN KEY ("compteAdminId") REFERENCES "CompteAdmin"("id") ON DELETE CASCADE ON UPDATE CASCADE;


-- Une session appartient soit à un participant, soit à un compte admin (jamais aux deux, jamais à aucun).
ALTER TABLE "Session" ADD CONSTRAINT "Session_un_seul_titulaire" CHECK (("participantId" IS NULL) <> ("compteAdminId" IS NULL));
