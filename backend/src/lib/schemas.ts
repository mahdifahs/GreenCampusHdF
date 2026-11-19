import { z } from 'zod';

// Forme commune de toutes les réponses d'erreur de l'API.
export const erreurSchema = z.object({
  code: z.string(),
  message: z.string(),
  details: z.array(z.object({ champ: z.string(), message: z.string() })).optional(),
});
