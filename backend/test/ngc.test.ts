import { describe, expect, it } from 'vitest';
import { DEFIS } from '../prisma/defis.js';
import { ErreurSituation, ModeleNgc } from '../src/lib/ngc.js';
import { lundiDeLaSemaine, versDateIso } from '../src/lib/semaine.js';
import { QUESTIONS_STAND } from '../src/modules/bilans/questions-stand.js';

const ngc = new ModeleNgc();

describe('modèle Nos Gestes Climat', () => {
  it('calcule le bilan moyen français sans aucune réponse', () => {
    const r = ngc.calculerBilan({});
    // Ordre de grandeur de l'empreinte moyenne d'un Français selon le modèle (≈ 8 à 9 t CO2e/an).
    expect(r.totalKg).toBeGreaterThan(6000);
    expect(r.totalKg).toBeLessThan(12000);
    const somme = Object.values(r.parCategorie).reduce((a, b) => a + b, 0);
    expect(Math.abs(somme - r.totalKg)).toBeLessThan(1);
  });

  it('réagit aux réponses : moins de voiture et de viande = empreinte plus basse', () => {
    const moyen = ngc.calculerBilan({});
    const sobre = ngc.calculerBilan(
      ngc.validerSituation({
        'transport . voiture . utilisateur': 'jamais',
        'alimentation . plats . viande rouge . nombre': 0,
        'alimentation . plats . viande blanche . nombre': 0,
        'alimentation . plats . végétarien . nombre': 14,
      }),
    );
    expect(sobre.parCategorie.transport).toBeLessThan(moyen.parCategorie.transport);
    expect(sobre.parCategorie.alimentation).toBeLessThan(moyen.parCategorie.alimentation);
  });

  it('ne garde pas la situation d’un calcul au suivant', () => {
    const a = ngc.calculerBilan({});
    ngc.calculerBilan(ngc.validerSituation({ 'transport . voiture . km': 50000 }));
    expect(ngc.calculerBilan({}).totalKg).toBe(a.totalKg);
  });

  it('normalise les réponses (choix entre quotes, booléens en oui/non)', () => {
    expect(
      ngc.validerSituation({
        'logement . type': 'appartement',
        'transport . voiture . motorisation': "'électrique'",
        'transport . train . usager': true,
        'logement . habitants': 3,
      }),
    ).toEqual({
      'logement . type': "'appartement'",
      'transport . voiture . motorisation': "'électrique'",
      'transport . train . usager': 'oui',
      'logement . habitants': 3,
    });
  });

  it('refuse les clés inconnues, les mauvaises valeurs et les expressions publicodes', () => {
    const tenter = (s: Record<string, number | string | boolean>) => {
      try {
        ngc.validerSituation(s);
        return [];
      } catch (e) {
        return (e as ErreurSituation).erreurs.map((x) => x.champ);
      }
    };
    expect(tenter({ bilan: 0 })).toEqual(['bilan']); // pas une question
    expect(tenter({ 'transport . vacances': 'oui' })).toEqual(['transport . vacances']); // mosaïque
    expect(tenter({ 'logement . type': 'château' })).toEqual(['logement . type']);
    expect(tenter({ 'logement . habitants': -2 })).toEqual(['logement . habitants']);
    // Injection : une chaîne serait évaluée comme une formule par publicodes.
    expect(tenter({ 'transport . voiture . km': 'bilan * 0' })).toEqual(['transport . voiture . km']);
    expect(tenter({ 'logement . surface': '10 * 1000' })).toEqual(['logement . surface']);
  });

  it('applique les bornes du modèle, et celles du projet pour le bus et le métro', () => {
    const tenter = (s: Record<string, number>) => {
      try {
        ngc.validerSituation(s);
        return [];
      } catch (e) {
        return (e as ErreurSituation).erreurs.map((x) => x.message);
      }
    };
    const bus = 'transport . transports commun . bus . heures par semaine';
    expect(ngc.question(bus)).toMatchObject({ min: 0, max: 40 }); // le modèle n'en donne pas
    expect(ngc.question('alimentation . boisson . chaude . café . nombre')).toMatchObject({ min: 0, max: 10 });
    expect(ngc.question('logement . surface')).toMatchObject({ min: 1, max: 999 });
    expect(ngc.question('logement . type')).toMatchObject({ min: null, max: null });

    expect(tenter({ [bus]: 40, 'transport . transports commun . métro ou tram . heures par semaine': 40 })).toEqual([]);
    expect(tenter({ [bus]: 41 })).toEqual(['Valeur attendue : un nombre entre 0 et 40.']);
    expect(tenter({ 'transport . transports commun . métro ou tram . heures par semaine': 500 })).toHaveLength(1);
    expect(tenter({ 'alimentation . boisson . chaude . café . nombre': 11 })).toHaveLength(1);
    expect(tenter({ 'logement . surface': 0 })).toHaveLength(1);
    expect(tenter({ 'transport . voiture . km': 100_000 })).toHaveLength(1);
  });

  it('plafonne le total des repas à 14 par semaine', () => {
    const plats = (rouge: number, vege: number) => ({
      'alimentation . plats . viande rouge . nombre': rouge,
      'alimentation . plats . végétarien . nombre': vege,
    });
    expect(() => ngc.validerSituation(plats(7, 7))).not.toThrow();
    expect(() => ngc.validerSituation(plats(14, 0))).not.toThrow();
    try {
      ngc.validerSituation(plats(8, 7));
      expect.unreachable();
    } catch (e) {
      expect((e as ErreurSituation).erreurs).toEqual([
        { champ: 'alimentation . plats', message: 'Au plus 14 repas par semaine au total (midi et soir) : 15 renseignés.' },
      ]);
    }
  });

  it('connaît toutes les questions de la version stand', () => {
    for (const q of QUESTIONS_STAND) expect(ngc.question(q), q).toBeDefined();
    const voiture = ngc.question('transport . voiture . utilisateur')!;
    expect(voiture.type).toBe('choix');
    expect(voiture.possibilites.map((p) => p.valeur)).toContain('jamais');
    expect(ngc.question('transport . voiture . km')!.type).toBe('nombre');
    // Les questions oui/non doivent aussi exposer leurs deux réponses possibles (sinon le
    // front n'a aucun moyen de savoir quoi proposer).
    const train = ngc.question('transport . train . usager')!;
    expect(train.type).toBe('oui-non');
    expect(train.possibilites.map((p) => p.valeur)).toEqual(['oui', 'non']);
  });

  it('trouve toutes les actions du catalogue de défis dans le modèle', () => {
    for (const d of DEFIS) expect(ngc.existe(d.actionNgc), d.actionNgc).toBe(true);
    const gains = ngc.gainsActions(
      {},
      DEFIS.map((d) => d.actionNgc),
    );
    // Pour la situation moyenne, plusieurs défis ont un gain positif.
    expect(Object.values(gains).filter((g) => g > 0).length).toBeGreaterThanOrEqual(5);
  });

  it('personnalise les gains : réduire la viande ne rapporte rien à un végétarien', () => {
    const action = 'alimentation . repas . réduire viande . max 2 par semaine';
    const vegetarien = ngc.validerSituation({
      'alimentation . plats . viande rouge . nombre': 0,
      'alimentation . plats . viande blanche . nombre': 0,
      'alimentation . plats . poisson gras . nombre': 0,
      'alimentation . plats . poisson blanc . nombre': 0,
      'alimentation . plats . végétarien . nombre': 14,
    });
    expect(ngc.gainsActions({}, [action])[action]).toBeGreaterThan(0);
    expect(ngc.gainsActions(vegetarien, [action])[action]).toBe(0);
  });
});

describe('semaine', () => {
  it('ramène une date au lundi de sa semaine, heure de Paris', () => {
    expect(versDateIso(lundiDeLaSemaine(new Date('2026-12-03T10:00:00Z')))).toBe('2026-11-30'); // jeudi
    expect(versDateIso(lundiDeLaSemaine(new Date('2026-11-30T00:30:00Z')))).toBe('2026-11-30'); // lundi
    // Dimanche 23h30 UTC = lundi 0h30 à Paris : déjà la semaine suivante.
    expect(versDateIso(lundiDeLaSemaine(new Date('2026-12-06T23:30:00Z')))).toBe('2026-12-07');
  });
});
