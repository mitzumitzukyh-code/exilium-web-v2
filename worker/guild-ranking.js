// worker/guild-ranking.js
// Ranking de los top 20 jugadores de la guild Exilium por rating PvP.
// Solo incluye miembros reales de la hermandad (verificados vía Blizzard Guild Roster API).

import { getAccessToken, getCurrentSeasonId, getBracketRating, getCharacterMedia } from './blizzard.js';

const KV_KEY = 'cache:guild-ranking';
const GUILD_REALM = 'quelthalas';
const GUILD_NAME = 'exílium';
const API_BASE = 'https://us.api.blizzard.com';

const CLASS_SLUG_MAP = {
  1: 'warrior', 2: 'paladin', 3: 'hunter', 4: 'rogue', 5: 'priest',
  6: 'death-knight', 7: 'shaman', 8: 'mage', 9: 'warlock', 10: 'monk',
  11: 'druid', 12: 'demon-hunter', 13: 'evoker',
};

const CLASS_NAME_MAP = {
  1: 'Warrior', 2: 'Paladin', 3: 'Hunter', 4: 'Rogue', 5: 'Priest',
  6: 'Death Knight', 7: 'Shaman', 8: 'Mage', 9: 'Warlock', 10: 'Monk',
  11: 'Druid', 12: 'Demon Hunter', 13: 'Evoker',
};

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

async function fetchWithAuth(url, env) {
  const token = await getAccessToken(env);
  return fetch(url, { headers: { 'Authorization': 'Bearer ' + token } });
}

async function fetchGuildRoster(env) {
  // Descubrir la URL del roster desde el perfil de un personaje conocido.
  // Esto evita problemas con slugs de guilds con caracteres especiales (Exílium).
  const charUrl = API_BASE + '/profile/wow/character/' + GUILD_REALM + '/mitzukyhs?namespace=profile-us&locale=en_US';
  const charRes = await fetchWithAuth(charUrl, env);
  if (!charRes.ok) throw new Error('Character profile HTTP ' + charRes.status);
  const charData = await charRes.json();
  const guildHref = charData.guild?.key?.href;
  if (!guildHref) throw new Error('No guild found in character profile');

  const rosterUrl = guildHref.replace('?', '/roster?');
  const res = await fetchWithAuth(rosterUrl, env);
  if (!res.ok) throw new Error('Guild roster HTTP ' + res.status);
  return res.json();
}

// Fase 1: ratings estándar (2v2, 3v3, rbg) — 3 calls per member
async function fetchStandardRatings(name, realm, seasonId, env) {
  const [r2, r3, rbg] = await Promise.all([
    getBracketRating(name, realm, '2v2', seasonId, env),
    getBracketRating(name, realm, '3v3', seasonId, env),
    getBracketRating(name, realm, 'rbg', seasonId, env),
  ]);
  return {
    current: { rs: 0, r2: r2.rating, r3: r3.rating, rbg: rbg.rating, bgs: 0 },
    wins: { rs: 0, r2: r2.wins, r3: r3.wins, rbg: rbg.wins, bgs: 0 },
    losses: { rs: 0, r2: r2.losses, r3: r3.losses, rbg: rbg.losses, bgs: 0 },
  };
}

// Fase 2: shuffle + blitz (spec-based) — ~7 calls per member
async function fetchSpecRatings(name, realm, classSlug, seasonId, env) {
  const result = { rs: 0, rsW: 0, rsL: 0, bgs: 0, bgsW: 0, bgsL: 0 };

  const shuffleSpecs = SHUFFLE_SPECS[classSlug] || [];
  const blitzSpecs = BLITZ_SPECS[classSlug] || [];

  const allSpecs = [
    ...shuffleSpecs.map(s => ({ bracket: s, type: 'rs' })),
    ...blitzSpecs.map(s => ({ bracket: s, type: 'bgs' })),
  ];

  const results = await Promise.all(
    allSpecs.map(s => getBracketRating(name, realm, s.bracket, seasonId, env).then(r => ({ ...r, type: s.type })))
  );

  for (const r of results) {
    if (r.type === 'rs' && r.rating > result.rs) {
      result.rs = r.rating;
      result.rsW = r.wins;
      result.rsL = r.losses;
    }
    if (r.type === 'bgs' && r.rating > result.bgs) {
      result.bgs = r.rating;
      result.bgsW = r.wins;
      result.bgsL = r.losses;
    }
  }

  return result;
}

