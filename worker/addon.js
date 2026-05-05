// worker/addon.js

import { getPlayersData } from './players.js';

const CLASS_ID_MAP = {
  'WARRIOR': 1,
  'PALADIN': 2,
  'HUNTER': 3,
  'ROGUE': 4,
  'PRIEST': 5,
  'DEATH KNIGHT': 6,
  'SHAMAN': 7,
  'MAGE': 8,
  'WARLOCK': 9,
  'MONK': 10,
  'DRUID': 11,
  'DEMON HUNTER': 12,
  'EVOKER': 13,
};

function normalizeName(name) {
  return name.charAt(0).toUpperCase() + name.slice(1).toLowerCase();
}

export async function getRatingsForAddon(request, env) {
  const players = await getPlayersData(env, false);

  const formattedPlayers = players.map((p) => {
    const pvp = p.pvp || { current: {} };
    const battlepass = p.battlepass || { total_xp: 0, level: 0, rank_name: 'EXILIADO' };
    const className = (p.class || '').toUpperCase();

    const seasonMax = pvp.season_max || {};

    return {
      name: normalizeName(p.name),
      realm: normalizeName(p.realm_display || p.realm),
      class: className.replace(/ /g, ''),
      class_id: CLASS_ID_MAP[className] || 0,
      r2: pvp.current.r2 || 0,
      r3: pvp.current.r3 || 0,
      rs: pvp.current.rs || 0,
      rbg: pvp.current.rbg || 0,
      bgs: pvp.current.bgs || 0,
      max_r2: seasonMax.max_r2 || 0,
      max_r3: seasonMax.max_r3 || 0,
      max_rs: seasonMax.max_rs || 0,
      max_rbg: seasonMax.max_rbg || 0,
      max_bgs: seasonMax.max_bgs || 0,
      xp: battlepass.total_xp,
      level: battlepass.level,
      rank: battlepass.rank_name,
    };
  });

  return {
    success: true,
    players: formattedPlayers,
    timestamp: Math.floor(Date.now() / 1000),
    season: 's1-midnight',
    total_players: formattedPlayers.length,
  };
}

export async function exportAddonDataLua(request, env) {
  const players = await getPlayersData(env, false);

  // Generate EXIMPORT:v1| format compatible with EXILIUM_IMPORT.lua parser
  // Format: EXIMPORT:v1|Name-Realm:CLASS:r2:r3:rs:rbg:bgs:mr2:mr3:mrs:mrbg:mbgs
  const parts = ['EXIMPORT:v1'];

  players.forEach((p) => {
    const pvp = p.pvp || { current: {}, season_max: {} };
    const current = pvp.current || {};
    const seasonMax = pvp.season_max || {};
    const name = normalizeName(p.name);
    const realm = (p.realm_display || p.realm || '').replace(/'/g, '');
    const className = (p.class || 'WARRIOR').toUpperCase().replace(/ /g, '');

    const r2  = current.r2  || 0;
    const r3  = current.r3  || 0;
    const rs  = current.rs  || 0;
    const rbg = current.rbg || 0;
    const bgs = current.bgs || 0;
    const mr2  = Math.max(seasonMax.max_r2  || 0, r2);
    const mr3  = Math.max(seasonMax.max_r3  || 0, r3);
    const mrs  = Math.max(seasonMax.max_rs  || 0, rs);
    const mrbg = Math.max(seasonMax.max_rbg || 0, rbg);
    const mbgs = Math.max(seasonMax.max_bgs || 0, bgs);

    parts.push(`${name}-${realm}:${className}:${r2}:${r3}:${rs}:${rbg}:${bgs}:${mr2}:${mr3}:${mrs}:${mrbg}:${mbgs}`);
  });

  const exportString = parts.join('|');
  return new Response(exportString, { headers: { 'Content-Type': 'text/plain' } });
}
