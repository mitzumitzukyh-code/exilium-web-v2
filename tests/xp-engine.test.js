// tests/xp-engine.test.js
// Tests para el motor de XP del Battle Pass

import { describe, it, expect } from 'vitest';
import { calculateBattlePass, LEVELS_TABLE, isHealerSpec } from '../worker/xp-engine.js';

// ─────────────────────────────────────────────────────────────────────
//  LEVELS_TABLE — integridad de la tabla
// ─────────────────────────────────────────────────────────────────────

describe('LEVELS_TABLE', () => {
  it('tiene 41 niveles (0-40)', () => {
    expect(LEVELS_TABLE.length).toBe(41);
  });

  it('nivel 0 requiere 0 XP', () => {
    const lvl0 = LEVELS_TABLE.find(l => l.level === 0);
    expect(lvl0).toBeDefined();
    expect(lvl0.xp).toBe(0);
  });

  it('nivel 40 requiere 15500 XP', () => {
    const lvl40 = LEVELS_TABLE.find(l => l.level === 40);
    expect(lvl40).toBeDefined();
    expect(lvl40.xp).toBe(15500);
  });

  it('está ordenada de mayor a menor nivel', () => {
    for (let i = 1; i < LEVELS_TABLE.length; i++) {
      expect(LEVELS_TABLE[i - 1].level).toBeGreaterThan(LEVELS_TABLE[i].level);
    }
  });

  it('XP es estrictamente creciente con el nivel', () => {
    const sorted = [...LEVELS_TABLE].sort((a, b) => a.level - b.level);
    for (let i = 1; i < sorted.length; i++) {
      expect(sorted[i].xp).toBeGreaterThan(sorted[i - 1].xp);
    }
  });

  it('rangos correctos por nivel', () => {
    const rankChecks = [
      { level: 0, rank: 'EXILIADO' },
      { level: 1, rank: 'INICIADO' },
      { level: 5, rank: 'INICIADO' },
      { level: 6, rank: 'PENITENTE' },
      { level: 11, rank: 'PENITENTE' },
      { level: 12, rank: 'SOMBRA' },
      { level: 17, rank: 'SOMBRA' },
      { level: 18, rank: 'APÓSTATA' },
      { level: 23, rank: 'APÓSTATA' },
      { level: 24, rank: 'ROMPEJURAMENTOS' },
      { level: 29, rank: 'ROMPEJURAMENTOS' },
      { level: 30, rank: 'HEREJE' },
      { level: 34, rank: 'HEREJE' },
      { level: 35, rank: 'PROFETA' },
      { level: 39, rank: 'PROFETA' },
      { level: 40, rank: 'EXARCA' },
    ];

    for (const check of rankChecks) {
      const entry = LEVELS_TABLE.find(l => l.level === check.level);
      expect(entry.rank, `Nivel ${check.level} debería ser ${check.rank}`).toBe(check.rank);
    }
  });

  it('valores XP críticos (niveles previamente bugueados)', () => {
    const critical = [
      { level: 8, xp: 850 },
      { level: 38, xp: 15320 },
      { level: 39, xp: 15420 },
      { level: 40, xp: 15500 },
    ];
    for (const c of critical) {
      const entry = LEVELS_TABLE.find(l => l.level === c.level);
      expect(entry.xp, `Nivel ${c.level} XP`).toBe(c.xp);
    }
  });
});

// ─────────────────────────────────────────────────────────────────────
//  calculateBattlePass — cálculos XP
// ─────────────────────────────────────────────────────────────────────

