// worker/casino-shop.js
// ════════════════════════════════════════════════════════════════════
//  Tienda de decoraciones del casino (estilo Discord Nitro).
//  Compra PERMANENTE con PandaCoins. Cada decoración tiene un `slot`:
//   - avatar_frame : marco animado alrededor del avatar (se ve en asientos/perfil)
//   - name_effect  : color/efecto del nombre (se ve en asientos)
//   - chip_skin    : aspecto de las fichas (solo lo ve el propietario)
//
//  El aspecto visual lo define el frontend a partir del `id` (CSS por ahora;
//  el sistema admite añadir decoraciones con imagen — campo `image` opcional).
// ════════════════════════════════════════════════════════════════════

export const SHOP_SLOTS = ['avatar_frame', 'name_effect', 'chip_skin'];

export const SHOP_CATALOG = [
  // ── Marcos de avatar ──
  { id: 'frame_gold',    slot: 'avatar_frame', name: 'Anillo Dorado',    price: 500,  rarity: 'raro' },
  { id: 'frame_emerald', slot: 'avatar_frame', name: 'Halo Esmeralda',   price: 650,  rarity: 'raro' },
  { id: 'frame_flame',   slot: 'avatar_frame', name: 'Aura de Llamas',   price: 900,  rarity: 'epico' },
  { id: 'frame_ice',     slot: 'avatar_frame', name: 'Escarcha Arcana',  price: 900,  rarity: 'epico' },
  { id: 'frame_dragon',  slot: 'avatar_frame', name: 'Marco Dracónico',  price: 1600, rarity: 'legendario' },
  // ── Efectos de nombre ──
  { id: 'name_gold',     slot: 'name_effect',  name: 'Nombre Dorado',    price: 300,  rarity: 'comun' },
  { id: 'name_fire',     slot: 'name_effect',  name: 'Nombre Ardiente',  price: 550,  rarity: 'raro' },
  { id: 'name_rainbow',  slot: 'name_effect',  name: 'Nombre Arcoíris',  price: 850,  rarity: 'epico' },
  // ── Skins de fichas ──
  { id: 'chip_neon',     slot: 'chip_skin',    name: 'Fichas Neón',      price: 450,  rarity: 'raro' },
  { id: 'chip_royal',    slot: 'chip_skin',    name: 'Fichas Reales',    price: 750,  rarity: 'epico' },
];

export function shopItem(id) {
  return SHOP_CATALOG.find(x => x.id === id) || null;
}

// Catálogo efectivo: el editado por el admin en KV (`casino:shop`) o, si no hay, el del código.
export async function getCatalog(env) {
  try {
    const kv = await env.EXILIUM_KV.get('casino:shop', 'json');
    if (Array.isArray(kv) && kv.length) return kv;
  } catch (_) {}
  return SHOP_CATALOG;
}

// ── Admin: ver tienda (catálogo + ventas) ──
export async function handleAdminGetShop(env) {
  const catalog = await getCatalog(env);
  const sales = (await env.EXILIUM_KV.get('casino:shop_sales', 'json')) || [];
  const summary = {};
  for (const s of sales) {
    if (!summary[s.item_id]) summary[s.item_id] = { item_id: s.item_id, name: s.item_name, count: 0, revenue: 0 };
    summary[s.item_id].count += 1;
    summary[s.item_id].revenue += s.price || 0;
  }
  return {
    ok: true, catalog,
    sales: sales.slice(0, 300),
    summary: Object.values(summary).sort((a, b) => b.revenue - a.revenue),
    total_sales: sales.length,
    total_revenue: sales.reduce((a, s) => a + (s.price || 0), 0),
    default_catalog: SHOP_CATALOG,
  };
}

// ── Admin: guardar catálogo ──
export async function handleAdminPutShop(request, env) {
  let body;
  try { body = await request.json(); } catch (_) { return { error: 'JSON inválido' }; }
  if (!Array.isArray(body.catalog)) return { error: 'Se esperaba { catalog: [...] }' };
  const clean = [];
  const seen = new Set();
  for (const it of body.catalog) {
    if (!it || !it.id || !SHOP_SLOTS.includes(it.slot)) continue;
    const id = String(it.id).trim().slice(0, 40);
    if (!id || seen.has(id)) continue;
    seen.add(id);
    const item = { id, slot: it.slot, name: String(it.name || id).slice(0, 60), price: Math.max(0, Math.round(Number(it.price) || 0)), rarity: ['comun', 'raro', 'epico', 'legendario'].includes(it.rarity) ? it.rarity : 'comun' };
    if (it.image) item.image = String(it.image).slice(0, 200);
    clean.push(item);
  }
  await env.EXILIUM_KV.put('casino:shop', JSON.stringify(clean));
  return { ok: true, catalog: clean };
}
