// ============================================================
//  worker/rbg-tracker.js
//  RBG Match Tracker — Routes for ExiliumRBG addon integration
//  KV keys: rbg:match:{id}, rbg:index, rbg:stats
// ============================================================

// ── Handler: guardar resultado de partida ─────────────────────
export async function handleRBGMatch(request, env) {
  try {
    const match = await request.json();

    // Validar campos mínimos
    if (!match.id || !match.map || match.won === undefined) {
      return { error: 'Payload inválido: se requiere id, map y won', status: 400 };
    }

    // Clave en KV: rbg:match:{id}
    const key = `rbg:match:${match.id}`;
    const payload = JSON.stringify({
      ...match,
      receivedAt: new Date().toISOString(),
    });

    await env.EXILIUM_KV.put(key, payload, {
      expirationTtl: 60 * 60 * 24 * 180, // 6 meses
    });

    // Actualizar índice de partidas (lista de IDs para consulta rápida)
    const indexKey = 'rbg:index';
    const rawIndex = await env.EXILIUM_KV.get(indexKey);
    const index = rawIndex ? JSON.parse(rawIndex) : [];

    if (!index.includes(match.id)) {
      index.unshift(match.id); // Más reciente primero
      if (index.length > 500) index.pop();
      await env.EXILIUM_KV.put(indexKey, JSON.stringify(index));
    }

    // Actualizar stats acumuladas
    await updateRBGStats(env, match);

    return { ok: true, stored: key };
  } catch (err) {
    return { error: err.message, status: 500 };
  }
}

// ── Handler: historial de partidas ────────────────────────────
export async function handleRBGHistory(request, env) {
  try {
    const url = new URL(request.url);
    const limit = Math.min(parseInt(url.searchParams.get('limit') || '20'), 100);
    const offset = parseInt(url.searchParams.get('offset') || '0');

    const rawIndex = await env.EXILIUM_KV.get('rbg:index');
    if (!rawIndex) {
      return { matches: [], total: 0 };
    }

    const index = JSON.parse(rawIndex);
    const total = index.length;
    const page = index.slice(offset, offset + limit);

    // Obtener partidas en paralelo
    const matchPromises = page.map(id => env.EXILIUM_KV.get(`rbg:match:${id}`));
    const rawMatches = await Promise.all(matchPromises);
    const matches = rawMatches
      .filter(Boolean)
      .map(raw => JSON.parse(raw));

    return { matches, total, offset, limit };
  } catch (err) {
    return { error: err.message, status: 500 };
  }
}

// ── Handler: stats globales de temporada ─────────────────────
export async function handleRBGStats(request, env) {
  try {
    const raw = await env.EXILIUM_KV.get('rbg:stats');
    const stats = raw ? JSON.parse(raw) : {
      wins: 0, losses: 0, totalMatches: 0, ratingDelta: 0,
      topMaps: {}, playerContrib: {},
    };

    // Sincronizar totalMatches con el índice real
    const rawIndex = await env.EXILIUM_KV.get('rbg:index');
    if (rawIndex) {
      stats.totalMatches = JSON.parse(rawIndex).length;
    }

    return stats;
  } catch (err) {
    return { error: err.message, status: 500 };
  }
}

// ── Helper: actualizar stats acumuladas en KV ─────────────────
async function updateRBGStats(env, match) {
  const raw = await env.EXILIUM_KV.get('rbg:stats');
  const stats = raw ? JSON.parse(raw) : {
    wins: 0, losses: 0, totalMatches: 0, ratingDelta: 0,
    topMaps: {},
    playerContrib: {},
    updatedAt: null,
  };

  // Contadores básicos
  stats.totalMatches++;
  if (match.won) stats.wins++;
  else stats.losses++;
  stats.ratingDelta = (stats.ratingDelta || 0) + (match.ratingDelta || 0);

  // Stats por mapa
  if (!stats.topMaps) stats.topMaps = {};
  if (!stats.topMaps[match.map]) {
    stats.topMaps[match.map] = { wins: 0, losses: 0 };
  }
  if (match.won) stats.topMaps[match.map].wins++;
  else stats.topMaps[match.map].losses++;

  // Contribuciones por jugador
  if (!stats.playerContrib) stats.playerContrib = {};
  for (const player of (match.players || [])) {
    const key = player.name;
    if (!stats.playerContrib[key]) {
      stats.playerContrib[key] = { damage: 0, healing: 0, kills: 0, matches: 0 };
    }
    stats.playerContrib[key].damage += player.damage || 0;
    stats.playerContrib[key].healing += player.healing || 0;
    stats.playerContrib[key].kills += player.killingBlows || 0;
    stats.playerContrib[key].matches++;
  }

  stats.updatedAt = new Date().toISOString();
  await env.EXILIUM_KV.put('rbg:stats', JSON.stringify(stats));
}
