// worker/casino.js
// Lógica de la Sala de PandaCoins — ruleta europea multijugador (1 giro compartido).
// Estado en KV. El servidor decide el número ganador; el cliente solo anima.

// ─────────────────────────────────────────────────────────────────────
//  Constantes de la ruleta europea
// ─────────────────────────────────────────────────────────────────────

// Secuencia real de la ruleta europea (37 sectores, 0 + 1-36)
export const WHEEL_SEQUENCE = [
  0, 32, 15, 19, 4, 21, 2, 25, 17, 34, 6, 27, 13, 36, 11, 30, 8, 23, 10, 5,
  24, 16, 33, 1, 20, 14, 31, 9, 22, 18, 29, 7, 28, 12, 35, 3, 26,
];

export const RED_NUMBERS = new Set([1, 3, 5, 7, 9, 12, 14, 16, 18, 19, 21, 23, 25, 27, 30, 32, 34, 36]);

export function colorOf(n) {
  if (n === 0) return 'green';
  return RED_NUMBERS.has(n) ? 'red' : 'black';
}

// ─────────────────────────────────────────────────────────────────────
//  Multiplicadores y resolución de apuestas (funciones PURAS — testeable)
// ─────────────────────────────────────────────────────────────────────

/** Devuelve el multiplicador (excluyendo la apuesta) según el tipo de apuesta */
export function payoutMultiplier(betKey) {
  if (betKey.startsWith('number:')) return 35;
  if (betKey.startsWith('col:') || betKey.startsWith('dozen:')) return 2;
  if (betKey.startsWith('color:') || betKey.startsWith('parity:') || betKey.startsWith('half:')) return 1;
  return 0;
}

/** Comprueba si una apuesta ganó dado el número resultado */
export function checkWin(resultNumber, betKey) {
  if (betKey.startsWith('number:')) {
    return parseInt(betKey.split(':')[1], 10) === resultNumber;
  }
  if (resultNumber === 0) return false; // el 0 solo gana si apostaste al 0 directo
  if (betKey === 'color:red') return colorOf(resultNumber) === 'red';
  if (betKey === 'color:black') return colorOf(resultNumber) === 'black';
  if (betKey === 'parity:even') return resultNumber % 2 === 0;
  if (betKey === 'parity:odd') return resultNumber % 2 === 1;
  if (betKey === 'half:low') return resultNumber >= 1 && resultNumber <= 18;
  if (betKey === 'half:high') return resultNumber >= 19 && resultNumber <= 36;
  if (betKey === 'dozen:1') return resultNumber >= 1 && resultNumber <= 12;
  if (betKey === 'dozen:2') return resultNumber >= 13 && resultNumber <= 24;
  if (betKey === 'dozen:3') return resultNumber >= 25 && resultNumber <= 36;
  if (betKey === 'col:1') return resultNumber % 3 === 1;   // 1,4,7,...,34
  if (betKey === 'col:2') return resultNumber % 3 === 2;   // 2,5,8,...,35
  if (betKey === 'col:3') return resultNumber % 3 === 0;   // 3,6,9,...,36
  return false;
}

/**
 * Resuelve una lista de apuestas contra el número resultado.
 * @param {number} resultNumber 0-36
 * @param {Array<{bet_key:string,amount:number}>} bets
 * @returns {{total_win:number, total_bet:number, details:Array}}
 */
export function resolveBets(resultNumber, bets) {
  let totalWin = 0;
  let totalBet = 0;
  const details = [];
  for (const b of bets) {
    const amount = Number(b.amount) || 0;
    totalBet += amount;
    const won = checkWin(resultNumber, b.bet_key);
    const mult = payoutMultiplier(b.bet_key);
    // Ganancia NETA = amount * mult. La apuesta se devuelve además (payout = amount*(mult+1)).
    const net = won ? amount * mult : 0;
    totalWin += net;
    details.push({ bet_key: b.bet_key, amount, won, multiplier: mult, net });
  }
  return { total_win: totalWin, total_bet: totalBet, details };
}

