import { describe, expect, it } from 'vitest';
import { cibleLisible, confirmationDemandee, nomDeLaBase } from '../src/lib/suppression.js';

// Le script lui-même (src/outils/suppression-finale.ts) n'est pas lancé ici : il viderait la base
// de test partagée par les autres fichiers. Il a été essayé sur une base jetable (voir RGPD.md §6).
describe('suppression de fin de projet', () => {
  const url = 'postgresql://greencampus:motdepasse-secret@db.exemple.fr:5432/greencampus?sslmode=require';

  it('lit le nom de la base visée dans DATABASE_URL', () => {
    expect(nomDeLaBase(url)).toBe('greencampus');
  });

  it("affiche la cible sans jamais montrer le mot de passe", () => {
    expect(cibleLisible(url)).toBe('db.exemple.fr:5432/greencampus');
    expect(cibleLisible(url)).not.toContain('motdepasse');
  });

  it('ne supprime rien sans --confirmer, et lit le nom retapé', () => {
    expect(confirmationDemandee([])).toBeNull();
    expect(confirmationDemandee(['--confirmer', 'greencampus'])).toBe('greencampus');
    expect(confirmationDemandee(['--confirmer'])).toBe('');
  });
});
