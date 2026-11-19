import fp from 'fastify-plugin';
import { ModeleNgc } from '../lib/ngc.js';

declare module 'fastify' {
  interface FastifyInstance {
    ngc: ModeleNgc;
  }
}

// Le modèle est chargé une seule fois au démarrage (environ 150 ms) puis réutilisé pour chaque calcul.
let modele: ModeleNgc | undefined;

export default fp(async (app) => {
  modele ??= new ModeleNgc();
  app.decorate('ngc', modele);
});
