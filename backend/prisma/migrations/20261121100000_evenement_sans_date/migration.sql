-- Un évènement peut être publié sans date (simple message, ex. « version de test »).
ALTER TABLE "Evenement" ALTER COLUMN "dateDebut" DROP NOT NULL;
