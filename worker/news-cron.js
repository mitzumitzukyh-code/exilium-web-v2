// worker/news-cron.js

import { insertArticles } from './news.js';

const SOURCES = [
  {
    id: 'wowhead',
    url: 'https://www.wowhead.com/news/rss/retail',
  },
  {
    id: 'mmo-champion',
    url: 'https://www.mmo-champion.com/external.php?type=rss2',
  },
];

const PVP_KEYWORDS = [
  'pvp', 'arena', 'battleground', 'player vs player', 'player versus player',
  'solo shuffle', 'blitz battleground', 'rbg', 'rated battleground',
  'honor', 'conquest', 'pvp talent', 'gladiator', 'duelist', 'rival',
  'combatant', 'aspirant', 'war mode', 'skirmish', 'duel',
  'damage reduced in pvp', 'healing reduced in pvp', 'effectiveness in pvp',
  'pvp tuning', 'pvp adjustment', 'pvp hotfix', 'pvp change',
  'resilience', 'versatility',
  'patch', 'hotfix', 'tuning', 'balance', 'class', 'damage', 'healing',
  'nerf', 'buff', 'ability', 'spell', 'talent', 'spec', 'specialization',
];

const WOW_CLASSES = [
  'warrior', 'mage', 'priest', 'druid', 'hunter', 'rogue',
  'shaman', 'warlock', 'paladin', 'monk', 'demon hunter',
  'death knight', 'evoker',
];

const CLASS_MAP = {
  'warrior': 'warrior', 'mage': 'mage', 'priest': 'priest',
  'druid': 'druid', 'hunter': 'hunter', 'rogue': 'rogue',
  'shaman': 'shaman', 'warlock': 'warlock', 'paladin': 'paladin',
  'monk': 'monk', 'demon hunter': 'demonhunter', 'death knight': 'deathknight',
  'evoker': 'evoker',
};