// ─────────────────────────────────────────────────────────────────────
//  Config por defecto
// ─────────────────────────────────────────────────────────────────────

const DEFAULT_CONFIG = {
  betting_duration: 20,    // segundos de fase de apuestas
  spinning_duration: 4,    // segundos animación ruleta
  result_duration: 4,      // segundos mostrando resultado
  min_bet: 50,
  max_bet: 1000,
  max_seats: 5,
  max_bets_per_round: 3,
  initial_balance: 1000,
  rounds_to_release_seat: 3, // liberar asiento tras N rondas sin apostar
};

const CHAT_MAX = 30;
const ROUNDS_HISTORY = 50;

async function getConfig(env) {
  const cfg = await env.EXILIUM_KV.get('casino:config', 'json');
  return { ...DEFAULT_CONFIG, ...(cfg || {}) };
}

// ─────────────────────────────────────────────────────────────────────
//  Estado de la sala (state machine)
// ─────────────────────────────────────────────────────────────────────

async function getState(env) {
  const s = await env.EXILIUM_KV.get('casino:state', 'json');
  if (s) return s;
  // Inicializar estado por defecto
  const fresh = {
    status: 'betting',        // betting | spinning | result
    round_id: 1,
    betting_ends_at: Date.now() + DEFAULT_CONFIG.betting_duration * 1000,
    spinning_ends_at: null,
    result_ends_at: null,
    last_result: null,
    last_spin_at: null,
  };
  await env.EXILIUM_KV.put('casino:state', JSON.stringify(fresh));
  return fresh;
}

async function setState(env, state) {
  await env.EXILIUM_KV.put('casino:state', JSON.stringify(state));
}

async function getSeats(env) {
  return (await env.EXILIUM_KV.get('casino:seats', 'json')) || [];
}

async function setSeats(env, seats) {
  await env.EXILIUM_KV.put('casino:seats', JSON.stringify(seats));
}

async function getChat(env) {
  return (await env.EXILIUM_KV.get('casino:chat', 'json')) || [];
}

async function getRound(env, roundId) {
  return await env.EXILIUM_KV.get(`casino:round:${roundId}`, 'json');
}

async function setRound(env, roundId, round) {
  await env.EXILIUM_KV.put(`casino:round:${roundId}`, JSON.stringify(round));
}

async function getUser(env, userId) {
  return await env.EXILIUM_KV.get(`casino:user:${userId}`, 'json');
}

async function setUser(env, user) {
  await env.EXILIUM_KV.put(`casino:user:${user.id}`, JSON.stringify(user));
}

async function appendRoundToHistory(env, summary) {
  const list = (await env.EXILIUM_KV.get('casino:rounds_history', 'json')) || [];
  list.unshift(summary);
  await env.EXILIUM_KV.put('casino:rounds_history', JSON.stringify(list.slice(0, ROUNDS_HISTORY)));
}

async function appendTransaction(env, userId, tx) {
  const list = (await env.EXILIUM_KV.get(`casino:transactions:${userId}`, 'json')) || [];
  list.unshift(tx);
  await env.EXILIUM_KV.put(`casino:transactions:${userId}`, JSON.stringify(list.slice(0, 100)));
}

// ─────────────────────────────────────────────────────────────────────
//  Transiciones de estado (motor de la ronda)
// ─────────────────────────────────────────────────────────────────────

/**
 * Avanza la máquina de estados si corresponde. Se llama al inicio de cada request.
 * Lógica:
 *  - betting → spinning: si timer expiró O todos los sentados marcaron ready
 *  - spinning → result: si timer expiró (resuelve apuestas y paga)
 *  - result → betting: si timer expiró (nueva ronda)
 */
