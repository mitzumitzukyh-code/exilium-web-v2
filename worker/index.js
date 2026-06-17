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
import { handleRBGMatch, handleRBGHistory, handleRBGStats } from './rbg-tracker.js';
import {
  handleBoostRegister, handleBoostLogin, handleBoostLogout, handleBoostMe,
  handleBoosterApply, handleGetBoosterApplications, handleApproveBooster, handleRejectBooster,
  verifyBoostingSession,
} from './boosting-auth.js';
import {
  handleCreateOrder, handleGetClientOrders, handleGetOrder, handleGetAvailableOrders,
  handleClaimOrder, handleStartOrder, handleCompleteOrder, handleCancelOrder,
  handleAddProgressNote, handleGetNotifications, handleMarkNotificationsRead,
  handleAdminGetAllOrders, handleAdminGetBoosters,
} from './boosting-orders.js';import { getArticles, getArticleById, createArticle, updateArticle, deleteArticle } from './news.js';
import { scheduled as newsCronScheduled, handleImportNews } from './news-cron.js';
const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Filename, X-Upload-Id, X-Upload-Key, X-Part-Number',
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

  // --- Public routes ---
  if (method === 'GET' && path === '/api/health') return new Response('OK');

  if (method === 'GET' && path === '/api/players') {
    try {
      const players = await getPlayersData(env, false);
      return cachedJsonResponse(players, 60);
    } catch (err) {
      return jsonResponse({ error: err.message }, 500);
    }
  }

  if (method === 'GET' && path.startsWith('/api/players/')) {
    const playerId = decodeURIComponent(path.split('/')[3]);
    const player = await getPlayer(request, env, `player:${playerId}`);
    return player ? jsonResponse(player) : jsonResponse({ error: 'Jugador no encontrado' }, 404);
  }

  if (method === 'GET' && path === '/api/announcement') {
    try {
      const announcement = await getAnnouncement(request, env);
      return cachedJsonResponse(announcement, 120);
    } catch (err) {
      return cachedJsonResponse({ message: null }, 120);
    }
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

  if (method === 'GET' && path === '/api/boost-banner') {
    const val = await env.EXILIUM_KV.get('config:boost_banner_visible');
    return cachedJsonResponse({ visible: val !== 'false' }, 60);
  }

  if (method === 'GET' && path === '/api/rbg-strategies') {
    const raw = await env.EXILIUM_KV.get('config:rbg_strategies', 'json');
    return cachedJsonResponse(raw || [], 60);
  }

  // ── Public News ──
  if (method === 'GET' && path === '/api/news') {
    try {
      const articles = await getArticles(env, false);
      return cachedJsonResponse(articles, 120);
    } catch (err) {
      return jsonResponse({ error: err.message }, 500);
    }
  }

  if (method === 'GET' && path.startsWith('/api/news/')) {
    const id = decodeURIComponent(path.split('/')[3]);
    try {
      const article = await getArticleById(env, id);
      if (!article || article.status !== 'published') {
        return jsonResponse({ error: 'Noticia no encontrada' }, 404);
      }
      return jsonResponse(article);
    } catch (err) {
      return jsonResponse({ error: err.message }, 500);
    }
  }

  // ── Public Comments ──
  if (method === 'GET' && path === '/api/comments') {
    const raw = await env.EXILIUM_KV.get('public:comments', 'json') || [];
    // Strip IP addresses before returning to clients (privacy)
    const safe = raw.map(({ ip, ...rest }) => rest);
    return jsonResponse(safe);
  }

  if (method === 'POST' && path === '/api/comments') {
    let body;
    try { body = await request.json(); } catch (_) { return jsonResponse({ error: 'JSON inválido' }, 400); }
    const author = (body.author || '').trim().slice(0, 40);
    const text = (body.text || '').trim().slice(0, 300);
    if (!author || !text) return jsonResponse({ error: 'Autor y texto requeridos' }, 400);

    const ip = request.headers.get('CF-Connecting-IP') || 'unknown';
    const existing = await env.EXILIUM_KV.get('public:comments', 'json') || [];

    // Rate limit: max 2 comments per IP in last 5 minutes
    const fiveMinAgo = Date.now() - 5 * 60 * 1000;
    const recentFromIp = existing.filter(c => c.ip === ip && c.ts > fiveMinAgo);
    if (recentFromIp.length >= 2) return jsonResponse({ error: 'Espera un poco antes de comentar de nuevo' }, 429);

    const newComment = { id: Date.now(), author, text, ts: Date.now(), ip, likes: 0 };
    const updated = [newComment, ...existing].slice(0, 200);
    await env.EXILIUM_KV.put('public:comments', JSON.stringify(updated));
    const { ip: _ip, ...safe } = newComment;
    return jsonResponse({ ok: true, comment: safe });
  }

  // ── Comment Likes ──
  if (method === 'POST' && path.startsWith('/api/comments/') && path.endsWith('/like')) {
    const commentId = parseInt(path.split('/')[3], 10);
    if (!commentId) return jsonResponse({ error: 'ID inválido' }, 400);
    const ip = request.headers.get('CF-Connecting-IP') || 'unknown';

    const likeKey = `likes:comment:${commentId}:${ip}`;
    const alreadyLiked = await env.EXILIUM_KV.get(likeKey);
    if (alreadyLiked) return jsonResponse({ error: 'Ya diste like a este comentario' }, 409);

    const existing = await env.EXILIUM_KV.get('public:comments', 'json') || [];
    const idx = existing.findIndex(c => c.id === commentId);
    if (idx === -1) return jsonResponse({ error: 'Comentario no encontrado' }, 404);
    existing[idx].likes = (existing[idx].likes || 0) + 1;
    await env.EXILIUM_KV.put('public:comments', JSON.stringify(existing));
    await env.EXILIUM_KV.put(likeKey, '1', { expirationTtl: 60 * 60 * 24 * 30 });
    return jsonResponse({ ok: true, likes: existing[idx].likes });
  }

  // ── Page Like (general) ──
  if (method === 'GET' && path === '/api/page-likes') {
    const raw = await env.EXILIUM_KV.get('public:page_likes', 'json');
    return jsonResponse(raw || { total: 0 });
  }

  if (method === 'POST' && path === '/api/page-likes') {
    const ip = request.headers.get('CF-Connecting-IP') || 'unknown';
    const likeKey = `likes:page:${ip}`;
    const alreadyLiked = await env.EXILIUM_KV.get(likeKey);

    const raw = await env.EXILIUM_KV.get('public:page_likes', 'json') || { total: 0 };
    if (alreadyLiked) {
      return jsonResponse({ ok: true, total: raw.total, already: true });
    }
    raw.total = (raw.total || 0) + 1;
    await env.EXILIUM_KV.put('public:page_likes', JSON.stringify(raw));
    await env.EXILIUM_KV.put(likeKey, '1', { expirationTtl: 60 * 60 * 24 * 30 });
    return jsonResponse({ ok: true, total: raw.total, already: false });
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

  // --- RBG Tracker routes ---
  if (method === 'POST' && path === '/rbg/match') {
    const result = await handleRBGMatch(request, env);
    return jsonResponse(result, result.status || (result.error ? 400 : 200));
  }
  if (method === 'GET' && path === '/rbg/history') {
    const result = await handleRBGHistory(request, env);
    return result.error ? jsonResponse(result, result.status || 500) : cachedJsonResponse(result, 30);
  }
  if (method === 'GET' && path === '/rbg/stats') {
    const result = await handleRBGStats(request, env);
    return result.error ? jsonResponse(result, result.status || 500) : cachedJsonResponse(result, 60);
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

    // ── Media Upload (R2) — single PUT (small files < 90MB) ──
    if (method === 'POST' && path === '/admin/upload-media') {
      const filename = request.headers.get('X-Filename') || ('upload-' + Date.now());
      const safeFilename = filename.replace(/[^a-zA-Z0-9._-]/g, '_');
      const ext = safeFilename.split('.').pop().toLowerCase();
      const extTypes = { mp4: 'video/mp4', webm: 'video/webm', mov: 'video/quicktime', avi: 'video/x-msvideo', mkv: 'video/x-matroska', jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', gif: 'image/gif', webp: 'image/webp' };
      let contentType = request.headers.get('Content-Type') || '';
      if (!contentType.startsWith('video/') && !contentType.startsWith('image/')) {
        contentType = extTypes[ext] || 'video/mp4';
      }
      const key = 'media/' + safeFilename;
      await env.EXILIUM_MEDIA.put(key, request.body, { httpMetadata: { contentType } });
      const publicUrl = 'https://exilium-blizzard.mitzumitzukyhs.workers.dev/media/' + safeFilename;
      return jsonResponse({ ok: true, url: publicUrl, key });
    }

    // ── Multipart Upload: Init ──
    if (method === 'POST' && path === '/admin/upload-media/init') {
      const filename = request.headers.get('X-Filename') || ('upload-' + Date.now());
      const safeFilename = filename.replace(/[^a-zA-Z0-9._-]/g, '_');
      const ext = safeFilename.split('.').pop().toLowerCase();
      const extTypes = { mp4: 'video/mp4', webm: 'video/webm', mov: 'video/quicktime', avi: 'video/x-msvideo', mkv: 'video/x-matroska' };
      let contentType = request.headers.get('Content-Type') || '';
      if (!contentType.startsWith('video/') && !contentType.startsWith('image/')) {
        contentType = extTypes[ext] || 'video/mp4';
      }
      const key = 'media/' + safeFilename;
      const upload = await env.EXILIUM_MEDIA.createMultipartUpload(key, { httpMetadata: { contentType } });
      return jsonResponse({ uploadId: upload.uploadId, key, filename: safeFilename });
    }

    // ── Multipart Upload: Upload Part ──
    if (method === 'POST' && path === '/admin/upload-media/part') {
      const uploadId = request.headers.get('X-Upload-Id');
      const key = request.headers.get('X-Upload-Key');
      const partNum = parseInt(request.headers.get('X-Part-Number') || '1', 10);
      if (!uploadId || !key) return jsonResponse({ error: 'Missing upload ID or key' }, 400);
      const upload = env.EXILIUM_MEDIA.resumeMultipartUpload(key, uploadId);
      const part = await upload.uploadPart(partNum, request.body);
      return jsonResponse({ partNumber: part.partNumber, etag: part.etag });
    }

    // ── Multipart Upload: Complete ──
    if (method === 'POST' && path === '/admin/upload-media/complete') {
      const body = await request.json();
      const { uploadId, key, parts } = body;
      if (!uploadId || !key || !parts) return jsonResponse({ error: 'Missing fields' }, 400);
      const upload = env.EXILIUM_MEDIA.resumeMultipartUpload(key, uploadId);
      await upload.complete(parts);
      const filename = key.replace('media/', '');
      const publicUrl = 'https://exilium-blizzard.mitzumitzukyhs.workers.dev/media/' + filename;
      return jsonResponse({ ok: true, url: publicUrl, key });
    }

    // ── Multipart Upload: Abort ──
    if (method === 'POST' && path === '/admin/upload-media/abort') {
      const body = await request.json();
      const { uploadId, key } = body;
      if (!uploadId || !key) return jsonResponse({ error: 'Missing fields' }, 400);
      const upload = env.EXILIUM_MEDIA.resumeMultipartUpload(key, uploadId);
      await upload.abort();
      return jsonResponse({ ok: true });
    }

    // ── Noticias de Parche ──
    if (method === 'GET' && path === '/admin/news') {
      try {
        const articles = await getArticles(env, true);
        return jsonResponse(articles);
      } catch (err) {
        return jsonResponse({ error: err.message }, 500);
      }
    }
    if (method === 'POST' && path === '/admin/news/import') {
      return await handleImportNews(request, env);
    }
    if (method === 'POST' && path === '/admin/news') {
      try {
        const body = await request.json();
        const article = await createArticle(env, body);
        return jsonResponse(article, 201);
      } catch (err) {
        return jsonResponse({ error: err.message }, 400);
      }
    }

    if (method === 'PATCH' && path.startsWith('/admin/news/')) {
      const id = decodeURIComponent(path.split('/')[3]);
      if (!id) return jsonResponse({ error: 'ID requerido' }, 400);
      try {
        const body = await request.json();
        const article = await updateArticle(env, id, body);
        if (!article) return jsonResponse({ error: 'Noticia no encontrada' }, 404);
        return jsonResponse(article);
      } catch (err) {
        return jsonResponse({ error: err.message }, 400);
      }
    }

    if (method === 'DELETE' && path.startsWith('/admin/news/')) {
      const id = decodeURIComponent(path.split('/')[3]);
      if (!id) return jsonResponse({ error: 'ID requerido' }, 400);
      try {
        const deleted = await deleteArticle(env, id);
        if (!deleted) return jsonResponse({ error: 'Noticia no encontrada' }, 404);
        return jsonResponse({ ok: true });
      } catch (err) {
        return jsonResponse({ error: err.message }, 500);
      }
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

    // ── Boost Banner Toggle ──
    if (method === 'GET' && path === '/admin/boost-banner') {
      const val = await env.EXILIUM_KV.get('config:boost_banner_visible');
      return jsonResponse({ visible: val !== 'false' });
    }

    if (method === 'PUT' && path === '/admin/boost-banner') {
      const body = await request.json().catch(() => ({}));
      const visible = body.visible !== false;
      await env.EXILIUM_KV.put('config:boost_banner_visible', visible ? 'true' : 'false');
      return jsonResponse({ ok: true, visible });
    }

    // ── RBG Strategies ──
    if (method === 'GET' && path === '/admin/rbg-strategies') {
      const raw = await env.EXILIUM_KV.get('config:rbg_strategies', 'json');
      return jsonResponse(raw || []);
    }

    if (method === 'PUT' && path === '/admin/rbg-strategies') {
      const body = await request.json().catch(() => ([]));
      await env.EXILIUM_KV.put('config:rbg_strategies', JSON.stringify(body));
      return jsonResponse({ ok: true });
    }

    // ── N8N Webhook Config ──
    if (method === 'GET' && path === '/admin/n8n-config') {
      const url = await env.EXILIUM_KV.get('config:n8n_webhook_url') || '';
      const discordUrl = await env.EXILIUM_KV.get('config:discord_webhook_url') || '';
      return jsonResponse({ webhook_url: url, discord_webhook_url: discordUrl });
    }

    if (method === 'PUT' && path === '/admin/n8n-config') {
      const body = await request.json();
      if (body.webhook_url !== undefined) {
        await env.EXILIUM_KV.put('config:n8n_webhook_url', body.webhook_url.trim());
      }
      if (body.discord_webhook_url !== undefined) {
        await env.EXILIUM_KV.put('config:discord_webhook_url', body.discord_webhook_url.trim());
      }
      return jsonResponse({ ok: true });
    }

    // Endpoint for admin to test the N8N webhook manually
    if (method === 'POST' && path === '/admin/n8n-test') {
      const webhookUrl = await env.EXILIUM_KV.get('config:n8n_webhook_url');
      if (!webhookUrl) return jsonResponse({ error: 'No hay webhook configurado' }, 400);
      const res = await fetch(webhookUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          event: 'rating_milestone',
          player_name: 'TestPlayer',
          player_class: 'Warrior',
          player_spec: 'Arms',
          player_realm: 'Ragnaros',
          player_avatar: '',
          bracket: 'Solo Shuffle',
          rating: 2400,
          milestone: 2400,
          timestamp: new Date().toISOString(),
          test: true,
        }),
      });
      return jsonResponse({ ok: res.ok, status: res.status });
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

  // ── Boosting Portal — Public Auth Routes ──
  if (method === 'POST' && path === '/api/boost/register') {
    const result = await handleBoostRegister(request, env);
    return jsonResponse(result, result.error ? 400 : 200);
  }

  if (method === 'POST' && path === '/api/boost/login') {
    const result = await handleBoostLogin(request, env);
    return jsonResponse(result, result.error ? 401 : 200);
  }

  if (method === 'POST' && path === '/api/boost/logout') {
    const result = await handleBoostLogout(request, env);
    return jsonResponse(result);
  }

  if (method === 'GET' && path === '/api/boost/me') {
    const result = await handleBoostMe(request, env);
    return jsonResponse(result, result.status || 200);
  }

  if (method === 'POST' && path === '/api/boost/booster/apply') {
    const result = await handleBoosterApply(request, env);
    return jsonResponse(result, result.error ? 400 : 200);
  }

  // ── Boosting Portal — Orders (require boost session) ──
  if (path.startsWith('/api/boost/')) {
    const session = await verifyBoostingSession(request, env);

    if (method === 'POST' && path === '/api/boost/orders') {
      const result = await handleCreateOrder(request, env, session);
      return jsonResponse(result, result.status || (result.error ? 400 : 200));
    }

    if (method === 'GET' && path === '/api/boost/orders') {
      const result = await handleGetClientOrders(request, env, session);
      return jsonResponse(result, result.status || 200);
    }

    if (method === 'GET' && path === '/api/boost/orders/available') {
      const result = await handleGetAvailableOrders(env, session);
      return jsonResponse(result, result.status || 200);
    }

    if (method === 'GET' && path.startsWith('/api/boost/orders/') && !path.endsWith('/available')) {
      const orderId = path.split('/')[4];
      const result = await handleGetOrder(orderId, env, session);
      return jsonResponse(result, result.status || 200);
    }

    if (method === 'POST' && path.startsWith('/api/boost/orders/') && path.endsWith('/claim')) {
      const orderId = path.split('/')[4];
      const result = await handleClaimOrder(orderId, env, session);
      return jsonResponse(result, result.status || 200);
    }

    if (method === 'POST' && path.startsWith('/api/boost/orders/') && path.endsWith('/start')) {
      const orderId = path.split('/')[4];
      const result = await handleStartOrder(orderId, env, session);
      return jsonResponse(result, result.status || 200);
    }

    if (method === 'POST' && path.startsWith('/api/boost/orders/') && path.endsWith('/complete')) {
      const orderId = path.split('/')[4];
      const result = await handleCompleteOrder(orderId, env, session);
      return jsonResponse(result, result.status || 200);
    }

    if (method === 'POST' && path.startsWith('/api/boost/orders/') && path.endsWith('/cancel')) {
      const orderId = path.split('/')[4];
      const result = await handleCancelOrder(orderId, env, session);
      return jsonResponse(result, result.status || 200);
    }

    if (method === 'POST' && path.startsWith('/api/boost/orders/') && path.endsWith('/note')) {
      const orderId = path.split('/')[4];
      const result = await handleAddProgressNote(orderId, request, env, session);
      return jsonResponse(result, result.status || 200);
    }

    if (method === 'GET' && path === '/api/boost/notifications') {
      const result = await handleGetNotifications(env, session);
      return jsonResponse(result, result.status || 200);
    }

    if (method === 'POST' && path === '/api/boost/notifications/read') {
      const result = await handleMarkNotificationsRead(env, session);
      return jsonResponse(result, result.status || 200);
    }
  }

  // ── Boosting Portal — Admin Routes ──
  if (path.startsWith('/admin/boost/')) {
    if (!(await handleAdminAuth(request, env))) {
      return jsonResponse({ error: 'Unauthorized' }, 401);
    }

    if (method === 'GET' && path === '/admin/boost/applications') {
      const result = await handleGetBoosterApplications(request, env);
      return jsonResponse(result);
    }

    if (method === 'POST' && path.startsWith('/admin/boost/applications/') && path.endsWith('/approve')) {
      const userId = path.split('/')[4];
      const result = await handleApproveBooster(userId, env);
      return jsonResponse(result, result.error ? 404 : 200);
    }

    if (method === 'POST' && path.startsWith('/admin/boost/applications/') && path.endsWith('/reject')) {
      const userId = path.split('/')[4];
      const result = await handleRejectBooster(userId, env);
      return jsonResponse(result, result.error ? 404 : 200);
    }

    if (method === 'GET' && path === '/admin/boost/orders') {
      const result = await handleAdminGetAllOrders(env);
      return jsonResponse(result);
    }

    if (method === 'GET' && path === '/admin/boost/boosters') {
      const result = await handleAdminGetBoosters(env);
      return jsonResponse(result);
    }
  }

  return jsonResponse({ error: 'Ruta no encontrada' }, 404);
}

export default {
  async fetch(request, env, ctx) {
    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: CORS_HEADERS });
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

    // Ejecutar también el cron de noticias
    ctx.waitUntil(newsCronScheduled(event, env, ctx));
  },
};
