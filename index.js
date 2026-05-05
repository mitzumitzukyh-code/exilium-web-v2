var __defProp = Object.defineProperty;
var __name = (target, value) => __defProp(target, "name", { value, configurable: true });

// worker/auth.js
var FAILED_ATTEMPTS_KEY = "auth:failed_attempts";
var MAX_FAILED_ATTEMPTS = 5;
var LOCKOUT_DURATION = 15 * 60;
var TOKEN_TTL = 8 * 60 * 60;
async function handleAdminLogin(request, env) {
  const failedAttempts = await env.EXILIUM_KV.get(FAILED_ATTEMPTS_KEY, { type: "json" });
  if (failedAttempts && failedAttempts.count >= MAX_FAILED_ATTEMPTS) {
    return { error: "Demasiados intentos fallidos. Int\xE9ntalo m\xE1s tarde." };
  }
  const { password } = await request.json();
  if (!password) {
    return { error: "Falta la contrase\xF1a." };
  }
  if (password === env.ADMIN_KEY) {
    await env.EXILIUM_KV.delete(FAILED_ATTEMPTS_KEY);
    const token = crypto.randomUUID();
    const tokenKey = `auth:token:${token}`;
    await env.EXILIUM_KV.put(tokenKey, JSON.stringify({ user: "admin", created: Date.now() }), { expirationTtl: TOKEN_TTL });
    return { token };
  } else {
    const newAttempts = { count: (failedAttempts?.count || 0) + 1 };
    await env.EXILIUM_KV.put(FAILED_ATTEMPTS_KEY, JSON.stringify(newAttempts), { expirationTtl: LOCKOUT_DURATION });
    return { error: "Credenciales inv\xE1lidas." };
  }
}
__name(handleAdminLogin, "handleAdminLogin");
async function handleAdminAuth(request, env) {
  const authHeader = request.headers.get("Authorization");
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return false;
  }
  const token = authHeader.substring(7);
  if (!token) {
    return false;
  }
  const tokenKey = `auth:token:${token}`;
  const session = await env.EXILIUM_KV.get(tokenKey);
  return session !== null;
}
__name(handleAdminAuth, "handleAdminAuth");
function handlePublicAuth(request, env) {
  const token = request.headers.get("X-API-Token");
  if (!token || token !== env.API_RATINGS_TOKEN) {
    return false;
  }
  return true;
}
__name(handlePublicAuth, "handlePublicAuth");

