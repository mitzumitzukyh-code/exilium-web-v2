// js/zona-vip.js — Lógica interactiva de la Zona VIP

const API_BASE = 'https://exilium-blizzard.mitzumitzukyhs.workers.dev';

// ═══════════════════════════════════════════════════════════════
//  AUTH GATE — Solo admin puede acceder
// ═══════════════════════════════════════════════════════════════

let vipToken = sessionStorage.getItem('vip_token');

function showAuthGate() {
  document.getElementById('vip-auth-gate').style.display = 'flex';
  document.getElementById('vip-main-content').style.display = 'none';
}

function showMainContent() {
  document.getElementById('vip-auth-gate').style.display = 'none';
  document.getElementById('vip-main-content').style.display = 'block';
}

async function vipLogin() {
  const pw = document.getElementById('vip-password').value;
  const errEl = document.getElementById('vip-auth-error');
  errEl.textContent = '';
  if (!pw) { errEl.textContent = 'Ingresa la contraseña.'; return; }
  try {
    const res = await fetch(`${API_BASE}/admin/auth`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ password: pw }),
    });
    const data = await res.json();
    if (data.token) {
      vipToken = data.token;
      sessionStorage.setItem('vip_token', vipToken);
      showMainContent();
    } else {
      errEl.textContent = 'Contraseña incorrecta.';
    }
  } catch (_) {
    errEl.textContent = 'Error de conexión.';
  }
}

async function checkAuth() {
  if (!vipToken) { showAuthGate(); return; }
  try {
    const res = await fetch(`${API_BASE}/admin/players`, {
      headers: { 'Authorization': `Bearer ${vipToken}` },
    });
    if (res.ok) { showMainContent(); } else { sessionStorage.removeItem('vip_token'); showAuthGate(); }
  } catch (_) { showAuthGate(); }
}

// ═══════════════════════════════════════════════════════════════
//  CASINO: TRAGAMONEDAS
// ═══════════════════════════════════════════════════════════════

const SLOT_SYMBOLS = ['⚔️', '🛡️', '💎', '🏆', '🧪', '💀'];
const SLOT_MULTIPLIERS = {
  '⚔️⚔️⚔️': 10,
  '💎💎💎': 8,
  '🏆🏆🏆': 5,
  '🛡️🛡️🛡️': 3,
  '🧪🧪🧪': 2,
  '💀💀💀': 2,
};

let slotBalance = 1000;
let slotBet = 50;
let isSpinning = false;

function updateSlotUI() {
  document.getElementById('slot-balance').textContent = slotBalance;
  document.getElementById('slot-bet-display').textContent = slotBet;
  // Sync roulette balance
  const rb = document.getElementById('roulette-balance');
  if (rb) rb.textContent = slotBalance;
}

function changeBet(delta) {
  slotBet = Math.max(25, Math.min(500, slotBet + delta));
  updateSlotUI();
}

function getRandomSymbol() {
  // Weighted: common symbols appear more often
  const weighted = [
    ...Array(4).fill('🛡️'),
    ...Array(4).fill('🧪'),
    ...Array(3).fill('💀'),
    ...Array(3).fill('🏆'),
    ...Array(2).fill('💎'),
    ...Array(2).fill('⚔️'),
  ];
  return weighted[Math.floor(Math.random() * weighted.length)];
}

function spinSlots() {
  if (isSpinning) return;
  if (slotBalance < slotBet) {
    document.getElementById('slot-result').textContent = '¡No tienes suficientes monedas!';
    document.getElementById('slot-result').className = 'slot-result lose';
    return;
  }

  isSpinning = true;
  slotBalance -= slotBet;
  updateSlotUI();

  const spinBtn = document.getElementById('spin-btn');
  spinBtn.disabled = true;

  const reels = [
    document.getElementById('reel-1'),
    document.getElementById('reel-2'),
    document.getElementById('reel-3'),
  ];

  const resultEl = document.getElementById('slot-result');
  resultEl.textContent = '';
  resultEl.className = 'slot-result';

  // Animate reels
  reels.forEach(r => r.classList.add('spinning'));

  const finalSymbols = [getRandomSymbol(), getRandomSymbol(), getRandomSymbol()];

  // Stop reels sequentially
  const delays = [600, 1200, 1800];
  reels.forEach((reel, i) => {
    // Fast symbol cycling
    let interval = setInterval(() => {
      reel.textContent = SLOT_SYMBOLS[Math.floor(Math.random() * SLOT_SYMBOLS.length)];
    }, 80);

    setTimeout(() => {
      clearInterval(interval);
      reel.classList.remove('spinning');
      reel.textContent = finalSymbols[i];

      // After last reel stops, calculate result
      if (i === 2) {
        setTimeout(() => calculateSlotResult(finalSymbols), 300);
      }
    }, delays[i]);
  });
}

