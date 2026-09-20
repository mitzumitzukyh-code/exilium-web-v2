// ============================================================
//  worker/rbg-league.js
//  Liga RBG — inscripción + roster (KV: rbg:*).
//  Sesión: reutiliza el token Discord del casino (exi_tk / casino:session:*).
// ============================================================

import { verifyCasinoSession } from './casino-auth.js';
import {
  getAccessToken,
  getCharacterProfile,
  getBracketRating,
  getCurrentSeasonId,
} from './blizzard.js';

const PROFILE_PREFIX = 'rbg:profile:';
const PHOTO_PREFIX = 'rbg:photo:';
const INDEX_KEY = 'rbg:league_index';
const CORE_KEY = 'rbg:core';

const COUNTRIES = [
  'VE', 'MX', 'AR', 'CL', 'PE', 'CO', 'EC', 'BO', 'UY', 'PY',
  'BR', 'DO', 'CR', 'PA', 'GT', 'HN', 'SV', 'NI', 'CU', 'PR',
  'HT', 'ES', 'US', 'CA', 'OTRO',
];

// Specs alineadas con assets/rbg/specs/*.jpg (ids = nombre de archivo).
const SPECS = {
  warrior_arms:        { name: 'Arms',           cls: 'Guerrero',        role: 'dps',    color: '#C79C6E' },
  warrior_fury:        { name: 'Fury',           cls: 'Guerrero',        role: 'dps',    color: '#C79C6E' },
  warrior_protection:  { name: 'Protection',     cls: 'Guerrero',        role: 'tank',   color: '#C79C6E' },
  paladin_holy:        { name: 'Holy',           cls: 'Paladín',         role: 'healer', color: '#F58CBA' },
  paladin_protection:  { name: 'Protection',     cls: 'Paladín',         role: 'tank',   color: '#F58CBA' },
  paladin_retribution: { name: 'Retribution',    cls: 'Paladín',         role: 'dps',    color: '#F58CBA' },
  hunter_beastmastery: { name: 'Beast Mastery',  cls: 'Cazador',         role: 'dps',    color: '#ABD473' },
  hunter_marksmanship: { name: 'Marksmanship',   cls: 'Cazador',         role: 'dps',    color: '#ABD473' },
  hunter_survival:     { name: 'Survival',       cls: 'Cazador',         role: 'dps',    color: '#ABD473' },
  rogue_assassination: { name: 'Assassination',  cls: 'Pícaro',          role: 'dps',    color: '#FFF569' },
  rogue_outlaw:        { name: 'Outlaw',         cls: 'Pícaro',          role: 'dps',    color: '#FFF569' },
  rogue_subtlety:      { name: 'Subtlety',       cls: 'Pícaro',          role: 'dps',    color: '#FFF569' },
  priest_discipline:   { name: 'Discipline',     cls: 'Sacerdote',       role: 'healer', color: '#FFFFFF' },
  priest_holy:         { name: 'Holy',           cls: 'Sacerdote',       role: 'healer', color: '#FFFFFF' },
  priest_shadow:       { name: 'Shadow',         cls: 'Sacerdote',       role: 'dps',    color: '#FFFFFF' },
  dk_blood:            { name: 'Blood',          cls: 'Caballero de la Muerte', role: 'tank', color: '#C41F3B' },
  dk_frost:            { name: 'Frost',          cls: 'Caballero de la Muerte', role: 'dps',  color: '#C41F3B' },
  dk_unholy:           { name: 'Unholy',         cls: 'Caballero de la Muerte', role: 'dps',  color: '#C41F3B' },
  shaman_elemental:    { name: 'Elemental',      cls: 'Chamán',          role: 'dps',    color: '#0070DE' },
  shaman_enhancement:  { name: 'Enhancement',    cls: 'Chamán',          role: 'dps',    color: '#0070DE' },
  shaman_restoration:  { name: 'Restoration',    cls: 'Chamán',          role: 'healer', color: '#0070DE' },
  mage_arcane:         { name: 'Arcane',         cls: 'Mago',            role: 'dps',    color: '#69CCF0' },
  mage_fire:           { name: 'Fire',           cls: 'Mago',            role: 'dps',    color: '#69CCF0' },
  mage_frost:          { name: 'Frost',          cls: 'Mago',            role: 'dps',    color: '#69CCF0' },
  warlock_affliction:  { name: 'Affliction',     cls: 'Brujo',           role: 'dps',    color: '#9482C9' },
  warlock_demonology:  { name: 'Demonology',     cls: 'Brujo',           role: 'dps',    color: '#9482C9' },
  warlock_destruction: { name: 'Destruction',    cls: 'Brujo',           role: 'dps',    color: '#9482C9' },
  monk_brewmaster:     { name: 'Brewmaster',     cls: 'Monje',           role: 'tank',   color: '#00FF96' },
  monk_mistweaver:     { name: 'Mistweaver',     cls: 'Monje',           role: 'healer', color: '#00FF96' },
  monk_windwalker:     { name: 'Windwalker',     cls: 'Monje',           role: 'dps',    color: '#00FF96' },
  druid_balance:       { name: 'Balance',        cls: 'Druida',          role: 'dps',    color: '#FF7D0A' },
  druid_feral:         { name: 'Feral',          cls: 'Druida',          role: 'dps',    color: '#FF7D0A' },
  druid_guardian:      { name: 'Guardian',       cls: 'Druida',          role: 'tank',   color: '#FF7D0A' },
  druid_restoration:   { name: 'Restoration',    cls: 'Druida',          role: 'healer', color: '#FF7D0A' },
  dh_havoc:            { name: 'Havoc',          cls: 'Cazador de demonios', role: 'dps',  color: '#A330C9' },
  dh_vengeance:        { name: 'Vengeance',      cls: 'Cazador de demonios', role: 'tank', color: '#A330C9' },
  dh_devourer:         { name: 'Devourer',       cls: 'Cazador de demonios', role: 'dps',  color: '#A330C9' },
  evoker_devastation:  { name: 'Devastation',    cls: 'Evocador',        role: 'dps',    color: '#33937F' },
  evoker_preservation: { name: 'Preservation',   cls: 'Evocador',        role: 'healer', color: '#33937F' },
  evoker_augmentation: { name: 'Augmentation',   cls: 'Evocador',        role: 'dps',    color: '#33937F' },
};

