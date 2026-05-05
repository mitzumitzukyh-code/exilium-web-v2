// worker/players.js

import { getCharacterProfile, getCharacterMedia, getAllBracketRatings } from './blizzard.js';
import { calculateBattlePass, LEVELS_TABLE, isHealerSpec } from './xp-engine.js';

const PLAYER_KEY_PREFIX = 'player:';

/**
 * FIX #3 (parcial): Normaliza realm slug para uso como ID y en llamadas API.
 * Misma lógica que normalizeRealmSlug en blizzard.js.
 */
function normalizeRealmForId(realm) {
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

function ensurePlayerStructure(player) {
  if (!player) return player;
  player.pvp = player.pvp || {};
  player.pvp.current = player.pvp.current || { rs: 0, r2: 0, r3: 0, rbg: 0, bgs: 0 };
  player.pvp.season_max = player.pvp.season_max || { max_rs: 0, max_r2: 0, max_r3: 0, max_rbg: 0, max_bgs: 0 };
  player.pvp.wins = player.pvp.wins || { rs: 0, r2: 0, r3: 0, rbg: 0, bgs: 0 };
  player.pvp.losses = player.pvp.losses || { rs: 0, r2: 0, r3: 0, rbg: 0, bgs: 0 };
  if (player.pvp.manual_bonus === undefined) player.pvp.manual_bonus = 0;
  player.sync = player.sync || { last_update: null, last_success: null, last_error: null, sync_status: 'new', blizzard_status: null };
  player.media = player.media || { avatar: null, armory_url: null };
  player.battlepass = player.battlepass || { total_xp: 0, level: 0, rank_name: 'EXILIADO', xp_breakdown: {} };

  // Migrar datos PvP de formato antiguo (pvp.shuffle, pvp.2v2, etc.) a formato nuevo
  const OLD_BRACKET_MAP = { 'shuffle': 'rs', '2v2': 'r2', '3v3': 'r3', 'rbg': 'rbg', 'blitz': 'bgs' };
  let migrated = false;
  for (const [oldKey, newKey] of Object.entries(OLD_BRACKET_MAP)) {
    const oldData = player.pvp[oldKey];
    if (oldData && typeof oldData === 'object') {
      const rating = oldData.rating || 0;
      if (rating > (player.pvp.current[newKey] || 0)) {
        player.pvp.current[newKey] = rating;
        migrated = true;
      }
      const maxKey = `max_${newKey}`;
      const record = oldData.record || rating;
      if (record > (player.pvp.season_max[maxKey] || 0)) {
        player.pvp.season_max[maxKey] = record;
        migrated = true;
      }
      if ((oldData.wins || 0) > (player.pvp.wins[newKey] || 0)) {
        player.pvp.wins[newKey] = oldData.wins;
        migrated = true;
      }
      if ((oldData.losses || 0) > (player.pvp.losses[newKey] || 0)) {
        player.pvp.losses[newKey] = oldData.losses;
        migrated = true;
      }
    }
  }
  // NOTA: peak_ratings son lifetime bests, NO deben ir a season_max.
  // Se preservan como referencia pero no afectan XP de temporada.

  // Recalcular battlepass si hubo migración o si level/rank están corruptos
  const existingXp = player.battlepass.total_xp || 0;
  const levelCorrupt = typeof player.battlepass.level !== 'number' || typeof player.battlepass.rank_name !== 'string' || player.battlepass.rank_name === 'undefined';

  if (migrated || levelCorrupt) {
    const recalculated = calculateBattlePass(player.pvp);
    if (recalculated.total_xp >= existingXp) {
      player.battlepass = recalculated;
    } else {
      // Preservar XP existente (de código anterior) pero corregir level/rank
      const lvl = LEVELS_TABLE.find((l) => existingXp >= l.xp) || { level: 0, rank: 'EXILIADO' };
      player.battlepass.level = lvl.level;
      player.battlepass.rank_name = lvl.rank;
    }
  }

  player.titles = player.titles || { legend: false, gladiator: false };
  if (player.marriage === undefined) player.marriage = null;
  return player;
}

export async function getPlayersData(env, includeBanned = false) {
  const { keys } = await env.EXILIUM_KV.list({ prefix: PLAYER_KEY_PREFIX });
  const players = await Promise.all(keys.map((key) => env.EXILIUM_KV.get(key.name, 'json')));
  const filtered = players
    .filter((p) => p && (includeBanned || !p.banned))
    .map(ensurePlayerStructure);
  return filtered.sort((a, b) => (b.battlepass?.total_xp || 0) - (a.battlepass?.total_xp || 0));
}

export async function getPlayer(request, env, playerId) {
  if (!playerId) throw new Error('Player ID no proporcionado');
  const player = await env.EXILIUM_KV.get(playerId, 'json');
  return ensurePlayerStructure(player);
}

/**
 * FIX #3: createPlayer ahora normaliza el realm slug correctamente.
 * Antes solo hacía .replace(/\s/g, '-') sin quitar apóstrofes ni acentos,
 * lo que generaba IDs como "player:toon-quel'thalas" que no coincidían
 * con lo que Blizzard espera.
 */
export async function createPlayer(request, env) {
  let body;
  try { body = await request.json(); } catch (_) {
    return { error: 'JSON inválido en el body del request.', status: 400 };
  }
  const { name, realm, region } = body;
  if (!name || !realm || !region) return { error: 'Nombre, reino y región son requeridos.', status: 400 };

  // Validación de datos entrantes
  if (typeof name !== 'string' || name.trim().length < 2 || name.trim().length > 24) {
    return { error: 'El nombre debe tener entre 2 y 24 caracteres.', status: 400 };
  }
  if (typeof realm !== 'string' || realm.trim().length < 2) {
    return { error: 'El reino no es válido.', status: 400 };
  }
  const VALID_REGIONS = ['us', 'eu', 'kr', 'tw'];
  if (!VALID_REGIONS.includes(region.toLowerCase())) {
    return { error: `Región inválida. Debe ser una de: ${VALID_REGIONS.join(', ')}`, status: 400 };
  }

  const normalizedRealm = normalizeRealmForId(realm);
  const id = `${name.toLowerCase()}-${normalizedRealm}`;
  const playerKey = `${PLAYER_KEY_PREFIX}${id}`;

  if (await env.EXILIUM_KV.get(playerKey)) return { error: 'El jugador ya está inscrito.', status: 409 };

  const newPlayer = {
    id,
    name: name.charAt(0).toUpperCase() + name.slice(1).toLowerCase(),
    realm: normalizedRealm,
    realm_display: realm,
    region,
    banned: false,
    notes: '',
    season_id: 's1-midnight',
    pvp: {
      current: { rs: 0, r2: 0, r3: 0, rbg: 0, bgs: 0 },
      season_max: { max_rs: 0, max_r2: 0, max_r3: 0, max_rbg: 0, max_bgs: 0 },
      wins: { rs: 0, r2: 0, r3: 0, rbg: 0, bgs: 0 },
      losses: { rs: 0, r2: 0, r3: 0, rbg: 0, bgs: 0 },
      manual_bonus: 0,
    },
    battlepass: { total_xp: 0, level: 0, rank_name: 'EXILIADO', xp_breakdown: {} },
    marriage: null,
    titles: { legend: false, gladiator: false },
    media: { avatar: null, armory_url: null },
    sync: { last_update: null, last_success: null, last_error: null, sync_status: 'new', blizzard_status: null },
  };

  await env.EXILIUM_KV.put(playerKey, JSON.stringify(newPlayer));
  return newPlayer;
}

export async function updatePlayer(request, env, playerId) {
  const player = await getPlayer(request, env, playerId);
  if (!player) return { error: 'Jugador no encontrado', status: 404 };

  const { notes, banned } = await request.json();
  if (notes !== undefined) player.notes = notes;
  if (banned !== undefined) player.banned = banned;

  await env.EXILIUM_KV.put(playerId, JSON.stringify(player));
  return player;
}

export async function deletePlayer(request, env, playerId) {
  await env.EXILIUM_KV.delete(playerId);
  return { success: true, message: `Jugador ${playerId} eliminado.` };
}

export async function syncPlayer(request, env, playerId) {
  const player = await env.EXILIUM_KV.get(playerId, 'json');
  if (!player) return { error: 'Jugador no encontrado', status: 404 };

  ensurePlayerStructure(player);

  try {
    const profile = await getCharacterProfile(player.name, player.realm, env);

    if (profile.error) {
      player.sync.last_update = new Date().toISOString();
      player.sync.sync_status =
        profile.status === 404 ? 'not_found' :
        profile.status === 403 ? 'private' :
        'blizzard_error';
      player.sync.blizzard_status = profile.status;
      await env.EXILIUM_KV.put(playerId, JSON.stringify(player));
      return player;
    }

    player.class = profile.class_name;
    player.spec = profile.spec;
    player.race = profile.race;
    player.faction = profile.faction;
    player.level = profile.level;
    player.ilvl = profile.ilvl;

    const classKeyMap = {
      'Warrior': 'warrior',
      'Paladin': 'paladin',
      'Hunter': 'hunter',
      'Rogue': 'rogue',
      'Priest': 'priest',
      'Death Knight': 'death-knight',
      'Shaman': 'shaman',
      'Mage': 'mage',
      'Warlock': 'warlock',
      'Monk': 'monk',
      'Druid': 'druid',
      'Demon Hunter': 'demon-hunter',
      'Evoker': 'evoker',
    };

    const classKey = classKeyMap[profile.class_name] || '';

    const avatarUrl = await getCharacterMedia(player.name, player.realm, env);
    if (avatarUrl) {
      player.media = player.media || {};
      player.media.avatar = avatarUrl;
      player.media.armory_url = `https://worldofwarcraft.blizzard.com/en-us/character/us/${player.realm}/${player.name.toLowerCase()}`;
    }

    const ratingsData = await getAllBracketRatings(player.name, player.realm, classKey, env);

    player.pvp.current = ratingsData.current;
    player.pvp.wins = ratingsData.wins;
    player.pvp.losses = ratingsData.losses;

    player.pvp.season_max = player.pvp.season_max || {
      max_rs: 0, max_r2: 0, max_r3: 0, max_rbg: 0, max_bgs: 0,
    };

    const brackets = ['rs', 'r2', 'r3', 'rbg', 'bgs'];
    brackets.forEach((key) => {
      const maxKey = `max_${key}`;
      const newRating = ratingsData.current[key] || 0;
      const totalGames = (ratingsData.wins[key] || 0) + (ratingsData.losses[key] || 0);
      const currentMax = player.pvp.season_max[maxKey] || 0;

      if (totalGames > 0) {
        // Solo actualizar hacia arriba: preservar el peak rating histórico
        player.pvp.season_max[maxKey] = Math.max(currentMax, newRating);
      }
      // Si totalGames === 0, se mantiene el peak existente (no se resetea)
    });

    // Cargar config healer bonus y aplicar si corresponde
    let healerOpts = null;
    try {
      const hbRaw = await env.EXILIUM_KV.get('config:healer_bonus');
      if (hbRaw) {
        const hb = JSON.parse(hbRaw);
        if (hb.enabled && hb.multiplier > 1 && isHealerSpec(player.spec)) {
          healerOpts = { isHealer: true, multiplier: hb.multiplier };
        }
      }
    } catch (_) {}

    player.battlepass = calculateBattlePass(player.pvp, healerOpts);

    player.sync.last_update = new Date().toISOString();
    player.sync.last_success = new Date().toISOString();
    player.sync.last_error = null;
    player.sync.sync_status = ratingsData.hasApiBug ? 'api_bug_ss' : 'ok';
    player.sync.blizzard_status = 200;

    await env.EXILIUM_KV.put(playerId, JSON.stringify(player));
    return player;
  } catch (err) {
    player.sync.last_update = new Date().toISOString();
    player.sync.last_error = err.message;
    player.sync.sync_status = 'error';
    await env.EXILIUM_KV.put(playerId, JSON.stringify(player));
    throw err;
  }
}

/**
 * FIX: Round-robin sync — cada invocación sincroniza máximo MAX_SYNC_PER_RUN jugadores
 * secuencialmente para no exceder el límite de 50 subrequests de Cloudflare Workers.
 * Cada jugador usa ~13 fetch calls (profile + media + 3 standard + ~4 shuffle + ~4 blitz).
 * Con MAX=3: 3×13 = 39 fetches, dentro del límite.
 * El offset se guarda en KV para continuar donde se quedó en la próxima invocación.
 */
const MAX_SYNC_PER_RUN = 3;
const SYNC_OFFSET_KEY = 'cron:sync_offset';

export async function syncAllPlayers(env) {
  const { keys } = await env.EXILIUM_KV.list({ prefix: 'player:' });
  const allPlayers = await Promise.all(keys.map((key) => env.EXILIUM_KV.get(key.name, 'json')));
  const players = allPlayers.filter((p) => p);

  if (players.length === 0) {
    return { timestamp: new Date().toISOString(), status: 'ok', players_synced: 0, errors: 0, total: 0, message: 'No hay jugadores.' };
  }

  // Round-robin: obtener offset de donde quedamos
  let offset = parseInt(await env.EXILIUM_KV.get(SYNC_OFFSET_KEY) || '0', 10);
  if (offset >= players.length) offset = 0;

  const batch = players.slice(offset, offset + MAX_SYNC_PER_RUN);
  let synced = 0;
  let errors = 0;
  const errorDetails = [];

  // Sincronizar secuencialmente (1 a la vez) para minimizar subrequests concurrentes
  for (const p of batch) {
    try {
      const result = await syncPlayer(null, env, `player:${p.id}`);
      if (result?.error) {
        errors++;
        errorDetails.push({ id: p.id, error: result.error });
      } else {
        synced++;
      }
    } catch (err) {
      errors++;
      errorDetails.push({ id: p.id, error: err.message });
    }
  }

  // Avanzar offset para la próxima invocación
  const newOffset = offset + batch.length;
  await env.EXILIUM_KV.put(SYNC_OFFSET_KEY, String(newOffset >= players.length ? 0 : newOffset));

  const summary = {
    timestamp: new Date().toISOString(),
    status: errors > batch.length / 2 ? 'alert' : 'ok',
    players_synced: synced,
    errors,
    total: players.length,
    batch_size: batch.length,
    offset,
    next_offset: newOffset >= players.length ? 0 : newOffset,
    message: `Sincronizados ${synced}/${batch.length} (lote ${Math.floor(offset / MAX_SYNC_PER_RUN) + 1}/${Math.ceil(players.length / MAX_SYNC_PER_RUN)})`,
  };

  if (errorDetails.length > 0) {
    summary.error_details = errorDetails;
  }

  await env.EXILIUM_KV.put('cron:last_run', JSON.stringify(summary));

  if (errors > batch.length / 2) {
    await env.EXILIUM_KV.put('meta:cron_alert', JSON.stringify({
      timestamp: new Date().toISOString(),
      message: `Alerta: ${errors}/${batch.length} jugadores fallaron en el sync (lote ${offset}-${offset + batch.length})`,
    }));
  }

  return summary;
}

export async function adjustPlayerXp(request, env, playerId) {
  const player = await getPlayer(request, env, playerId);
  if (!player) return { error: 'Jugador no encontrado', status: 404 };

  const { amount, reason } = await request.json();
  if (typeof amount !== 'number' || !reason) return { error: 'Se requiere `amount` (número) y `reason` (string).', status: 400 };

  player.pvp.manual_bonus = (player.pvp.manual_bonus || 0) + amount;

  // Cargar healer bonus para no perder multiplicador al recalcular
  let healerOpts = null;
  try {
    const hbRaw = await env.EXILIUM_KV.get('config:healer_bonus');
    if (hbRaw) {
      const hb = JSON.parse(hbRaw);
      if (hb.enabled && hb.multiplier > 1 && isHealerSpec(player.spec)) {
        healerOpts = { isHealer: true, multiplier: hb.multiplier };
      }
    }
  } catch (_) {}

  player.battlepass = calculateBattlePass(player.pvp, healerOpts);

  await env.EXILIUM_KV.put(playerId, JSON.stringify(player));
  return player;
}

/**
 * FIX: Verifica si el título ya fue otorgado para no dar XP duplicado.
 * Antes, llamar /title dos veces sumaba 3500 XP cada vez.
 */
export async function grantPlayerTitle(request, env, playerId) {
  const player = await getPlayer(request, env, playerId);
  if (!player) return { error: 'Jugador no encontrado', status: 404 };

  const { title } = await request.json();
  if (title !== 'legend' && title !== 'gladiator') {
    return { error: 'Título inválido. Debe ser `legend` o `gladiator`.', status: 400 };
  }

  if (player.titles[title]) {
    return { error: `El jugador ya tiene el título '${title}'.`, status: 409 };
  }

  player.titles[title] = true;
  player.pvp.manual_bonus = (player.pvp.manual_bonus || 0) + 3500;

  // Cargar healer bonus para no perder multiplicador al recalcular
  let healerOpts = null;
  try {
    const hbRaw = await env.EXILIUM_KV.get('config:healer_bonus');
    if (hbRaw) {
      const hb = JSON.parse(hbRaw);
      if (hb.enabled && hb.multiplier > 1 && isHealerSpec(player.spec)) {
        healerOpts = { isHealer: true, multiplier: hb.multiplier };
      }
    }
  } catch (_) {}

  player.battlepass = calculateBattlePass(player.pvp, healerOpts);

  await env.EXILIUM_KV.put(playerId, JSON.stringify(player));
  return player;
}

/**
 * FIX #4: marryPlayers — Agrega PLAYER_KEY_PREFIX si el ID no lo tiene.
 * Antes, getPlayer(null, env, "toon-realm") buscaba key "toon-realm"
 * en KV, pero la key real es "player:toon-realm".
 */
export async function marryPlayers(request, env) {
  const { player1_id, player2_id } = await request.json();

  const p1Key = player1_id.startsWith(PLAYER_KEY_PREFIX) ? player1_id : `${PLAYER_KEY_PREFIX}${player1_id}`;
  const p2Key = player2_id.startsWith(PLAYER_KEY_PREFIX) ? player2_id : `${PLAYER_KEY_PREFIX}${player2_id}`;

  const p1 = await getPlayer(null, env, p1Key);
  const p2 = await getPlayer(null, env, p2Key);
  if (!p1 || !p2) return { error: 'Uno o ambos jugadores no encontrados', status: 404 };

  const since = new Date().toISOString();
  p1.marriage = { married_to: p2.id, partner_name: p2.name, married_since: since };
  p2.marriage = { married_to: p1.id, partner_name: p1.name, married_since: since };

  await env.EXILIUM_KV.put(`${PLAYER_KEY_PREFIX}${p1.id}`, JSON.stringify(p1));
  await env.EXILIUM_KV.put(`${PLAYER_KEY_PREFIX}${p2.id}`, JSON.stringify(p2));

  return { success: true };
}

/**
 * FIX #5: divorcePlayer — married_to guarda ID sin prefijo.
 * Antes, getPlayer buscaba "toon-realm" sin prefijo → null.
 */
export async function divorcePlayer(request, env, playerId) {
  const p1 = await getPlayer(request, env, playerId);
  if (!p1 || !p1.marriage) return { error: 'Jugador no encontrado o no está casado', status: 404 };

  const partnerKey = p1.marriage.married_to.startsWith(PLAYER_KEY_PREFIX)
    ? p1.marriage.married_to
    : `${PLAYER_KEY_PREFIX}${p1.marriage.married_to}`;

  const p2 = await getPlayer(null, env, partnerKey);

  p1.marriage = null;
  if (p2) {
    p2.marriage = null;
    await env.EXILIUM_KV.put(`${PLAYER_KEY_PREFIX}${p2.id}`, JSON.stringify(p2));
  }
  await env.EXILIUM_KV.put(`${PLAYER_KEY_PREFIX}${p1.id}`, JSON.stringify(p1));

  return { success: true };
}
