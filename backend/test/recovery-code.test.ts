import { describe, expect, it } from 'vitest';
import { genererPseudo } from '../src/lib/pseudo.js';
import { analyserCode, genererCode } from '../src/lib/recovery-code.js';

describe('code de récupération', () => {
  it('a le format XXXX-XXXX-XXXX-XXXX et se découpe en sélecteur + vérificateur', () => {
    const { code, selecteur, verificateur } = genererCode();
    expect(code).toMatch(/^[0-9A-HJKMNP-TV-Z]{4}(-[0-9A-HJKMNP-TV-Z]{4}){3}$/);
    expect(selecteur).toHaveLength(6);
    expect(verificateur).toHaveLength(10);
    expect(analyserCode(code)).toEqual({ selecteur, verificateur });
  });

  it('tolère minuscules, espaces et confusions O/0, I/1, L/1', () => {
    expect(analyserCode('0001 1111 aaaa bbbb')).toEqual(analyserCode('OOOI-ILIL-AAAA-BBBB'));
  });

  it('refuse les codes mal formés', () => {
    expect(analyserCode('')).toBeNull();
    expect(analyserCode('ABCD-EFGH')).toBeNull();
    expect(analyserCode('ABCD-EFGH-JKMN-PQRU')).toBeNull(); // U n'est pas dans l'alphabet
  });

  it('génère des codes différents', () => {
    const codes = new Set(Array.from({ length: 1000 }, () => genererCode().code));
    expect(codes.size).toBe(1000);
  });
});

describe('pseudo', () => {
  it('est composé d’un animal, d’un adjectif et de deux chiffres', () => {
    expect(genererPseudo()).toMatch(/^[A-Z][a-z]+[A-Z][a-z]+\d{2}$/);
  });
});