export async function tickStateMachine(env) {
  const cfg = await getConfig(env);
  const state = await getState(env);
  const now = Date.now();

  if (state.status === 'betting') {
    const seats = await getSeats(env);
    const round = await getRound(env, state.round_id);

    // ¿Todos los sentados están listos? (requiere al menos 1 sentado)
    const seatedWithBets = seats.filter(s => s.bets && s.bets.length > 0);
    const allReady = seatedWithBets.length > 0 && seatedWithBets.every(s => s.ready === true);

    const timerExpired = now >= state.betting_ends_at;

    // Solo girar si hay al menos 1 apuesta
    if ((timerExpired || allReady) && seatedWithBets.length > 0) {
      // Generar número ganador (servidor decide)
      const resultIndex = Math.floor(Math.random() * WHEEL_SEQUENCE.length);
      const resultNumber = WHEEL_SEQUENCE[resultIndex];

      state.status = 'spinning';
      state.spinning_ends_at = now + cfg.spinning_duration * 1000;
      state.result_number = resultNumber;
      state.result_index = resultIndex;
      state.last_result = resultNumber;
      state.last_spin_at = now;

      // Guardar resultado en la ronda (pero NO resolver todavía — se resuelve al pasar a 'result')
      if (round) {
        round.result = resultNumber;
        round.result_index = resultIndex;
        await setRound(env, state.round_id, round);
      }
      await setState(env, state);
      return state;
    }

    // Si timer expiró pero no hay apuestas: extender la ronda (reiniciar timer)
    if (timerExpired && seatedWithBets.length === 0) {
      state.betting_ends_at = now + cfg.betting_duration * 1000;
      await setState(env, state);
      return state;
    }
  }

  if (state.status === 'spinning') {
    if (now >= state.spinning_ends_at) {
      // Resolver todas las apuestas y pagar
      const resultNumber = state.result_number;
      const seats = await getSeats(env);

      // Sumar rondas sin apostar para los sentados que NO apostaron esta ronda
      const summaryWinners = [];
      const seatsDetail = []; // detalle expandido para el historial (admin)
      for (const seat of seats) {
        if (seat.bets && seat.bets.length > 0) {
          const resolved = resolveBets(resultNumber, seat.bets);
          const payout = resolved.total_bet + resolved.total_win; // apuesta + ganancia neta
          const user = await getUser(env, seat.user_id);
          if (user) {
            user.balance += payout;
            user.total_bet = (user.total_bet || 0) + resolved.total_bet;
            user.total_won = (user.total_won || 0) + resolved.total_win;
            user.rounds_played = (user.rounds_played || 0) + 1;
            await setUser(env, user);
            await appendTransaction(env, user.id, {
              type: 'round_payout',
              round_id: state.round_id,
              result: resultNumber,
              bet: resolved.total_bet,
              win: resolved.total_win,
              payout,
              balance_after: user.balance,
              ts: now,
            });
            if (resolved.total_win > 0) {
              summaryWinners.push({ name: seat.name, won: resolved.total_win });
            }
          }
          seat.last_result = {
            total_bet: resolved.total_bet,
            total_win: resolved.total_win,
            won: resolved.total_win > 0,
          };
          seatsDetail.push({
            name: seat.name,
            user_id: seat.user_id,
            bets: seat.bets.map(b => ({ key: b.bet_key || b.key, amount: b.amount })),
            total_bet: resolved.total_bet,
            total_win: resolved.total_win,
            won: resolved.total_win > 0,
          });
          seat.rounds_without_bet = 0;
        } else {
          // No apostó esta ronda
          seat.rounds_without_bet = (seat.rounds_without_bet || 0) + 1;
          seat.last_result = null;
          seatsDetail.push({
            name: seat.name,
            user_id: seat.user_id,
            bets: [],
            total_bet: 0,
            total_win: 0,
            won: false,
          });
        }
        seat.bets = [];
        seat.ready = false;
      }

      // Auto-liberar asientos inactivos
      const before = seats.length;
      const filtered = seats.filter(s => (s.rounds_without_bet || 0) < cfg.rounds_to_release_seat);
      if (filtered.length !== before) {
        await setSeats(env, filtered);
      } else {
        await setSeats(env, seats);
      }

      // Resumen de la ronda en historial
      const totalBet = seatsDetail.reduce((a, s) => a + (s.total_bet || 0), 0);
      const totalWin = seatsDetail.reduce((a, s) => a + (s.total_win || 0), 0);
      await appendRoundToHistory(env, {
        round_id: state.round_id,
        result: resultNumber,
        color: colorOf(resultNumber),
        winners: summaryWinners,
        seats_detail: seatsDetail,
        total_bet: totalBet,
        total_win: totalWin,
        ts: now,
      });

      state.status = 'result';
      state.result_ends_at = now + cfg.result_duration * 1000;
      await setState(env, state);
      return state;
    }
  }

  if (state.status === 'result') {
    if (now >= state.result_ends_at) {
      // Nueva ronda
      state.status = 'betting';
      state.round_id = state.round_id + 1;
      state.betting_ends_at = now + cfg.betting_duration * 1000;
      state.spinning_ends_at = null;
      state.result_ends_at = null;
      state.result_number = null;
      state.result_index = null;
      // Limpiar last_result de seats para nueva ronda
      const seats = await getSeats(env);
      for (const s of seats) s.last_result = null;
      await setSeats(env, seats);
      await setRound(env, state.round_id, { bets: [], result: null, resolved: false });
      await setState(env, state);
      return state;
    }
  }

  return state;
}

