// worker/news-cron.js — Importación automática de parches desde Blizzard
// Busca en Blizzard News RSS + Wowhead, filtra solo cambios PvP con Workers AI
// y guarda como pending para aprobación del admin.

const NEWS_KEY = 'news:articles';
const CRON_STATE_KEY = 'news:cron_last_run';

// Fuentes RSS oficiales
const SOURCES = [
  {
    id: 'blizzard',
    name: 'Blizzard',
    url: 'https://news.blizzard.com/en-us/world-of-warcraft/rss',
    label: 'Blizzard — Notas de parche oficiales',
  },
  {
    id: 'wowhead',
    name: 'Wowhead',
    url: 'https://www.wowhead.com/news/rss/world-of-warcraft',
    label: 'Wowhead — Noticias PvP',
  },
];

// Palabras clave PvP para filtro rápido (evita llamar IA innecesariamente)
const PVP_KEYWORDS = [
  'pvp', 'arena', 'battleground', 'battlefield', 'player vs player',
  'player versus player', 'honor', 'conquest', 'rating',
  'pvp talent', 'pvp combat', 'pvp modifier', 'pvp coefficient',
  'damage reduced', 'healing reduced', 'duration reduced',
  'efectividad en pvp', 'daño reducido en', 'curacion reducida',
  'glutão', 'warsong', 'arathi', 'eye of the storm',
  'solo shuffle', 'blitz', 'rbg', 'rated battleground',
  'pvp trinket', 'gladiator', 'duelist', 'rival', 'combatant',
  'pvp set bonus', 'pvp tier',
  // Palabras clave en español
  'jugador contra jugador', 'campo de batalla', 'honor',
  'daño reducido', 'curacion reducida',
];

function hasPvPKeywords(text) {
  const lower = text.toLowerCase();
  return PVP_KEYWORDS.some(kw => lower.includes(kw));
}

// ── RSS Parser básico (sin dependencias) ──
function parseRSS(xmlText) {
  const items = [];
  // Extraer items del RSS
  const itemRegex = /<item>([\s\S]*?)<\/item>/gi;
  let match;
  while ((match = itemRegex.exec(xmlText)) !== null) {
    const itemXml = match[1];
    const title = extractTag(itemXml, 'title');
    const link = extractTag(itemXml, 'link');
    const description = extractTag(itemXml, 'description');
    const pubDate = extractTag(itemXml, 'pubDate');
    const guid = extractTag(itemXml, 'guid') || link;

    if (title) {
      items.push({
        guid: guid.trim(),
        title: cleanHtmlEntities(title.trim()),
        link: (link || '').trim(),
        description: cleanHtmlEntities(description || '').trim(),
        pubDate: pubDate ? new Date(pubDate).toISOString() : new Date().toISOString(),
        source: 'blizzard',
      });
    }
  }

  // También intentar con Atom/JSON feed (para Wowhead)
  if (items.length === 0) {
    const entryRegex = /<entry>([\s\S]*?)<\/entry>/gi;
    while ((match = entryRegex.exec(xmlText)) !== null) {
      const entryXml = match[1];
      const title = extractTag(entryXml, 'title');
      const link = extractTag(entryXml, 'link');
      const content = extractTag(entryXml, 'content') || extractTag(entryXml, 'summary');
      const published = extractTag(entryXml, 'published') || extractTag(entryXml, 'updated');
      const id = extractTag(entryXml, 'id') || link;

      if (title) {
        items.push({
          guid: id.trim(),
          title: cleanHtmlEntities(title.trim()),
          link: (link || '').trim(),
          description: cleanHtmlEntities(content || '').trim(),
          pubDate: published ? new Date(published).toISOString() : new Date().toISOString(),
          source: 'wowhead',
        });
      }
    }
  }

  return items;
}

function extractTag(xml, tag) {
  const regex = new RegExp(`<${tag}[^>]*>(.*?)<\/${tag}>`, 'is');
  const m = regex.exec(xml);
  return m ? m[1].trim() : '';
}

function cleanHtmlEntities(str) {
  return str
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&#x27;/g, "'")
    .replace(/<[^>]*>/g, ''); // strip HTML tags
}

// ── Clasificación con Workers AI ──
async function classifyWithAI(text, env) {
  if (!env.AI) return { pvp: false, confidence: 0, reason: 'no AI binding' };

  try {
    const response = await env.AI.run('@cf/meta/llama-3.1-8b-instruct', {
      prompt: `Eres un experto en World of Warcraft PvP. Analiza el siguiente texto de notas de parche y determina si describe CAMBIOS EN PvP (jugador contra jugador).

Reglas:
- Responde SOLO con {"pvp":"si","clase":"..."} o {"pvp":"no"}
- Si es PvP, incluye la clase afectada (warrior/mage/priest/etc o "general")
- EJEMPLOS de cambios PvP: "aumenta el daño en PvP", "efectividad reducida en combates contra jugadores", "ahora funciona al 50% en arena"
- EJEMPLOS de NO PvP: "nueva montura", "corrección de errores de interfaz", "cambios en mazmorras"

Texto:
${text.trim().slice(0, 1500)}`,
      max_tokens: 50,
      temperature: 0.05,
    });

    const resultText = response.response || '';
    try {
      const result = JSON.parse(resultText);
      return {
        pvp: result.pvp === 'si',
        class: result.clase || 'general',
        confidence: 1,
        reason: 'AI classified',
      };
    } catch {
      // Fallback: si no se puede parsear, buscar "pvp" en la respuesta
      return {
        pvp: resultText.toLowerCase().includes('"pvp":"si"') || resultText.toLowerCase().includes('pvp'),
        class: 'general',
        confidence: 0.5,
        reason: 'AI fuzzy match',
      };
    }
  } catch (err) {
    return { pvp: false, confidence: 0, reason: err.message };
  }
}

