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

async function creerType(nom: string, poidsMoyenGrammes?: number) {
  return app.inject({ method: 'POST', url: '/api/admin/vetements/types', headers: admin, payload: { nom, poidsMoyenGrammes } });
}
async function creerMatiere(nom: string, facteurEmissionKgCo2ParKg?: number, source?: string) {
  return app.inject({ method: 'POST', url: '/api/admin/vetements/matieres', headers: admin, payload: { nom, facteurEmissionKgCo2ParKg, source } });
}

describe('types de vêtements', () => {
  it('exige une session admin', async () => {
    expect((await app.inject({ method: 'GET', url: '/api/admin/vetements/types' })).statusCode).toBe(401);
  });

  it('crée un type avec un poids moyen facultatif', async () => {
    const sansPoids = await creerType('Écharpe');
    expect(sansPoids.statusCode).toBe(201);
    expect(sansPoids.json().poidsMoyenGrammes).toBeNull();

    const avecPoids = await creerType('Jean', 700);
    expect(avecPoids.statusCode).toBe(201);
    expect(avecPoids.json().poidsMoyenGrammes).toBe(700);
    expect(avecPoids.json().actif).toBe(true);
  });

  it('refuse un nom déjà utilisé', async () => {
    await creerType('Pull');
    const res = await creerType('Pull');
    expect(res.statusCode).toBe(409);
  });

  it('modifie un type, y compris pour le désactiver', async () => {
    const t = (await creerType('Chemise', 200)).json();
    const res = await app.inject({ method: 'PATCH', url: `/api/admin/vetements/types/${t.id}`, headers: admin, payload: { poidsMoyenGrammes: 220, actif: false } });
    expect(res.json()).toMatchObject({ poidsMoyenGrammes: 220, actif: false });
  });

  it('404 sur un type inconnu', async () => {
    expect((await app.inject({ method: 'PATCH', url: '/api/admin/vetements/types/999999', headers: admin, payload: { actif: false } })).statusCode).toBe(404);
    expect((await app.inject({ method: 'DELETE', url: '/api/admin/vetements/types/999999', headers: admin })).statusCode).toBe(404);
  });

  it('supprime un type jamais utilisé, mais refuse si des quantités existent', async () => {
    const libre = (await creerType('Robe')).json();
    expect((await app.inject({ method: 'DELETE', url: `/api/admin/vetements/types/${libre.id}`, headers: admin })).statusCode).toBe(204);

    const utilise = (await creerType('Manteau')).json();
    const matiere = (await creerMatiere('Laine-utilisee-type')).json();
    await app.inject({
      method: 'POST',
      url: '/api/admin/vetements/quantites/2026-11-10/incrementer',
      headers: admin,
      payload: { typeId: utilise.id, matiereId: matiere.id, sens: 'recuperes', delta: 1 },
    });
    const res = await app.inject({ method: 'DELETE', url: `/api/admin/vetements/types/${utilise.id}`, headers: admin });
    expect(res.statusCode).toBe(409);
  });
});

describe('matières', () => {
  it('crée une matière avec un facteur d’émission et sa source', async () => {
    const res = await creerMatiere('Coton bio', 4.5, 'ADEME Base Empreinte, 2024');
    expect(res.statusCode).toBe(201);
    expect(res.json()).toMatchObject({ nom: 'Coton bio', facteurEmissionKgCo2ParKg: 4.5, source: 'ADEME Base Empreinte, 2024', actif: true });
  });

  it('refuse un nom déjà utilisé', async () => {
    await creerMatiere('Lin');
    expect((await creerMatiere('Lin')).statusCode).toBe(409);
  });

  it('supprime une matière jamais utilisée, mais refuse si des quantités existent', async () => {
    const libre = (await creerMatiere('Soie')).json();
    expect((await app.inject({ method: 'DELETE', url: `/api/admin/vetements/matieres/${libre.id}`, headers: admin })).statusCode).toBe(204);

    const utilisee = (await creerMatiere('Cuir')).json();
    const type = (await creerType('Veste-matiere-utilisee')).json();
    await app.inject({
      method: 'POST',
      url: '/api/admin/vetements/quantites/2026-11-10/incrementer',
      headers: admin,
      payload: { typeId: type.id, matiereId: utilisee.id, sens: 'donnes', delta: 1 },
    });
    expect((await app.inject({ method: 'DELETE', url: `/api/admin/vetements/matieres/${utilisee.id}`, headers: admin })).statusCode).toBe(409);
  });
});

