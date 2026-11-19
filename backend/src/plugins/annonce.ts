import type { Annonce, NiveauAnnonce } from '@prisma/client';
import fp from 'fastify-plugin';

export type AnnoncePublique = { texte: string; niveau: NiveauAnnonce; fin: Date | null; version: Date };
export type EntreeAnnonce = { texte: string; niveau: NiveauAnnonce; fin: Date | null; publiee: boolean };

declare module 'fastify' {
  interface FastifyInstance {
    annonce: {
      // Message visible du public (publié et pas encore expiré), sinon null. Lu à chaque
      // changement de page de chaque visiteur : cache mémoire de quelques secondes.
      publique: () => Promise<AnnoncePublique | null>;
      etat: () => Promise<Annonce | null>;
      definir: (entree: EntreeAnnonce, par: string) => Promise<Annonce>;
    };
  }
}

const ID = 1;

// Bandeau d'information du site (une seule ligne en base : un seul message à la fois).
export default fp<{ cacheMs?: number }>(async (app, opts) => {
  const cacheMs = opts.cacheMs ?? 10_000;
  let cache: { ligne: Annonce | null; expire: number } | null = null;

  const etat = () => app.prisma.annonce.findUnique({ where: { id: ID } });

  const publique = async (): Promise<AnnoncePublique | null> => {
    if (!cache || cache.expire <= Date.now()) cache = { ligne: await etat(), expire: Date.now() + cacheMs };
    const ligne = cache.ligne;
    // La date de fin est vérifiée à chaque lecture, pas seulement à la mise en cache.
    if (!ligne?.publiee || (ligne.fin && ligne.fin.getTime() <= Date.now())) return null;
    return { texte: ligne.texte, niveau: ligne.niveau, fin: ligne.fin, version: ligne.updatedAt };
  };

  const definir = async (entree: EntreeAnnonce, par: string) => {
    const donnees = { ...entree, par };
    const ligne = await app.prisma.annonce.upsert({ where: { id: ID }, create: { id: ID, ...donnees }, update: donnees });
    cache = { ligne, expire: Date.now() + cacheMs };
    return ligne;
  };

  app.decorate('annonce', { publique, etat, definir });
});
