// worker/news.js — Sistema de noticias de parches WoW (solo PvP)
// Almacenamiento: KV key "news:articles" → Array de artículos

const NEWS_KEY = 'news:articles';

// ── Helpers ──

function generateId() {
  return 'news_' + Date.now() + '_' + Math.random().toString(36).slice(2, 8);
}

function sanitizeArticle(body) {
  return {
    id: body.id || generateId(),
    title: (body.title || '').trim().slice(0, 200),
    summary: (body.summary || '').trim().slice(0, 500),
    body: (body.body || '').trim().slice(0, 10000),
    class: body.class || 'general',
    expansion: (body.expansion || '').trim().slice(0, 50),
    patchVersion: (body.patchVersion || '').trim().slice(0, 20),
    source: body.source === 'wowhead' ? 'wowhead' : 'blizzard',
    sourceUrl: (body.sourceUrl || '').trim().slice(0, 500),
    status: body.status || 'draft',
    createdAt: body.createdAt || new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    publishedAt: body.publishedAt || null,
    approvedBy: body.approvedBy || null,
  };
}

function compareDatesDesc(a, b) {
  const dateA = a.publishedAt || a.createdAt;
  const dateB = b.publishedAt || b.createdAt;
  return dateB.localeCompare(dateA);
}

// ── CRUD ──

export async function getArticles(env, includeAll = false) {
  const raw = await env.EXILIUM_KV.get(NEWS_KEY, 'json');
  const articles = Array.isArray(raw) ? raw : [];

  if (!includeAll) {
    // Público: solo published, ordenados por fecha
    return articles
      .filter(a => a.status === 'published')
      .sort(compareDatesDesc);
  }

  // Admin: todos, ordenados por fecha descendente
  return articles.sort(compareDatesDesc);
}

export async function getArticleById(env, id) {
  const raw = await env.EXILIUM_KV.get(NEWS_KEY, 'json');
  const articles = Array.isArray(raw) ? raw : [];
  return articles.find(a => a.id === id) || null;
}

export async function createArticle(env, body) {
  const raw = await env.EXILIUM_KV.get(NEWS_KEY, 'json');
  const articles = Array.isArray(raw) ? raw : [];

  const article = sanitizeArticle(body);
  article.createdAt = new Date().toISOString();
  article.updatedAt = article.createdAt;

  articles.unshift(article);
  await env.EXILIUM_KV.put(NEWS_KEY, JSON.stringify(articles));
  return article;
}

export async function updateArticle(env, id, body) {
  const raw = await env.EXILIUM_KV.get(NEWS_KEY, 'json');
  const articles = Array.isArray(raw) ? raw : [];
  const idx = articles.findIndex(a => a.id === id);

  if (idx === -1) return null;

  const article = articles[idx];

  // Actualizar campos permitidos
  if (body.title !== undefined) article.title = (body.title || '').trim().slice(0, 200);
  if (body.summary !== undefined) article.summary = (body.summary || '').trim().slice(0, 500);
  if (body.body !== undefined) article.body = (body.body || '').trim().slice(0, 10000);
  if (body.class !== undefined) article.class = body.class;
  if (body.expansion !== undefined) article.expansion = (body.expansion || '').trim().slice(0, 50);
  if (body.patchVersion !== undefined) article.patchVersion = (body.patchVersion || '').trim().slice(0, 20);
  if (body.source !== undefined) article.source = body.source === 'wowhead' ? 'wowhead' : 'blizzard';
  if (body.sourceUrl !== undefined) article.sourceUrl = (body.sourceUrl || '').trim().slice(0, 500);

  // Manejo de status
  if (body.status === 'published' && article.status !== 'published') {
    article.status = 'published';
    article.publishedAt = new Date().toISOString();
    article.approvedBy = body.approvedBy || 'admin';
  } else if (body.status === 'rejected') {
    article.status = 'rejected';
  } else if (body.status === 'draft') {
    article.status = 'draft';
  } else if (body.status === 'pending') {
    article.status = 'pending';
  }

  article.updatedAt = new Date().toISOString();
  articles[idx] = article;
  await env.EXILIUM_KV.put(NEWS_KEY, JSON.stringify(articles));
  return article;
}

export async function deleteArticle(env, id) {
  const raw = await env.EXILIUM_KV.get(NEWS_KEY, 'json');
  const articles = Array.isArray(raw) ? raw : [];
  const idx = articles.findIndex(a => a.id === id);

  if (idx === -1) return false;

  articles.splice(idx, 1);
  await env.EXILIUM_KV.put(NEWS_KEY, JSON.stringify(articles));
  return true;
}
