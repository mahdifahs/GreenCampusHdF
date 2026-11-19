import { randomUUID } from 'node:crypto';
import argon2 from 'argon2';
import type { RoleAdmin } from '@prisma/client';
import type { buildApp } from '../src/app.js';
import { jetonDe } from './aide-session.js';

type App = Awaited<ReturnType<typeof buildApp>>;

export const MOT_DE_PASSE_ADMIN_TEST = 'mot-de-passe-de-test-123';

// Crée un compte admin directement en base (sans passer par le seed) puis ouvre une session :
// utilisé par tous les tests qui ont besoin d'un jeton admin. Le prénom reçoit toujours un
// suffixe aléatoire : les fichiers de test tournent en parallèle sur la même base (prénom
// unique en base), un prénom littéral comme « Testeur » collisionnerait sinon entre fichiers.
export async function connecterAdmin(
  app: App,
  options: { prenom?: string; role?: RoleAdmin; headers?: Record<string, string> } = {},
) {
  const prenom = `${options.prenom ?? 'Testeur'}-${randomUUID().slice(0, 8)}`;
  const role = options.role ?? 'SUPER_ADMIN';
  await app.prisma.compteAdmin.create({ data: { prenom, role, motDePasseHash: await argon2.hash(MOT_DE_PASSE_ADMIN_TEST) } });
  const res = await app.inject({
    method: 'POST',
    url: '/api/admin/session',
    headers: options.headers,
    payload: { motDePasse: MOT_DE_PASSE_ADMIN_TEST, nom: prenom },
  });
  return { authorization: `Bearer ${jetonDe(res, 'gc_admin')}`, prenom };
}
