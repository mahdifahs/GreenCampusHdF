import argon2 from 'argon2';
import type { FastifyPluginAsyncZod, ZodTypeProvider } from 'fastify-type-provider-zod';
import { z } from 'zod';
import { ErreurApi } from '../../lib/errors.js';
import { VerrouEchecs } from '../../lib/verrou.js';
import { erreurSchema } from '../../lib/schemas.js';
import routesAnnonce from './routes-annonce.js';
import routesComptes from './routes-comptes.js';
import routesEvenements from './routes-evenements.js';
import routesGeneral from './routes-general.js';
import routesModeration from './routes-moderation.js';
import routesStand from './routes-stand.js';

// Routes /api/admin : connexion (ce fichier), puis les routes protégées, réparties par thème dans
// routes-general.ts, routes-moderation.ts, routes-comptes.ts, routes-stand.ts et routes-evenements.ts
// (aides communes dans routes-commun.ts). Les hooks d'accès posés ici (session admin, liste blanche
// des bénévoles) s'appliquent à tous ces fichiers, enregistrés dans le même contexte.

// Hash factice calculé une fois, utilisé quand le prénom saisi ne correspond à aucun compte :
// évite qu'une connexion sur un prénom inconnu réponde plus vite qu'une connexion sur un prénom
// existant mais un mauvais mot de passe (ce qui permettrait de deviner les prénoms des comptes).
const hashFactice = argon2.hash('mot-de-passe-factice-pour-comparaison-a-temps-constant');

// Seules routes ouvertes aux comptes BENEVOLE (saisie au stand) : identité, compteur de personnes
// venues (Jour J) et quantités de vêtements, avec le catalogue en lecture seule. Liste blanche :
// toute nouvelle route d'administration reste fermée aux bénévoles tant qu'on ne l'ajoute pas ici.
export const ROUTES_BENEVOLE = new Set([
  'GET /moi',
  'GET /compteurs',
  'GET /compteurs/:date',
  'POST /compteurs/:date/incrementer',
  'PATCH /compteurs/:date',
  'GET /vetements/types',
  'GET /vetements/matieres',
  'GET /vetements/quantites/:date',
  'POST /vetements/quantites/:date/incrementer',
  'PATCH /vetements/quantites/:date',
  'GET /vetements/bilan',
]);

// Au-delà de 20 mots de passe faux en 15 minutes sur un même prénom (toutes IP confondues), la connexion
// à ce compte est verrouillée 15 minutes.
export const VERROU_ADMIN = { seuil: 20, fenetreMs: 15 * 60_000, dureeMs: 15 * 60_000 };
// Chaque prénom tenté, même inventé, crée une entrée : au-delà de ce nombre, on oublie les entrées
// inactives, pour que des essais avec des prénoms aléatoires ne fassent pas grossir la mémoire sans fin.
export const VERROUS_ADMIN_MAX = 1000;

