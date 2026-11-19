-- CreateTable
CREATE TABLE "CompteurJour" (
    "date" DATE NOT NULL,
    "personnesVenues" INTEGER NOT NULL DEFAULT 0,
    "vetementsRecuperes" INTEGER NOT NULL DEFAULT 0,
    "vetementsDonnes" INTEGER NOT NULL DEFAULT 0,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CompteurJour_pkey" PRIMARY KEY ("date")
);
