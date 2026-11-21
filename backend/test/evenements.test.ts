import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { buildApp } from '../src/app.js';
import { loadConfig } from '../src/config.js';
import { connecterAdmin } from './aide-admin.js';

let app: Awaited<ReturnType<typeof buildApp>>;
let admin: Record<string, string>;

beforeAll(async () => {
  app = await buildApp(loadConfig({ ...process.env, ADMIN_ENABLED: 'true' }));
  admin = await connecterAdmin(app);
});

afterAll(() => app.close());

async function creer(payload: Record<string, unknown>) {
  return app.inject({ method: 'POST', url: '/api/admin/evenements', headers: admin, payload });
}

describe('évènements (page d’accueil)', () => {
  it('est un brouillon par défaut, invisible du public', async () => {
    const creation = await creer({ titre: 'Collecte textile', dateDebut: '2027-03-10T09:00:00.000Z' });
    expect(creation.statusCode).toBe(201);
    expect(creation.json().statut).toBe('BROUILLON');

    const publics = (await app.inject({ method: 'GET', url: '/api/evenements' })).json();
    expect(publics.find((e: { titre: string }) => e.titre === 'Collecte textile')).toBeUndefined();
  });

  it('apparaît publiquement une fois publié, et plus après dépublication', async () => {
    const creation = await creer({ titre: 'Stand de rentrée', dateDebut: '2027-04-01T09:00:00.000Z', statut: 'PUBLIE' });
    const id = creation.json().id;

    let publics = (await app.inject({ method: 'GET', url: '/api/evenements' })).json();
    expect(publics.map((e: { titre: string }) => e.titre)).toContain('Stand de rentrée');

    await app.inject({ method: 'PATCH', url: `/api/admin/evenements/${id}`, headers: admin, payload: { statut: 'BROUILLON' } });
    publics = (await app.inject({ method: 'GET', url: '/api/evenements' })).json();
    expect(publics.map((e: { titre: string }) => e.titre)).not.toContain('Stand de rentrée');
  });

  it('trie la liste publique par date de début croissante', async () => {
    await creer({ titre: 'Évènement tardif', dateDebut: '2027-06-01T09:00:00.000Z', statut: 'PUBLIE' });
    await creer({ titre: 'Évènement précoce', dateDebut: '2027-05-01T09:00:00.000Z', statut: 'PUBLIE' });
    const publics = (await app.inject({ method: 'GET', url: '/api/evenements' })).json();
    const dates = publics.map((e: { dateDebut: string | null }) => e.dateDebut).filter(Boolean);
    expect(dates).toEqual([...dates].sort());
  });

  it('ne renvoie ni description ni lieu quand ils ne sont pas fournis', async () => {
    const creation = await creer({ titre: 'Sans détails', dateDebut: '2027-07-01T09:00:00.000Z', statut: 'PUBLIE' });
    expect(creation.json().description).toBeNull();
    expect(creation.json().lieu).toBeNull();
  });

  it('accepte un évènement sans date, affiché avant les évènements datés', async () => {
    const creation = await creer({ titre: 'Version de test', description: 'Les données ne seront pas conservées.', statut: 'PUBLIE' });
    expect(creation.statusCode).toBe(201);
    expect(creation.json().dateDebut).toBeNull();
    expect(creation.json().dateFin).toBeNull();

    const publics = (await app.inject({ method: 'GET', url: '/api/evenements' })).json();
    const index = publics.findIndex((e: { titre: string }) => e.titre === 'Version de test');
    expect(index).toBeGreaterThanOrEqual(0);
    // Tous les évènements sans date passent avant le premier évènement daté.
    const premierDate = publics.findIndex((e: { dateDebut: string | null }) => e.dateDebut !== null);
    expect(premierDate === -1 || index < premierDate).toBe(true);
  });

  it('refuse une heure de fin sans date de début, et permet de retirer les dates', async () => {
    const finSeule = await creer({ titre: 'Fin sans début', dateFin: '2027-03-10T17:00:00.000Z' });
    expect(finSeule.statusCode).toBe(400);
    expect(finSeule.json().code).toBe('DATES_INCOHERENTES');

    const ok = await creer({ titre: 'Collecte datée', dateDebut: '2027-03-10T09:00:00.000Z', dateFin: '2027-03-10T17:00:00.000Z' });
    expect(ok.json().dateFin).toBe('2027-03-10T17:00:00.000Z');
    const url = `/api/admin/evenements/${ok.json().id}`;
    // Retirer le début en gardant la fin enregistrée : incohérent.
    const debutRetire = await app.inject({ method: 'PATCH', url, headers: admin, payload: { dateDebut: null } });
    expect(debutRetire.json().code).toBe('DATES_INCOHERENTES');
    const sansDates = await app.inject({ method: 'PATCH', url, headers: admin, payload: { dateDebut: null, dateFin: null } });
    expect(sansDates.statusCode).toBe(200);
    expect(sansDates.json().dateDebut).toBeNull();
  });

  it('refuse un titre vide', async () => {
    const res = await creer({ titre: '', dateDebut: '2027-03-10T09:00:00.000Z' });
    expect(res.statusCode).toBe(400);
  });

  it('refuse une date de début invalide', async () => {
    const res = await creer({ titre: 'Date invalide', dateDebut: 'pas-une-date' });
    expect(res.statusCode).toBe(400);
  });

  it('refuse une fin avant le début, à la création comme en modification partielle', async () => {
    const avant = await creer({ titre: 'Fin avant début', dateDebut: '2027-03-10T09:00:00.000Z', dateFin: '2027-03-10T08:00:00.000Z' });
    expect(avant.statusCode).toBe(400);
    expect(avant.json().code).toBe('DATES_INCOHERENTES');

    const ok = await creer({ titre: 'Dates cohérentes', dateDebut: '2027-03-10T09:00:00.000Z', dateFin: '2027-03-10T17:00:00.000Z' });
    expect(ok.statusCode).toBe(201);
    const url = `/api/admin/evenements/${ok.json().id}`;
    // Seul le début change : comparé avec la fin déjà enregistrée.
    const debutApresFin = await app.inject({ method: 'PATCH', url, headers: admin, payload: { dateDebut: '2027-03-10T18:00:00.000Z' } });
    expect(debutApresFin.json().code).toBe('DATES_INCOHERENTES');
    const finRetiree = await app.inject({ method: 'PATCH', url, headers: admin, payload: { dateDebut: '2027-03-10T18:00:00.000Z', dateFin: null } });
    expect(finRetiree.statusCode).toBe(200);
  });

  it('exige une session admin pour créer, lister, modifier ou supprimer', async () => {
    expect((await app.inject({ method: 'GET', url: '/api/admin/evenements' })).statusCode).toBe(401);
    expect((await app.inject({ method: 'POST', url: '/api/admin/evenements', payload: { titre: 'x', dateDebut: '2027-01-01T00:00:00.000Z' } })).statusCode).toBe(401);
    expect((await app.inject({ method: 'PATCH', url: '/api/admin/evenements/00000000-0000-0000-0000-000000000000', payload: { titre: 'x' } })).statusCode).toBe(401);
    expect((await app.inject({ method: 'DELETE', url: '/api/admin/evenements/00000000-0000-0000-0000-000000000000' })).statusCode).toBe(401);
  });

  it('liste tous les évènements côté admin, brouillons compris', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/admin/evenements', headers: admin });
    expect(res.statusCode).toBe(200);
    expect(res.json().some((e: { statut: string }) => e.statut === 'BROUILLON')).toBe(true);
  });

  it('404 sur un évènement inconnu, en modification comme en suppression', async () => {
    const id = '00000000-0000-0000-0000-000000000000';
    expect((await app.inject({ method: 'PATCH', url: `/api/admin/evenements/${id}`, headers: admin, payload: { titre: 'x' } })).statusCode).toBe(404);
    expect((await app.inject({ method: 'DELETE', url: `/api/admin/evenements/${id}`, headers: admin })).statusCode).toBe(404);
  });

  it('supprime définitivement un évènement', async () => {
    const creation = await creer({ titre: 'À supprimer', dateDebut: '2027-08-01T09:00:00.000Z', statut: 'PUBLIE' });
    const id = creation.json().id;

    expect((await app.inject({ method: 'DELETE', url: `/api/admin/evenements/${id}`, headers: admin })).statusCode).toBe(204);

    const publics = (await app.inject({ method: 'GET', url: '/api/evenements' })).json();
    expect(publics.map((e: { titre: string }) => e.titre)).not.toContain('À supprimer');
  });
});
