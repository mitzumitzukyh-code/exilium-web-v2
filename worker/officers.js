// worker/officers.js
// Gestión de oficiales de la guild en KV
// Los oficiales son independientes del Battle Pass — cualquier personaje puede ser oficial.

import { getCharacterProfile, getCharacterMedia, getAllBracketRatings } from './blizzard.js';

const KV_KEY = 'config:officers';

const CLASS_SLUG_MAP = {
  'Warrior': 'warrior', 'Paladin': 'paladin', 'Hunter': 'hunter',
  'Rogue': 'rogue', 'Priest': 'priest', 'Death Knight': 'death-knight',
  'Shaman': 'shaman', 'Mage': 'mage', 'Warlock': 'warlock',
  'Monk': 'monk', 'Druid': 'druid', 'Demon Hunter': 'demon-hunter',
  'Evoker': 'evoker',
};

function normalizeId(name, realm) {
  return (name + '-' + realm)
    .toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/['']/g, '')
    .replace(/\s+/g, '')
    .replace(/[^a-z0-9-]/g, '');
}

// Busca cualquier personaje en Blizzard API y devuelve datos enriquecidos
export async function lookupCharacter(name, realm, env) {
  const profile = await getCharacterProfile(name, realm, env);
  if (profile.error) {
    return { error: 'Personaje no encontrado (HTTP ' + profile.status + ')' };
  }

  const avatar = await getCharacterMedia(name, realm, env);
  const classSlug = CLASS_SLUG_MAP[profile.class_name] || profile.class_name.toLowerCase().replace(/\s+/g, '-');

  let pvp = { current: {}, wins: {}, losses: {} };
  try {
    pvp = await getAllBracketRatings(name, realm, classSlug, env);
  } catch (_) { /* PvP data optional */ }

  const realmSlug = realm.toLowerCase().replace(/['']/g, '').replace(/\s+/g, '');
  const displayName = name.charAt(0).toUpperCase() + name.slice(1).toLowerCase();

  return {
    id: normalizeId(name, realm),
    name: displayName,
    realm: realmSlug,
    realm_display: realm,
    class: profile.class_name,
    spec: profile.spec,
    race: profile.race,
    faction: profile.faction,
    level: profile.level,
    ilvl: profile.ilvl,
    media: {
      avatar: avatar || null,
      armory_url: 'https://worldofwarcraft.blizzard.com/en-us/character/us/' + realmSlug + '/' + encodeURIComponent(name.toLowerCase()),
    },
    pvp: {
      current: pvp.current || {},
      wins: pvp.wins || {},
      losses: pvp.losses || {},
    },
  };
}

export async function getOfficers(env) {
  const raw = await env.EXILIUM_KV.get(KV_KEY);
  return raw ? JSON.parse(raw) : [];
}

// Devuelve oficiales con datos de jugador enriquecidos (mezcla KV inscrito + datos guardados)
export async function getOfficersEnriched(env) {
  const officers = await getOfficers(env);
  const enriched = [];

  for (const o of officers) {
    // Intenta obtener datos del jugador inscrito en el BP
    const playerRaw = await env.EXILIUM_KV.get('player:' + o.player_id);
    let playerData = playerRaw ? JSON.parse(playerRaw) : null;

    // Si no está inscrito, usar los datos guardados del oficial
    if (!playerData && o.player_data) {
      playerData = o.player_data;
    }

    enriched.push({
      ...o,
      player_data: playerData || null,
    });
  }

  return enriched;
}

export async function addOfficer(request, env) {
  const body = await request.json();
  const charName = body.character_name || '';
  const charRealm = body.realm || '';

  if (!charName || !charRealm) {
    return { error: 'character_name y realm son requeridos' };
  }

  const playerId = normalizeId(charName, charRealm);
  const officers = await getOfficers(env);

  if (officers.find(o => o.player_id === playerId)) {
    return { error: 'Este jugador ya es oficial' };
  }

  // Buscar datos del personaje en Blizzard API
  const charData = await lookupCharacter(charName, charRealm, env);
  if (charData.error) {
    return { error: charData.error };
  }

  officers.push({
    player_id: playerId,
    player_data: charData,
    lore: body.lore || '',
    title: body.title || 'Oficial',
    order: body.order ?? officers.length,
    added_at: new Date().toISOString(),
  });

  await env.EXILIUM_KV.put(KV_KEY, JSON.stringify(officers));
  return { ok: true, officers };
}

export async function updateOfficer(request, env, playerId) {
  const body = await request.json();
  const officers = await getOfficers(env);
  const index = officers.findIndex(o => o.player_id === playerId);

  if (index === -1) {
    return { error: 'Oficial no encontrado' };
  }

  if (body.lore !== undefined) officers[index].lore = body.lore;
  if (body.title !== undefined) officers[index].title = body.title;
  if (body.order !== undefined) officers[index].order = body.order;

  // Refresh datos de Blizzard si se pide
  if (body.refresh_data) {
    const o = officers[index];
    const charData = o.player_data;
    if (charData) {
      const fresh = await lookupCharacter(charData.name, charData.realm_display || charData.realm, env);
      if (!fresh.error) {
        officers[index].player_data = fresh;
      }
    }
  }

  await env.EXILIUM_KV.put(KV_KEY, JSON.stringify(officers));
  return { ok: true, officer: officers[index] };
}

export async function removeOfficer(env, playerId) {
  const officers = await getOfficers(env);
  const filtered = officers.filter(o => o.player_id !== playerId);

  if (filtered.length === officers.length) {
    return { error: 'Oficial no encontrado' };
  }

  await env.EXILIUM_KV.put(KV_KEY, JSON.stringify(filtered));
  return { ok: true, removed: playerId };
}