// worker/blizzard.js
var BNET_TOKEN_URL = "https://us.oauth.blizzard.com/oauth/token";
var API_BASE_URL = "https://us.api.blizzard.com";
var TOKEN_KV_KEY = "blizzard:token";
var SEASON_ID_KV_KEY = "blizzard:current_season_id";
var SHUFFLE_SPECS = {
  "warrior": ["shuffle-warrior-arms", "shuffle-warrior-fury", "shuffle-warrior-protection"],
  "paladin": ["shuffle-paladin-holy", "shuffle-paladin-protection", "shuffle-paladin-retribution"],
  "hunter": ["shuffle-hunter-beastmastery", "shuffle-hunter-marksmanship", "shuffle-hunter-survival"],
  "rogue": ["shuffle-rogue-assassination", "shuffle-rogue-outlaw", "shuffle-rogue-subtlety"],
  "priest": ["shuffle-priest-discipline", "shuffle-priest-holy", "shuffle-priest-shadow"],
  "death-knight": ["shuffle-deathknight-blood", "shuffle-deathknight-frost", "shuffle-deathknight-unholy"],
  "shaman": ["shuffle-shaman-elemental", "shuffle-shaman-enhancement", "shuffle-shaman-restoration"],
  "mage": ["shuffle-mage-arcane", "shuffle-mage-fire", "shuffle-mage-frost"],
  "warlock": ["shuffle-warlock-affliction", "shuffle-warlock-demonology", "shuffle-warlock-destruction"],
  "monk": ["shuffle-monk-brewmaster", "shuffle-monk-mistweaver", "shuffle-monk-windwalker"],
  "druid": ["shuffle-druid-balance", "shuffle-druid-feral", "shuffle-druid-guardian", "shuffle-druid-restoration"],
  "demon-hunter": ["shuffle-demonhunter-havoc", "shuffle-demonhunter-vengeance"],
  "evoker": ["shuffle-evoker-devastation", "shuffle-evoker-preservation", "shuffle-evoker-augmentation"]
};
async function getAccessToken(env) {
  let token = await env.EXILIUM_KV.get(TOKEN_KV_KEY, "json");
  if (token && token.expires_at > Date.now()) {
    return token.access_token;
  }
  const client_id = env.BLIZZARD_CLIENT_ID;
  const client_secret = env.BLIZZARD_CLIENT_SECRET;
  const response = await fetch(BNET_TOKEN_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      "Authorization": "Basic " + btoa(`${client_id}:${client_secret}`)
    },
    body: "grant_type=client_credentials"
  });
  if (!response.ok) {
    throw new Error(`Error al obtener token de Blizzard: ${response.statusText}`);
  }
  const data = await response.json();
  const newToken = {
    access_token: data.access_token,
    expires_at: Date.now() + (data.expires_in - 300) * 1e3
  };
  await env.EXILIUM_KV.put(TOKEN_KV_KEY, JSON.stringify(newToken), { expirationTtl: data.expires_in - 300 });
  return newToken.access_token;
}
__name(getAccessToken, "getAccessToken");
async function getCurrentSeasonId(env) {
  let seasonId = await env.EXILIUM_KV.get(SEASON_ID_KV_KEY);
  if (seasonId) return parseInt(seasonId, 10);
  const url = `${API_BASE_URL}/data/wow/pvp-season/index?namespace=dynamic-us&locale=en_US`;
  const response = await fetchWithAuthRetry(url, env);
  if (!response.ok) throw new Error("No se pudo obtener el \xEDndice de temporadas de PvP.");
  const data = await response.json();
  const currentSeason = data.seasons[data.seasons.length - 1];
  seasonId = currentSeason.id;
  await env.EXILIUM_KV.put(SEASON_ID_KV_KEY, String(seasonId), { expirationTtl: 21600 });
  return parseInt(seasonId, 10);
}
__name(getCurrentSeasonId, "getCurrentSeasonId");
async function fetchWithAuthRetry(url, env) {
  let accessToken = await getAccessToken(env);
  let response = await fetch(url, { headers: { "Authorization": `Bearer ${accessToken}` } });
  if (response.status === 401) {
    await env.EXILIUM_KV.delete(TOKEN_KV_KEY);
    accessToken = await getAccessToken(env);
    response = await fetch(url, { headers: { "Authorization": `Bearer ${accessToken}` } });
  }
  return response;
}
__name(fetchWithAuthRetry, "fetchWithAuthRetry");
async function getCharacterProfile(name, realmSlug, env) {
  const url = `${API_BASE_URL}/profile/wow/character/${realmSlug}/${name.toLowerCase()}?namespace=profile-us&locale=en_US`;
  const response = await fetchWithAuthRetry(url, env);
  if (!response.ok) return { error: true, status: response.status };
  const data = await response.json();
  return {
    class_name: data.character_class?.name || "",
    spec: data.active_spec?.name || "",
    race: data.race?.name || "",
    faction: data.faction?.type || "",
    level: data.level || 0,
    ilvl: data.average_item_level || 0
  };
}
__name(getCharacterProfile, "getCharacterProfile");
async function getCharacterMedia(name, realmSlug, env) {
  const url = `${API_BASE_URL}/profile/wow/character/${realmSlug}/${name.toLowerCase()}/character-media?namespace=profile-us&locale=en_US`;
  const response = await fetchWithAuthRetry(url, env);
  if (!response.ok) return null;
  const data = await response.json();
  const avatar = data.assets?.find((a) => a.key === "avatar");
  return avatar?.value || null;
}
__name(getCharacterMedia, "getCharacterMedia");
async function getBracketRating(name, realmSlug, bracket, currentSeasonId, env) {
  const url = `${API_BASE_URL}/profile/wow/character/${realmSlug}/${name.toLowerCase()}/pvp-bracket/${bracket}?namespace=profile-us&locale=en_US`;
  const response = await fetchWithAuthRetry(url, env);
  if (response.status === 404) {
    return { rating: 0, wins: 0, losses: 0, valid: true, apiBug: false };
  }
  if (!response.ok) {
    return { rating: 0, wins: 0, losses: 0, valid: false, apiBug: false };
  }
  const data = await response.json();
  const seasonId = data.season?.id;
  const rating = data.rating || 0;
  const played = data.season_match_statistics?.played || 0;
  const won = data.season_match_statistics?.won || 0;
  const lost = data.season_match_statistics?.lost || 0;
  if (seasonId !== currentSeasonId) {
    return { rating: 0, wins: 0, losses: 0, valid: true, apiBug: false };
  }
  if (rating === 0 && played > 0 && bracket.startsWith("shuffle-")) {
    return { rating: 0, wins: won, losses: lost, valid: true, apiBug: true };
  }
  return { rating, wins: won, losses: lost, valid: true, apiBug: false };
}
__name(getBracketRating, "getBracketRating");
async function getAllBracketRatings(name, realmSlug, classKey, env) {
  const currentSeasonId = await getCurrentSeasonId(env);
  const result = {
    current: { rs: 0, r2: 0, r3: 0, rbg: 0, bgs: 0 },
    wins: { rs: 0, r2: 0, r3: 0, rbg: 0, bgs: 0 },
    losses: { rs: 0, r2: 0, r3: 0, rbg: 0, bgs: 0 },
    hasApiBug: false
  };
  const r2 = await getBracketRating(name, realmSlug, "2v2", currentSeasonId, env);
  result.current.r2 = r2.rating;
  result.wins.r2 = r2.wins;
  result.losses.r2 = r2.losses;
  const r3 = await getBracketRating(name, realmSlug, "3v3", currentSeasonId, env);
  result.current.r3 = r3.rating;
  result.wins.r3 = r3.wins;
  result.losses.r3 = r3.losses;
  const rbg = await getBracketRating(name, realmSlug, "rbg", currentSeasonId, env);
  result.current.rbg = rbg.rating;
  result.wins.rbg = rbg.wins;
  result.losses.rbg = rbg.losses;
  const bgs = await getBracketRating(name, realmSlug, "battlegrounds-blitz", currentSeasonId, env);
  result.current.bgs = bgs.rating;
  result.wins.bgs = bgs.wins;
  result.losses.bgs = bgs.losses;
  const classSlug = classKey || "";
  const shuffleSpecs = SHUFFLE_SPECS[classSlug] || [];
  let maxShuffleRating = 0;
  let shuffleWins = 0;
  let shuffleLosses = 0;
  for (const spec of shuffleSpecs) {
    const ss = await getBracketRating(name, realmSlug, spec, currentSeasonId, env);
    if (ss.apiBug) result.hasApiBug = true;
    if (ss.rating > maxShuffleRating) {
      maxShuffleRating = ss.rating;
      shuffleWins = ss.wins;
      shuffleLosses = ss.losses;
    }
  }
  result.current.rs = maxShuffleRating;
  result.wins.rs = shuffleWins;
  result.losses.rs = shuffleLosses;
  return result;
}
__name(getAllBracketRatings, "getAllBracketRatings");

