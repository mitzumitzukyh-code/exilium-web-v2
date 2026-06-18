// worker/news.js

const KV_KEY_ARTICLES = 'news:articles';
const KV_KEY_CRON = 'news:cron_last_run';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function generateId() {
  const ts = Date.now();
  const rand = Math.random().toString(36).slice(2, 6);
  return `auto_${ts}_${rand}`;
}

async function getAllArticles(env) {
  const raw = await env.KV.get(KV_KEY_ARTICLES);
  if (!raw) return [];
  try {
    return JSON.parse(raw);
  } catch {
    return [];
  }
}

async function saveAllArticles(env, articles) {
  await env.KV.put(KV_KEY_ARTICLES, JSON.stringify(articles));
}

// ─── Handlers públicos ────────────────────────────────────────────────────────

export async function handleGetNews(request, env) {
  const articles = await getAllArticles(env);
  const published = articles
    .filter(a => a.status === 'published')
    .sort((a, b) => new Date(b.publishedAt) - new Date(a.publishedAt));
  return Response.json(published);
}

export async function handleGetNewsById(request, env, id) {
  const articles = await getAllArticles(env);
  const article = articles.find(a => a.id === id);
  if (!article || article.status !== 'published') {
    return new Response('Not found', { status: 404 });
  }
  return Response.json(article);
}

// ─── Handlers admin ───────────────────────────────────────────────────────────

export async function handleAdminGetNews(request, env) {
  const articles = await getAllArticles(env);
  const sorted = [...articles].sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
  return Response.json(sorted);
}

export async function handleAdminPatchNews(request, env, id) {
  let body;
  try {
    body = await request.json();
  } catch {
    return new Response('Invalid JSON', { status: 400 });
  }

  const articles = await getAllArticles(env);
  const idx = articles.findIndex(a => a.id === id);
  if (idx === -1) return new Response('Not found', { status: 404 });

  const allowed = ['status', 'title', 'summary', 'body', 'class', 'patchVersion', 'expansion'];
  for (const key of allowed) {
    if (body[key] !== undefined) articles[idx][key] = body[key];
  }

  if (body.status === 'published' && !articles[idx].publishedAt) {
    articles[idx].publishedAt = new Date().toISOString();
    articles[idx].approvedBy = body.approvedBy || 'admin';
  }

  await saveAllArticles(env, articles);
  return Response.json(articles[idx]);
}

export async function handleAdminDeleteNews(request, env, id) {
  const articles = await getAllArticles(env);
  const filtered = articles.filter(a => a.id !== id);
  if (filtered.length === articles.length) {
    return new Response('Not found', { status: 404 });
  }
  await saveAllArticles(env, filtered);
  return new Response(null, { status: 204 });
}

export async function handleAdminGetCronStatus(request, env) {
  const raw = await env.KV.get(KV_KEY_CRON);
  if (!raw) return Response.json({ lastRun: null });
  return Response.json(JSON.parse(raw));
}

// ─── Función interna: insertar artículos desde el cron ────────────────────────

export async function insertArticles(env, newArticles) {
  const articles = await getAllArticles(env);
  const existingIds = new Set(articles.map(a => a.blizzardId));
  let inserted = 0;

  for (const article of newArticles) {
    if (existingIds.has(article.blizzardId)) continue;
    articles.push({
      ...article,
      id: generateId(),
      status: 'pending',
      createdAt: new Date().toISOString(),
      publishedAt: null,
      approvedBy: null,
    });
    inserted++;
  }

  await saveAllArticles(env, articles);
  return inserted;
}