function publicProfile(p) {
  if (!p) return null;
  return {
    user_id: p.user_id,
    nickname: p.nickname,
    discord_name: p.discord_name,
    avatar_url: p.avatar_url || null,
    country: p.country,
    spec: p.spec,
    role: p.role,
    starter: !!p.starter,
    char_name: p.char_name || '',
    realm: p.realm || '',
    has_photo: !!p.has_photo,
    has_char: !!(p.char_name && String(p.char_name).trim().length >= 2),
    name_effect: p.name_effect || null,
    updated_at: p.updated_at || p.created_at || '',
  };
}

async function loadCasinoUser(env, userId) {
  try {
    return await env.EXILIUM_KV.get(`casino:user:${userId}`, 'json');
  } catch (_) {
    return null;
  }
}

async function getIndex(env) {
  try {
    const idx = await env.EXILIUM_KV.get(INDEX_KEY, 'json');
    return Array.isArray(idx) ? idx : [];
  } catch (_) {
    return [];
  }
}

async function putIndex(env, index) {
  await env.EXILIUM_KV.put(INDEX_KEY, JSON.stringify(index));
}

async function getCore(env, roster) {
  let core = null;
  try {
    core = await env.EXILIUM_KV.get(CORE_KEY, 'json');
  } catch (_) {}
  let captain = core && core.captain ? core.captain : null;
  // Si no hay capitán configurado, tomar al jugador cuyo nick contenga "panda"
  if (!captain && Array.isArray(roster)) {
    const found = roster.find((p) => /panda/i.test(p.nickname || ''));
    if (found) captain = found.user_id;
  }
  return { captain };
}

