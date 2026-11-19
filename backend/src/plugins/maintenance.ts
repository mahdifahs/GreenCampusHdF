import fp from 'fastify-plugin';

export type EtatMaintenance = { actif: boolean; depuis: Date | null; par: string | null };

declare module 'fastify' {
  interface FastifyInstance {
    maintenance: {
      // Lecture rapide (cache mémoire de quelques secondes), appelée à chaque requête de l'API.
      active: () => Promise<boolean>;
      etat: () => Promise<EtatMaintenance>;
      definir: (actif: boolean, par: string) => Promise<EtatMaintenance>;
    };
  }
}

const ID = 1;
// Seules ces routes restent joignables pendant la maintenance : l'état lui-même (lu par le site
// pour afficher sa page de maintenance) et l'administration (pour réparer pendant ce temps).
const toujoursOuvert = (chemin: string) => chemin === '/api/statut' || chemin === '/api/admin' || chemin.startsWith('/api/admin/');
const RETRY_AFTER_SECONDES = 60;

// Mode maintenance : basculé depuis l'admin (PUT /api/admin/maintenance), sans redémarrer l'API.
// Tant qu'il est actif, toute l'API publique et participant répond 503 { code: 'MAINTENANCE' }.
export default fp<{ cacheMs?: number }>(async (app, opts) => {
  const cacheMs = opts.cacheMs ?? 5000;
  let cache: { actif: boolean; expire: number } | null = null;

  const etat = async (): Promise<EtatMaintenance> => {
    const ligne = await app.prisma.maintenance.findUnique({ where: { id: ID } });
    return { actif: ligne?.actif ?? false, depuis: ligne?.depuis ?? null, par: ligne?.par ?? null };
  };

  const active = async () => {
    if (cache && cache.expire > Date.now()) return cache.actif;
    const { actif } = await etat();
    cache = { actif, expire: Date.now() + cacheMs };
    return actif;
  };

  const definir = async (actif: boolean, par: string) => {
    const donnees = { actif, depuis: actif ? new Date() : null, par: actif ? par : null };
    await app.prisma.maintenance.upsert({ where: { id: ID }, create: { id: ID, ...donnees }, update: donnees });
    cache = { actif, expire: Date.now() + cacheMs };
    return donnees;
  };

  app.decorate('maintenance', { active, etat, definir });

  app.addHook('onRequest', async (request, reply) => {
    const chemin = request.url.split('?')[0];
    if (!chemin.startsWith('/api/') || toujoursOuvert(chemin)) return;
    // La déconnexion reste possible : elle ne touche pas à la base, seulement au cookie de session.
    if (request.method === 'DELETE' && chemin === '/api/sessions') return;
    if (!(await active())) return;
    return reply
      .status(503)
      .header('retry-after', String(RETRY_AFTER_SECONDES))
      .header('cache-control', 'no-store')
      .send({ code: 'MAINTENANCE', message: 'Le site est en maintenance, reviens dans quelques minutes.' });
  });
});