const routes: FastifyPluginAsyncZod<{ limiteComptes: number; limiteBenevoles?: number; limiteConnexionParMin: number }> = async (app, opts) => {
  // Un verrou par prénom (et non global) : les échecs sur un compte n'en verrouillent pas un autre.
  const verrous = new Map<string, VerrouEchecs>();
  const verrouDe = (prenom: string) => {
    const cle = prenom.toLowerCase();
    let v = verrous.get(cle);
    if (!v) {
      if (verrous.size >= VERROUS_ADMIN_MAX) {
        for (const [c, verrou] of verrous) if (verrou.estInactif()) verrous.delete(c);
      }
      v = new VerrouEchecs(VERROU_ADMIN.seuil, VERROU_ADMIN.fenetreMs, VERROU_ADMIN.dureeMs);
      verrous.set(cle, v);
    }
    return v;
  };

  app.post(
    '/session',
    {
      config: { rateLimit: { max: opts.limiteConnexionParMin, timeWindow: '1 minute' } },
      schema: {
        tags: ['Administration'],
        summary: 'Ouvrir une session d’administration (compte nominatif)',
        description:
          'Le prénom identifie le compte admin, créé et géré par un super-admin (voir /admin/comptes-admin). La session est ouverte par un cookie HttpOnly (gc_admin).',
        body: z.object({ motDePasse: z.string().min(1).max(200), nom: z.string().trim().min(2).max(40) }),
        response: { 204: z.null(), 401: erreurSchema, 429: erreurSchema },
      },
    },
    async (request, reply) => {
      const prenom = request.body.nom.trim();
      const verrou = verrouDe(prenom);
      if (verrou.estVerrouille()) {
        throw new ErreurApi(429, 'ADMIN_VERROUILLE', `Trop d’échecs de connexion : réessaie dans ${verrou.minutesRestantes()} min.`);
      }
      const compte = await app.prisma.compteAdmin.findUnique({ where: { prenom } });
      // Toujours vérifier un hash (réel ou factice) : un prénom inconnu ne doit pas répondre plus
      // vite qu'un prénom existant avec un mauvais mot de passe (évite de deviner les prénoms).
      const motDePasseValide = await argon2.verify(compte?.motDePasseHash ?? (await hashFactice), request.body.motDePasse).catch(() => false);
      if (!compte || compte.bloque || !motDePasseValide) {
        const recents = verrou.echec();
        await app.journalSecurite(request, 'ADMIN_ECHEC_CONNEXION', { nom: prenom });
        if (verrou.estVerrouille()) {
          await app.journalSecurite(request, 'ADMIN_VERROUILLE', { nom: prenom, dureeMinutes: verrou.minutesRestantes() });
        }
        request.log.warn({ ip: request.ip, echecsRecents: recents }, 'Échec de connexion admin');
        throw new ErreurApi(401, 'IDENTIFIANTS_INVALIDES', 'Prénom ou mot de passe incorrect.');
      }
      await app.prisma.compteAdmin.update({ where: { id: compte.id }, data: { derniereConnexionAt: new Date() } });
      await app.journalSecurite(request, 'ADMIN_CONNEXION', { nom: prenom });
      await app.ouvrirSessionAdmin(reply, compte);
      return reply.status(204).send(null);
    },
  );

  // Sans authentification : efface le cookie, même si la session a déjà expiré.
  app.delete(
    '/session',
    { schema: { tags: ['Administration'], summary: 'Fermer la session d’administration', response: { 204: z.null() } } },
    async (request, reply) => {
      await app.fermerSessionAdmin(request, reply);
      return reply.status(204).send(null);
    },
  );

  // Toutes les autres routes demandent une session d'administration.
  await app.register(async (contexte) => {
    const prive = contexte.withTypeProvider<ZodTypeProvider>();
    // preValidation (avant la validation du corps) : une requête non autorisée est refusée en
    // 401/403 sans que son contenu soit examiné.
    prive.addHook('preValidation', app.authenticateAdmin);
    // Après authenticateAdmin (les hooks s'exécutent dans l'ordre) : un bénévole n'atteint que les
    // routes de ROUTES_BENEVOLE, tout le reste est refusé et journalisé.
    prive.addHook('preValidation', async (request) => {
      if (request.compteAdmin?.role !== 'BENEVOLE') return;
      const chemin = (request.routeOptions.url ?? '').replace(/^\/api\/admin/, '');
      if (!ROUTES_BENEVOLE.has(`${request.method} ${chemin}`)) {
        await app.journalSecurite(request, 'ADMIN_ACCES_BENEVOLE_REFUSE', { compteId: request.compteAdmin.id, route: `${request.method} ${chemin}` });
        throw new ErreurApi(403, 'ACCES_REFUSE', 'Ton compte bénévole donne accès au Jour J et aux vêtements seulement.');
      }
    });

    await prive.register(routesGeneral);
    await prive.register(routesModeration);
    await prive.register(routesComptes, { limiteComptes: opts.limiteComptes, limiteBenevoles: opts.limiteBenevoles });
    await prive.register(routesStand);
    await prive.register(routesEvenements);
    await prive.register(routesAnnonce);
  });
};

export default routes;
