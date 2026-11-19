-- AlterTable
ALTER TABLE "Defi" DROP COLUMN "co2EviteKgSemaine",
DROP COLUMN "source",
ADD COLUMN     "actionNgc" TEXT NOT NULL;

-- AlterTable
ALTER TABLE "Engagement" ADD COLUMN     "co2EviteKgSemaine" DOUBLE PRECISION NOT NULL;

-- CreateIndex
CREATE UNIQUE INDEX "Defi_actionNgc_key" ON "Defi"("actionNgc");

