// Suppression de toutes les données au 21/12 (fin du projet, RGPD.md §6).
//
//   Aperçu, rien n'est supprimé :      npm run db:suppression-finale
//   Suppression réelle :               npm run db:suppression-finale -- --confirmer <nom de la base>
//
// Dans l'image Docker de production : node dist/outils/suppression-finale.js [--confirmer <nom>]
// La base visée est celle de DATABASE_URL. Le nom de la base doit être retapé pour confirmer, afin
// qu'une erreur de copier-coller ne vide pas la mauvaise. Les tables restent (vides) : la base
// elle-même, ses sauvegardes et la VM se suppriment ensuite chez l'hébergeur (liste affichée à la fin).
import { PrismaClient } from '@prisma/client';
import { cibleLisible, confirmationDemandee, nomDeLaBase } from '../lib/suppression.js';

const RESTE_A_FAIRE = `
Reste à faire à la main (voir RGPD.md §6) :
  1. Supprimer les SAUVEGARDES de la base chez l'hébergeur (elles contiennent les mêmes données).
  2. Supprimer la base elle-même, puis la VM (disque compris).
  3. Supprimer les journaux du serveur et du reverse proxy (adresses IP) s'ils survivent à la VM.
  4. Retirer le nom de domaine / l'enregistrement DNS, et révoquer les clés VAPID (.env du serveur).
  5. Supprimer le .env du serveur et toute copie locale contenant des secrets ou des exports CSV.
  6. Noter dans RGPD.md la date et qui a effectué la suppression.`;

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error('DATABASE_URL absente : impossible de savoir quelle base vider.');
  const base = nomDeLaBase(url);
  const confirmation = confirmationDemandee(process.argv.slice(2));

  const prisma = new PrismaClient();
  try {
    const tables = (
      await prisma.$queryRaw<{ tablename: string }[]>`
        SELECT tablename FROM pg_tables
        WHERE schemaname = current_schema() AND tablename <> '_prisma_migrations'
        ORDER BY tablename`
    ).map((t) => t.tablename);
    const compter = async () => {
      const lignes: Record<string, number> = {};
      for (const t of tables) {
        const [{ n }] = await prisma.$queryRawUnsafe<{ n: bigint }[]>(`SELECT count(*) AS n FROM "${t.replace(/"/g, '""')}"`);
        lignes[t] = Number(n);
      }
      return lignes;
    };

    console.log(`Base visée : ${cibleLisible(url)}`);
    const avant = await compter();
    console.table(avant);

    if (confirmation === null) {
      console.log(`\nAperçu seulement : rien n'a été supprimé.\nPour tout supprimer : --confirmer ${base}`);
      return;
    }
    if (confirmation !== base) {
      console.error(`\nConfirmation refusée : « ${confirmation} » n'est pas le nom de la base visée (« ${base} »). Rien n'a été supprimé.`);
      process.exitCode = 1;
      return;
    }

    const liste = tables.map((t) => `"${t.replace(/"/g, '""')}"`).join(', ');
    await prisma.$executeRawUnsafe(`TRUNCATE ${liste} RESTART IDENTITY CASCADE`);
    const apres = await compter();
    const restantes = Object.entries(apres).filter(([, n]) => n > 0);
    if (restantes.length) throw new Error(`Des lignes subsistent : ${JSON.stringify(Object.fromEntries(restantes))}`);
    const total = Object.values(avant).reduce((a, b) => a + b, 0);
    console.log(`\nSuppression effectuée le ${new Date().toISOString()} : ${total} lignes effacées, ${tables.length} tables vides.`);
    console.log(RESTE_A_FAIRE);
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exitCode = 1;
});
