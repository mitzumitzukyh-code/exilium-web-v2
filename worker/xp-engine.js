// worker/xp-engine.js

const STANDARD_XP_TABLE = [
  { rating: 2400, xp: 4550 },
  { rating: 2100, xp: 2550 },
  { rating: 1800, xp: 1050 },
  { rating: 1600, xp: 550 },
  { rating: 1400, xp: 300 },
  { rating: 1200, xp: 150 },
  { rating: 1000, xp: 50 },
];

const THREE_V_THREE_XP_TABLE = [
  { rating: 2400, xp: 5800 },
  { rating: 2100, xp: 3300 },
  { rating: 1800, xp: 1300 },
  { rating: 1600, xp: 550 },
  { rating: 1400, xp: 300 },
  { rating: 1200, xp: 150 },
  { rating: 1000, xp: 50 },
];

export const LEVELS_TABLE = [
  { level: 40, xp: 15500, rank: 'EXARCA' },
  { level: 39, xp: 15420, rank: 'PROFETA' },
  { level: 38, xp: 15320, rank: 'PROFETA' },
  { level: 37, xp: 15170, rank: 'PROFETA' },
  { level: 36, xp: 14400, rank: 'PROFETA' },
  { level: 35, xp: 13650, rank: 'PROFETA' },
  { level: 34, xp: 12920, rank: 'HEREJE' },
  { level: 33, xp: 12210, rank: 'HEREJE' },
  { level: 32, xp: 11520, rank: 'HEREJE' },
  { level: 31, xp: 10850, rank: 'HEREJE' },
  { level: 30, xp: 10200, rank: 'HEREJE' },
  { level: 29, xp: 9570, rank: 'ROMPEJURAMENTOS' },
  { level: 28, xp: 8960, rank: 'ROMPEJURAMENTOS' },
  { level: 27, xp: 8370, rank: 'ROMPEJURAMENTOS' },
  { level: 26, xp: 7800, rank: 'ROMPEJURAMENTOS' },
  { level: 25, xp: 7250, rank: 'ROMPEJURAMENTOS' },
  { level: 24, xp: 6720, rank: 'ROMPEJURAMENTOS' },
  { level: 23, xp: 6210, rank: 'APÓSTATA' },
  { level: 22, xp: 5720, rank: 'APÓSTATA' },
  { level: 21, xp: 5250, rank: 'APÓSTATA' },
  { level: 20, xp: 4800, rank: 'APÓSTATA' },
  { level: 19, xp: 4370, rank: 'APÓSTATA' },
  { level: 18, xp: 3960, rank: 'APÓSTATA' },
  { level: 17, xp: 3570, rank: 'SOMBRA' },
  { level: 16, xp: 3200, rank: 'SOMBRA' },
  { level: 15, xp: 2850, rank: 'SOMBRA' },
  { level: 14, xp: 2520, rank: 'SOMBRA' },
  { level: 13, xp: 2210, rank: 'SOMBRA' },
  { level: 12, xp: 1920, rank: 'SOMBRA' },
  { level: 11, xp: 1400, rank: 'PENITENTE' },
  { level: 10, xp: 1170, rank: 'PENITENTE' },
  { level: 9, xp: 960, rank: 'PENITENTE' },
  { level: 8, xp: 850, rank: 'PENITENTE' },
  { level: 7, xp: 770, rank: 'PENITENTE' },
  { level: 6, xp: 600, rank: 'PENITENTE' },
  { level: 5, xp: 450, rank: 'INICIADO' },
  { level: 4, xp: 320, rank: 'INICIADO' },
  { level: 3, xp: 210, rank: 'INICIADO' },
  { level: 2, xp: 120, rank: 'INICIADO' },
  { level: 1, xp: 50, rank: 'INICIADO' },
  { level: 0, xp: 0, rank: 'EXILIADO' },
];

function getXpForRating(rating, table) {
  const tier = table.find((t) => rating >= t.rating);
  return tier ? tier.xp : 0;
}

// Specs que son healer en WoW
const HEALER_SPECS = [
  'Holy',          // Priest, Paladin
  'Discipline',    // Priest
  'Restoration',   // Shaman, Druid
  'Mistweaver',    // Monk
  'Preservation',  // Evoker
];

export function isHealerSpec(spec) {
  return HEALER_SPECS.includes(spec);
}

/**
 * Calcula el battle pass XP.
 * @param {object} pvpData - datos PvP del jugador
 * @param {object} [healerOpts] - { isHealer: bool, multiplier: number }
 *   Si isHealer es true y multiplier > 1, se aplica al XP de RBG.
 */
export function calculateBattlePass(pvpData = {}, healerOpts = null) {
  const maxRatings = pvpData.season_max || {};
  const manualBonus = pvpData.manual_bonus || 0;

  let rbgXp = getXpForRating(maxRatings.max_rbg || 0, STANDARD_XP_TABLE);

  // Aplicar multiplicador healer si corresponde
  const healerMultiplier = (healerOpts?.isHealer && healerOpts?.multiplier > 1)
    ? healerOpts.multiplier : 1;
  const rbgBase = rbgXp;
  rbgXp = Math.floor(rbgXp * healerMultiplier);

  const xp_breakdown = {
    from_rs: getXpForRating(maxRatings.max_rs || 0, STANDARD_XP_TABLE),
    from_r2: getXpForRating(maxRatings.max_r2 || 0, STANDARD_XP_TABLE),
    from_r3: getXpForRating(maxRatings.max_r3 || 0, THREE_V_THREE_XP_TABLE),
    from_rbg: rbgXp,
    from_bgs: getXpForRating(maxRatings.max_bgs || 0, STANDARD_XP_TABLE),
    manual_bonus: manualBonus,
  };

  // Si se aplicó multiplicador healer, guardar info extra
  if (healerMultiplier > 1) {
    xp_breakdown.healer_bonus = { multiplier: healerMultiplier, rbg_base: rbgBase, rbg_boosted: rbgXp };
  }

  const total_xp = Object.values(xp_breakdown).reduce((sum, xp) => {
    if (typeof xp === 'number') return sum + xp;
    return sum; // skip healer_bonus object
  }, 0);
  const currentLevel = LEVELS_TABLE.find((l) => total_xp >= l.xp) || { level: 0, rank: 'EXILIADO' };

  return {
    total_xp,
    level: currentLevel.level,
    rank_name: currentLevel.rank,
    xp_breakdown,
  };
}