describe('quantités par journée', () => {
  it('incrémente, ne descend jamais sous zéro, et garde récupéré/donné indépendants', async () => {
    const type = (await creerType('T-shirt quantites', 180)).json();
    const matiere = (await creerMatiere('Polyester quantites', 8)).json();
    const date = '2026-11-11';

    await app.inject({ method: 'POST', url: `/api/admin/vetements/quantites/${date}/incrementer`, headers: admin, payload: { typeId: type.id, matiereId: matiere.id, sens: 'recuperes', delta: 10 } });
    const res = await app.inject({ method: 'POST', url: `/api/admin/vetements/quantites/${date}/incrementer`, headers: admin, payload: { typeId: type.id, matiereId: matiere.id, sens: 'recuperes', delta: -3 } });
    expect(res.json()).toMatchObject({ recuperes: 7, donnes: 0 });

    const sousZero = await app.inject({ method: 'POST', url: `/api/admin/vetements/quantites/${date}/incrementer`, headers: admin, payload: { typeId: type.id, matiereId: matiere.id, sens: 'donnes', delta: -5 } });
    expect(sousZero.json().donnes).toBe(0);
  });

  it('permet de corriger directement une quantité', async () => {
    const type = (await creerType('Jupe', 250)).json();
    const matiere = (await creerMatiere('Viscose', 6)).json();
    const date = '2026-11-12';
    const res = await app.inject({ method: 'PATCH', url: `/api/admin/vetements/quantites/${date}`, headers: admin, payload: { typeId: type.id, matiereId: matiere.id, sens: 'donnes', valeur: 25 } });
    expect(res.json().donnes).toBe(25);
  });

  it('liste la journée avec les noms de type et de matière', async () => {
    const type = (await creerType('Short', 150)).json();
    const matiere = (await creerMatiere('Coton short', 10)).json();
    const date = '2026-11-13';
    await app.inject({ method: 'PATCH', url: `/api/admin/vetements/quantites/${date}`, headers: admin, payload: { typeId: type.id, matiereId: matiere.id, sens: 'recuperes', valeur: 4 } });
    const res = await app.inject({ method: 'GET', url: `/api/admin/vetements/quantites/${date}`, headers: admin });
    expect(res.json()).toContainEqual({ typeId: type.id, type: 'Short', matiereId: matiere.id, matiere: 'Coton short', recuperes: 4, donnes: 0 });
  });
});

describe('bilan CO2', () => {
  it('calcule kg et CO2 évité à partir du poids moyen et du facteur d’émission', async () => {
    const type = (await creerType('T-shirt bilan', 200)).json(); // 0.2 kg/pièce
    const matiere = (await creerMatiere('Coton bilan', 10)).json(); // 10 kg CO2e/kg
    const date = '2026-11-14';
    // 5 récupérés, 2 donnés : 1 kg récupéré -> 10 kg CO2e ; 0.4 kg donné -> 4 kg CO2e
    await app.inject({ method: 'PATCH', url: `/api/admin/vetements/quantites/${date}`, headers: admin, payload: { typeId: type.id, matiereId: matiere.id, sens: 'recuperes', valeur: 5 } });
    await app.inject({ method: 'PATCH', url: `/api/admin/vetements/quantites/${date}`, headers: admin, payload: { typeId: type.id, matiereId: matiere.id, sens: 'donnes', valeur: 2 } });

    const res = await app.inject({ method: 'GET', url: '/api/admin/vetements/bilan', headers: admin });
    const m = res.json().parMatiere.find((x: { matiere: string }) => x.matiere === 'Coton bilan');
    expect(m).toMatchObject({ kgRecupere: 1, kgDonne: 0.4, co2EviteKg: 14 });
  });

  it('signale des données incomplètes quand un type ou une matière utilisé n’a pas de poids/facteur', async () => {
    const type = (await creerType('Casquette sans poids')).json();
    const matiere = (await creerMatiere('Matière sans facteur')).json();
    await app.inject({
      method: 'POST',
      url: '/api/admin/vetements/quantites/2026-11-15/incrementer',
      headers: admin,
      payload: { typeId: type.id, matiereId: matiere.id, sens: 'recuperes', delta: 3 },
    });
    const res = await app.inject({ method: 'GET', url: '/api/admin/vetements/bilan', headers: admin });
    expect(res.json().donneesIncompletes).toBe(true);
  });

  it('expose au public uniquement les totaux de la collecte, sans session', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/vetements/collecte' });
    expect(res.statusCode).toBe(200);
    const c = res.json();
    // Pas de détail par journée, type ou matière : seulement des totaux.
    expect(Object.keys(c).sort()).toEqual([
      'co2EviteDonneKg', 'co2EviteRecupereKg', 'donneesIncompletes', 'nombreDonnes', 'nombreRecuperes', 'poidsDonneKg', 'poidsRecupereKg',
    ]);
    // Au moins les quantités créées plus haut dans ce fichier (d'autres fichiers en ajoutent en parallèle).
    expect(c.nombreRecuperes).toBeGreaterThanOrEqual(8);
    expect(c.nombreDonnes).toBeGreaterThanOrEqual(2);
    expect(c.poidsRecupereKg).toBeGreaterThanOrEqual(1);
    expect(c.co2EviteDonneKg).toBeGreaterThanOrEqual(4);
    expect(c.donneesIncompletes).toBe(true);
  });
});

describe('export CSV des vêtements', () => {
  it('exporte date, type, matière, quantités, poids et facteur', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/admin/export/vetements', headers: admin });
    expect(res.statusCode).toBe(200);
    expect(res.headers['content-type']).toContain('text/csv');
    const lignes = res.body.replace('﻿', '').trim().split('\r\n');
    expect(lignes[0]).toBe('date;type;matiere;recuperes;donnes;poids_moyen_g;facteur_emission_kg_co2_par_kg');
  });
});
