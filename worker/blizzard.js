// worker/blizzard.js

const BNET_TOKEN_URL = 'https://us.battle.net/oauth/token';
const API_BASE_URL = 'https://us.api.blizzard.com';
const TOKEN_KV_KEY = 'blizzard:token';
const SEASON_ID_KV_KEY = 'blizzard:current_season_id';

const SHUFFLE_SPECS = {
  'warrior': ['shuffle-warrior-arms', 'shuffle-warrior-fury', 'shuffle-warrior-protection'],
  'paladin': ['shuffle-paladin-holy', 'shuffle-paladin-protection', 'shuffle-paladin-retribution'],
  'hunter': ['shuffle-hunter-beastmastery', 'shuffle-hunter-marksmanship', 'shuffle-hunter-survival'],
  'rogue': ['shuffle-rogue-assassination', 'shuffle-rogue-outlaw', 'shuffle-rogue-subtlety'],
  'priest': ['shuffle-priest-discipline', 'shuffle-priest-holy', 'shuffle-priest-shadow'],
  'death-knight': ['shuffle-deathknight-blood', 'shuffle-deathknight-frost', 'shuffle-deathknight-unholy'],
  'shaman': ['shuffle-shaman-elemental', 'shuffle-shaman-enhancement', 'shuffle-shaman-restoration'],
  'mage': ['shuffle-mage-arcane', 'shuffle-mage-fire', 'shuffle-mage-frost'],
  'warlock': ['shuffle-warlock-affliction', 'shuffle-warlock-demonology', 'shuffle-warlock-destruction'],
  'monk': ['shuffle-monk-brewmaster', 'shuffle-monk-mistweaver', 'shuffle-monk-windwalker'],
  'druid': ['shuffle-druid-balance', 'shuffle-druid-feral', 'shuffle-druid-guardian', 'shuffle-druid-restoration'],
  'demon-hunter': ['shuffle-demonhunter-havoc', 'shuffle-demonhunter-vengeance'],
  'evoker': ['shuffle-evoker-devastation', 'shuffle-evoker-preservation', 'shuffle-evoker-augmentation'],
};

/**
 * FIX #9: Blitz usa brackets por clase/spec como Solo Shuffle.
 * El bracket 'battlegrounds-blitz' no existe en la API.
 * Formato correcto: blitz-{classSlug}-{specSlug}
 */
const BLITZ_SPECS = {
  'warrior': ['blitz-warrior-arms', 'blitz-warrior-fury', 'blitz-warrior-protection'],
  'paladin': ['blitz-paladin-holy', 'blitz-paladin-protection', 'blitz-paladin-retribution'],
  'hunter': ['blitz-hunter-beastmastery', 'blitz-hunter-marksmanship', 'blitz-hunter-survival'],
  'rogue': ['blitz-rogue-assassination', 'blitz-rogue-outlaw', 'blitz-rogue-subtlety'],
  'priest': ['blitz-priest-discipline', 'blitz-priest-holy', 'blitz-priest-shadow'],
  'death-knight': ['blitz-deathknight-blood', 'blitz-deathknight-frost', 'blitz-deathknight-unholy'],
  'shaman': ['blitz-shaman-elemental', 'blitz-shaman-enhancement', 'blitz-shaman-restoration'],
  'mage': ['blitz-mage-arcane', 'blitz-mage-fire', 'blitz-mage-frost'],
  'warlock': ['blitz-warlock-affliction', 'blitz-warlock-demonology', 'blitz-warlock-destruction'],
  'monk': ['blitz-monk-brewmaster', 'blitz-monk-mistweaver', 'blitz-monk-windwalker'],
  'druid': ['blitz-druid-balance', 'blitz-druid-feral', 'blitz-druid-guardian', 'blitz-druid-restoration'],
  'demon-hunter': ['blitz-demonhunter-havoc', 'blitz-demonhunter-vengeance'],
  'evoker': ['blitz-evoker-devastation', 'blitz-evoker-preservation', 'blitz-evoker-augmentation'],
};

/**
 * FIX #2: Normaliza realm slugs para la API de Blizzard.
 * Blizzard espera slugs sin apóstrofes, acentos, ni caracteres especiales.
 * Ej: "Quel'Thalas" → "quelthalas", "Área 52" → "area-52"
 */
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