// worker/xp-engine.js
var STANDARD_XP_TABLE = [
  { rating: 2400, xp: 4550 },
  { rating: 2100, xp: 2550 },
  { rating: 1800, xp: 1050 },
  { rating: 1600, xp: 550 },
  { rating: 1400, xp: 300 },
  { rating: 1200, xp: 150 },
  { rating: 1e3, xp: 50 }
];
var THREE_V_THREE_XP_TABLE = [
  { rating: 2400, xp: 5800 },
  { rating: 2100, xp: 3300 },
  { rating: 1800, xp: 1300 },
  { rating: 1600, xp: 550 },
  { rating: 1400, xp: 300 },
  { rating: 1200, xp: 150 },
  { rating: 1e3, xp: 50 }
];
var LEVELS_TABLE = [
  { level: 40, xp: 15500, rank: "EXARCA" },
  { level: 39, xp: 15420, rank: "PROFETA" },
  { level: 38, xp: 15320, rank: "PROFETA" },
  { level: 37, xp: 15170, rank: "PROFETA" },
  { level: 36, xp: 14400, rank: "PROFETA" },
  { level: 35, xp: 13650, rank: "PROFETA" },
  { level: 34, xp: 12920, rank: "HEREJE" },
  { level: 33, xp: 12210, rank: "HEREJE" },
  { level: 32, xp: 11520, rank: "HEREJE" },
  { level: 31, xp: 10850, rank: "HEREJE" },
  { level: 30, xp: 10200, rank: "HEREJE" },
  { level: 29, xp: 9570, rank: "ROMPEJURAMENTOS" },
  { level: 28, xp: 8960, rank: "ROMPEJURAMENTOS" },
  { level: 27, xp: 8370, rank: "ROMPEJURAMENTOS" },
  { level: 26, xp: 7800, rank: "ROMPEJURAMENTOS" },
  { level: 25, xp: 7250, rank: "ROMPEJURAMENTOS" },
  { level: 24, xp: 6720, rank: "ROMPEJURAMENTOS" },
  { level: 23, xp: 6210, rank: "AP\xD3STATA" },
  { level: 22, xp: 5720, rank: "AP\xD3STATA" },
  { level: 21, xp: 5250, rank: "AP\xD3STATA" },
  { level: 20, xp: 4800, rank: "AP\xD3STATA" },
  { level: 19, xp: 4370, rank: "AP\xD3STATA" },
  { level: 18, xp: 3960, rank: "AP\xD3STATA" },
  { level: 17, xp: 3570, rank: "SOMBRA" },
  { level: 16, xp: 3200, rank: "SOMBRA" },
  { level: 15, xp: 2850, rank: "SOMBRA" },
  { level: 14, xp: 2520, rank: "SOMBRA" },
  { level: 13, xp: 2210, rank: "SOMBRA" },
  { level: 12, xp: 1920, rank: "SOMBRA" },
  { level: 11, xp: 1400, rank: "PENITENTE" },
  { level: 10, xp: 1170, rank: "PENITENTE" },
  { level: 9, xp: 960, rank: "PENITENTE" },
  { level: 8, xp: 850, rank: "PENITENTE" },
  { level: 7, xp: 770, rank: "PENITENTE" },
  { level: 6, xp: 600, rank: "PENITENTE" },
  { level: 5, xp: 450, rank: "INICIADO" },
  { level: 4, xp: 320, rank: "INICIADO" },
  { level: 3, xp: 210, rank: "INICIADO" },
  { level: 2, xp: 120, rank: "INICIADO" },
  { level: 1, xp: 50, rank: "INICIADO" },
  { level: 0, xp: 0, rank: "EXILIADO" }
];
function getXpForRating(rating, table) {
  const tier = table.find((t) => rating >= t.rating);
  return tier ? tier.xp : 0;
}
__name(getXpForRating, "getXpForRating");
function calculateBattlePass(pvpData = {}) {
  const maxRatings = pvpData.season_max || {};
  const manualBonus = pvpData.manual_bonus || 0;
  const xp_breakdown = {
    from_rs: getXpForRating(maxRatings.max_rs || 0, STANDARD_XP_TABLE),
    from_r2: getXpForRating(maxRatings.max_r2 || 0, STANDARD_XP_TABLE),
    from_r3: getXpForRating(maxRatings.max_r3 || 0, THREE_V_THREE_XP_TABLE),
    from_rbg: getXpForRating(maxRatings.max_rbg || 0, STANDARD_XP_TABLE),
    from_bgs: getXpForRating(maxRatings.max_bgs || 0, STANDARD_XP_TABLE),
    manual_bonus: manualBonus
  };
  const total_xp = Object.values(xp_breakdown).reduce((sum, xp) => sum + xp, 0);
  const currentLevel = LEVELS_TABLE.find((l) => total_xp >= l.xp) || { level: 0, rank: "EXILIADO" };
  return {
    total_xp,
    level: currentLevel.level,
    rank_name: currentLevel.rank,
    xp_breakdown
  };
}
__name(calculateBattlePass, "calculateBattlePass");