// ─────────────────────────────────────────────────────────────────────
//  GET /api/casino/state — estado completo de la sala (polling)
// ─────────────────────────────────────────────────────────────────────

export async function getCasinoState(env, session) {
  const cfg = await getConfig(env);
  const state = await getState(env);
  const seats = await getSeats(env);
  const chat = await getChat(env);
  const history = (await env.EXILIUM_KV.get('casino:rounds_history', 'json')) || [];

  // Información del usuario actual (si logueado)
  let me = null;
  let mySeat = null;
  if (session) {
    const user = await getUser(env, session.user_id);
    if (user) {
      me = {
        id: user.id,
        name: user.name,
        balance: user.balance,
      };
      mySeat = seats.find(s => s.user_id === user.id);
    }
  }

  // Sanitizar seats para el cliente (no exponer datos sensibles)
  const publicSeats = seats.map(s => ({
    seat: s.seat,
    name: s.name,
    has_bet: !!(s.bets && s.bets.length > 0),
    bet_count: s.bets ? s.bets.length : 0,
    bet_total: s.bets ? s.bets.reduce((t, b) => t + (Number(b.amount) || 0), 0) : 0,
    ready: !!s.ready,
    last_result: s.last_result || null,
    is_me: session && s.user_id === session.user_id,
  }));

  // Rellenar hasta max_seats con asientos vacíos
  for (let i = publicSeats.length; i < cfg.max_seats; i++) {
    publicSeats.push({ seat: i + 1, name: null, has_bet: false, bet_count: 0, bet_total: 0, ready: false, last_result: null, is_me: false });
  }

  return {
    ok: true,
    config: {
      betting_duration: cfg.betting_duration,
      spinning_duration: cfg.spinning_duration,
      result_duration: cfg.result_duration,
      min_bet: cfg.min_bet,
      max_bet: cfg.max_bet,
      max_seats: cfg.max_seats,
      max_bets_per_round: cfg.max_bets_per_round,
    },
    state: {
      status: state.status,
      round_id: state.round_id,
      betting_ends_at: state.betting_ends_at,
      spinning_ends_at: state.spinning_ends_at,
      result_ends_at: state.result_ends_at,
      result_number: state.status === 'spinning' || state.status === 'result' ? state.result_number : null,
      result_index: state.status === 'spinning' || state.status === 'result' ? state.result_index : null,
      last_result: state.last_result,
      server_time: Date.now(),
    },
    seats: publicSeats,
    chat: chat.slice(-50),
    history: history.slice(0, 15),
    me,
    my_seat: mySeat ? {
      seat: mySeat.seat,
      bets: mySeat.bets || [],
      ready: !!mySeat.ready,
      rounds_without_bet: mySeat.rounds_without_bet || 0,
    } : null,
  };
}

// ─────────────────────────────────────────────────────────────────────
//  POST /api/casino/seat — sentarse o levantarse
// ─────────────────────────────────────────────────────────────────────