// ── Detectar versión de parche desde el texto ──
function detectPatchInfo(text) {
  const patchRegex = /(\d+\.\d+(?:\.\d+)?)/g;
  const matches = text.match(patchRegex);
  const version = matches ? matches[0] : '';

  // Detectar expansión
  let expansion = '';
  const expMap = {
    'the war within': 'The War Within',
    'dragonflight': 'Dragonflight',
    'shadowlands': 'Shadowlands',
    'battle for azeroth': 'Battle for Azeroth',
    'legion': 'Legion',
    'warlords of draenor': 'Warlords of Draenor',
    'mists of pandaria': 'Mists of Pandaria',
    'cataclysm': 'Cataclysm',
    'wrath of the lich king': 'Wrath of the Lich King',
    'the burning crusade': 'The Burning Crusade',
    'classic': 'Classic',
  };

  const lower = text.toLowerCase();
  for (const [key, val] of Object.entries(expMap)) {
    if (lower.includes(key)) {
      expansion = val;
      break;
    }
  }

  return { version, expansion };
}

// ── Artículo ya existe? ──
function articleExists(articles, guid) {
  return articles.some(a => a.blizzardId === guid || a.link === guid);
}

// ── Main cron handler ──
export async function runNewsCron(env) {
  const results = { fetched: 0, pvpFound: 0, errors: 0, newArticles: [] };
  const existing = (await env.EXILIUM_KV.get(NEWS_KEY, 'json')) || [];
  const articles = Array.isArray(existing) ? existing : [];

  for (const source of SOURCES) {
    try {
      const res = await fetch(source.url, {
        headers: { 'User-Agent': 'ExiliumBot/1.0 (PvP News Aggregator)' },
        signal: AbortSignal.timeout(10000),
      });

      if (!res.ok) {
        results.errors++;
        continue;
      }

      const xml = await res.text();
      const items = parseRSS(xml);
      results.fetched += items.length;

      for (const item of items) {
        // Saltar si ya existe
        if (articleExists(articles, item.guid)) continue;

        // Filtro rápido por palabras clave
        const combinedText = item.title + ' ' + item.description;
        if (!hasPvPKeywords(combinedText)) continue;

        // Clasificación con IA (si está disponible)
        let aiResult = { pvp: true, class: 'general', confidence: 0.5 };
        if (env.AI) {
          aiResult = await classifyWithAI(combinedText, env);
        }

        if (!aiResult.pvp) continue;

        results.pvpFound++;

        // Detectar versión de parche
        const patch = detectPatchInfo(combinedText);

        const article = {
          id: 'auto_' + Date.now() + '_' + Math.random().toString(36).slice(2, 6),
          blizzardId: item.guid,
          title: item.title.slice(0, 200),
          summary: item.description.slice(0, 500),
          body: item.description.slice(0, 10000),
          class: aiResult.class || 'general',
          expansion: patch.expansion || 'The War Within',
          patchVersion: patch.version || 'latest',
          source: source.id,
          sourceUrl: item.link,
          status: 'pending',
          createdAt: item.pubDate,
          updatedAt: new Date().toISOString(),
          publishedAt: null,
          approvedBy: null,
          aiConfidence: aiResult.confidence,
        };

        articles.unshift(article);
        results.newArticles.push(article.title);
      }
    } catch (err) {
      results.errors++;
    }
  }

  // Guardar si hay cambios
  if (results.newArticles.length > 0) {
    await env.EXILIUM_KV.put(NEWS_KEY, JSON.stringify(articles));
  }

  // Actualizar timestamp del último cron
  await env.EXILIUM_KV.put(CRON_STATE_KEY, JSON.stringify({
    lastRun: new Date().toISOString(),
    fetched: results.fetched,
    pvpFound: results.pvpFound,
    newArticles: results.newArticles.length,
  }));

  return results;
}

// ── Handler para scheduled cron (llamado desde index.js) ──
export async function scheduled(event, env, ctx) {
  const results = await runNewsCron(env);
  console.log('News cron:', JSON.stringify(results));
}

// ── Handler para fetch (admin trigger) ──
export async function handleImportNews(request, env) {
  try {
    const results = await runNewsCron(env);
    return new Response(JSON.stringify({
      ok: true,
      fetched: results.fetched,
      pvpFound: results.pvpFound,
      newArticles: results.newArticles.length,
      titles: results.newArticles.slice(0, 20),
      errors: results.errors,
    }), {
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
}