function calculateSlotResult(symbols) {
  const key = symbols.join('');
  const multiplier = SLOT_MULTIPLIERS[key];
  const resultEl = document.getElementById('slot-result');

  if (multiplier) {
    const winnings = slotBet * multiplier;
    slotBalance += winnings;
    resultEl.textContent = `🎉 ¡GANASTE ${winnings} monedas! (x${multiplier})`;
    resultEl.className = 'slot-result win';
  } else if (symbols[0] === symbols[1] || symbols[1] === symbols[2] || symbols[0] === symbols[2]) {
    const winnings = slotBet;
    slotBalance += winnings;
    resultEl.textContent = `✨ Par encontrado — +${winnings} monedas`;
    resultEl.className = 'slot-result win';
  } else {
    resultEl.textContent = '💨 Sin suerte esta vez...';
    resultEl.className = 'slot-result lose';
  }

  updateSlotUI();
  isSpinning = false;
  document.getElementById('spin-btn').disabled = false;
}

// ═══════════════════════════════════════════════════════════════
//  CASINO: RULETA
// ═══════════════════════════════════════════════════════════════

const ROULETTE_SEGMENTS = [
  { label: '2x', color: '#e74c3c', multiplier: 2 },
  { label: '💀', color: '#2c3e50', multiplier: 0 },
  { label: '3x', color: '#27ae60', multiplier: 3 },
  { label: '1.5x', color: '#8e44ad', multiplier: 1.5 },
  { label: '💀', color: '#2c3e50', multiplier: 0 },
  { label: '5x', color: '#d4a017', multiplier: 5 },
  { label: '💀', color: '#34495e', multiplier: 0 },
  { label: '1.5x', color: '#2980b9', multiplier: 1.5 },
  { label: '💀', color: '#2c3e50', multiplier: 0 },
  { label: '10x', color: '#f39c12', multiplier: 10 },
  { label: '💀', color: '#34495e', multiplier: 0 },
  { label: '2x', color: '#e67e22', multiplier: 2 },
];

let rouletteAngle = 0;
let isRouletteSpinning = false;

function drawRouletteWheel() {
  const canvas = document.getElementById('roulette-canvas');
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  const cx = canvas.width / 2;
  const cy = canvas.height / 2;
  const radius = cx - 4;
  const segAngle = (2 * Math.PI) / ROULETTE_SEGMENTS.length;

  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.save();
  ctx.translate(cx, cy);
  ctx.rotate((rouletteAngle * Math.PI) / 180);

  ROULETTE_SEGMENTS.forEach((seg, i) => {
    const startAngle = i * segAngle - Math.PI / 2;
    const endAngle = startAngle + segAngle;

    // Draw segment
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.arc(0, 0, radius, startAngle, endAngle);
    ctx.closePath();
    ctx.fillStyle = seg.color;
    ctx.fill();
    ctx.strokeStyle = 'rgba(212,160,23,0.4)';
    ctx.lineWidth = 1.5;
    ctx.stroke();

    // Draw text
    ctx.save();
    ctx.rotate(startAngle + segAngle / 2 + Math.PI / 2);
    ctx.textAlign = 'center';
    ctx.fillStyle = '#fff';
    ctx.font = 'bold 16px sans-serif';
    ctx.fillText(seg.label, 0, -radius + 40);
    ctx.restore();
  });

  ctx.restore();
}

