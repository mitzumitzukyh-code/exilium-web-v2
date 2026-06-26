// tests/casino.test.js
// Tests para el motor de la ruleta europea de la Sala de PandaCoins.

import { describe, it, expect } from 'vitest';
import {
  WHEEL_SEQUENCE, RED_NUMBERS, colorOf,
  payoutMultiplier, checkWin, resolveBets,
  isValidBetKey, isValidSplit, isValidCorner, isValidStreet, isValidSixLine,
} from '../worker/casino.js';

// ─────────────────────────────────────────────────────────────────────
//  Integridad de la ruleta europea
// ─────────────────────────────────────────────────────────────────────

describe('WHEEL_SEQUENCE — ruleta europea', () => {
  it('tiene 37 sectores (0-36)', () => {
    expect(WHEEL_SEQUENCE.length).toBe(37);
    const set = new Set(WHEEL_SEQUENCE);
    expect(set.size).toBe(37); // sin duplicados
    for (let i = 0; i <= 36; i++) expect(set.has(i)).toBe(true);
  });

  it('empieza con el 0', () => {
    expect(WHEEL_SEQUENCE[0]).toBe(0);
  });

  it('respeta la secuencia europea real', () => {
    // Verificar algunas posiciones conocidas
    expect(WHEEL_SEQUENCE[1]).toBe(32);
    expect(WHEEL_SEQUENCE[2]).toBe(15);
    expect(WHEEL_SEQUENCE[36]).toBe(26); // última posición
  });

  it('RED_NUMBERS tiene 18 elementos rojos', () => {
    expect(RED_NUMBERS.size).toBe(18);
  });

  it('todos los rojos están entre 1 y 36', () => {
    for (const n of RED_NUMBERS) {
      expect(n).toBeGreaterThanOrEqual(1);
      expect(n).toBeLessThanOrEqual(36);
    }
  });
});

describe('colorOf', () => {
  it('el 0 es verde', () => {
    expect(colorOf(0)).toBe('green');
  });

  it('los números rojos son rojos', () => {
    expect(colorOf(1)).toBe('red');
    expect(colorOf(36)).toBe('red');
    expect(colorOf(32)).toBe('red');
  });

  it('los números negros son negros', () => {
    expect(colorOf(2)).toBe('black');
    expect(colorOf(11)).toBe('black');
    expect(colorOf(20)).toBe('black');
  });

  it('ningún rojo se reporta como negro y viceversa', () => {
    for (let n = 1; n <= 36; n++) {
      const c = colorOf(n);
      expect(['red', 'black']).toContain(c);
      if (RED_NUMBERS.has(n)) expect(c).toBe('red');
      else expect(c).toBe('black');
    }
  });
});

// ─────────────────────────────────────────────────────────────────────
//  payoutMultiplier
// ─────────────────────────────────────────────────────────────────────

describe('payoutMultiplier', () => {
  it('número directo = 35', () => {
    expect(payoutMultiplier('number:0')).toBe(35);
    expect(payoutMultiplier('number:17')).toBe(35);
    expect(payoutMultiplier('number:36')).toBe(35);
  });

  it('docena = 2', () => {
    expect(payoutMultiplier('dozen:1')).toBe(2);
    expect(payoutMultiplier('dozen:2')).toBe(2);
    expect(payoutMultiplier('dozen:3')).toBe(2);
  });

  it('columna = 2', () => {
    expect(payoutMultiplier('col:1')).toBe(2);
    expect(payoutMultiplier('col:2')).toBe(2);
    expect(payoutMultiplier('col:3')).toBe(2);
  });

  it('color/paridad/mitad = 1', () => {
    expect(payoutMultiplier('color:red')).toBe(1);
    expect(payoutMultiplier('color:black')).toBe(1);
    expect(payoutMultiplier('parity:even')).toBe(1);
    expect(payoutMultiplier('parity:odd')).toBe(1);
    expect(payoutMultiplier('half:low')).toBe(1);
    expect(payoutMultiplier('half:high')).toBe(1);
  });

  it('tipo inválido = 0', () => {
    expect(payoutMultiplier('invalid')).toBe(0);
    expect(payoutMultiplier('foo:bar')).toBe(0);
  });
});