export async function handleSeat(request, env, session, action) {
  // action: 'sit' | 'stand'
  if (!session) return { error: 'No autenticado', status: 401 };

  const state = await getState(env);
  if (state.status !== 'betting') {
    return { error: 'Solo puedes sentarte durante la fase de apuestas.' };
  }

  const cfg = await getConfig(env);
  let seats = await getSeats(env);

  if (action === 'stand') {
    seats = seats.filter(s => s.user_id !== session.user_id);
    await setSeats(env, seats);
    return { ok: true, message: 'Te has levantado del asiento.' };
  }

  // action === 'sit'
  const existing = seats.find(s => s.user_id === session.user_id);
  if (existing) return { error: 'Ya estás sentado.' };
  if (seats.length >= cfg.max_seats) return { error: 'La mesa está llena.' };

  // Encontrar asiento libre (1..max_seats)
  const taken = new Set(seats.map(s => s.seat));
  let seatNum = null;
  for (let i = 1; i <= cfg.max_seats; i++) {
    if (!taken.has(i)) { seatNum = i; break; }
  }
  if (seatNum === null) return { error: 'La mesa está llena.' };

  seats.push({
    seat: seatNum,
    user_id: session.user_id,
    name: session.name,
    bets: [],
    ready: false,
    joined_at: Date.now(),
    rounds_without_bet: 0,
  });
  await setSeats(env, seats);
  return { ok: true, seat: seatNum };
}

// ─────────────────────────────────────────────────────────────────────
//  POST /api/casino/bet — colocar apuesta(s)
// ─────────────────────────────────────────────────────────────────────

export async function handlePlaceBet(request, env, session) {
  if (!session) return { error: 'No autenticado', status: 401 };

  let body;
  try { body = await request.json(); } catch (_) { return { error: 'JSON inválido' }; }

  // body: { bets: [{bet_key, amount}] }  o  { bets: [{type, value, amount}] }
  let bets = Array.isArray(body.bets) ? body.bets : [];
  if (bets.length === 0) return { error: 'Debes enviar al menos una apuesta.' };

  const cfg = await getConfig(env);
  const state = await getState(env);

  if (state.status !== 'betting') {
    return { error: 'No estás en fase de apuestas.' };
  }

  const seats = await getSeats(env);
  const seatIdx = seats.findIndex(s => s.user_id === session.user_id);
  if (seatIdx === -1) return { error: 'Debes sentarte antes de apostar.' };

  const user = await getUser(env, session.user_id);
  if (!user) return { error: 'Usuario no encontrado.' };

  // Validar cada apuesta
  const validated = [];
  for (const b of bets) {
    const amount = parseInt(b.amount, 10);
    if (!Number.isFinite(amount) || amount < cfg.min_bet) {
      return { error: `Apuesta mínima: ${cfg.min_bet} PandaCoins.` };
    }
    if (amount > cfg.max_bet) {
      return { error: `Apuesta máxima: ${cfg.max_bet} PandaCoins.` };
    }
    if (!isValidBetKey(b.bet_key || b.key)) {
      return { error: 'Tipo de apuesta inválido.' };
    }
    validated.push({ bet_key: b.bet_key || b.key, amount });
  }

  // Limitar apuestas por ronda
  const existingBets = seats[seatIdx].bets || [];
  const totalAfter = existingBets.length + validated.length;
  if (totalAfter > cfg.max_bets_per_round) {
    return { error: `Máximo ${cfg.max_bets_per_round} apuestas por ronda.` };
  }

  // Validar saldo
  const totalNew = validated.reduce((t, b) => t + b.amount, 0);
  const alreadyBet = existingBets.reduce((t, b) => t + b.amount, 0);
  if (alreadyBet + totalNew > user.balance) {
    return { error: 'Saldo insuficiente.' };
  }

  // Debitar del saldo AHORA (se reembolsa o suma al resolver)
  user.balance -= totalNew;
  await setUser(env, user);

  // Añadir apuestas al asiento
  seats[seatIdx].bets = [...existingBets, ...validated];
  seats[seatIdx].ready = false; // reset ready si añade más apuestas
  await setSeats(env, seats);

  return {
    ok: true,
    message: 'Apuesta colocada.',
    balance: user.balance,
    bets: seats[seatIdx].bets,
  };
}

