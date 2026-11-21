import fp from 'fastify-plugin';
import * as service from '../modules/questionnaire/service.js';

declare module 'fastify' {
  interface FastifyInstance {
    questionnaire: {
      // Questions actives (ADEME et information) et bornes ADEME. Lu à chaque ouverture du bilan et à
      // chaque estimation : cache mémoire de quelques secondes, vidé à chaque modification admin.
      actif: () => Promise<service.QuestionnaireActif>;
      // À appeler après toute modification du questionnaire.
      invalider: () => void;
      // Remplit la table au premier usage si elle est vide (les 29 questions de la version stand).
      pret: () => Promise<void>;
    };
  }
}

export default fp<{ cacheMs?: number }>(async (app, opts) => {
  const cacheMs = opts.cacheMs ?? 10_000;
  let cache: { valeur: service.QuestionnaireActif; expire: number } | null = null;
  let initialisation: Promise<void> | null = null;

  const pret = () => {
    // En cas d'échec (base injoignable), on retentera au prochain appel.
    initialisation ??= service.initialiser(app.prisma, app.ngc).catch((e) => {
      initialisation = null;
      throw e;
    });
    return initialisation;
  };

  const actif = async () => {
    if (!cache || cache.expire <= Date.now()) {
      await pret();
      cache = { valeur: await service.actif(app.prisma, app.ngc), expire: Date.now() + cacheMs };
    }
    return cache.valeur;
  };

  app.decorate('questionnaire', { actif, pret, invalider: () => (cache = null) });
});