// ══════════════════════════════════════════════════════════
// HELPER: Ensure player has all required nested objects
// This fixes "Cannot set properties of undefined" errors
// for players loaded into KV before sync structure existed.
// ══════════════════════════════════════════════════════════
function ensurePlayerStructure(player) {
  if (!player) return player;
  player.pvp = player.pvp || { current: {}, season_max: {}, wins: {}, losses: {}, manual_bonus: 0 };
  player.pvp.current = player.pvp.current || {};
  player.pvp.season_max = player.pvp.season_max || {};
  player.pvp.wins = player.pvp.wins || {};
  player.pvp.losses = player.pvp.losses || {};
  if (player.pvp.manual_bonus === undefined) player.pvp.manual_bonus = 0;
  player.sync = player.sync || { last_update: null, last_success: null, last_error: null, sync_status: "new", blizzard_status: null };
  player.media = player.media || { avatar: null, armory_url: null };
  player.battlepass = player.battlepass || { total_xp: 0, level: 0, rank_name: "EXILIADO", xp_breakdown: {} };
  player.titles = player.titles || { legend: false, gladiator: false };
  player.marriage = player.marriage || null;
  return player;
}
__name(ensurePlayerStructure, "ensurePlayerStructure");

// worker/players.js
var PLAYER_KEY_PREFIX = "player:";
async function getPlayersData(env, includeBanned = false) {
  const { keys } = await env.EXILIUM_KV.list({ prefix: PLAYER_KEY_PREFIX });
  const players = await Promise.all(keys.map((key) => env.EXILIUM_KV.get(key.name, "json")));
  const filtered = players.filter((p) => p && (includeBanned || !p.banned)).map(ensurePlayerStructure);
  return filtered.sort((a, b) => (b.battlepass?.total_xp || 0) - (a.battlepass?.total_xp || 0));
}
__name(getPlayersData, "getPlayersData");
async function getPlayer(request, env, playerId) {
  if (!playerId) throw new Error("Player ID no proporcionado");
  const player = await env.EXILIUM_KV.get(playerId, "json");
  return ensurePlayerStructure(player);
}
__name(getPlayer, "getPlayer");
async function createPlayer(request, env) {
  const { name, realm, region } = await request.json();
  if (!name || !realm || !region) return { error: "Nombre, reino y regi\xF3n son requeridos.", status: 400 };
  const id = `${name.toLowerCase()}-${realm.toLowerCase().replace(/\s/g, "-")}`;
  const playerKey = `${PLAYER_KEY_PREFIX}${id}`;
  if (await env.EXILIUM_KV.get(playerKey)) return { error: "El jugador ya est\xE1 inscrito.", status: 409 };
  const newPlayer = {
    id,
    name: name.charAt(0).toUpperCase() + name.slice(1).toLowerCase(),
    realm: realm.toLowerCase().replace(/\s/g, "-"),
    realm_display: realm,
    region,
    banned: false,
    notes: "",
    season_id: "s1-midnight",
    pvp: {
      current: { rs: 0, r2: 0, r3: 0, rbg: 0, bgs: 0 },
      season_max: { max_rs: 0, max_r2: 0, max_r3: 0, max_rbg: 0, max_bgs: 0 },
      wins: { rs: 0, r2: 0, r3: 0, rbg: 0, bgs: 0 },
      losses: { rs: 0, r2: 0, r3: 0, rbg: 0, bgs: 0 },
      manual_bonus: 0
    },
    battlepass: { total_xp: 0, level: 0, rank_name: "EXILIADO", xp_breakdown: {} },
    marriage: null,
    titles: { legend: false, gladiator: false },
    media: { avatar: null, armory_url: null },
    sync: { last_update: null, last_success: null, last_error: null, sync_status: "new", blizzard_status: null }
  };
  await env.EXILIUM_KV.put(playerKey, JSON.stringify(newPlayer));
  return newPlayer;
}
__name(createPlayer, "createPlayer");
async function updatePlayer(request, env, playerId) {
  const player = await getPlayer(request, env, playerId);
  if (!player) return { error: "Jugador no encontrado", status: 404 };
  const { notes, banned } = await request.json();
  if (notes !== void 0) player.notes = notes;
  if (banned !== void 0) player.banned = banned;
  await env.EXILIUM_KV.put(playerId, JSON.stringify(player));
  return player;
}
__name(updatePlayer, "updatePlayer");
async function deletePlayer(request, env, playerId) {
  await env.EXILIUM_KV.delete(playerId);
  return { success: true, message: `Jugador ${playerId} eliminado.` };
}
__name(deletePlayer, "deletePlayer");
async function syncPlayer(request, env, playerId) {
  const player = await env.EXILIUM_KV.get(playerId, "json");
  if (!player) return { error: "Jugador no encontrado", status: 404 };
  // ── FIX: Ensure all nested objects exist ──
  ensurePlayerStructure(player);
  try {
    const profile = await getCharacterProfile(player.name, player.realm, env);
    if (profile.error) {
      player.sync.last_update = (/* @__PURE__ */ new Date()).toISOString();
      player.sync.sync_status = profile.status === 404 ? "not_found" : profile.status === 403 ? "private" : "blizzard_error";
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
      "Warrior": "warrior",
      "Paladin": "paladin",
      "Hunter": "hunter",
      "Rogue": "rogue",
      "Priest": "priest",
      "Death Knight": "death-knight",
      "Shaman": "shaman",
      "Mage": "mage",
      "Warlock": "warlock",
      "Monk": "monk",
      "Druid": "druid",
      "Demon Hunter": "demon-hunter",
      "Evoker": "evoker"
    };
    const classKey = classKeyMap[profile.class_name] || "";
    const avatarUrl = await getCharacterMedia(player.name, player.realm, env);
    if (avatarUrl) {
      player.media.avatar = avatarUrl;
      player.media.armory_url = `https://worldofwarcraft.blizzard.com/en-us/character/us/${player.realm}/${player.name.toLowerCase()}`;
    }
    const ratingsData = await getAllBracketRatings(player.name, player.realm, classKey, env);
    player.pvp.current = ratingsData.current;
    player.pvp.wins = ratingsData.wins;
    player.pvp.losses = ratingsData.losses;
    const brackets = ["rs", "r2", "r3", "rbg", "bgs"];
    brackets.forEach((key) => {
      const maxKey = `max_${key}`;
      const currentMax = player.pvp.season_max[maxKey] || 0;
      const newRating = ratingsData.current[key] || 0;
      player.pvp.season_max[maxKey] = Math.max(currentMax, newRating);
    });
    player.battlepass = calculateBattlePass(player.pvp);
    player.sync.last_update = (/* @__PURE__ */ new Date()).toISOString();
    player.sync.last_success = (/* @__PURE__ */ new Date()).toISOString();
    player.sync.last_error = null;
    player.sync.sync_status = ratingsData.hasApiBug ? "api_bug_ss" : "ok";
    player.sync.blizzard_status = 200;
    await env.EXILIUM_KV.put(playerId, JSON.stringify(player));
    return player;
  } catch (err) {
    player.sync.last_update = (/* @__PURE__ */ new Date()).toISOString();
    player.sync.last_error = err.message;
    player.sync.sync_status = "error";
    await env.EXILIUM_KV.put(playerId, JSON.stringify(player));
    throw err;
  }
}
__name(syncPlayer, "syncPlayer");
async function syncAllPlayers(env) {
  const { keys } = await env.EXILIUM_KV.list({ prefix: "player:" });
  const allPlayers = await Promise.all(keys.map((key) => env.EXILIUM_KV.get(key.name, "json")));
  const players = allPlayers.filter((p) => p);
  let synced = 0;
  let errors = 0;
  for (let i = 0; i < players.length; i += 5) {
    const batch = players.slice(i, i + 5);
    const results = await Promise.allSettled(
      batch.map((p) => syncPlayer(null, env, `player:${p.id}`))
    );
    results.forEach((r) => {
      if (r.status === "fulfilled") synced++;
      else errors++;
    });
    if (i + 5 < players.length) await new Promise((resolve) => setTimeout(resolve, 500));
  }
  const summary = {
    timestamp: (/* @__PURE__ */ new Date()).toISOString(),
    status: errors > players.length / 2 ? "alert" : "ok",
    players_synced: synced,
    errors,
    total: players.length
  };
  await env.EXILIUM_KV.put("cron:last_run", JSON.stringify(summary));
  if (errors > players.length / 2) {
    await env.EXILIUM_KV.put("meta:cron_alert", JSON.stringify({
      timestamp: (/* @__PURE__ */ new Date()).toISOString(),
      message: `Alerta: ${errors}/${players.length} jugadores fallaron en el sync`
    }));
  }
  return summary;
}
__name(syncAllPlayers, "syncAllPlayers");
async function adjustPlayerXp(request, env, playerId) {
  const player = await getPlayer(request, env, playerId);
  if (!player) return { error: "Jugador no encontrado", status: 404 };
  const { amount, reason } = await request.json();
  if (typeof amount !== "number" || !reason) return { error: "Se requiere `amount` (n\xFAmero) y `reason` (string).", status: 400 };
  player.pvp.manual_bonus = (player.pvp.manual_bonus || 0) + amount;
  player.battlepass = calculateBattlePass(player.pvp);
  await env.EXILIUM_KV.put(playerId, JSON.stringify(player));
  return player;
}
__name(adjustPlayerXp, "adjustPlayerXp");
async function grantPlayerTitle(request, env, playerId) {
  const player = await getPlayer(request, env, playerId);
  if (!player) return { error: "Jugador no encontrado", status: 404 };
  const { title } = await request.json();
  if (title !== "legend" && title !== "gladiator") return { error: "T\xEDtulo inv\xE1lido. Debe ser `legend` o `gladiator`.", status: 400 };
  player.titles[title] = true;
  player.pvp.manual_bonus = (player.pvp.manual_bonus || 0) + 3500;
  player.battlepass = calculateBattlePass(player.pvp);
  await env.EXILIUM_KV.put(playerId, JSON.stringify(player));
  return player;
}
__name(grantPlayerTitle, "grantPlayerTitle");
async function marryPlayers(request, env) {
  const { player1_id, player2_id } = await request.json();
  // ── FIX: Use "player:" prefix for KV keys ──
  const p1Key = player1_id.startsWith("player:") ? player1_id : `player:${player1_id}`;
  const p2Key = player2_id.startsWith("player:") ? player2_id : `player:${player2_id}`;
  const p1 = await getPlayer(null, env, p1Key);
  const p2 = await getPlayer(null, env, p2Key);
  if (!p1 || !p2) return { error: "Uno o ambos jugadores no encontrados", status: 404 };
  const since = (/* @__PURE__ */ new Date()).toISOString();
  p1.marriage = { married_to: p2.id, partner_name: p2.name, married_since: since };
  p2.marriage = { married_to: p1.id, partner_name: p1.name, married_since: since };
  await env.EXILIUM_KV.put(p1Key, JSON.stringify(p1));
  await env.EXILIUM_KV.put(p2Key, JSON.stringify(p2));
  return { success: true };
}
__name(marryPlayers, "marryPlayers");
async function divorcePlayer(request, env, playerId) {
  const p1 = await getPlayer(request, env, playerId);
  if (!p1 || !p1.marriage) return { error: "Jugador no encontrado o no est\xE1 casado", status: 404 };
  // ── FIX: Use "player:" prefix for partner KV key ──
  const partnerKey = p1.marriage.married_to.startsWith("player:") ? p1.marriage.married_to : `player:${p1.marriage.married_to}`;
  const p2 = await getPlayer(null, env, partnerKey);
  p1.marriage = null;
  if (p2) {
    p2.marriage = null;
    await env.EXILIUM_KV.put(partnerKey, JSON.stringify(p2));
  }
  await env.EXILIUM_KV.put(playerId, JSON.stringify(p1));
  return { success: true };
}
__name(divorcePlayer, "divorcePlayer");