/**
 * FIX #1: Eliminado btoa() para Basic Auth.
 * Ahora se envían credenciales como body params con encodeURIComponent.
 * Se valida que env tenga las credenciales antes de intentar.
 */
export async function getAccessToken(env) {
  if (!env?.BLIZZARD_CLIENT_ID || !env?.BLIZZARD_CLIENT_SECRET) {
    throw new Error('Blizzard OAuth: BLIZZARD_CLIENT_ID o BLIZZARD_CLIENT_SECRET no configurados en env.');
  }

  let token = await env.EXILIUM_KV.get(TOKEN_KV_KEY, 'json');
  if (token && token.expires_at > Date.now()) {
    return token.access_token;
  }

  const client_id = env.BLIZZARD_CLIENT_ID;
  const client_secret = env.BLIZZARD_CLIENT_SECRET;

  const response = await fetch(BNET_TOKEN_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: `grant_type=client_credentials&client_id=${encodeURIComponent(client_id)}&client_secret=${encodeURIComponent(client_secret)}`,
  });

  if (!response.ok) {
    const body = await response.text();
    await env.EXILIUM_KV.delete(TOKEN_KV_KEY);
    throw new Error(`Blizzard OAuth HTTP ${response.status}: ${body}`);
  }

  const data = await response.json();
  const ttl = Math.max(data.expires_in - 300, 60);
  const newToken = {
    access_token: data.access_token,
    expires_at: Date.now() + ttl * 1000,
  };

  await env.EXILIUM_KV.put(TOKEN_KV_KEY, JSON.stringify(newToken), { expirationTtl: ttl });
  return newToken.access_token;
}

export async function getCurrentSeasonId(env) {
  let seasonId = await env.EXILIUM_KV.get(SEASON_ID_KV_KEY);
  if (seasonId) return parseInt(seasonId, 10);

  const url = `${API_BASE_URL}/data/wow/pvp-season/index?namespace=dynamic-us&locale=en_US`;
  const response = await fetchWithAuthRetry(url, env);
  if (!response.ok) throw new Error('No se pudo obtener el índice de temporadas de PvP.');

  const data = await response.json();
  const currentSeason = data.current_season || data.seasons[data.seasons.length - 1];
  seasonId = currentSeason.id;

  await env.EXILIUM_KV.put(SEASON_ID_KV_KEY, String(seasonId), { expirationTtl: 21600 });
  return parseInt(seasonId, 10);
}

const RETRYABLE_STATUSES = new Set([429, 500, 502, 503, 504]);
const MAX_RETRIES = 3;
const BASE_DELAY_MS = 500;

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

async function fetchWithAuthRetry(url, env) {
  let accessToken = await getAccessToken(env);

  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    const response = await fetch(url, { headers: { 'Authorization': `Bearer ${accessToken}` } });

    // Token expirado: refrescar y reintentar una vez
    if (response.status === 401 && attempt === 0) {
      await env.EXILIUM_KV.delete(TOKEN_KV_KEY);
      accessToken = await getAccessToken(env);
      continue;
    }

    // Errores retryables: esperar con backoff exponencial
    if (RETRYABLE_STATUSES.has(response.status) && attempt < MAX_RETRIES) {
      const delay = BASE_DELAY_MS * Math.pow(2, attempt);
      console.warn(`[Blizzard] HTTP ${response.status} en ${url} — reintento ${attempt + 1}/${MAX_RETRIES} en ${delay}ms`);
      await sleep(delay);
      continue;
    }

    return response;
  }

  // Fallback: último intento sin reintentos
  return fetch(url, { headers: { 'Authorization': `Bearer ${accessToken}` } });
}

export async function getCharacterProfile(name, realmSlug, env) {
  const slug = normalizeRealmSlug(realmSlug);
  const encodedName = encodeURIComponent(name.toLowerCase());
  const url = `${API_BASE_URL}/profile/wow/character/${slug}/${encodedName}?namespace=profile-us&locale=en_US`;
  const response = await fetchWithAuthRetry(url, env);

  if (!response.ok) return { error: true, status: response.status };

  const data = await response.json();
  return {
    class_name: data.character_class?.name || '',
    spec: data.active_spec?.name || '',
    race: data.race?.name || '',
    faction: data.faction?.type || '',
    level: data.level || 0,
    ilvl: data.average_item_level || 0,
  };
}

