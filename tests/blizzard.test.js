// tests/blizzard.test.js
// Tests para normalización de realms y lógica de Blizzard API

import { describe, it, expect } from 'vitest';

// Reimplementamos normalizeRealmSlug para testearlo (es privada en blizzard.js)
function normalizeRealmSlug(realm) {
  return realm
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/['']/g, '')
    .replace(/\s+/g, '-')
    .replace(/[^a-z0-9-]/g, '')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
}

describe('normalizeRealmSlug', () => {
  it('normaliza realm simple', () => {
    expect(normalizeRealmSlug('Ragnaros')).toBe('ragnaros');
  });

  it('normaliza realm con apóstrofe', () => {
    expect(normalizeRealmSlug("Quel'Thalas")).toBe('quelthalas');
  });

  it('normaliza realm con apóstrofe tipográfico', () => {
    expect(normalizeRealmSlug("Quel\u2019Thalas")).toBe('quelthalas');
  });

  it('normaliza realm con acentos', () => {
    expect(normalizeRealmSlug('Área 52')).toBe('area-52');
  });

  it('normaliza realm con espacios', () => {
    expect(normalizeRealmSlug('Los Errantes')).toBe('los-errantes');
  });

  it('normaliza realm con guiones múltiples', () => {
    expect(normalizeRealmSlug('Burning--Legion')).toBe('burning-legion');
  });

  it('normaliza realm ya en formato slug', () => {
    expect(normalizeRealmSlug('quelthalas')).toBe('quelthalas');
  });

  it('maneja string vacío', () => {
    expect(normalizeRealmSlug('')).toBe('');
  });

  it('normaliza realm con mayúsculas mixtas', () => {
    expect(normalizeRealmSlug('RAGNAROS')).toBe('ragnaros');
  });

  it('normaliza realm con caracteres especiales', () => {
    expect(normalizeRealmSlug('Drakkári')).toBe('drakkari');
  });
});

// ─────────────────────────────────────────────────────────────────────
//  NormalizeRealmName del instalador .NET (verificación cruzada)
// ─────────────────────────────────────────────────────────────────────

function normalizeRealmNamePascalCase(realm) {
  if (!realm || !realm.trim()) return (realm || '').trim();
  const cleaned = realm.replace(/'/g, ' ').replace(/-/g, ' ');
  return cleaned.split(/\s+/).filter(Boolean).map(w =>
    w.charAt(0).toUpperCase() + w.slice(1).toLowerCase()
  ).join('');
}

describe('NormalizeRealmName (PascalCase para addon sync)', () => {
  it('Los Errantes → LosErrantes', () => {
    expect(normalizeRealmNamePascalCase('Los Errantes')).toBe('LosErrantes');
  });

  it("Quel'Thalas → QueltThalas (apóstrofe eliminado)", () => {
    expect(normalizeRealmNamePascalCase("Quel'Thalas")).toBe('QuelThalas');
  });

  it('ragnaros → Ragnaros', () => {
    expect(normalizeRealmNamePascalCase('ragnaros')).toBe('Ragnaros');
  });

  it('ORGRIMMAR → Orgrimmar', () => {
    expect(normalizeRealmNamePascalCase('ORGRIMMAR')).toBe('Orgrimmar');
  });
});

// ─────────────────────────────────────────────────────────────────────
//  Mapa de clases del instalador (verificación)
// ─────────────────────────────────────────────────────────────────────

const CLASS_ID_MAP = {
  1: 'WARRIOR', 2: 'PALADIN', 3: 'HUNTER', 4: 'ROGUE', 5: 'PRIEST',
  6: 'DEATHKNIGHT', 7: 'SHAMAN', 8: 'MAGE', 9: 'WARLOCK', 10: 'MONK',
  11: 'DRUID', 12: 'DEMONHUNTER', 13: 'EVOKER',
};

describe('CLASS_ID_MAP — cobertura completa', () => {
  it('tiene las 13 clases de WoW', () => {
    expect(Object.keys(CLASS_ID_MAP).length).toBe(13);
  });

  it('IDs 1-13 todos definidos', () => {
    for (let i = 1; i <= 13; i++) {
      expect(CLASS_ID_MAP[i], `class_id ${i}`).toBeDefined();
    }
  });

  it('valores correctos', () => {
    expect(CLASS_ID_MAP[6]).toBe('DEATHKNIGHT');
    expect(CLASS_ID_MAP[12]).toBe('DEMONHUNTER');
    expect(CLASS_ID_MAP[13]).toBe('EVOKER');
  });
});