function spinRoulette() {
  if (isRouletteSpinning) return;
  if (slotBalance < 50) {
    document.getElementById('roulette-result').textContent = '¡No tienes suficientes monedas!';
    return;
  }

  isRouletteSpinning = true;
  slotBalance -= 50;
  updateSlotUI();

  const btn = document.getElementById('roulette-spin-btn');
  btn.disabled = true;

  const resultEl = document.getElementById('roulette-result');
  resultEl.textContent = '🎡 Girando...';

  // Random spin: 3-5 full rotations + random segment
  const extraDeg = Math.random() * 360;
  const totalDeg = 1080 + Math.floor(Math.random() * 720) + extraDeg;
  const targetAngle = rouletteAngle + totalDeg;

  // Animate
  const startTime = performance.now();
  const duration = 4000;
  const startAngle = rouletteAngle;

  function animate(now) {
    const elapsed = now - startTime;
    const progress = Math.min(elapsed / duration, 1);
    // Ease out cubic
    const eased = 1 - Math.pow(1 - progress, 3);
    rouletteAngle = startAngle + totalDeg * eased;

    drawRouletteWheel();

    if (progress < 1) {
      requestAnimationFrame(animate);
    } else {
      rouletteAngle = targetAngle % 360;
      // Determine winning segment
      // The pointer is at the top (270 degrees in standard canvas)
      // We need to find which segment is under the pointer
      const segAngle = 360 / ROULETTE_SEGMENTS.length;
      // Normalize: pointer is at top, wheel rotated by rouletteAngle
      const normalizedAngle = (360 - (rouletteAngle % 360)) % 360;
      const segIndex = Math.floor(normalizedAngle / segAngle) % ROULETTE_SEGMENTS.length;
      const winner = ROULETTE_SEGMENTS[segIndex];

      if (winner.multiplier > 0) {
        const winnings = Math.floor(50 * winner.multiplier);
        slotBalance += winnings;
        resultEl.textContent = `🎉 ${winner.label} — ¡Ganaste ${winnings} monedas!`;
        resultEl.style.color = '#00ff88';
      } else {
        resultEl.textContent = `💀 ¡Perdiste! La ruleta no perdona...`;
        resultEl.style.color = '#ff4444';
      }

      updateSlotUI();
      isRouletteSpinning = false;
      btn.disabled = false;
    }
  }

  requestAnimationFrame(animate);
}

// ═══════════════════════════════════════════════════════════════
//  CASINO: Tab switching
// ═══════════════════════════════════════════════════════════════

function switchCasinoGame(game) {
  document.querySelectorAll('.casino-game').forEach(g => g.classList.remove('active'));
  document.querySelectorAll('.casino-tab').forEach(t => t.classList.remove('active'));
  document.getElementById('game-' + game).classList.add('active');
  event.target.classList.add('active');
  if (game === 'roulette') drawRouletteWheel();
}

// ═══════════════════════════════════════════════════════════════
//  PVP BUILDS — Datos por clase
// ═══════════════════════════════════════════════════════════════