// ─────────────────────────────────────────────────────────────────────
//  checkWin — resolución de cada tipo de apuesta
// ─────────────────────────────────────────────────────────────────────

describe('checkWin', () => {
  describe('número directo', () => {
    it('gana si coincide', () => {
      expect(checkWin(17, 'number:17')).toBe(true);
    });
    it('pierde si no coincide', () => {
      expect(checkWin(17, 'number:18')).toBe(false);
    });
    it('el 0 apostado directo gana con el 0', () => {
      expect(checkWin(0, 'number:0')).toBe(true);
    });
  });

  describe('apuestas exteriores con el 0', () => {
    it('el 0 pierde en todas las apuestas exteriores', () => {
      expect(checkWin(0, 'color:red')).toBe(false);
      expect(checkWin(0, 'color:black')).toBe(false);
      expect(checkWin(0, 'parity:even')).toBe(false);
      expect(checkWin(0, 'parity:odd')).toBe(false);
      expect(checkWin(0, 'half:low')).toBe(false);
      expect(checkWin(0, 'half:high')).toBe(false);
      expect(checkWin(0, 'dozen:1')).toBe(false);
      expect(checkWin(0, 'col:1')).toBe(false);
    });
  });

  describe('color', () => {
    it('rojo gana con número rojo', () => {
      expect(checkWin(1, 'color:red')).toBe(true);
      expect(checkWin(36, 'color:red')).toBe(true);
    });
    it('rojo pierde con número negro', () => {
      expect(checkWin(2, 'color:red')).toBe(false);
      expect(checkWin(11, 'color:red')).toBe(false);
    });
    it('negro gana con número negro', () => {
      expect(checkWin(2, 'color:black')).toBe(true);
    });
  });

  describe('paridad', () => {
    it('par gana con pares', () => {
      expect(checkWin(2, 'parity:even')).toBe(true);
      expect(checkWin(36, 'parity:even')).toBe(true);
    });
    it('impar gana con impares', () => {
      expect(checkWin(1, 'parity:odd')).toBe(true);
      expect(checkWin(35, 'parity:odd')).toBe(true);
    });
    it('par pierde con impares', () => {
      expect(checkWin(1, 'parity:even')).toBe(false);
    });
  });

  describe('mitad', () => {
    it('1-18 (low)', () => {
      expect(checkWin(1, 'half:low')).toBe(true);
      expect(checkWin(18, 'half:low')).toBe(true);
      expect(checkWin(19, 'half:low')).toBe(false);
    });
    it('19-36 (high)', () => {
      expect(checkWin(19, 'half:high')).toBe(true);
      expect(checkWin(36, 'half:high')).toBe(true);
      expect(checkWin(18, 'half:high')).toBe(false);
    });
  });

  describe('docena', () => {
    it('1ª docena (1-12)', () => {
      expect(checkWin(1, 'dozen:1')).toBe(true);
      expect(checkWin(12, 'dozen:1')).toBe(true);
      expect(checkWin(13, 'dozen:1')).toBe(false);
    });
    it('2ª docena (13-24)', () => {
      expect(checkWin(13, 'dozen:2')).toBe(true);
      expect(checkWin(24, 'dozen:2')).toBe(true);
      expect(checkWin(12, 'dozen:2')).toBe(false);
    });
    it('3ª docena (25-36)', () => {
      expect(checkWin(25, 'dozen:3')).toBe(true);
      expect(checkWin(36, 'dozen:3')).toBe(true);
      expect(checkWin(24, 'dozen:3')).toBe(false);
    });
  });

  describe('columna (2:1)', () => {
    it('columna 1: 1,4,7,...,34 (n % 3 === 1)', () => {
      expect(checkWin(1, 'col:1')).toBe(true);
      expect(checkWin(4, 'col:1')).toBe(true);
      expect(checkWin(34, 'col:1')).toBe(true);
      expect(checkWin(2, 'col:1')).toBe(false);
    });
    it('columna 2: 2,5,8,...,35 (n % 3 === 2)', () => {
      expect(checkWin(2, 'col:2')).toBe(true);
      expect(checkWin(5, 'col:2')).toBe(true);
      expect(checkWin(35, 'col:2')).toBe(true);
      expect(checkWin(3, 'col:2')).toBe(false);
    });
    it('columna 3: 3,6,9,...,36 (n % 3 === 0)', () => {
      expect(checkWin(3, 'col:3')).toBe(true);
      expect(checkWin(6, 'col:3')).toBe(true);
      expect(checkWin(36, 'col:3')).toBe(true);
      expect(checkWin(1, 'col:3')).toBe(false);
    });
  });
});

