// worker/news-cron.js

import { insertArticles } from './news.js';

const SOURCES = [
  { id: 'blizzard', url: 'https://news.blizzard.com/en-us/world-of-warcraft/rss' },
  { id: 'wowhead', url: 'https://www.wowhead.com/news/rss/world-of-warcraft' },
];

const PVP_KEYWORDS = [
  'pvp', 'arena', 'battleground', 'player vs player', 'player versus player',
  'solo shuffle', 'blitz battleground', 'rbg', 'rated battleground',
  'honor', 'conquest', 'pvp talent', 'gladiator', 'duelist', 'rival',
  'combatant', 'aspirant', 'war mode', 'skirmish', 'duel',
  'damage reduced in pvp', 'healing reduced in pvp', 'effectiveness in pvp',
  'pvp tuning', 'pvp adjustment', 'pvp hotfix', 'pvp change',
  'resilience', 'versatility',
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

  const prompt = `You are a World of Warcraft expert. Determine if the following article is about PvP (Player vs Player) content.
PvP includes: arena, battlegrounds, honor, conquest, pvp talents, rated play, solo shuffle, war mode.
PvP does NOT include: raids, dungeons, quests, crafting, housing, general class changes without pvp context.

Article: "${text}"

Respond ONLY with valid JSON, nothing else. Format:
{"pvp":"yes","class":"warrior"} if it IS pvp content (use class name or "general")
{"pvp":"no"} if it is NOT pvp content`;

  try {
    const result = await env.AI.run('@cf/meta/llama-3.1-8b-instruct', {
      prompt,
      max_tokens: 50,
      temperature: 0.05,
    });

    const raw = (result.response || result || '').toString().trim();
    const jsonMatch = raw.match(/\{[^}]+\}/);
    if (!jsonMatch) return { pvp: false, confidence: 0.5 };

    const parsed = JSON.parse(jsonMatch[0]);
    return {
      pvp: parsed.pvp === 'yes',
      class: parsed.class || 'general',
      confidence: parsed.pvp === 'yes' ? 0.85 : 0.9,
    };
  } catch {
    return { pvp: false, confidence: 0.0 };
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
        if (!ai.pvp) continue;

        stats.pvpFound++;

        const detectedClass = ai.class !== 'general'
          ? ai.class
          : detectClass(combined);

        articlesToInsert.push({
          blizzardId: generateBlizzardId(item),
          title: item.title,
          summary: item.description.slice(0, 300).replace(/<[^>]*>/g, ''),
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