// ═══════════════════════════════════════════════════════════════════
// Build por chunks (límite 50 subrequests por invocación del Worker)
// Fase 1: roster → KV (1 call: char profile + roster = ~3 subreqs)
// Fase 2: standard ratings en chunks de 12 (12×3=36 subreqs + overhead)
// Fase 3: shuffle+blitz para top 25 en chunks de 3 (3×~7=21 subreqs)
// Fase 4: avatars para top 20 (20 subreqs)
// ═══════════════════════════════════════════════════════════════════

const PARTIAL_KEY = 'cache:guild-ranking:partial';
const CHUNK_SIZE_STANDARD = 12; // 12 members × 3 calls = 36 + overhead
const CHUNK_SIZE_SPEC = 3;     // 3 members × ~7 calls = ~21 + overhead

export async function buildGuildRanking(env, offset) {
  const off = parseInt(offset, 10) || 0;

  // ── FASE 1: Fetch roster (offset === 0 y no hay partial) ──
  let partial = await env.EXILIUM_KV.get(PARTIAL_KEY, 'json');

  if (!partial) {
    const roster = await fetchGuildRoster(env);
    const members = roster.members || [];
    const maxLevel = members.reduce((max, m) => Math.max(max, m.character?.level || 0), 0);
    const eligible = members.filter(m => m.character?.level === maxLevel).map(m => ({
      name: m.character.name,
      realm: m.character.realm?.slug || GUILD_REALM,
      class_id: m.character.playable_class?.id || 0,
      class_slug: CLASS_SLUG_MAP[m.character.playable_class?.id] || '',
      class_name: CLASS_NAME_MAP[m.character.playable_class?.id] || 'Unknown',
      level: m.character.level,
    }));

    partial = {
      phase: 'standard',
      eligible,
      results: [],
      total_members: members.length,
      eligible_count: eligible.length,
      max_level: maxLevel,
      offset: 0,
    };
    await env.EXILIUM_KV.put(PARTIAL_KEY, JSON.stringify(partial));

    return {
      status: 'roster_done',
      total_members: members.length,
      eligible_members: eligible.length,
      max_level: maxLevel,
      next_offset: 0,
    };
  }

  // ── FASE 2: Standard ratings (2v2, 3v3, rbg) en chunks ──
  if (partial.phase === 'standard') {
    const seasonId = await getCurrentSeasonId(env);
    const start = off;
    const chunk = partial.eligible.slice(start, start + CHUNK_SIZE_STANDARD);

    if (chunk.length === 0) {
      // Fase 2 completa → pasar a fase 3
      partial.phase = 'spec';
      partial.results.sort((a, b) => b.best_standard - a.best_standard);
      partial.spec_candidates = partial.results.slice(0, 25).map(r => r.name);
      partial.offset = 0;
      await env.EXILIUM_KV.put(PARTIAL_KEY, JSON.stringify(partial));
      return { status: 'standard_done', processed: partial.results.length, candidates: partial.spec_candidates.length, next_offset: 0 };
    }

    const batchResults = await Promise.all(chunk.map(async (m) => {
      try {
        const pvp = await fetchStandardRatings(m.name, m.realm, seasonId, env);
        const best = Math.max(pvp.current.r2, pvp.current.r3, pvp.current.rbg);
        return { ...m, pvp, best_standard: best };
      } catch (_) { return { ...m, pvp: { current: { rs: 0, r2: 0, r3: 0, rbg: 0, bgs: 0 }, wins: { rs: 0, r2: 0, r3: 0, rbg: 0, bgs: 0 }, losses: { rs: 0, r2: 0, r3: 0, rbg: 0, bgs: 0 } }, best_standard: 0 }; }
    }));

    partial.results.push(...batchResults);
    partial.offset = start + chunk.length;
    await env.EXILIUM_KV.put(PARTIAL_KEY, JSON.stringify(partial));

    return {
      status: 'standard_chunk',
      processed_so_far: partial.results.length,
      total_eligible: partial.eligible_count,
      next_offset: partial.offset,
    };
  }

  // ── FASE 3: Shuffle + Blitz para top candidates ──
  if (partial.phase === 'spec') {
    const seasonId = await getCurrentSeasonId(env);
    const candidateNames = partial.spec_candidates || [];
    const candidates = partial.results.filter(r => candidateNames.includes(r.name));
    const start = off;
    const chunk = candidates.slice(start, start + CHUNK_SIZE_SPEC);

    if (chunk.length === 0) {
      // Fase 3 completa → pasar a fase 4
      partial.phase = 'avatars';
      partial.offset = 0;
      await env.EXILIUM_KV.put(PARTIAL_KEY, JSON.stringify(partial));
      return { status: 'spec_done', next_offset: 0 };
    }

    await Promise.all(chunk.map(async (p) => {
      try {
        const spec = await fetchSpecRatings(p.name, p.realm, p.class_slug, seasonId, env);
        p.pvp.current.rs = spec.rs;
        p.pvp.wins.rs = spec.rsW;
        p.pvp.losses.rs = spec.rsL;
        p.pvp.current.bgs = spec.bgs;
        p.pvp.wins.bgs = spec.bgsW;
        p.pvp.losses.bgs = spec.bgsL;
      } catch (_) {}
    }));

    // Update results in partial
    for (const p of chunk) {
      const idx = partial.results.findIndex(r => r.name === p.name);
      if (idx !== -1) partial.results[idx] = p;
    }

    partial.offset = start + chunk.length;
    await env.EXILIUM_KV.put(PARTIAL_KEY, JSON.stringify(partial));
    return { status: 'spec_chunk', processed: start + chunk.length, total_candidates: candidateNames.length, next_offset: partial.offset };
  }

  // ── FASE 4: Avatars + finalize ──
  if (partial.phase === 'avatars') {
    // Compute best_rating for all
    for (const p of partial.results) {
      const c = p.pvp.current;
      p.best_rating = Math.max(c.rs || 0, c.r2 || 0, c.r3 || 0, c.rbg || 0, c.bgs || 0);
    }
    partial.results.sort((a, b) => b.best_rating - a.best_rating);
    const top20 = partial.results.filter(p => p.best_rating > 0).slice(0, 20);

    // Fetch avatars in 2 batches of 10
    const start = off;
    const avatarChunk = top20.slice(start, start + 10);
    if (avatarChunk.length > 0 && start < 20) {
      await Promise.all(avatarChunk.map(async (p) => {
        try { p.avatar = await getCharacterMedia(p.name, p.realm, env); } catch (_) { p.avatar = null; }
      }));
      // Update in results
      for (const p of avatarChunk) {
        const idx = partial.results.findIndex(r => r.name === p.name);
        if (idx !== -1) partial.results[idx] = p;
      }
      if (start + 10 < top20.length) {
        partial.offset = start + 10;
        await env.EXILIUM_KV.put(PARTIAL_KEY, JSON.stringify(partial));
        return { status: 'avatars_chunk', next_offset: partial.offset };
      }
    }

    // Finalize: rebuild top20 with avatars
    for (const p of partial.results) {
      const c = p.pvp?.current || {};
      p.best_rating = Math.max(c.rs || 0, c.r2 || 0, c.r3 || 0, c.rbg || 0, c.bgs || 0);
    }
    partial.results.sort((a, b) => b.best_rating - a.best_rating);
    const finalTop = partial.results.filter(p => p.best_rating > 0).slice(0, 20);

    const ranking = finalTop.map((p, i) => ({
      position: i + 1,
      name: p.name,
      realm: p.realm,
      class: p.class_name,
      class_id: p.class_id,
      level: p.level,
      avatar: p.avatar || null,
      best_rating: p.best_rating,
      ratings: {
        shuffle: p.pvp.current.rs || 0,
        arena_2v2: p.pvp.current.r2 || 0,
        arena_3v3: p.pvp.current.r3 || 0,
        rbg: p.pvp.current.rbg || 0,
        blitz: p.pvp.current.bgs || 0,
      },
      wins: {
        shuffle: p.pvp.wins.rs || 0,
        arena_2v2: p.pvp.wins.r2 || 0,
        arena_3v3: p.pvp.wins.r3 || 0,
        rbg: p.pvp.wins.rbg || 0,
        blitz: p.pvp.wins.bgs || 0,
      },
      losses: {
        shuffle: p.pvp.losses.rs || 0,
        arena_2v2: p.pvp.losses.r2 || 0,
        arena_3v3: p.pvp.losses.r3 || 0,
        rbg: p.pvp.losses.rbg || 0,
        blitz: p.pvp.losses.bgs || 0,
      },
    }));

    const data = {
      ranking,
      generated_at: new Date().toISOString(),
      total_members: partial.total_members,
      eligible_members: partial.eligible_count,
      max_level: partial.max_level,
    };

    await env.EXILIUM_KV.put(KV_KEY, JSON.stringify(data));
    await env.EXILIUM_KV.delete(PARTIAL_KEY);
    return { status: 'complete', data };
  }

  return { status: 'unknown_phase', phase: partial?.phase };
}

export async function getGuildRanking(env) {
  const raw = await env.EXILIUM_KV.get(KV_KEY);
  return raw ? JSON.parse(raw) : { ranking: [], generated_at: null };
}