// ─────────────────────────────────────────────────────────────────────
//  resolveBets — integración de payout
// ─────────────────────────────────────────────────────────────────────

describe('resolveBets', () => {
  it('apuesta ganadora a número directo paga 35:1', () => {
    const result = resolveBets(17, [{ bet_key: 'number:17', amount: 100 }]);
    // net = 100 * 35 = 3500
    expect(result.total_win).toBe(3500);
    expect(result.total_bet).toBe(100);
    expect(result.details[0].won).toBe(true);
    expect(result.details[0].net).toBe(3500);
  });

  it('apuesta perdedora no paga nada', () => {
    const result = resolveBets(18, [{ bet_key: 'number:17', amount: 100 }]);
    expect(result.total_win).toBe(0);
    expect(result.total_bet).toBe(100);
    expect(result.details[0].won).toBe(false);
    expect(result.details[0].net).toBe(0);
  });

  it('apuesta a docena ganadora paga 2:1', () => {
    const result = resolveBets(5, [{ bet_key: 'dozen:1', amount: 200 }]);
    // net = 200 * 2 = 400
    expect(result.total_win).toBe(400);
    expect(result.details[0].net).toBe(400);
  });

  it('apuesta a color ganadora paga 1:1', () => {
    const result = resolveBets(1, [{ bet_key: 'color:red', amount: 500 }]);
    expect(result.total_win).toBe(500);
  });

  it('apuesta a columna ganadora paga 2:1', () => {
    const result = resolveBets(3, [{ bet_key: 'col:3', amount: 150 }]);
    expect(result.total_win).toBe(300);
  });

  it('múltiples apuestas mezcladas', () => {
    const bets = [
      { bet_key: 'number:17', amount: 100 },   // gana → 3500
      { bet_key: 'color:red', amount: 100 },    // 17 no es rojo → pierde
      { bet_key: 'dozen:1', amount: 200 },      // 17 no está en 1-12 → pierde
    ];
    const result = resolveBets(17, bets);
    expect(result.total_bet).toBe(400);
    expect(result.total_win).toBe(3500);
    expect(result.details).toHaveLength(3);
    expect(result.details[0].won).toBe(true);
    expect(result.details[1].won).toBe(false);
    expect(result.details[2].won).toBe(false);
  });

  it('todas las apuestas pierden cuando sale 0 (sin apostar al 0)', () => {
    const bets = [
      { bet_key: 'color:red', amount: 100 },
      { bet_key: 'dozen:1', amount: 100 },
      { bet_key: 'half:low', amount: 100 },
    ];
    const result = resolveBets(0, bets);
    expect(result.total_win).toBe(0);
    expect(result.total_bet).toBe(300);
    expect(result.details.every(d => d.won === false)).toBe(true);
  });

  it('apostar al 0 directo y que salga 0 paga 35:1', () => {
    const result = resolveBets(0, [{ bet_key: 'number:0', amount: 50 }]);
    expect(result.total_win).toBe(1750); // 50 * 35
  });

  it('maneja amounts inválidos como 0', () => {
    const result = resolveBets(17, [
      { bet_key: 'number:17', amount: 'invalid' },
      { bet_key: 'number:17', amount: null },
    ]);
    expect(result.total_bet).toBe(0);
    expect(result.total_win).toBe(0);
  });

  it('payout = apuesta + ganancia (devolución incluida)', () => {
    // Si apuesto 100 al 17 y gana, recupero 100 + 3500 = 3600 total
    const result = resolveBets(17, [{ bet_key: 'number:17', amount: 100 }]);
    const payout = result.total_bet + result.total_win;
    expect(payout).toBe(3600);
  });
});