function isValidBetKey(key) {
  if (typeof key !== 'string') return false;
  // number:0..36 | col:1..3 | dozen:1..3 | color:red|black | parity:even|odd | half:low|high
  if (/^number:(\d+)$/.test(key)) {
    const n = parseInt(key.split(':')[1], 10);
    return n >= 0 && n <= 36;
  }
  if (/^col:[123]$/.test(key)) return true;
  if (/^dozen:[123]$/.test(key)) return true;
  if (key === 'color:red' || key === 'color:black') return true;
  if (key === 'parity:even' || key === 'parity:odd') return true;
  if (key === 'half:low' || key === 'half:high') return true;
  return false;
}

// ─────────────────────────────────────────────────────────────────────
//  POST /api/casino/ready — marcar listo
// ─────────────────────────────────────────────────────────────────────

export async function handleMarkReady(request, env, session) {
  if (!session) return { error: 'No autenticado', status: 401 };

  const state = await getState(env);
  if (state.status !== 'betting') return { error: 'No estás en fase de apuestas.' };

  const seats = await getSeats(env);
  const seatIdx = seats.findIndex(s => s.user_id === session.user_id);
  if (seatIdx === -1) return { error: 'No estás sentado.' };
  if (!seats[seatIdx].bets || seats[seatIdx].bets.length === 0) {
    return { error: 'Debes apostar antes de marcar listo.' };
  }

  seats[seatIdx].ready = true;
  await setSeats(env, seats);
  return { ok: true };
}

// ─────────────────────────────────────────────────────────────────────
//  POST /api/casino/clear-bets — quitar apuestas antes del giro
// ─────────────────────────────────────────────────────────────────────

export async function handleClearBets(request, env, session) {
  if (!session) return { error: 'No autenticado', status: 401 };

  const state = await getState(env);
  if (state.status !== 'betting') return { error: 'Ya no puedes quitar apuestas.' };

  const seats = await getSeats(env);
  const seatIdx = seats.findIndex(s => s.user_id === session.user_id);
  if (seatIdx === -1) return { error: 'No estás sentado.' };

  const bets = seats[seatIdx].bets || [];
  if (bets.length === 0) return { ok: true, message: 'No hay apuestas que quitar.' };

  // Reembolsar
  const refund = bets.reduce((t, b) => t + b.amount, 0);
  const user = await getUser(env, session.user_id);
  if (user) {
    user.balance += refund;
    await setUser(env, user);
  }
  seats[seatIdx].bets = [];
  seats[seatIdx].ready = false;
  await setSeats(env, seats);

  return { ok: true, balance: user ? user.balance : null };
}

// ─────────────────────────────────────────────────────────────────────
//  POST /api/casino/chat — enviar mensaje
// ─────────────────────────────────────────────────────────────────────

export async function handleSendChat(request, env, session) {
  if (!session) return { error: 'No autenticado', status: 401 };

  let body;
  try { body = await request.json(); } catch (_) { return { error: 'JSON inválido' }; }

  const message = String(body.message || '').trim().slice(0, 200);
  if (!message) return { error: 'Mensaje vacío.' };

  // Rate limit: máx 5 mensajes por usuario en 30s
  const rlKey = `casino:chat_rl:${session.user_id}`;
  const rl = await env.EXILIUM_KV.get(rlKey, 'json') || { count: 0 };
  if (rl.count >= 5) return { error: 'Demasiados mensajes. Espera un momento.' };
  rl.count++;
  await env.EXILIUM_KV.put(rlKey, JSON.stringify(rl), { expirationTtl: 30 });

  const chat = await getChat(env);
  chat.push({
    user_id: session.user_id,
    name: session.name,
    message,
    ts: Date.now(),
  });
  // Mantener últimos CHAT_MAX mensajes
  await env.EXILIUM_KV.put('casino:chat', JSON.stringify(chat.slice(-CHAT_MAX)));

  return { ok: true };
}