function parseDataUrl(dataUrl) {
  if (!dataUrl || typeof dataUrl !== 'string') return null;
  const m = dataUrl.match(/^data:(image\/(?:png|webp|jpeg|jpg));base64,([A-Za-z0-9+/=\s]+)$/i);
  if (!m) return null;
  const contentType = m[1].toLowerCase() === 'image/jpg' ? 'image/jpeg' : m[1].toLowerCase();
  const b64 = m[2].replace(/\s+/g, '');
  if (b64.length > 400000) return null; // ~300KB binario
  try {
    const bin = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
    return { contentType, bytes: bin };
  } catch (_) {
    return null;
  }
}

async function fetchCharacterRender(name, realm, env) {
  try {
    const token = await getAccessToken(env);
    const slug = String(realm || '')
      .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
      .toLowerCase().replace(/['']/g, '').replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '');
    const encodedName = encodeURIComponent(String(name).toLowerCase());
    const url = `https://us.api.blizzard.com/profile/wow/character/${slug}/${encodedName}/character-media?namespace=profile-us&locale=en_US`;
    const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
    if (!res.ok) return null;
    const data = await res.json();
    const assets = data.assets || [];
    const prefer = ['main-raw', 'main', 'inset', 'avatar'];
    for (const key of prefer) {
      const a = assets.find((x) => x.key === key);
      if (a && a.value) return a.value;
    }
    return null;
  } catch (_) {
    return null;
  }
}

/** GET /api/rbg/catalog */
export async function handleRbgCatalog() {
  return { countries: COUNTRIES, specs: SPECS };
}

/** GET /api/rbg/profile — sesión requerida */
export async function handleRbgGetProfile(request, env) {
  const session = await verifyCasinoSession(request, env);
  if (!session) return { error: 'No autenticado', status: 401 };

  const raw = await env.EXILIUM_KV.get(PROFILE_PREFIX + session.user_id, 'json');
  if (!raw) return { profile: null };

  // Refrescar nombre/avatar/efecto desde el usuario del casino
  const user = await loadCasinoUser(env, session.user_id);
  if (user) {
    raw.nickname = user.name || raw.nickname;
    raw.discord_name = user.discord_username || user.name || raw.discord_name;
    raw.avatar_url = user.avatar_url || raw.avatar_url;
    raw.name_effect = (user.equipped && user.equipped.name_effect) || raw.name_effect || null;
  }
  return { profile: publicProfile(raw) };
}

/** PUT /api/rbg/profile — crear/actualizar inscripción (sin duplicados) */
export async function handleRbgPutProfile(request, env) {
  const session = await verifyCasinoSession(request, env);
  if (!session) return { error: 'No autenticado', status: 401 };

  let body;
  try {
    body = await request.json();
  } catch (_) {
    return { error: 'JSON inválido', status: 400 };
  }

  const country = String(body.country || '').toUpperCase();
  const spec = String(body.spec || '');
  const charName = String(body.char_name || '').trim();
  const realm = String(body.realm || '').trim() || "Quel'Thalas";
  const starter = body.starter !== false;

  if (!COUNTRIES.includes(country)) {
    return { error: 'País inválido', status: 400 };
  }
  if (!SPECS[spec]) {
    return { error: 'Especialización inválida', status: 400 };
  }
  if (charName.length < 2 || charName.length > 12) {
    return { error: 'El nombre del personaje debe tener entre 2 y 12 caracteres', status: 400 };
  }

  const user = await loadCasinoUser(env, session.user_id);
  const now = new Date().toISOString();
  const existing = await env.EXILIUM_KV.get(PROFILE_PREFIX + session.user_id, 'json');

  let hasPhoto = existing ? !!existing.has_photo : false;
  if (body.photo !== undefined) {
    if (body.photo === null || body.photo === '') {
      hasPhoto = false;
      try { await env.EXILIUM_KV.delete(PHOTO_PREFIX + session.user_id); } catch (_) {}
    } else {
      const parsed = parseDataUrl(body.photo);
      if (!parsed) {
        return { error: 'Foto inválida o demasiado pesada', status: 400 };
      }
      // Guardar data URL (ya validada/acotada por el frontend ~290KB)
      await env.EXILIUM_KV.put(PHOTO_PREFIX + session.user_id, body.photo);
      hasPhoto = true;
    }
  }

  const profile = {
    user_id: session.user_id,
    nickname: (user && user.name) || session.name || 'Jugador',
    discord_name: (user && (user.discord_username || user.name)) || session.name || 'Jugador',
    avatar_url: (user && user.avatar_url) || null,
    name_effect: (user && user.equipped && user.equipped.name_effect) || null,
    country,
    spec,
    role: SPECS[spec].role,
    starter,
    char_name: charName,
    realm,
    has_photo: hasPhoto,
    created_at: (existing && existing.created_at) || now,
    updated_at: now,
  };

  await env.EXILIUM_KV.put(PROFILE_PREFIX + session.user_id, JSON.stringify(profile));

  const index = await getIndex(env);
  if (!index.includes(session.user_id)) {
    index.push(session.user_id);
    await putIndex(env, index);
  }

  return { ok: true, profile: publicProfile(profile) };
}

