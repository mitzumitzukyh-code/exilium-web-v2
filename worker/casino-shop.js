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
