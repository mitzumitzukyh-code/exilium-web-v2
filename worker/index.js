// worker/index.js

import { handleAdminLogin, handleAdminAuth, handlePublicAuth } from './auth.js';
import {
  getPlayersData, getPlayer, createPlayer, updatePlayer, deletePlayer,
  syncPlayer, syncAllPlayers, adjustPlayerXp, grantPlayerTitle,
  marryPlayers, divorcePlayer,
} from './players.js';
import { getAccessToken, getCurrentSeasonId } from './blizzard.js';
import { getRatingsForAddon, exportAddonDataLua } from './addon.js';
import { logError, getErrorLog, clearErrorLog } from './errors.js';
import { getAnnouncement, setAnnouncement, deleteAnnouncement } from './announcement.js';
import { closeSeason } from './season.js';
import { getOfficers, getOfficersEnriched, addOfficer, updateOfficer, removeOfficer, lookupCharacter } from './officers.js';
import { getGuildRanking, buildGuildRanking } from './guild-ranking.js';
import { createBackup, restoreBackup, getBackupInfo } from './backup.js';

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Filename',
};

function jsonResponse(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json', ...CORS_HEADERS },
  });
}

function cachedJsonResponse(data, maxAgeSecs = 60, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'Content-Type': 'application/json',
      'Cache-Control': `public, max-age=${maxAgeSecs}, s-maxage=${maxAgeSecs}`,
      ...CORS_HEADERS,
    },
  });
}

