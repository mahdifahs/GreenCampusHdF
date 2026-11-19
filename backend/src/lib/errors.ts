import type { FastifyError, FastifyInstance } from 'fastify';
import { hasZodFastifySchemaValidationErrors } from 'fastify-type-provider-zod';

// Erreur métier renvoyée telle quelle au client : { code, message }.
export class ErreurApi extends Error {
  constructor(
    public statusCode: number,
    public code: string,
    message: string,
    public details?: { champ: string; message: string }[],
  ) {
    super(message);
  }
}

export function installerGestionErreurs(app: FastifyInstance) {
  app.setErrorHandler((error: FastifyError | ErreurApi, request, reply) => {
    if (error instanceof ErreurApi) {
      return reply
        .status(error.statusCode)
        .send({ code: error.code, message: error.message, ...(error.details ? { details: error.details } : {}) });
    }
    if (hasZodFastifySchemaValidationErrors(error)) {
      return reply.status(400).send({
        code: 'REQUETE_INVALIDE',
        message: 'Certains champs sont invalides.',
        details: error.validation.map((v) => ({ champ: v.instancePath, message: v.message })),
      });
    }
    if (error.statusCode === 429) {
      return reply.status(429).send({ code: 'TROP_DE_REQUETES', message: 'Trop de tentatives, réessaie dans une minute.' });
    }
    if (error.code === 'FST_ERR_CTP_INVALID_JSON_BODY' || error.code === 'FST_ERR_CTP_EMPTY_JSON_BODY') {
      return reply.status(400).send({ code: 'REQUETE_INVALIDE', message: 'Le corps de la requête n’est pas un JSON valide.' });
    }
    if (error.statusCode && error.statusCode < 500) {
      return reply.status(error.statusCode).send({ code: 'REQUETE_INVALIDE', message: error.message });
    }
    request.log.error(error);
    return reply.status(500).send({ code: 'ERREUR_INTERNE', message: 'Erreur interne du serveur.' });
  });

  app.setNotFoundHandler((request, reply) =>
    reply.status(404).send({ code: 'INTROUVABLE', message: `Route ${request.method} ${request.url} inconnue.` }),
  );
}