const EXPANSION_KEYWORDS = {
  'The War Within': ['the war within', 'war within', 'tww'],
  'Dragonflight': ['dragonflight'],
  'Midnight': ['midnight'],
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

function hasPvPKeywords(text) {
  const lower = text.toLowerCase();
  return PVP_KEYWORDS.some(kw => lower.includes(kw));
}

function detectClass(text) {
  const lower = text.toLowerCase();
  for (const cls of WOW_CLASSES) {
    if (lower.includes(cls)) return CLASS_MAP[cls] || cls;
  }
  return 'general';
}

function detectExpansion(text) {
  const lower = text.toLowerCase();
  for (const [expansion, keywords] of Object.entries(EXPANSION_KEYWORDS)) {
    if (keywords.some(kw => lower.includes(kw))) return expansion;
  }
  return 'The War Within';
}

function detectPatchVersion(text) {
  const match = text.match(/\b(\d+\.\d+(?:\.\d+)?)\b/);
  return match ? match[1] : '';
}

function generateBlizzardId(item) {
  if (item.guid) return item.guid;
  if (item.link) return item.link;
  const raw = (item.title || '') + (item.pubDate || '');
  let hash = 0;
  for (let i = 0; i < raw.length; i++) {
    hash = ((hash << 5) - hash) + raw.charCodeAt(i);
    hash |= 0;
  }
  return `hash_${Math.abs(hash)}`;
}

// ─── Parser RSS (XML nativo) ──────────────────────────────────────────────────

function parseRSS(xmlText) {
  const items = [];
  const itemMatches = xmlText.matchAll(/<item>([\s\S]*?)<\/item>/g);

  for (const match of itemMatches) {
    const block = match[1];

    const getTag = (tag) => {
      const m = block.match(new RegExp(`<${tag}[^>]*><!\\[CDATA\\[([\\s\\S]*?)\\]\\]><\\/${tag}>|<${tag}[^>]*>([\\s\\S]*?)<\\/${tag}>`));
      if (!m) return '';
      return (m[1] || m[2] || '').trim();
    };

    items.push({
      title: getTag('title'),
      link: getTag('link'),
      description: getTag('description'),
      pubDate: getTag('pubDate'),
      guid: getTag('guid'),
    });
  }

  return items;
}

// ─── Clasificación IA ─────────────────────────────────────────────────────────

async function classifyWithAI(env, title, description) {
  const text = `${title} ${description}`.slice(0, 500);
  try {
    const result = await env.AI.run('@cf/meta/llama-3.3-70b-instruct-fp8-fast', {
      messages: [
        {
          role: 'system',
          content: 'You are a strict classifier for World of Warcraft news articles. You only output JSON matching the given schema. Never explain, never comment, never add extra text.',
        },
        {
          role: 'user',
          content: `Is this article about PvP combat (arenas, battlegrounds, honor, conquest, pvp talents, solo shuffle, war mode, rated pvp)? If yes, identify which class it affects: warrior, mage, priest, druid, hunter, rogue, shaman, warlock, paladin, monk, demonhunter, deathknight, evoker, or general if it's not class-specific.\n\nArticle: ${text}`,
        },
      ],
      response_format: {
        type: 'json_schema',
        json_schema: {
          type: 'object',
          properties: {
            pvp: { type: 'boolean' },
            class: { type: 'string' },
          },
          required: ['pvp', 'class'],
        },
      },
      max_tokens: 80,
      temperature: 0.1,
    });

    let parsed = result?.response;
    if (typeof parsed === 'string') {
      try { parsed = JSON.parse(parsed); } catch { parsed = null; }
    }

    if (!parsed || typeof parsed.pvp !== 'boolean') {
      return { pvp: false, confidence: 0.5, debug: 'no_json:' + JSON.stringify(result).slice(0, 150) };
    }

    return {
      pvp: parsed.pvp === true,
      class: parsed.class || 'general',
      confidence: parsed.pvp === true ? 0.85 : 0.9,
    };
  } catch (err) {
    return { pvp: false, confidence: 0.0, debug: 'catch:' + err.message };
  }
}

// ─── Traducción a español ─────────────────────────────────────────────────────

async function translateToSpanish(env, title, description) {
  try {
    const result = await env.AI.run('@cf/meta/llama-3.3-70b-instruct-fp8-fast', {
      messages: [
        {
          role: 'system',
          content: 'You are a translator. You only output JSON matching the given schema. Never explain, never comment, never add extra text.',
        },
        {
          role: 'user',
          content: `Translate this World of Warcraft article title and summary to Spanish. Keep WoW terms in English (arena, battleground, pvp, buff, nerf, hotfix, patch, honor, conquest, class names).\n\nTitle: ${title}\nSummary: ${description.slice(0, 300)}`,
        },
      ],
      response_format: {
        type: 'json_schema',
        json_schema: {
          type: 'object',
          properties: {
            title: { type: 'string' },
            summary: { type: 'string' },
          },
          required: ['title', 'summary'],
        },
      },
      max_tokens: 500,
      temperature: 0.1,
    });

    let parsed = result?.response;
    if (typeof parsed === 'string') {
      try { parsed = JSON.parse(parsed); } catch { parsed = null; }
    }

    if (!parsed || !parsed.title) {
      return { title, summary: description.slice(0, 300) };
    }

    return {
      title: parsed.title,
      summary: parsed.summary || description.slice(0, 300),
    };
  } catch {
    return { title, summary: description.slice(0, 300) };
  }
}

// ─── Función principal ────────────────────────────────────────────────────────

export async function runNewsCron(env) {
  const stats = { fetched: 0, pvpFound: 0, newArticles: 0, errors: [] };
  const articlesToInsert = [];

  for (const source of SOURCES) {
    try {
      const res = await fetch(source.url, {
        headers: { 'User-Agent': 'ExiliumBattlePass/1.0' },
        cf: { cacheTtl: 300 },
      });

      if (!res.ok) {
        stats.errors.push(`${source.id}: HTTP ${res.status}`);
        continue;
      }

      const xml = await res.text();
      const items = parseRSS(xml);
      stats.fetched += items.length;

      for (const item of items) {
        const combined = `${item.title} ${item.description}`;

        if (!hasPvPKeywords(combined)) continue;

        const ai = await classifyWithAI(env, item.title, item.description);
        if (ai.debug) stats.errors.push(`AI debug: ${ai.debug}`);
        if (!ai.pvp) continue;

        stats.pvpFound++;

        const translated = await translateToSpanish(env, item.title, item.description);

        const detectedClass = ai.class !== 'general'
          ? ai.class
          : detectClass(combined);

        articlesToInsert.push({
          blizzardId: generateBlizzardId(item),
          title: translated.title,
          summary: translated.summary.replace(/<[^>]*>/g, ''),
          body: item.description.replace(/<[^>]*>/g, ''),
          class: detectedClass,
          expansion: detectExpansion(combined),
          patchVersion: detectPatchVersion(combined),
          source: source.id,
          sourceUrl: item.link,
          aiConfidence: ai.confidence,
        });
      }
    } catch (err) {
      stats.errors.push(`${source.id}: ${err.message}`);
    }
  }

  stats.newArticles = await insertArticles(env, articlesToInsert);

  await env.KV.put('news:cron_last_run', JSON.stringify({
    lastRun: new Date().toISOString(),
    fetched: stats.fetched,
    pvpFound: stats.pvpFound,
    newArticles: stats.newArticles,
    errors: stats.errors,
  }));

  return stats;
}

export async function scheduled(event, env, ctx) {
  const results = await runNewsCron(env);
  console.log('News cron:', JSON.stringify(results));
}