async function handleRequest(request, env, ctx) {
  const url = new URL(request.url);
  const path = url.pathname;
  const method = request.method;

  // Handle CORS preflight
  if (method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: CORS_HEADERS });
  }

  // --- Public routes ---
  if (method === 'GET' && path === '/api/health') return new Response('OK');

  if (method === 'GET' && path === '/api/players') {
    const players = await getPlayersData(env, false);
    return cachedJsonResponse(players, 60);
  }

  if (method === 'GET' && path.startsWith('/api/players/')) {
    const playerId = decodeURIComponent(path.split('/')[3]);
    const player = await getPlayer(request, env, `player:${playerId}`);
    return player ? jsonResponse(player) : jsonResponse({ error: 'Jugador no encontrado' }, 404);
  }

  if (method === 'GET' && path === '/api/announcement') {
    const announcement = await getAnnouncement(request, env);
    return cachedJsonResponse(announcement, 120);
  }

  /**
   * FIX #8: Endpoint público para consultar la temporada actual.
   */
  if (method === 'GET' && path === '/api/season') {
    try {
      const seasonId = await getCurrentSeasonId(env);
      return jsonResponse({ season_id: seasonId, status: 'ok' });
    } catch (err) {
      return jsonResponse({ error: err.message, status: 'error' }, 500);
    }
  }

  if (method === 'GET' && path === '/api/battlepass-config') {
    const raw = await env.EXILIUM_KV.get('config:battlepass_rewards');
    return cachedJsonResponse(raw ? JSON.parse(raw) : { rewards: [] }, 300);
  }

  if (method === 'GET' && path === '/api/officers') {
    const officers = await getOfficersEnriched(env);
    return cachedJsonResponse(officers, 120);
  }

  if (method === 'GET' && path === '/api/hall-of-fame') {
    const raw = await env.EXILIUM_KV.get('config:hall_of_fame', 'json');
    return cachedJsonResponse(raw || { entries: [] }, 120);
  }

  // Serve R2 media files publicly
  if (method === 'GET' && path.startsWith('/media/')) {
    const key = 'media/' + path.slice(7);
    const obj = await env.EXILIUM_MEDIA.get(key);
    if (!obj) return new Response('Not found', { status: 404 });
    const headers = new Headers();
    obj.writeHttpMetadata(headers);
    headers.set('Cache-Control', 'public, max-age=31536000');
    Object.entries(CORS_HEADERS).forEach(([k, v]) => headers.set(k, v));
    return new Response(obj.body, { headers });
  }

  if (method === 'GET' && path === '/api/guild-ranking') {
    const data = await getGuildRanking(env);
    return cachedJsonResponse(data, 300);
  }

  // Page view tracking (público, sin auth)
  if (method === 'POST' && path === '/api/pageview') {
    try {
      const key = 'analytics:pageviews';
      const raw = await env.EXILIUM_KV.get(key, 'json') || { total: 0, daily: {} };
      raw.total = (raw.total || 0) + 1;
      const today = new Date().toISOString().slice(0, 10);
      raw.daily = raw.daily || {};
      raw.daily[today] = (raw.daily[today] || 0) + 1;
      // Mantener solo últimos 90 días
      const days = Object.keys(raw.daily).sort();
      if (days.length > 90) {
        for (const d of days.slice(0, days.length - 90)) delete raw.daily[d];
      }
      await env.EXILIUM_KV.put(key, JSON.stringify(raw));
      return jsonResponse({ ok: true });
    } catch (_) {
      return jsonResponse({ ok: true });
    }
  }

  if (method === 'GET' && path === '/api/ratings') {
    if (!handlePublicAuth(request, env)) {
      return jsonResponse({ error: 'Unauthorized' }, 401);
    }
    const ratings = await getRatingsForAddon(request, env);
    return jsonResponse(ratings);
  }

  // --- Admin routes ---
  if (path.startsWith('/admin/')) {
    if (method === 'POST' && path === '/admin/auth') {
      const loginResponse = await handleAdminLogin(request, env);
      return jsonResponse(loginResponse, loginResponse.error ? 401 : 200);
    }

    if (!(await handleAdminAuth(request, env))) {
      return jsonResponse({ error: 'Unauthorized' }, 401);
    }

    if (method === 'GET' && path === '/admin/players') {
      const players = await getPlayersData(env, true);
      return jsonResponse(players);
    }

    if (method === 'POST' && path === '/admin/players') {
      const result = await createPlayer(request, env);
      return jsonResponse(result, result.error ? 400 : 201);
    }

    if (method === 'PATCH' && path.startsWith('/admin/players/')) {
      const playerId = decodeURIComponent(path.split('/')[3]);
      const result = await updatePlayer(request, env, `player:${playerId}`);
      return jsonResponse(result, result.error ? 404 : 200);
    }

    if (method === 'DELETE' && path.startsWith('/admin/players/')) {
      const playerId = decodeURIComponent(path.split('/')[3]);
      const result = await deletePlayer(request, env, `player:${playerId}`);
      return jsonResponse(result);
    }

    if (method === 'POST' && path.endsWith('/refresh')) {
      const playerId = decodeURIComponent(path.split('/')[3]);
      const result = await syncPlayer(request, env, `player:${playerId}`);
      return jsonResponse(result, result.error ? 500 : 200);
    }

    if (method === 'POST' && path.endsWith('/xp')) {
      const playerId = decodeURIComponent(path.split('/')[3]);
      const result = await adjustPlayerXp(request, env, `player:${playerId}`);
      return jsonResponse(result, result.error ? 400 : 200);
    }

    if (method === 'POST' && path.endsWith('/title')) {
      const playerId = decodeURIComponent(path.split('/')[3]);
      const result = await grantPlayerTitle(request, env, `player:${playerId}`);
      return jsonResponse(result, result.error ? 400 : 200);
    }

    if (method === 'POST' && path === '/admin/players/marry') {
      const result = await marryPlayers(request, env);
      return jsonResponse(result, result.error ? 404 : 200);
    }

    if (method === 'POST' && path.startsWith('/admin/players/divorce')) {
      const playerId = decodeURIComponent(path.split('/')[4]);
      const result = await divorcePlayer(request, env, `player:${playerId}`);
      return jsonResponse(result, result.error ? 404 : 200);
    }

    if (method === 'POST' && path === '/admin/sync') {
      const result = await syncAllPlayers(env);
      return jsonResponse(result);
    }

    if (method === 'GET' && path === '/admin/announcement') {
      const announcement = await getAnnouncement(request, env);
      return jsonResponse(announcement);
    }

    if (method === 'POST' && path === '/admin/announcement') {
      const result = await setAnnouncement(request, env);
      return jsonResponse(result, result.error ? 400 : 200);
    }

    if (method === 'DELETE' && path === '/admin/announcement') {
      return jsonResponse(await deleteAnnouncement(request, env));
    }

    if (method === 'GET' && path === '/admin/export-addon') {
      return exportAddonDataLua(request, env);
    }

    if (method === 'POST' && path === '/admin/season/close') {
      const result = await closeSeason(request, env);
      return jsonResponse(result, result.error ? 501 : 200);
    }

    if (method === 'GET' && path === '/admin/errors') {
      return jsonResponse(await getErrorLog(request, env));
    }

    if (method === 'DELETE' && path === '/admin/errors') {
      return jsonResponse(await clearErrorLog(request, env));
    }

    // ── Officers ──
    if (method === 'GET' && path === '/admin/officers') {
      const officers = await getOfficersEnriched(env);
      return jsonResponse(officers);
    }

    // Lookup: busca cualquier personaje en Blizzard API (no requiere inscripción)
    if (method === 'GET' && path.startsWith('/admin/officers/lookup/')) {
      const parts = path.replace('/admin/officers/lookup/', '').split('/');
      const charName = decodeURIComponent(parts[0] || '');
      const charRealm = decodeURIComponent(parts[1] || '');
      if (!charName || !charRealm) {
        return jsonResponse({ error: 'Se requiere /lookup/:name/:realm' }, 400);
      }
      const result = await lookupCharacter(charName, charRealm, env);
      return jsonResponse(result, result.error ? 404 : 200);
    }

    if (method === 'POST' && path === '/admin/officers') {
      const result = await addOfficer(request, env);
      return jsonResponse(result, result.error ? 400 : 201);
    }

    if (method === 'PUT' && path.startsWith('/admin/officers/')) {
      const playerId = decodeURIComponent(path.split('/admin/officers/')[1]);
      const result = await updateOfficer(request, env, playerId);
      return jsonResponse(result, result.error ? 404 : 200);
    }

    if (method === 'DELETE' && path.startsWith('/admin/officers/')) {
      const playerId = decodeURIComponent(path.split('/admin/officers/')[1]);
      const result = await removeOfficer(env, playerId);
      return jsonResponse(result, result.error ? 404 : 200);
    }

    // ── Guild Ranking ──
    if (method === 'DELETE' && path === '/admin/guild-ranking/partial') {
      await env.EXILIUM_KV.delete('cache:guild-ranking:partial');
      return jsonResponse({ ok: true, message: 'Partial build reseteado' });
    }

    if (method === 'POST' && path === '/admin/guild-ranking/build') {
      try {
        const url = new URL(request.url);
        const off = url.searchParams.get('offset') || '0';
        const result = await buildGuildRanking(env, off);
        // Final phase returns { status: 'complete', data: { ranking: [...] } }
        if (result.status === 'complete' && result.data) {
          return jsonResponse({ ok: true, status: 'complete', count: result.data.ranking.length, generated_at: result.data.generated_at });
        }
        // Intermediate phases return progress info
        return jsonResponse({ ok: true, ...result });
      } catch (err) {
        return jsonResponse({ error: 'Error construyendo ranking: ' + err.message }, 500);
      }
    }

    // ── Media Upload (R2) ──
    if (method === 'POST' && path === '/admin/upload-media') {
      const contentType = request.headers.get('Content-Type') || '';
      if (!contentType.startsWith('video/') && !contentType.startsWith('image/')) {
        return jsonResponse({ error: 'Solo se permiten archivos de video o imagen' }, 400);
      }
      const filename = request.headers.get('X-Filename') || ('upload-' + Date.now());
      const safeFilename = filename.replace(/[^a-zA-Z0-9._-]/g, '_');
      const key = 'media/' + safeFilename;
      await env.EXILIUM_MEDIA.put(key, request.body, {
        httpMetadata: { contentType },
      });
      const publicUrl = 'https://exilium-blizzard.mitzumitzukyhs.workers.dev/media/' + safeFilename;
      return jsonResponse({ ok: true, url: publicUrl, key });
    }

    // ── Hall of Fame ──
    if (method === 'GET' && path === '/admin/hall-of-fame') {
      const raw = await env.EXILIUM_KV.get('config:hall_of_fame', 'json');
      return jsonResponse(raw || { entries: [] });
    }

    if (method === 'PUT' && path === '/admin/hall-of-fame') {
      const body = await request.json();
      if (!body || !Array.isArray(body.entries)) {
        return jsonResponse({ error: 'entries debe ser un array' }, 400);
      }
      await env.EXILIUM_KV.put('config:hall_of_fame', JSON.stringify(body));
      return jsonResponse({ ok: true, count: body.entries.length });
    }

    // ── Analytics ──
    if (method === 'GET' && path === '/admin/analytics') {
      const raw = await env.EXILIUM_KV.get('analytics:pageviews', 'json') || { total: 0, daily: {} };
      return jsonResponse(raw);
    }

    // ── Healer Bonus Config ──
    if (method === 'GET' && path === '/admin/healer-bonus') {
      const raw = await env.EXILIUM_KV.get('config:healer_bonus', 'json') || { enabled: false, multiplier: 2 };
      return jsonResponse(raw);
    }

    if (method === 'PUT' && path === '/admin/healer-bonus') {
      const body = await request.json();
      const config = {
        enabled: !!body.enabled,
        multiplier: Math.max(1, Math.min(10, parseInt(body.multiplier, 10) || 2)),
      };
      await env.EXILIUM_KV.put('config:healer_bonus', JSON.stringify(config));
      return jsonResponse({ ok: true, config });
    }

    // ── Battle Pass Config ──
    if (method === 'GET' && path === '/admin/battlepass-config') {
      const raw = await env.EXILIUM_KV.get('config:battlepass_rewards');
      return jsonResponse(raw ? JSON.parse(raw) : { rewards: [] });
    }

    if (method === 'PUT' && path === '/admin/battlepass-config') {
      const body = await request.json();
      if (!body || !Array.isArray(body.rewards)) {
        return jsonResponse({ error: 'rewards debe ser un array' }, 400);
      }
      await env.EXILIUM_KV.put('config:battlepass_rewards', JSON.stringify(body));
      return jsonResponse({ ok: true, count: body.rewards.length });
    }

    // ── Backup / Restore ──
    if (method === 'GET' && path === '/admin/backup/info') {
      const info = await getBackupInfo(request, env);
      return jsonResponse(info);
    }

    if (method === 'POST' && path === '/admin/backup') {
      const backup = await createBackup(request, env);
      return jsonResponse(backup);
    }

    if (method === 'POST' && path === '/admin/restore') {
      const result = await restoreBackup(request, env);
      return jsonResponse(result, result.success ? 200 : 400);
    }
  }

  return jsonResponse({ error: 'Ruta no encontrada' }, 404);
}