// ─────────────────────────────────────────────────────────────────────
//  GET /api/casino/leaderboard
// ─────────────────────────────────────────────────────────────────────

export async function handleGetLeaderboard(env) {
  const cached = await env.EXILIUM_KV.get('casino:leaderboard', 'json');
  if (cached && cached.expires_at > Date.now()) return { ok: true, leaderboard: cached.list };

  const index = await env.EXILIUM_KV.get('casino:user_index', 'json') || [];
  const users = [];
  for (const id of index) {
    const u = await getUser(env, id);
    if (u) {
      users.push({ name: u.name, balance: u.balance, total_won: u.total_won || 0, rounds_played: u.rounds_played || 0 });
    }
  }
  users.sort((a, b) => b.total_won - a.total_won);
  const top = users.slice(0, 10);
  await env.EXILIUM_KV.put('casino:leaderboard', JSON.stringify({
    list: top,
    expires_at: Date.now() + 5 * 60 * 1000, // 5 min
  }));
  return { ok: true, leaderboard: top };
}

// ─────────────────────────────────────────────────────────────────────
//  ENDPOINTS ADMIN
// ─────────────────────────────────────────────────────────────────────

export async function handleAdminGetConfig(env) {
  return { ok: true, config: await getConfig(env) };
}

export async function handleAdminPutConfig(request, env) {
  let body;
  try { body = await request.json(); } catch (_) { return { error: 'JSON inválido' }; }

  const current = await getConfig(env);
  const allowed = ['betting_duration', 'spinning_duration', 'result_duration', 'min_bet', 'max_bet', 'max_seats', 'max_bets_per_round', 'initial_balance', 'rounds_to_release_seat'];
  const updated = { ...current };
  for (const k of allowed) {
    if (body[k] !== undefined) {
      const v = Number(body[k]);
      if (Number.isFinite(v) && v >= 0) updated[k] = v;
    }
  }
  await env.EXILIUM_KV.put('casino:config', JSON.stringify(updated));
  return { ok: true, config: updated };
}

export async function handleAdminAdjustBalance(request, env, userId) {
  let body;
  try { body = await request.json(); } catch (_) { return { error: 'JSON inválido' }; }

  const delta = Number(body.delta);
  if (!Number.isFinite(delta)) return { error: 'delta inválido.' };

  const user = await getUser(env, userId);
  if (!user) return { error: 'Usuario no encontrado.' };

  user.balance = Math.max(0, user.balance + delta);
  await setUser(env, user);
  await appendTransaction(env, userId, {
    type: 'admin_adjust',
    delta,
    reason: String(body.reason || '').slice(0, 200),
    balance_after: user.balance,
    ts: Date.now(),
  });
  return { ok: true, balance: user.balance };
}

export async function handleAdminGetRounds(env) {
  const list = (await env.EXILIUM_KV.get('casino:rounds_history', 'json')) || [];
  return { ok: true, rounds: list };
}

export async function handleAdminGetTransactions(env, userId) {
  const list = (await env.EXILIUM_KV.get(`casino:transactions:${userId}`, 'json')) || [];
  return { ok: true, transactions: list };
}

export async function handleAdminGetStats(env) {
  const state = await getState(env);
  const seats = await getSeats(env);
  const index = await env.EXILIUM_KV.get('casino:user_index', 'json') || [];
  const chat = await getChat(env);
  let totalBalance = 0;
  for (const id of index) {
    const u = await getUser(env, id);
    if (u) totalBalance += u.balance || 0;
  }
  return {
    ok: true,
    stats: {
      status: state.status,
      round_id: state.round_id,
      total_users: index.length,
      total_balance: totalBalance,
      active_seats: seats.length,
      chat_messages: chat.length,
      last_result: state.last_result,
    },
  };
}

export async function handleAdminKick(env, userId) {
  let seats = await getSeats(env);
  const before = seats.length;
  seats = seats.filter(s => s.user_id !== userId);
  await setSeats(env, seats);
  return { ok: true, removed: before - seats.length };
}

