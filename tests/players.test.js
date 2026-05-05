// tests/players.test.js
// Tests para lógica de jugadores y validación de datos

import { describe, it, expect } from 'vitest';

// ─────────────────────────────────────────────────────────────────────
//  ensurePlayerStructure — migración de datos PvP
// ─────────────────────────────────────────────────────────────────────

// Reimplementamos la lógica central para testear sin dependencias de KV
function ensurePlayerStructure(player) {
  if (!player) return player;

  // Asegurar que pvp.current, pvp.wins, pvp.losses existan
  if (!player.pvp) player.pvp = {};
  if (!player.pvp.current) player.pvp.current = {};
  if (!player.pvp.season_max) player.pvp.season_max = {};
  if (!player.pvp.wins) player.pvp.wins = {};
  if (!player.pvp.losses) player.pvp.losses = {};

  // Migrar formato antiguo a nuevo
  const brackets = { shuffle: 'rs', '2v2': 'r2', '3v3': 'r3', rbg: 'rbg', blitz: 'bgs' };
  for (const [oldKey, newKey] of Object.entries(brackets)) {
    const old = player.pvp[oldKey];
    if (old && typeof old === 'object' && old.rating !== undefined) {
      player.pvp.current[newKey] = old.rating || 0;
      player.pvp.wins[newKey] = old.record?.wins || old.wins || 0;
      player.pvp.losses[newKey] = old.record?.losses || old.losses || 0;
      delete player.pvp[oldKey];
    }
  }

  // Asegurar season_max
  const maxKeys = { rs: 'max_rs', r2: 'max_r2', r3: 'max_r3', rbg: 'max_rbg', bgs: 'max_bgs' };
  for (const [cur, maxKey] of Object.entries(maxKeys)) {
    const current = player.pvp.current[cur] || 0;
    const existing = player.pvp.season_max[maxKey] || 0;
    player.pvp.season_max[maxKey] = Math.max(current, existing);
  }

  // Peak ratings
  if (!player.peak_ratings) player.peak_ratings = {};

  return player;
}

describe('ensurePlayerStructure', () => {
  it('maneja player null', () => {
    expect(ensurePlayerStructure(null)).toBeNull();
  });

  it('crea estructura PvP si no existe', () => {
    const p = ensurePlayerStructure({ name: 'Test' });
    expect(p.pvp).toBeDefined();
    expect(p.pvp.current).toBeDefined();
    expect(p.pvp.season_max).toBeDefined();
    expect(p.pvp.wins).toBeDefined();
    expect(p.pvp.losses).toBeDefined();
  });

  it('migra formato antiguo (shuffle con rating)', () => {
    const p = ensurePlayerStructure({
      pvp: {
        shuffle: { rating: 1800, record: { wins: 50, losses: 30 } },
      },
    });
    expect(p.pvp.current.rs).toBe(1800);
    expect(p.pvp.wins.rs).toBe(50);
    expect(p.pvp.losses.rs).toBe(30);
    expect(p.pvp.shuffle).toBeUndefined(); // migrado, eliminado
  });

  it('migra formato antiguo (2v2 con rating)', () => {
    const p = ensurePlayerStructure({
      pvp: {
        '2v2': { rating: 1500, record: { wins: 20, losses: 10 } },
      },
    });
    expect(p.pvp.current.r2).toBe(1500);
    expect(p.pvp.wins.r2).toBe(20);
    expect(p.pvp.losses.r2).toBe(10);
  });

  it('no sobreescribe season_max si ya es mayor', () => {
    const p = ensurePlayerStructure({
      pvp: {
        current: { rs: 1500 },
        season_max: { max_rs: 1800 },
      },
    });
    expect(p.pvp.season_max.max_rs).toBe(1800);
  });

  it('actualiza season_max si current es mayor', () => {
    const p = ensurePlayerStructure({
      pvp: {
        current: { rs: 2000 },
        season_max: { max_rs: 1800 },
      },
    });
    expect(p.pvp.season_max.max_rs).toBe(2000);
  });

  it('preserva datos existentes al crear estructura', () => {
    const p = ensurePlayerStructure({
      name: 'Mitzukyhs',
      realm: 'quelthalas',
      pvp: { current: { r3: 2100 } },
    });
    expect(p.name).toBe('Mitzukyhs');
    expect(p.realm).toBe('quelthalas');
    expect(p.pvp.current.r3).toBe(2100);
  });

  it('inicializa peak_ratings si no existe', () => {
    const p = ensurePlayerStructure({ name: 'Test' });
    expect(p.peak_ratings).toBeDefined();
  });
});

// ─────────────────────────────────────────────────────────────────────
//  Validación de IDs de jugador
// ─────────────────────────────────────────────────────────────────────

function isValidPlayerId(id) {
  if (!id || typeof id !== 'string') return false;
  const parts = id.split('-');
  if (parts.length < 2) return false;
  const name = parts[0];
  const realm = parts.slice(1).join('-');
  return name.length >= 2 && name.length <= 24 && realm.length >= 2;
}

describe('isValidPlayerId', () => {
  it('acepta IDs válidos', () => {
    expect(isValidPlayerId('mitzukyhs-quelthalas')).toBe(true);
    expect(isValidPlayerId('kindavion-ragnaros')).toBe(true);
    expect(isValidPlayerId('test-los-errantes')).toBe(true);
  });

  it('rechaza IDs inválidos', () => {
    expect(isValidPlayerId('')).toBe(false);
    expect(isValidPlayerId(null)).toBe(false);
    expect(isValidPlayerId('solounnombre')).toBe(false);
    expect(isValidPlayerId('a-b')).toBe(false); // nombre muy corto
  });
});