const PVP_BUILDS = {
  warrior: {
    name: 'Warrior', icon: '⚔️', iconImg: 'assets/class-icons/Ability_warrior_savageblow.webp', color: '#C69B6D',
    specs: ['Arms (PvP)', 'Fury (Alt)'],
    talents: [
      'Mortal Strike (core)',
      'Overpower — prioridad en rotación',
      'Sharpen Blade — reduce heal 50%',
      'Die by the Sword — defensiva clave',
      'Intervene — proteger aliados',
      'Storm Bolt — stun a distancia',
    ],
    bis: [
      { name: 'Gladiator\'s Plate Helm', slot: 'Cabeza' },
      { name: 'Gladiator\'s Plate Shoulders', slot: 'Hombros' },
      { name: 'Gladiator\'s Greatsword', slot: 'Arma 2H' },
      { name: 'Verdant Gladiator\'s Insignia of Alacrity', slot: 'Trinket 1' },
      { name: 'Gladiator\'s Badge of Ferocity', slot: 'Trinket 2' },
    ],
    tip: 'Arms Warrior domina el meta actual. Usa Sharpen Blade antes de tu burst con Avatar + Warbreaker + Bladestorm para presión letal. Coordina Intervene para peeling.',
  },
  paladin: {
    name: 'Paladin', icon: '🛡️', iconImg: 'assets/class-icons/Ability_paladin_shieldofthetemplar.webp', color: '#F48CBA',
    specs: ['Retribution (DPS)', 'Holy (Healer)'],
    talents: [
      'Templar\'s Verdict — burst principal',
      'Wake of Ashes — generador AoE',
      'Blessing of Sacrifice — peeling',
      'Divine Shield — inmunidad',
      'Hammer of Justice — stun',
      'Avenging Wrath — CD ofensivo',
    ],
    bis: [
      { name: 'Gladiator\'s Scaled Helm', slot: 'Cabeza' },
      { name: 'Gladiator\'s Greatsword', slot: 'Arma 2H' },
      { name: 'Gladiator\'s Insignia of Alacrity', slot: 'Trinket 1' },
      { name: 'Gladiator\'s Badge of Ferocity', slot: 'Trinket 2' },
      { name: 'Gladiator\'s Devotion', slot: 'Set 4p' },
    ],
    tip: 'Ret Paladin tiene excelente burst con Wings + Final Reckoning. Usa Blessing of Sacrifice en tu healer para reducir CC chains. Guarda Divine Shield para momentos críticos, no para panic.',
  },
  hunter: {
    name: 'Hunter', icon: '🏹', iconImg: 'assets/class-icons/Spell_nature_magicimmunity.webp', color: '#AAD372',
    specs: ['Beast Mastery (PvP)', 'Marksmanship (Alt)'],
    talents: [
      'Kill Command — daño base',
      'Intimidation — stun de mascota',
      'Roar of Sacrifice — defensiva',
      'Scatter Shot — CC setup',
      'Dire Beast: Basilisk — slow/stun',
      'Aspect of the Turtle — inmunidad',
    ],
    bis: [
      { name: 'Gladiator\'s Chain Helm', slot: 'Cabeza' },
      { name: 'Gladiator\'s Recurve', slot: 'Arma Ranged' },
      { name: 'Gladiator\'s Insignia of Alacrity', slot: 'Trinket 1' },
      { name: 'Gladiator\'s Medallion', slot: 'Trinket 2' },
      { name: 'Gladiator\'s Chain Leggings', slot: 'Piernas' },
    ],
    tip: 'BM Hunter es extremadamente fuerte en 2v2 y shuffle. Mantén presión constante con mascotas y usa Intimidation + Scatter Shot para CC chains. El kiting es tu mejor defensa.',
  },
  rogue: {
    name: 'Rogue', icon: '🗡️', iconImg: 'assets/class-icons/Ability_rogue_eviscerate.webp', color: '#FFF468',
    specs: ['Subtlety (PvP)', 'Assassination (Alt)'],
    talents: [
      'Shadow Dance — burst windows',
      'Shadowstrike — opener/restealth',
      'Kidney Shot — stun largo',
      'Blind — CC chain',
      'Cloak of Shadows — anti-magic',
      'Evasion — anti-melee',
    ],
    bis: [
      { name: 'Gladiator\'s Leather Helm', slot: 'Cabeza' },
      { name: 'Gladiator\'s Shiv', slot: 'Arma MH' },
      { name: 'Gladiator\'s Knife', slot: 'Arma OH' },
      { name: 'Gladiator\'s Insignia of Alacrity', slot: 'Trinket 1' },
      { name: 'Gladiator\'s Badge of Ferocity', slot: 'Trinket 2' },
    ],
    tip: 'Sub Rogue vive del control. Abre con Cheap Shot → Symbols → Shadowstrike spam → Eviscerate. Kidney Shot en healer mientras entrás en Shadow Dance para second go. Vanish para reset.',
  },
  priest: {
    name: 'Priest', icon: '✝️', iconImg: 'assets/class-icons/Spell_holy_guardianspirit.webp', color: '#FFFFFF',
    specs: ['Discipline (Healer)', 'Shadow (DPS)'],
    talents: [
      'Penance — heal/daño dual',
      'Pain Suppression — defensiva aliado',
      'Psychic Scream — AoE fear',
      'Mass Dispel — quita inmunidades',
      'Purify — dispel ofensivo/defensivo',
      'Rapture — shields masivos',
    ],
    bis: [
      { name: 'Gladiator\'s Satin Helm', slot: 'Cabeza' },
      { name: 'Gladiator\'s Rod', slot: 'Arma' },
      { name: 'Gladiator\'s Medallion', slot: 'Trinket 1' },
      { name: 'Gladiator\'s Insignia of Alacrity', slot: 'Trinket 2' },
      { name: 'Gladiator\'s Satin Robe', slot: 'Pecho' },
    ],
    tip: 'Disc Priest es el mejor healer para 3v3. Prioriza Atonement healing durante ventanas seguras y guarda Pain Suppression para goes enemigos. Mass Dispel es game-changing contra Pala/Mage.',
  },
  deathknight: {
    name: 'Death Knight', icon: '💀', iconImg: 'assets/class-icons/Spell_deathknight_unholypresence.webp', color: '#C41E3A',
    specs: ['Unholy (PvP)', 'Frost (Alt)'],
    talents: [
      'Apocalypse — burst + wounds',
      'Dark Transformation — pet buff',
      'Abomination Limb — grip AoE',
      'Anti-Magic Shell — absorbe magia',
      'Strangulate — silence 5s',
      'Necrotic Strike — absorb heal',
    ],
    bis: [
      { name: 'Gladiator\'s Plate Helm', slot: 'Cabeza' },
      { name: 'Gladiator\'s Greatsword', slot: 'Arma 2H' },
      { name: 'Gladiator\'s Insignia of Alacrity', slot: 'Trinket 1' },
      { name: 'Gladiator\'s Badge of Ferocity', slot: 'Trinket 2' },
      { name: 'Gladiator\'s Plate Legguards', slot: 'Piernas' },
    ],
    tip: 'Unholy DK es presión constante. Stackea Festering Wounds → Apocalypse → Dark Transformation para burst. Necrotic Strike contra healers es devastador. AMS absorbe burst mágico entero.',
  },
  shaman: {
    name: 'Shaman', icon: '🌊', iconImg: 'assets/class-icons/Spell_shaman_improvedstormstrike.webp', color: '#0070DD',
    specs: ['Enhancement (DPS)', 'Restoration (Healer)'],
    talents: [
      'Stormstrike — daño core',
      'Sundering — knockback/incap',
      'Hex — CC polymorph',
      'Grounding Totem — absorbe spell',
      'Healing Surge — self-heal',
      'Ascendance — burst CD',
    ],
    bis: [
      { name: 'Gladiator\'s Chain Helm', slot: 'Cabeza' },
      { name: 'Gladiator\'s Hacker', slot: 'Arma MH' },
      { name: 'Gladiator\'s Quickblade', slot: 'Arma OH' },
      { name: 'Gladiator\'s Insignia of Alacrity', slot: 'Trinket 1' },
      { name: 'Gladiator\'s Badge of Ferocity', slot: 'Trinket 2' },
    ],
    tip: 'Enh Shaman combina burst con utilidad. Grounding Totem puede absorber Polymorphs y otros CC. Purge agresivo en healer enemigo para quitar HoTs/shields. Hex para CC cadena.',
  },
  mage: {
    name: 'Mage', icon: '🔮', iconImg: 'assets/class-icons/Spell_holy_holybolt.webp', color: '#3FC7EB',
    specs: ['Frost (PvP)', 'Fire (Alt)'],
    talents: [
      'Glacial Spike — one-shot combo',
      'Ice Nova — root + burst',
      'Polymorph — CC principal',
      'Ice Block — inmunidad',
      'Shimmer — blinks dobles',
      'Ring of Frost — AoE CC',
    ],
    bis: [
      { name: 'Gladiator\'s Silk Helm', slot: 'Cabeza' },
      { name: 'Gladiator\'s Rod', slot: 'Arma' },
      { name: 'Gladiator\'s Insignia of Alacrity', slot: 'Trinket 1' },
      { name: 'Gladiator\'s Badge of Ferocity', slot: 'Trinket 2' },
      { name: 'Gladiator\'s Silk Robe', slot: 'Pecho' },
    ],
    tip: 'Frost Mage domina con CC chains. Setup: Sheep healer → Ice Nova + Glacial Spike en kill target. Ring of Frost para cross-CC. Siempre kite y usa Shimmer para reposicionarte.',
  },
  warlock: {
    name: 'Warlock', icon: '🔥', iconImg: 'assets/class-icons/Spell_shadow_shadowwordpain.webp', color: '#8788EE',
    specs: ['Affliction (PvP)', 'Destruction (Alt)'],
    talents: [
      'Unstable Affliction — dot spread',
      'Fear — CC principal',
      'Soul Rot — burst AoE',
      'Dark Pact — absorb shield',
      'Mortal Coil — horror + heal',
      'Unending Resolve — wall CD',
    ],
    bis: [
      { name: 'Gladiator\'s Felweave Helm', slot: 'Cabeza' },
      { name: 'Gladiator\'s Rod', slot: 'Arma' },
      { name: 'Gladiator\'s Medallion', slot: 'Trinket 1' },
      { name: 'Gladiator\'s Insignia of Alacrity', slot: 'Trinket 2' },
      { name: 'Gladiator\'s Felweave Robe', slot: 'Pecho' },
    ],
    tip: 'Aff Lock gana con rot pressure. Mantén todos los dots en 2+ targets. Fear healer → Soul Rot + Malefic Rapture para burst. Dark Pact + Unending Resolve te hacen muy tanky.',
  },
  monk: {
    name: 'Monk', icon: '☯️', iconImg: 'assets/class-icons/Spell_monk_windwalker_spec.webp', color: '#00FF98',
    specs: ['Windwalker (DPS)', 'Mistweaver (Healer)'],
    talents: [
      'Fists of Fury — burst + stun',
      'Rising Sun Kick — mortal strike',
      'Leg Sweep — AoE stun',
      'Touch of Karma — reflect damage',
      'Paralysis — CC incap',
      'Storm, Earth, and Fire — clones',
    ],
    bis: [
      { name: 'Gladiator\'s Leather Helm', slot: 'Cabeza' },
      { name: 'Gladiator\'s Claw', slot: 'Arma MH' },
      { name: 'Gladiator\'s Claw', slot: 'Arma OH' },
      { name: 'Gladiator\'s Insignia of Alacrity', slot: 'Trinket 1' },
      { name: 'Gladiator\'s Badge of Ferocity', slot: 'Trinket 2' },
    ],
    tip: 'WW Monk tiene movilidad absurda. Usa Touch of Karma agresivamente durante el burst del enemigo. Setup: Paralysis en healer → SEF + Fists + RSK → Leg Sweep para follow-up.',
  },
  druid: {
    name: 'Druid', icon: '🌿', iconImg: 'assets/class-icons/Ability_druid_catform.webp', color: '#FF7C0A',
    specs: ['Feral (DPS)', 'Restoration (Healer)'],
    talents: [
      'Ferocious Bite — execute/burst',
      'Rip — bleed finisher',
      'Cyclone — CC clave',
      'Entangling Roots — root',
      'Frenzied Regeneration — self-heal',
      'Berserk — burst CD',
    ],
    bis: [
      { name: 'Gladiator\'s Leather Helm', slot: 'Cabeza' },
      { name: 'Gladiator\'s Claws', slot: 'Arma' },
      { name: 'Gladiator\'s Insignia of Alacrity', slot: 'Trinket 1' },
      { name: 'Gladiator\'s Badge of Ferocity', slot: 'Trinket 2' },
      { name: 'Gladiator\'s Leather Legguards', slot: 'Piernas' },
    ],
    tip: 'Feral Druid excede en bleeds y CC. Prioriza Cyclone en healer mientras aplicas bleeds al kill target. Usa Prowl para re-opener cuando el enemigo pierde track de ti.',
  },
  demonhunter: {
    name: 'Demon Hunter', icon: '😈', iconImg: 'assets/class-icons/Ability_stealth.webp', color: '#A330C9',
    specs: ['Havoc (PvP)'],
    talents: [
      'The Hunt — burst + gap close',
      'Eye Beam — AoE burst',
      'Fel Rush — movilidad',
      'Imprison — CC incap',
      'Blur — dodge defensiva',
      'Darkness — AoE miss 20%',
    ],
    bis: [
      { name: 'Gladiator\'s Leather Helm', slot: 'Cabeza' },
      { name: 'Gladiator\'s Warglaive', slot: 'Arma MH' },
      { name: 'Gladiator\'s Warglaive', slot: 'Arma OH' },
      { name: 'Gladiator\'s Insignia of Alacrity', slot: 'Trinket 1' },
      { name: 'Gladiator\'s Badge of Ferocity', slot: 'Trinket 2' },
    ],
    tip: 'DH es puro burst y movilidad. The Hunt → Eye Beam es devastador. Usa Imprison en healer durante goes. Vengeful Retreat para kite y Fel Rush para re-engage inmediato.',
  },
  evoker: {
    name: 'Evoker', icon: '🐉', iconImg: 'assets/class-icons/Spell_nature_lightning.webp', color: '#33937F',
    specs: ['Devastation (DPS)', 'Preservation (Healer)'],
    talents: [
      'Deep Breath — AoE burst + dash',
      'Fire Breath — cono de fuego',
      'Disintegrate — channel damage',
      'Obsidian Scales — 30% DR',
      'Sleep Walk — CC único',
      'Rescue — save aliado',
    ],
    bis: [
      { name: 'Gladiator\'s Chain Helm', slot: 'Cabeza' },
      { name: 'Gladiator\'s Rod', slot: 'Arma' },
      { name: 'Gladiator\'s Insignia of Alacrity', slot: 'Trinket 1' },
      { name: 'Gladiator\'s Badge of Ferocity', slot: 'Trinket 2' },
      { name: 'Gladiator\'s Chain Robe', slot: 'Pecho' },
    ],
    tip: 'Devastation Evoker tiene burst masivo con Deep Breath + Dragonrage. Sleep Walk es CC único que mueve al target — usalo creativamente. Rescue puede salvar a tu healer de kills.',
  },
};

