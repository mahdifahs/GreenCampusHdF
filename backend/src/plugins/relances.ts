import fp from 'fastify-plugin';
import webpush from 'web-push';
import { envoyerRelances, type Envoyeur } from '../modules/suivis/service.js';

type Options = { clePublique: string; clePrivee: string; sujet: string; intervalleMin: number };

declare module 'fastify' {
  interface FastifyInstance {
    // Lance un tour d'envoi immédiatement ; null si les notifications sont désactivées.
    lancerRelances: (() => Promise<number>) | null;
  }
}

// Vérifie périodiquement les relances à envoyer. Désactivé si les clés VAPID ne sont pas configurées.
export default fp<Options>(async (app, opts) => {
  if (!opts.clePublique || !opts.clePrivee) {
    app.decorate('lancerRelances', null);
    app.log.info('Notifications de relance désactivées (clés VAPID absentes)');
    return;
  }
  webpush.setVapidDetails(opts.sujet, opts.clePublique, opts.clePrivee);

  const envoyer: Envoyeur = async (abonnement, notification) => {
    try {
      await webpush.sendNotification(
        { endpoint: abonnement.endpoint, keys: { p256dh: abonnement.p256dh, auth: abonnement.auth } },
        JSON.stringify(notification),
        { TTL: 24 * 60 * 60 },
      );
      return 'ok';
    } catch (e) {
      const statut = (e as { statusCode?: number }).statusCode;
      // 404 / 410 : l'abonnement n'existe plus côté navigateur, on le supprime.
      if (statut === 404 || statut === 410) return 'expire';
      throw e;
    }
  };

  const tourner = async () => {
    try {
      // Pas de rappel pendant une maintenance : il mènerait vers un site indisponible.
      if (await app.maintenance.active()) return;
      const n = await envoyerRelances(app.prisma, envoyer);
      if (n) app.log.info(`${n} relance(s) envoyée(s)`);
    } catch (e) {
      app.log.error(e, 'Échec de l’envoi des relances');
    }
  };
  app.decorate('lancerRelances', () => envoyerRelances(app.prisma, envoyer));
  const minuteur = setInterval(tourner, opts.intervalleMin * 60_000);
  minuteur.unref();
  app.addHook('onReady', async () => void tourner());
  app.addHook('onClose', async () => clearInterval(minuteur));
});