export default {
  async fetch(request, env, ctx) {
    if (request.method === 'OPTIONS') {
      return new Response(null, {
        headers: {
          'Access-Control-Allow-Origin': env.CORS_ORIGIN || '*',
          'Access-Control-Allow-Methods': 'GET, POST, PUT, PATCH, DELETE, OPTIONS',
          'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-API-Token',
          'Access-Control-Max-Age': '86400',
        },
      });
    }

    let response;
    try {
      response = await handleRequest(request, env, ctx);
    } catch (err) {
      console.error('Error global no capturado:', err);
      ctx.waitUntil(logError(err, 'global_unhandled', env, { path: request.url }));
      response = jsonResponse({ error: 'Error interno del servidor' }, 500);
    }

    const corsResponse = new Response(response.body, response);
    corsResponse.headers.set('Access-Control-Allow-Origin', env.CORS_ORIGIN || '*');
    corsResponse.headers.set('Vary', 'Origin');
    return corsResponse;
  },

  async scheduled(event, env, ctx) {
    console.log(`[CRON] Iniciando sincronización programada: ${new Date().toISOString()}`);
    ctx.waitUntil(
      (async () => {
        // Comprobar si hay un ranking build parcial en progreso
        const partial = await env.EXILIUM_KV.get('cache:guild-ranking:partial', 'json');

        if (partial) {
          // Si hay un build parcial, continuarlo (NO sincronizar jugadores para no exceder 50 subrequests)
          try {
            const off = partial.offset || 0;
            const result = await buildGuildRanking(env, String(off));
            console.log(`[CRON] Guild ranking phase: ${result.status}`);
          } catch (err) {
            console.error('[CRON] Error en guild ranking build:', err);
          }
        } else {
          // Sin build parcial: sincronizar jugadores y luego iniciar un nuevo ranking build (fase 1 = roster, ~3 calls)
          try {
            await syncAllPlayers(env);
          } catch (err) {
            console.error('[CRON] Error durante la sincronización masiva:', err);
            await logError(err, 'cron', env);
          }
          // Iniciar fase 1 del ranking (roster fetch = ~3 subrequests, seguro tras sync de ~39)
          try {
            const result = await buildGuildRanking(env, '0');
            console.log(`[CRON] Guild ranking started: ${result.status}`);
          } catch (err) {
            console.error('[CRON] Error iniciando guild ranking build:', err);
          }
        }
      })()
    );
  },
};