describe('calculateBattlePass', () => {
  it('retorna nivel 0 sin datos', () => {
    const bp = calculateBattlePass();
    expect(bp.total_xp).toBe(0);
    expect(bp.level).toBe(0);
    expect(bp.rank_name).toBe('EXILIADO');
  });

  it('retorna nivel 0 con ratings vacíos', () => {
    const bp = calculateBattlePass({ season_max: {} });
    expect(bp.total_xp).toBe(0);
    expect(bp.level).toBe(0);
  });

  it('calcula XP estándar correctamente (rating 1000)', () => {
    const bp = calculateBattlePass({ season_max: { max_rs: 1000 } });
    expect(bp.xp_breakdown.from_rs).toBe(50);
    expect(bp.total_xp).toBe(50);
    expect(bp.level).toBe(1);
    expect(bp.rank_name).toBe('INICIADO');
  });

  it('calcula XP estándar correctamente (rating 1800)', () => {
    const bp = calculateBattlePass({ season_max: { max_r2: 1800 } });
    expect(bp.xp_breakdown.from_r2).toBe(1050);
  });

  it('calcula XP estándar correctamente (rating 2400)', () => {
    const bp = calculateBattlePass({ season_max: { max_rs: 2400 } });
    expect(bp.xp_breakdown.from_rs).toBe(4550);
  });

  it('calcula XP 3v3 con tabla diferenciada', () => {
    const bp = calculateBattlePass({ season_max: { max_r3: 1800 } });
    expect(bp.xp_breakdown.from_r3).toBe(1300); // 3v3 = 1300 vs estándar = 1050
  });

  it('calcula XP 3v3 a 2400', () => {
    const bp = calculateBattlePass({ season_max: { max_r3: 2400 } });
    expect(bp.xp_breakdown.from_r3).toBe(5800);
  });

  it('suma XP de todos los brackets', () => {
    const bp = calculateBattlePass({
      season_max: { max_rs: 1000, max_r2: 1000, max_r3: 1000, max_rbg: 1000, max_bgs: 1000 },
    });
    // Cada bracket @1000 = 50 XP, r3 @1000 también = 50
    expect(bp.total_xp).toBe(250);
  });

  it('incluye manual_bonus en el total', () => {
    const bp = calculateBattlePass({ season_max: { max_rs: 1000 }, manual_bonus: 500 });
    expect(bp.xp_breakdown.manual_bonus).toBe(500);
    expect(bp.total_xp).toBe(550); // 50 + 500
  });

  it('rating entre umbrales usa el umbral inferior', () => {
    const bp = calculateBattlePass({ season_max: { max_rs: 1599 } });
    expect(bp.xp_breakdown.from_rs).toBe(300); // rating 1599 → umbral 1400 = 300
  });

  it('rating justo en umbral cuenta', () => {
    const bp = calculateBattlePass({ season_max: { max_rs: 1600 } });
    expect(bp.xp_breakdown.from_rs).toBe(550);
  });

  it('rating bajo 1000 da 0 XP', () => {
    const bp = calculateBattlePass({ season_max: { max_rs: 999 } });
    expect(bp.xp_breakdown.from_rs).toBe(0);
  });

  it('alcanza nivel 40 con ratings altos en todos los brackets', () => {
    const bp = calculateBattlePass({
      season_max: { max_rs: 2400, max_r2: 2400, max_r3: 2400, max_rbg: 2400, max_bgs: 2400 },
    });
    // 4×4550 + 1×5800 = 24000 → nivel 40
    expect(bp.total_xp).toBe(24000);
    expect(bp.level).toBe(40);
    expect(bp.rank_name).toBe('EXARCA');
  });

  it('aplica multiplicador healer a RBG', () => {
    const bp = calculateBattlePass(
      { season_max: { max_rbg: 1800 } },
      { isHealer: true, multiplier: 1.5 },
    );
    // RBG @1800 = 1050 × 1.5 = 1575
    expect(bp.xp_breakdown.from_rbg).toBe(1575);
    expect(bp.xp_breakdown.healer_bonus).toBeDefined();
    expect(bp.xp_breakdown.healer_bonus.multiplier).toBe(1.5);
    expect(bp.xp_breakdown.healer_bonus.rbg_base).toBe(1050);
  });

  it('no aplica multiplicador healer si isHealer = false', () => {
    const bp = calculateBattlePass(
      { season_max: { max_rbg: 1800 } },
      { isHealer: false, multiplier: 1.5 },
    );
    expect(bp.xp_breakdown.from_rbg).toBe(1050);
    expect(bp.xp_breakdown.healer_bonus).toBeUndefined();
  });

  it('no aplica multiplicador healer si multiplier = 1', () => {
    const bp = calculateBattlePass(
      { season_max: { max_rbg: 1800 } },
      { isHealer: true, multiplier: 1 },
    );
    expect(bp.xp_breakdown.from_rbg).toBe(1050);
  });
});

// ─────────────────────────────────────────────────────────────────────
//  isHealerSpec
// ─────────────────────────────────────────────────────────────────────

describe('isHealerSpec', () => {
  it('reconoce specs healer', () => {
    expect(isHealerSpec('Holy')).toBe(true);
    expect(isHealerSpec('Discipline')).toBe(true);
    expect(isHealerSpec('Restoration')).toBe(true);
    expect(isHealerSpec('Mistweaver')).toBe(true);
    expect(isHealerSpec('Preservation')).toBe(true);
  });

  it('rechaza specs no-healer', () => {
    expect(isHealerSpec('Arms')).toBe(false);
    expect(isHealerSpec('Fire')).toBe(false);
    expect(isHealerSpec('Retribution')).toBe(false);
    expect(isHealerSpec('Shadow')).toBe(false);
    expect(isHealerSpec('')).toBe(false);
    expect(isHealerSpec(null)).toBe(false);
  });
});

// ─────────────────────────────────────────────────────────────────────
//  Sincronización con addon Lua
// ─────────────────────────────────────────────────────────────────────

describe('Sincronización tablas XP con addon Lua', () => {
  // Estos valores deben coincidir EXACTAMENTE con EXILIUM_XP_SYSTEM.lua
  const ADDON_LEVELS = {
    0: 0, 1: 50, 2: 120, 3: 210, 4: 320, 5: 450, 6: 600, 7: 770, 8: 850,
    9: 960, 10: 1170, 11: 1400, 12: 1920, 13: 2210, 14: 2520, 15: 2850,
    16: 3200, 17: 3570, 18: 3960, 19: 4370, 20: 4800, 21: 5250, 22: 5720,
    23: 6210, 24: 6720, 25: 7250, 26: 7800, 27: 8370, 28: 8960, 29: 9570,
    30: 10200, 31: 10850, 32: 11520, 33: 12210, 34: 12920, 35: 13650,
    36: 14400, 37: 15170, 38: 15320, 39: 15420, 40: 15500,
  };

  it('todos los niveles del worker coinciden con el addon Lua', () => {
    for (const [level, xp] of Object.entries(ADDON_LEVELS)) {
      const entry = LEVELS_TABLE.find(l => l.level === parseInt(level, 10));
      expect(entry, `Nivel ${level} no encontrado en LEVELS_TABLE`).toBeDefined();
      expect(entry.xp, `Nivel ${level}: worker=${entry.xp} vs addon=${xp}`).toBe(xp);
    }
  });
});