export async function handleAdminResetState(env) {
  // Reset emergente: nueva ronda de apuestas sin resolver nada pendiente
  // Reembolsar apuestas pendientes
  const seats = await getSeats(env);
  for (const s of seats) {
    if (s.bets && s.bets.length > 0) {
      const refund = s.bets.reduce((t, b) => t + b.amount, 0);
      const u = await getUser(env, s.user_id);
      if (u) { u.balance += refund; await setUser(env, u); }
    }
    s.bets = [];
    s.ready = false;
  }
  await setSeats(env, seats);
  const cfg = await getConfig(env);
  await setState(env, {
    status: 'betting',
    round_id: 1,
    betting_ends_at: Date.now() + cfg.betting_duration * 1000,
    spinning_ends_at: null,
    result_ends_at: null,
    last_result: null,
    last_spin_at: null,
  });
  return { ok: true, message: 'Estado reseteado.' };
}

// ─────────────────────────────────────────────────────────────────────
//  ADMIN — Detalle de una ronda por ID
// ─────────────────────────────────────────────────────────────────────
export async function handleAdminGetRound(env, roundId) {
  const num = Number(roundId);
  if (!Number.isFinite(num)) return { error: 'roundId inválido.' };
  const round = await getRound(env, num);
  // También buscamos el summary en el historial (rondas pasadas)
  const history = (await env.EXILIUM_KV.get('casino:rounds_history', 'json')) || [];
  const summary = history.find(r => r.round_id === num) || null;
  return { ok: true, round, summary };
}

// ─────────────────────────────────────────────────────────────────────
//  ADMIN — Estadísticas avanzadas globales
// ─────────────────────────────────────────────────────────────────────
export async function handleAdminGetAdvancedStats(env) {
  const history = (await env.EXILIUM_KV.get('casino:rounds_history', 'json')) || [];
  const index = (await env.EXILIUM_KV.get('casino:user_index', 'json')) || [];

  let totalBet = 0;
  let totalWin = 0;
  const numberFreq = {};   // resultado -> count
  let redCount = 0, blackCount = 0, greenCount = 0;
  let activePlayers = new Set();

  for (const r of history) {
    totalBet += (r.total_bet || 0);
    totalWin += (r.total_win || 0);
    const res = r.result;
    if (res !== null && res !== undefined) {
      numberFreq[res] = (numberFreq[res] || 0) + 1;
      const c = colorOf(res);
      if (c === 'red') redCount++;
      else if (c === 'black') blackCount++;
      else if (c === 'green') greenCount++;
    }
    if (Array.isArray(r.seats_detail)) {
      r.seats_detail.forEach(s => { if (s.user_id) activePlayers.add(s.user_id); });
    }
  }

  // Número más frecuente
  let mostFrequentNumber = null;
  let mostFrequentCount = 0;
  for (const [n, c] of Object.entries(numberFreq)) {
    if (c > mostFrequentCount) { mostFrequentCount = c; mostFrequentNumber = Number(n); }
  }

  const totalSpins = history.length;
  const rtp = totalBet > 0 ? (totalWin / totalBet) * 100 : 0;

  return {
    ok: true,
    stats: {
      total_rounds: totalSpins,
      total_bet: totalBet,
      total_win: totalWin,
      total_house_net: totalBet - totalWin, // lo que retiene la casa (neto apostado - pagado)
      rtp: Math.round(rtp * 100) / 100,
      most_frequent_number: mostFrequentNumber,
      most_frequent_count: mostFrequentCount,
      color_distribution: {
        red: redCount,
        black: blackCount,
        green: greenCount,
        red_pct: totalSpins > 0 ? Math.round((redCount / totalSpins) * 10000) / 100 : 0,
        black_pct: totalSpins > 0 ? Math.round((blackCount / totalSpins) * 10000) / 100 : 0,
        green_pct: totalSpins > 0 ? Math.round((greenCount / totalSpins) * 10000) / 100 : 0,
      },
      number_frequency: numberFreq,
      registered_users: index.length,
      active_players: activePlayers.size,
    },
  };
}

