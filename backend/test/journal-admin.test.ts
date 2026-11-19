import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { buildApp } from '../src/app.js';
import { loadConfig } from '../src/config.js';
import { connecterAdmin } from './aide-admin.js';

let app: Awaited<ReturnType<typeof buildApp>>;
let headers: { authorization: string };
let prenom: string;

beforeAll(async () => {
  app = await buildApp(loadConfig({ ...process.env, ADMIN_ENABLED: 'true' }));
  const admin = await connecterAdmin(app, { prenom: 'Journal' });
  headers = { authorization: admin.authorization };
  prenom = admin.prenom;
});

afterAll(() => app.close());

// Les fichiers de test partagent la même base : on ne lit que les actions de ce compte.
async function actions(action: string) {
  return app.prisma.actionAdmin.findMany({ where: { auteur: prenom, action }, orderBy: { createdAt: 'asc' } });
}

const suffixe = () => randomUUID().slice(0, 8);

describe('journal des actions admin', () => {
  it('trace la création, la modification et la suppression d’un évènement', async () => {
    const titre = `Atelier ${suffixe()}`;
    const cree = await app.inject({ method: 'POST', url: '/api/admin/evenements', headers, payload: { titre, dateDebut: '2031-05-01T10:00:00.000Z' } });
    expect(cree.statusCode).toBe(201);
    const id = cree.json().id;

    await app.inject({ method: 'PATCH', url: `/api/admin/evenements/${id}`, headers, payload: { statut: 'PUBLIE' } });
    await app.inject({ method: 'DELETE', url: `/api/admin/evenements/${id}`, headers });

    expect((await actions('CREATION_EVENEMENT')).map((a) => [a.cible, a.details])).toContainEqual([titre, { statut: 'BROUILLON' }]);
    expect((await actions('MODIFICATION_EVENEMENT')).map((a) => [a.cible, a.details])).toContainEqual([titre, { champs: 'statut', statut: 'PUBLIE' }]);
    expect((await actions('SUPPRESSION_EVENEMENT')).map((a) => a.cible)).toContain(titre);
  });

  it('trace une saisie directe du compteur avec l’ancienne valeur, mais pas les +1/-1 du stand', async () => {
    const date = '2031-06-12';
    await app.inject({ method: 'POST', url: `/api/admin/compteurs/${date}/incrementer`, headers, payload: { delta: 1 } });
    await app.inject({ method: 'POST', url: `/api/admin/compteurs/${date}/incrementer`, headers, payload: { delta: 1 } });
    await app.inject({ method: 'PATCH', url: `/api/admin/compteurs/${date}`, headers, payload: { valeur: 40 } });

    const saisies = await actions('SAISIE_COMPTEUR_JOUR');
    expect(saisies.map((a) => [a.cible, a.details])).toContainEqual([date, { avant: 2, apres: 40 }]);
    const toutes = await app.prisma.actionAdmin.findMany({ where: { auteur: prenom, cible: date } });
    expect(toutes).toHaveLength(1);
  });

  it('trace le catalogue des vêtements et les corrections de quantité', async () => {
    const nomType = `Veste ${suffixe()}`;
    const nomMatiere = `Lin ${suffixe()}`;
    const type = (await app.inject({ method: 'POST', url: '/api/admin/vetements/types', headers, payload: { nom: nomType, poidsMoyenGrammes: 600 } })).json();
    const matiere = (await app.inject({ method: 'POST', url: '/api/admin/vetements/matieres', headers, payload: { nom: nomMatiere } })).json();
    await app.inject({ method: 'PATCH', url: `/api/admin/vetements/matieres/${matiere.id}`, headers, payload: { facteurEmissionKgCo2ParKg: 12.5 } });

    const date = '2031-06-13';
    await app.inject({
      method: 'PATCH',
      url: `/api/admin/vetements/quantites/${date}`,
      headers,
      payload: { typeId: type.id, matiereId: matiere.id, sens: 'recuperes', valeur: 7 },
    });

    expect((await actions('CREATION_TYPE_VETEMENT')).map((a) => [a.cible, a.details])).toContainEqual([nomType, { poidsMoyenGrammes: 600 }]);
    expect((await actions('CREATION_MATIERE')).map((a) => a.cible)).toContain(nomMatiere);
    expect((await actions('MODIFICATION_MATIERE')).map((a) => [a.cible, a.details])).toContainEqual([nomMatiere, { facteurEmissionKgCo2ParKg: 12.5 }]);
    expect((await actions('CORRECTION_QUANTITE_VETEMENT')).map((a) => [a.cible, a.details])).toContainEqual([
      `${date} · ${nomType} / ${nomMatiere}`,
      { sens: 'recuperes', avant: 0, apres: 7 },
    ]);
  });

  it('trace la suppression d’un type et d’une matière, mais pas une suppression refusée', async () => {
    const nomType = `Bonnet ${suffixe()}`;
    const type = (await app.inject({ method: 'POST', url: '/api/admin/vetements/types', headers, payload: { nom: nomType } })).json();
    await app.inject({ method: 'DELETE', url: `/api/admin/vetements/types/${type.id}`, headers });
    expect((await actions('SUPPRESSION_TYPE_VETEMENT')).map((a) => a.cible)).toContain(nomType);

    const nomUtilise = `Manteau ${suffixe()}`;
    const nomMatiere = `Laine ${suffixe()}`;
    const utilise = (await app.inject({ method: 'POST', url: '/api/admin/vetements/types', headers, payload: { nom: nomUtilise } })).json();
    const matiere = (await app.inject({ method: 'POST', url: '/api/admin/vetements/matieres', headers, payload: { nom: nomMatiere } })).json();
    await app.inject({
      method: 'PATCH',
      url: '/api/admin/vetements/quantites/2031-06-14',
      headers,
      payload: { typeId: utilise.id, matiereId: matiere.id, sens: 'donnes', valeur: 1 },
    });
    const refus = await app.inject({ method: 'DELETE', url: `/api/admin/vetements/matieres/${matiere.id}`, headers });
    expect(refus.statusCode).toBe(409);
    expect((await actions('SUPPRESSION_MATIERE')).map((a) => a.cible)).not.toContain(nomMatiere);
  });

  it('expose ces actions dans GET /journal', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/admin/journal', headers });
    expect(res.statusCode).toBe(200);
    expect(res.json().some((a: { auteur: string; action: string }) => a.auteur === prenom && a.action === 'CREATION_EVENEMENT')).toBe(true);
  });
});
