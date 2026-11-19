import type { Prisma } from '@prisma/client';
import type { FastifyRequest } from 'fastify';
import fp from 'fastify-plugin';
import { enregistrer, TYPES_EVENEMENT, type TypeEvenement } from '../modules/securite/service.js';

declare module 'fastify' {
  interface FastifyInstance {
    // Trace un événement de sécurité (journal applicatif + base). Ne lève jamais d'erreur.
    journalSecurite: (request: FastifyRequest, type: TypeEvenement, details?: Prisma.InputJsonValue) => Promise<void>;
  }
}

export default fp(async (app) => {
  app.decorate('journalSecurite', async (request: FastifyRequest, type: TypeEvenement, details?: Prisma.InputJsonValue) => {
    const niveau = TYPES_EVENEMENT[type];
    const contexte = { evenementSecurite: type, ip: request.ip, url: request.url, details };
    if (niveau === 'info') request.log.info(contexte, 'Événement de sécurité');
    else request.log.warn(contexte, 'Événement de sécurité');
    await enregistrer(app.prisma, { type, ip: request.ip, details }, request.log);
  });
});