export async function getCharacterMedia(name, realmSlug, env) {
  const slug = normalizeRealmSlug(realmSlug);
  const encodedName = encodeURIComponent(name.toLowerCase());
  const url = `${API_BASE_URL}/profile/wow/character/${slug}/${encodedName}/character-media?namespace=profile-us&locale=en_US`;
  const response = await fetchWithAuthRetry(url, env);
  if (!response.ok) return null;

  const data = await response.json();
  const avatar = data.assets?.find((a) => a.key === 'avatar');
  return avatar?.value || null;
}

export async function getBracketRating(name, realmSlug, bracket, currentSeasonId, env) {
  const slug = normalizeRealmSlug(realmSlug);
  const encodedName = encodeURIComponent(name.toLowerCase());
  const url = `${API_BASE_URL}/profile/wow/character/${slug}/${encodedName}/pvp-bracket/${bracket}?namespace=profile-us&locale=en_US`;
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

  if (rating === 0 && played > 0 && bracket.startsWith('shuffle-')) {
    return { rating: 0, wins: won, losses: lost, valid: true, apiBug: true };
  }

  return { rating, wins: won, losses: lost, valid: true, apiBug: false };
}

export async function getAllBracketRatings(name, realmSlug, classKey, env) {
  const currentSeasonId = await getCurrentSeasonId(env);

  const result = {
    current: { rs: 0, r2: 0, r3: 0, rbg: 0, bgs: 0 },
    wins: { rs: 0, r2: 0, r3: 0, rbg: 0, bgs: 0 },
    losses: { rs: 0, r2: 0, r3: 0, rbg: 0, bgs: 0 },
    hasApiBug: false,
  };

  // Brackets estándar: 2v2, 3v3, rbg
  const [r2, r3, rbg] = await Promise.all([
    getBracketRating(name, realmSlug, '2v2', currentSeasonId, env),
    getBracketRating(name, realmSlug, '3v3', currentSeasonId, env),
    getBracketRating(name, realmSlug, 'rbg', currentSeasonId, env),
  ]);

  result.current.r2 = r2.rating;
  result.wins.r2 = r2.wins;
  result.losses.r2 = r2.losses;

  result.current.r3 = r3.rating;
  result.wins.r3 = r3.wins;
  result.losses.r3 = r3.losses;

  result.current.rbg = rbg.rating;
  result.wins.rbg = rbg.wins;
  result.losses.rbg = rbg.losses;

  const classSlug = classKey || '';

  // Solo Shuffle: brackets por clase/spec, se toma el mayor rating
  const shuffleSpecs = SHUFFLE_SPECS[classSlug] || [];
  if (shuffleSpecs.length > 0) {
    const shuffleResults = await Promise.all(
      shuffleSpecs.map((spec) => getBracketRating(name, realmSlug, spec, currentSeasonId, env))
    );

    let maxShuffleRating = 0;
    let shuffleWins = 0;
    let shuffleLosses = 0;

    for (const ss of shuffleResults) {
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
  }

  // FIX #9: Blitz usa brackets por clase/spec (igual que Shuffle)
  const blitzSpecs = BLITZ_SPECS[classSlug] || [];
  if (blitzSpecs.length > 0) {
    const blitzResults = await Promise.all(
      blitzSpecs.map((spec) => getBracketRating(name, realmSlug, spec, currentSeasonId, env))
    );

    let maxBlitzRating = 0;
    let blitzWins = 0;
    let blitzLosses = 0;

    for (const bs of blitzResults) {
      if (bs.rating > maxBlitzRating) {
        maxBlitzRating = bs.rating;
        blitzWins = bs.wins;
        blitzLosses = bs.losses;
      }
    }

    result.current.bgs = maxBlitzRating;
    result.wins.bgs = blitzWins;
    result.losses.bgs = blitzLosses;
  }

  return result;
}