// ═══════════════════════════════════════════════════════════════
//  PVP BUILDS — Render
// ═══════════════════════════════════════════════════════════════

function renderClassSelector() {
  const container = document.getElementById('class-selector');
  if (!container) return;

  const classes = Object.entries(PVP_BUILDS);
  container.innerHTML = classes.map(([key, cls]) => `
    <button class="class-btn" onclick="selectClass('${key}')" data-class="${key}">
      <img class="class-icon-img" src="${cls.iconImg}" alt="${cls.name}">
      ${cls.name}
    </button>
  `).join('');
}

function selectClass(classKey) {
  const cls = PVP_BUILDS[classKey];
  if (!cls) return;

  // Update active button
  document.querySelectorAll('.class-btn').forEach(b => b.classList.remove('active'));
  const activeBtn = document.querySelector(`.class-btn[data-class="${classKey}"]`);
  if (activeBtn) activeBtn.classList.add('active');

  const display = document.getElementById('build-display');
  display.innerHTML = `
    <div class="build-header">
      <img class="class-icon-lg-img" src="${cls.iconImg}" alt="${cls.name}">
      <div>
        <h3 style="color:${cls.color}">${cls.name}</h3>
        <div>${cls.specs.map(s => `<span class="spec-tag">${s}</span>`).join(' ')}</div>
      </div>
    </div>
    <div class="build-content">
      <div class="build-section">
        <h4>🎯 Talentos Clave</h4>
        <ul class="build-list">
          ${cls.talents.map(t => `<li><span class="item-icon">⚡</span> ${t}</li>`).join('')}
        </ul>
      </div>
      <div class="build-section">
        <h4>🛡️ Ítems BiS PvP</h4>
        <ul class="build-list">
          ${cls.bis.map(item => `<li><span class="item-icon">💎</span> <strong>${item.slot}:</strong> ${item.name}</li>`).join('')}
        </ul>
      </div>
      <div class="build-tip">
        <h4>💡 Tip de Juego</h4>
        <p>${cls.tip}</p>
      </div>
    </div>
  `;
}

// ═══════════════════════════════════════════════════════════════
//  INIT
// ═══════════════════════════════════════════════════════════════

document.addEventListener('DOMContentLoaded', () => {
  checkAuth();
  renderClassSelector();
  drawRouletteWheel();
  updateSlotUI();

  // Enter key on password input
  const pwInput = document.getElementById('vip-password');
  if (pwInput) pwInput.addEventListener('keydown', (e) => { if (e.key === 'Enter') vipLogin(); });
});