// worker/addon.js
var CLASS_ID_MAP = {
  "WARRIOR": 1,
  "PALADIN": 2,
  "HUNTER": 3,
  "ROGUE": 4,
  "PRIEST": 5,
  "DEATH KNIGHT": 6,
  "SHAMAN": 7,
  "MAGE": 8,
  "WARLOCK": 9,
  "MONK": 10,
  "DRUID": 11,
  "DEMON HUNTER": 12,
  "EVOKER": 13
};
function normalizeName(name) {
  return name.charAt(0).toUpperCase() + name.slice(1).toLowerCase();
}
__name(normalizeName, "normalizeName");
async function getRatingsForAddon(request, env) {
  const players = await getPlayersData(env, false);
  const formattedPlayers = players.map((p) => {
    const pvp = p.pvp || { current: {} };
    const battlepass = p.battlepass || { total_xp: 0, level: 0, rank_name: "EXILIADO" };
    const className = (p.class || "").toUpperCase();
    return {
      name: normalizeName(p.name),
      realm: normalizeName(p.realm_display || p.realm),
      class: className.replace(" ", ""),
      class_id: CLASS_ID_MAP[className] || 0,
      r2: pvp.current.r2 || 0,
      r3: pvp.current.r3 || 0,
      rs: pvp.current.rs || 0,
      rbg: pvp.current.rbg || 0,
      bgs: pvp.current.bgs || 0,
      xp: battlepass.total_xp,
      level: battlepass.level,
      rank: battlepass.rank_name
    };
  });
  return {
    players: formattedPlayers,
    timestamp: Math.floor(Date.now() / 1e3),
    season: "s1-midnight",
    total_players: formattedPlayers.length
  };
}
__name(getRatingsForAddon, "getRatingsForAddon");
async function exportAddonDataLua(request, env) {
  const players = await getPlayersData(env, false);
  let luaString = "ExiliumDB = {\n";
  luaString += "  players = {\n";
  players.forEach((p) => {
    const playerName = `${p.name}-${p.realm}`.replace(/'/g, "");
    luaString += `    ['${playerName}'] = {
`;
    luaString += `      xp = ${p.battlepass?.total_xp || 0},
`;
    luaString += `      level = ${p.battlepass?.level || 0},
`;
    luaString += `      rank = "${p.battlepass?.rank_name || "EXILIADO"}",
`;
    luaString += "    },\n";
  });
  luaString += "  }\n";
  luaString += "}\n";
  return new Response(luaString, { headers: { "Content-Type": "text/plain" } });
}
__name(exportAddonDataLua, "exportAddonDataLua");

// worker/errors.js
var ERROR_LOG_KEY = "meta:error_log";
var MAX_LOG_ENTRIES = 50;
async function logError(err, module, env, details = {}) {
  try {
    const errorLog = await env.EXILIUM_KV.get(ERROR_LOG_KEY, { type: "json" }) || [];
    const newErrorEntry = {
      timestamp: (/* @__PURE__ */ new Date()).toISOString(),
      module,
      message: err.message,
      status: err.status || 500,
      ...details
    };
    errorLog.unshift(newErrorEntry);
    if (errorLog.length > MAX_LOG_ENTRIES) {
      errorLog.length = MAX_LOG_ENTRIES;
    }
    await env.EXILIUM_KV.put(ERROR_LOG_KEY, JSON.stringify(errorLog));
  } catch (loggingError) {
    console.error("FATAL: Fallo al escribir en el log de errores de KV.", loggingError);
    console.error("Error original:", err);
  }
}
__name(logError, "logError");
async function getErrorLog(request, env) {
  return await env.EXILIUM_KV.get(ERROR_LOG_KEY, { type: "json" }) || [];
}
__name(getErrorLog, "getErrorLog");
async function clearErrorLog(request, env) {
  await env.EXILIUM_KV.delete(ERROR_LOG_KEY);
  return { success: true, message: "Log de errores limpiado." };
}
__name(clearErrorLog, "clearErrorLog");

// worker/announcement.js
var ANNOUNCEMENT_KEY = "announcement:current";
async function getAnnouncement(request, env) {
  return await env.EXILIUM_KV.get(ANNOUNCEMENT_KEY, "json") || {};
}
__name(getAnnouncement, "getAnnouncement");
async function setAnnouncement(request, env) {
  const data = await request.json();
  if (!data.message || !data.type) {
    return { error: "El anuncio debe tener un mensaje y un tipo.", status: 400 };
  }
  await env.EXILIUM_KV.put(ANNOUNCEMENT_KEY, JSON.stringify(data));
  return { success: true, announcement: data };
}
__name(setAnnouncement, "setAnnouncement");
async function deleteAnnouncement(request, env) {
  await env.EXILIUM_KV.delete(ANNOUNCEMENT_KEY);
  return { success: true, message: "Anuncio eliminado." };
}
__name(deleteAnnouncement, "deleteAnnouncement");

// worker/season.js
async function closeSeason(request, env) {
  return {
    error: "Funci\xF3n no implementada. Requiere doble confirmaci\xF3n y es una zona peligrosa.",
    status: 501
  };
}
__name(closeSeason, "closeSeason");

// worker/index.js
function jsonResponse(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json" }
  });
}
__name(jsonResponse, "jsonResponse");
async function handleRequest(request, env, ctx) {
  const url = new URL(request.url);
  const path = url.pathname;
  const method = request.method;
  if (method === "GET" && path === "/api/health") return new Response("OK");
  if (method === "GET" && path === "/api/players") {
    const players = await getPlayersData(env, false);
    return jsonResponse(players);
  }
  if (method === "GET" && path.startsWith("/api/players/")) {
    const playerId = path.split("/")[3];
    const player = await getPlayer(request, env, `player:${playerId}`);
    return player ? jsonResponse(player) : jsonResponse({ error: "Jugador no encontrado" }, 404);
  }
  if (method === "GET" && path === "/api/announcement") {
    const announcement = await getAnnouncement(request, env);
    return jsonResponse(announcement);
  }
  if (method === "GET" && path === "/api/ratings") {
    if (!handlePublicAuth(request, env)) {
      return jsonResponse({ error: "Unauthorized" }, 401);
    }
    const ratings = await getRatingsForAddon(request, env);
    return jsonResponse(ratings);
  }
  if (path.startsWith("/admin/")) {
    if (method === "POST" && path === "/admin/auth") {
      const loginResponse = await handleAdminLogin(request, env);
      return jsonResponse(loginResponse, loginResponse.error ? 401 : 200);
    }
    if (!await handleAdminAuth(request, env)) {
      return jsonResponse({ error: "Unauthorized" }, 401);
    }
    if (method === "GET" && path === "/admin/players") {
      const players = await getPlayersData(env, true);
      return jsonResponse(players);
    }
    if (method === "POST" && path === "/admin/players") {
      const result = await createPlayer(request, env);
      return jsonResponse(result, result.error ? 400 : 201);
    }
    if (method === "PATCH" && path.startsWith("/admin/players/")) {
      const playerId = path.split("/")[3];
      const result = await updatePlayer(request, env, `player:${playerId}`);
      return jsonResponse(result, result.error ? 404 : 200);
    }
    if (method === "DELETE" && path.startsWith("/admin/players/")) {
      const playerId = path.split("/")[3];
      const result = await deletePlayer(request, env, `player:${playerId}`);
      return jsonResponse(result);
    }
    if (method === "POST" && path.endsWith("/refresh")) {
      const playerId = path.split("/")[3];
      const result = await syncPlayer(request, env, `player:${playerId}`);
      return jsonResponse(result, result.error ? 500 : 200);
    }
    if (method === "POST" && path.endsWith("/xp")) {
      const playerId = path.split("/")[3];
      const result = await adjustPlayerXp(request, env, `player:${playerId}`);
      return jsonResponse(result, result.error ? 400 : 200);
    }
    if (method === "POST" && path.endsWith("/title")) {
      const playerId = path.split("/")[3];
      const result = await grantPlayerTitle(request, env, `player:${playerId}`);
      return jsonResponse(result, result.error ? 400 : 200);
    }
    if (method === "POST" && path === "/admin/players/marry") {
      const result = await marryPlayers(request, env);
      return jsonResponse(result, result.error ? 404 : 200);
    }
    if (method === "POST" && path.startsWith("/admin/players/divorce")) {
      const playerId = path.split("/")[4];
      const result = await divorcePlayer(request, env, `player:${playerId}`);
      return jsonResponse(result, result.error ? 404 : 200);
    }
    if (method === "POST" && path === "/admin/sync") {
      const result = await syncAllPlayers(env);
      return jsonResponse(result);
    }
    if (method === "GET" && path === "/admin/announcement") {
      const announcement = await getAnnouncement(request, env);
      return jsonResponse(announcement);
    }
    if (method === "POST" && path === "/admin/announcement") {
      const result = await setAnnouncement(request, env);
      return jsonResponse(result, result.error ? 400 : 200);
    }
    if (method === "DELETE" && path === "/admin/announcement") {
      return jsonResponse(await deleteAnnouncement(request, env));
    }
    if (method === "GET" && path === "/admin/export-addon") {
      return exportAddonDataLua(request, env);
    }
    if (method === "POST" && path === "/admin/season/close") {
      const result = await closeSeason(request, env);
      return jsonResponse(result, result.error ? 501 : 200);
    }
    if (method === "GET" && path === "/admin/errors") {
      return jsonResponse(await getErrorLog(request, env));
    }
    if (method === "DELETE" && path === "/admin/errors") {
      return jsonResponse(await clearErrorLog(request, env));
    }
  }
  return jsonResponse({ error: "Ruta no encontrada" }, 404);
}
__name(handleRequest, "handleRequest");
var index_default = {
  async fetch(request, env, ctx) {
    if (request.method === "OPTIONS") {
      return new Response(null, {
        headers: {
          "Access-Control-Allow-Origin": env.CORS_ORIGIN || "*",
          "Access-Control-Allow-Methods": "GET, POST, PATCH, DELETE, OPTIONS",
          "Access-Control-Allow-Headers": "Content-Type, Authorization, X-API-Token",
          "Access-Control-Max-Age": "86400"
        }
      });
    }
    let response;
    try {
      response = await handleRequest(request, env, ctx);
    } catch (err) {
      console.error("Error global no capturado:", err);
      ctx.waitUntil(logError(err, "global_unhandled", env, { path: request.url }));
      response = jsonResponse({ error: "Error interno del servidor" }, 500);
    }
    const corsResponse = new Response(response.body, response);
    corsResponse.headers.set("Access-Control-Allow-Origin", env.CORS_ORIGIN || "*");
    corsResponse.headers.set("Vary", "Origin");
    return corsResponse;
  },
  async scheduled(event, env, ctx) {
    console.log(`[CRON] Iniciando sincronizaci\xF3n programada: ${(/* @__PURE__ */ new Date()).toISOString()}`);
    ctx.waitUntil(
      syncAllPlayers(env).catch((err) => {
        console.error("[CRON] Error durante la sincronizaci\xF3n masiva:", err);
        logError(err, "cron", env);
      })
    );
  }
};
export {
  index_default as default
};