/** GET /api/rbg/roster */
export async function handleRbgRoster(env) {
  const index = await getIndex(env);
  const roster = [];

  for (const userId of index) {
    try {
      const raw = await env.EXILIUM_KV.get(PROFILE_PREFIX + userId, 'json');
      if (!raw) continue;
      const user = await loadCasinoUser(env, userId);
      if (user) {
        raw.nickname = user.name || raw.nickname;
        raw.discord_name = user.discord_username || user.name || raw.discord_name;
        raw.avatar_url = user.avatar_url || raw.avatar_url;
        raw.name_effect = (user.equipped && user.equipped.name_effect) || raw.name_effect || null;
      }
      roster.push(publicProfile(raw));
    } catch (_) {}
  }

  // Orden estable: titulares primero por fecha de inscripción, luego bancas
  roster.sort((a, b) => {
    if (!!a.starter !== !!b.starter) return a.starter ? -1 : 1;
    return String(a.updated_at).localeCompare(String(b.updated_at));
  });

  const core = await getCore(env, roster);
  return { roster, core };
}

/** GET /api/rbg/photo/:userId */
export async function handleRbgPhoto(env, userId) {
  const dataUrl = await env.EXILIUM_KV.get(PHOTO_PREFIX + userId);
  if (!dataUrl) {
    return new Response('Not found', { status: 404 });
  }
  const parsed = parseDataUrl(dataUrl);
  if (!parsed) {
    return new Response('Invalid photo', { status: 500 });
  }
  return new Response(parsed.bytes, {
    status: 200,
    headers: {
      'Content-Type': parsed.contentType,
      'Cache-Control': 'public, max-age=300',
      'Access-Control-Allow-Origin': '*',
    },
  });
}

/** GET /api/rbg/player/:userId — ficha + datos Blizzard (rating RBG + render) */
export async function handleRbgPlayer(env, userId) {
  const raw = await env.EXILIUM_KV.get(PROFILE_PREFIX + userId, 'json');
  if (!raw) return { error: 'Jugador no encontrado', status: 404 };

  const user = await loadCasinoUser(env, userId);
  if (user) {
    raw.nickname = user.name || raw.nickname;
    raw.discord_name = user.discord_username || user.name || raw.discord_name;
    raw.avatar_url = user.avatar_url || raw.avatar_url;
    raw.name_effect = (user.equipped && user.equipped.name_effect) || raw.name_effect || null;
  }

  const player = publicProfile(raw);
  const result = { player, wow: null };

  if (!player.has_char) {
    return result;
  }

  try {
    const profile = await getCharacterProfile(raw.char_name, raw.realm, env);
    if (profile && profile.error) {
      result.wow = { not_found: true };
      return result;
    }

    const seasonId = await getCurrentSeasonId(env);
    const rbg = await getBracketRating(raw.char_name, raw.realm, 'rbg', seasonId, env);
    const render = await fetchCharacterRender(raw.char_name, raw.realm, env);

    result.wow = {
      rating: rbg.rating || 0,
      wins: rbg.wins || 0,
      losses: rbg.losses || 0,
      render: render || null,
      race: profile.race || '',
      class_name: profile.class_name || '',
      level: profile.level || 0,
      ilvl: profile.ilvl || 0,
    };
  } catch (e) {
    result.wow_error = true;
    result.wow = null;
  }

  return result;
}
