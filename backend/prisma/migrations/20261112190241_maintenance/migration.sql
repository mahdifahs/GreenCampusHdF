-- CreateTable
CREATE TABLE "Maintenance" (
    "id" INTEGER NOT NULL DEFAULT 1,
    "actif" BOOLEAN NOT NULL DEFAULT false,
    "depuis" TIMESTAMP(3),
    "par" TEXT,

    CONSTRAINT "Maintenance_pkey" PRIMARY KEY ("id")
);

-- Une seule ligne possible : le réglage du site.
ALTER TABLE "Maintenance" ADD CONSTRAINT "Maintenance_ligne_unique" CHECK ("id" = 1);
