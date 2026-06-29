// worker/casino-do.js
// ════════════════════════════════════════════════════════════════════
//  CasinoTable — Durable Object: mesa de ruleta multijugador en TIEMPO REAL.
//
//  Sustituye el estado en KV (eventualmente consistente) por una única
//  instancia con estado fuerte + WebSockets. TODOS los jugadores conectados
//  ven lo mismo al instante: mismo countdown, mismas apuestas, mismo giro.
//
//  - Estado/seats/chat persistidos en ctx.storage (sobreviven a reinicios).
//  - Saldos de usuario siguen en KV (casino:user:${id}) → perfil/leaderboard/admin OK.
//  - El reloj de la ronda lo lleva un alarm() del DO (no por request).
//  - WebSockets con hibernación: la sesión va en el attachment del socket.
// ════════════════════════════════════════════════════════════════════

import { WHEEL_SEQUENCE, colorOf, resolveBets, isValidBetKey } from './casino.js';

const DEFAULT_CONFIG = {
  betting_duration: 20,
  spinning_duration: 4,
  result_duration: 4,
  min_bet: 50,
  max_bet: 1000,
  max_seats: 5,
  max_bets_per_round: 3,
  initial_balance: 1000,
  rounds_to_release_seat: 3,
};
const CHAT_MAX = 40;
const HISTORY_MAX = 15;
const CHAT_RATE_LIMIT = 5;
const CHAT_RATE_WINDOW_MS = 30_000;

export class CasinoTable {
  constructor(ctx, env) {
    this.ctx = ctx;
    this.env = env;
    this.config = { ...DEFAULT_CONFIG };
    this.configLoadedAt = 0;
    // Cargar estado persistido antes de atender nada.
    ctx.blockConcurrencyWhile(async () => {
      this.state = (await ctx.storage.get('state')) || this._freshState();
      this.seats = (await ctx.storage.get('seats')) || [];
      this.chat = (await ctx.storage.get('chat')) || [];
      this.history = (await ctx.storage.get('history')) || [];
    });
  }

  _freshState() {
    return {
      status: 'betting',
      round_id: 1,
      betting_ends_at: null,   // null = en reposo (mesa vacía / sin apuestas)
      spinning_ends_at: null,
      result_ends_at: null,
      result_number: null,
      result_index: null,
      last_result: null,
    };
  }

  async _persist() {
    await this.ctx.storage.put({ state: this.state, seats: this.seats, chat: this.chat, history: this.history });
  }

  async _loadConfig() {
    // Config rara vez cambia; refrescamos como mucho cada 30s.
    if (Date.now() - this.configLoadedAt < 30_000) return this.config;
    try {
      const cfg = await this.env.EXILIUM_KV.get('casino:config', 'json');
      this.config = { ...DEFAULT_CONFIG, ...(cfg || {}) };
    } catch (_) { /* mantener la que haya */ }
    this.configLoadedAt = Date.now();
    return this.config;
  }

  // ── KV: usuarios (saldos) ──
  async _getUser(userId) {
    return await this.env.EXILIUM_KV.get(`casino:user:${userId}`, 'json');
  }
  async _setUser(user) {
    await this.env.EXILIUM_KV.put(`casino:user:${user.id}`, JSON.stringify(user));
  }
  async _appendTransaction(userId, tx) {
    try {
      const list = (await this.env.EXILIUM_KV.get(`casino:transactions:${userId}`, 'json')) || [];
      list.unshift(tx);
      await this.env.EXILIUM_KV.put(`casino:transactions:${userId}`, JSON.stringify(list.slice(0, 100)));
    } catch (_) {}
  }
  async _appendRoundHistoryKV(summary) {
    try {
      const list = (await this.env.EXILIUM_KV.get('casino:rounds_history', 'json')) || [];
      list.unshift(summary);
      await this.env.EXILIUM_KV.put('casino:rounds_history', JSON.stringify(list.slice(0, 50)));
    } catch (_) {}
  }

  // ════════════════════════════════════════════════════════════════
  //  Entrada HTTP → upgrade a WebSocket
  // ════════════════════════════════════════════════════════════════
  async fetch(request) {
    const url = new URL(request.url);
    if (url.pathname.endsWith('/ws')) {
      if (request.headers.get('Upgrade') !== 'websocket') {
        return new Response('Se esperaba WebSocket', { status: 426 });
      }
      const token = url.searchParams.get('token') || '';
      const session = await this._verifyToken(token);
      // Permitimos conexión anónima (espectador) para ver la mesa, pero sin acciones.
      const pair = new WebSocketPair();
      const [client, server] = [pair[0], pair[1]];
      this.ctx.acceptWebSocket(server);
      server.serializeAttachment({ session: session || null });
      await this._loadConfig();
      // Ponerse al día por si un temporizador venció estando el DO inactivo
      // (tras redeploy, hibernación o sin sockets). Evita estados "atascados".
      await this._advance();
      await this._persist();
      await this._scheduleAlarm();
      this._broadcast(); // incluye al recién conectado (y refresca a los demás si cambió)
      if (session) {
        const user = await this._getUser(session.user_id);
        if (user) this._send(server, { type: 'me', balance: user.balance, name: user.name, avatar_url: user.avatar_url || null });
      }
      return new Response(null, { status: 101, webSocket: client });
    }
    return new Response('No encontrado', { status: 404 });
  }

  async _verifyToken(token) {
    if (!token) return null;
    try {
      const s = await this.env.EXILIUM_KV.get(`casino:session:${token}`, 'json');
      if (!s) return null;
      const deleted = await this.env.EXILIUM_KV.get(`casino:user:deleted:${s.user_id}`);
      if (deleted) return null;
      return s; // { user_id, name }
    } catch (_) { return null; }
  }

  // ════════════════════════════════════════════════════════════════
  //  WebSocket handlers (hibernación)
  // ════════════════════════════════════════════════════════════════
  async webSocketMessage(ws, raw) {
    let msg;
    try { msg = JSON.parse(raw); } catch (_) { return; }
    const att = ws.deserializeAttachment() || {};
    const session = att.session;
    if (msg.type === 'ping') { this._send(ws, { type: 'pong' }); return; }
    if (!session) { this._send(ws, { type: 'error', message: 'Entra con Discord para jugar.' }); return; }

    await this._loadConfig();
    try {
      switch (msg.type) {
        case 'sit':   await this._sit(session); break;
        case 'stand': await this._stand(session); break;
        case 'bet':   await this._bet(ws, session, msg.bets); break;
        case 'clear': await this._clear(ws, session); break;
        case 'ready': await this._ready(session); break;
        case 'chat':  await this._chatMsg(session, msg.message); break;
        default: return;
      }
    } catch (e) {
      this._send(ws, { type: 'error', message: 'Error procesando la acción.' });
      console.error('[CasinoDO] action error', e);
    }
  }

  async webSocketClose(ws) { await this._onDisconnect(ws); }
  async webSocketError(ws) { await this._onDisconnect(ws); }

  async _onDisconnect(ws) {
    const att = ws.deserializeAttachment() || {};
    const session = att.session;
    if (!session) return;
    // ¿Sigue conectado por otra pestaña? Si no, marcar/limpiar el asiento.
    const stillConnected = this.ctx.getWebSockets().some(s => {
      if (s === ws) return false;
      const a = s.deserializeAttachment() || {};
      return a.session && a.session.user_id === session.user_id;
    });
    if (stillConnected) return;
    const seat = this.seats.find(s => s.user_id === session.user_id);
    if (!seat) return;
    if (this.state.status === 'betting') {
      // Reembolsar apuestas pendientes y liberar el asiento.
      await this._refundSeat(seat);
      this.seats = this.seats.filter(s => s.user_id !== session.user_id);
      await this._afterChange();
    } else {
      // En giro/resultado: NO quitar el asiento (debe cobrar). Marcar desconectado;
      // se limpia al empezar la siguiente ronda.
      seat.connected = false;
      await this._persist();
      this._broadcast();
    }
  }

  // ════════════════════════════════════════════════════════════════
  //  Acciones de jugador
  // ════════════════════════════════════════════════════════════════
  async _sit(session) {
    if (this.state.status !== 'betting') { this._sendErr(session, 'Solo puedes sentarte en la fase de apuestas.'); return; }
    if (this.seats.find(s => s.user_id === session.user_id)) return; // ya sentado
    if (this.seats.length >= this.config.max_seats) { this._sendErr(session, 'La mesa está llena.'); return; }
    const taken = new Set(this.seats.map(s => s.seat));
    let seatNum = null;
    for (let i = 1; i <= this.config.max_seats; i++) { if (!taken.has(i)) { seatNum = i; break; } }
    if (seatNum === null) { this._sendErr(session, 'La mesa está llena.'); return; }
    const user = await this._getUser(session.user_id);
    this.seats.push({
      seat: seatNum, user_id: session.user_id, name: session.name,
      avatar_url: (user && user.avatar_url) || null,
      bets: [], ready: false, connected: true, joined_at: Date.now(),
      rounds_without_bet: 0, last_result: null,
    });
    await this._afterChange();
  }

  async _stand(session) {
    const seat = this.seats.find(s => s.user_id === session.user_id);
    if (!seat) return;
    if (this.state.status === 'betting') await this._refundSeat(seat);
    this.seats = this.seats.filter(s => s.user_id !== session.user_id);
    await this._afterChange();
  }

  async _bet(ws, session, bets) {
    if (this.state.status !== 'betting') { this._send(ws, { type: 'error', message: 'No estás en fase de apuestas.' }); return; }
    const seat = this.seats.find(s => s.user_id === session.user_id);
    if (!seat) { this._send(ws, { type: 'error', message: 'Siéntate antes de apostar.' }); return; }
    if (!Array.isArray(bets) || bets.length === 0) return;
    const cfg = this.config;

    const validated = [];
    for (const b of bets) {
      const amount = parseInt(b.amount, 10);
      const key = b.bet_key || b.key;
      if (!Number.isFinite(amount) || amount < cfg.min_bet) { this._send(ws, { type: 'error', message: `Apuesta mínima: ${cfg.min_bet}.` }); return; }
      if (amount > cfg.max_bet) { this._send(ws, { type: 'error', message: `Apuesta máxima: ${cfg.max_bet}.` }); return; }
      if (!isValidBetKey(key)) { this._send(ws, { type: 'error', message: 'Apuesta inválida.' }); return; }
      validated.push({ bet_key: key, amount });
    }
    const existing = seat.bets || [];
    if (existing.length + validated.length > cfg.max_bets_per_round) { this._send(ws, { type: 'error', message: `Máximo ${cfg.max_bets_per_round} apuestas por ronda.` }); return; }

    const user = await this._getUser(session.user_id);
    if (!user) { this._send(ws, { type: 'error', message: 'Usuario no encontrado.' }); return; }
    const totalNew = validated.reduce((t, b) => t + b.amount, 0);
    const already = existing.reduce((t, b) => t + b.amount, 0);
    if (already + totalNew > user.balance) { this._send(ws, { type: 'error', message: 'Saldo insuficiente.' }); return; }

    // Cobrar → registrar.
    user.balance -= totalNew;
    await this._setUser(user);
    seat.bets = [...existing, ...validated];
    seat.ready = false;

    // Reanudar la ventana de apuestas si estaba en reposo.
    if (this.state.betting_ends_at == null || Date.now() >= this.state.betting_ends_at) {
      this.state.betting_ends_at = Date.now() + cfg.betting_duration * 1000;
    }
    this._send(ws, { type: 'me', balance: user.balance });
    await this._afterChange();
  }

  async _clear(ws, session) {
    if (this.state.status !== 'betting') return;
    const seat = this.seats.find(s => s.user_id === session.user_id);
    if (!seat || !seat.bets || seat.bets.length === 0) return;
    const user = await this._refundSeat(seat);
    seat.bets = []; seat.ready = false;
    if (user) this._send(ws, { type: 'me', balance: user.balance });
    await this._afterChange();
  }

  async _ready(session) {
    if (this.state.status !== 'betting') return;
    const seat = this.seats.find(s => s.user_id === session.user_id);
    if (!seat || !seat.bets || seat.bets.length === 0) { this._sendErr(session, 'Apuesta antes de marcar listo.'); return; }
    seat.ready = true;
    await this._afterChange(); // _advance puede disparar el giro
  }

  async _chatMsg(session, message) {
    const text = String(message || '').trim().slice(0, 200);
    if (!text) return;
    // Rate-limit por usuario (en memoria).
    this._chatRate = this._chatRate || {};
    const now = Date.now();
    const arr = (this._chatRate[session.user_id] || []).filter(t => t > now - CHAT_RATE_WINDOW_MS);
    if (arr.length >= CHAT_RATE_LIMIT) { this._sendErr(session, 'Demasiados mensajes, espera un momento.'); return; }
    arr.push(now); this._chatRate[session.user_id] = arr;
    this.chat.push({ user_id: session.user_id, name: session.name, message: text, ts: now });
    this.chat = this.chat.slice(-CHAT_MAX);
    await this._afterChange();
  }

  async _refundSeat(seat) {
    if (!seat.bets || seat.bets.length === 0) return await this._getUser(seat.user_id);
    const refund = seat.bets.reduce((t, b) => t + (Number(b.amount) || 0), 0);
    const user = await this._getUser(seat.user_id);
    if (user && refund > 0) {
      user.balance += refund;
      await this._setUser(user);
    }
    return user;
  }

  // ════════════════════════════════════════════════════════════════
  //  Motor de ronda (alarm + acciones lo invocan)
  // ════════════════════════════════════════════════════════════════
  async alarm() {
    await this._loadConfig();
    await this._advance();
    await this._persist();   // CRÍTICO: el DO puede hibernar tras el alarm; sin esto, al
                             // despertar recargaba estado viejo (ronda hacia atrás, "no estás
                             // en fase de apuestas", número fantasma, video repetido).
    this._broadcast();
    await this._scheduleAlarm();
  }

  // Llamar tras cualquier cambio: avanza si toca, persiste, reprograma alarm, difunde.
  async _afterChange() {
    await this._advance();
    await this._persist();
    this._broadcast();
    await this._scheduleAlarm();
  }

  async _advance() {
    const now = Date.now();
    const cfg = this.config;

    if (this.state.status === 'betting') {
      const active = this.seats.filter(s => s.connected !== false);
      const bettors = active.filter(s => s.bets && s.bets.length > 0);
      if (bettors.length === 0) {
        // Reposo: sin apuestas no hay giro ni temporizador.
        this.state.betting_ends_at = null;
        return;
      }
      // Girar cuando TODOS los sentados estén listos (no solo los que ya apostaron),
      // o cuando venza el tiempo. Solo (1 sentado) gira al instante con LISTO.
      // Varios: espera a que cada sentado marque LISTO o a que se agote el contador.
      const allReady = active.every(s => s.ready === true);
      const timerExpired = this.state.betting_ends_at != null && now >= this.state.betting_ends_at;
      if (timerExpired || allReady) {
        await this._spin();
      }
      return;
    }

    if (this.state.status === 'spinning') {
      if (this.state.spinning_ends_at != null && now >= this.state.spinning_ends_at) {
        await this._resolve();
      }
      return;
    }

    if (this.state.status === 'result') {
      if (this.state.result_ends_at != null && now >= this.state.result_ends_at) {
        this._newRound();
      }
      return;
    }
  }

  async _spin() {
    const now = Date.now();
    const idx = Math.floor(Math.random() * WHEEL_SEQUENCE.length);
    this.state.status = 'spinning';
    this.state.result_index = idx;
    this.state.result_number = WHEEL_SEQUENCE[idx];
    this.state.last_result = this.state.result_number;
    this.state.spinning_ends_at = now + this.config.spinning_duration * 1000;
    this.state.betting_ends_at = null;
  }

  async _resolve() {
    const now = Date.now();
    const resultNumber = this.state.result_number;
    const summaryWinners = [];
    const plenoWinners = []; // ganadores por PLENO (number:X) → disparan el video de celebración
    const seatsDetail = [];
    for (const seat of this.seats) {
      if (seat.bets && seat.bets.length > 0) {
        const r = resolveBets(resultNumber, seat.bets);
        // Pago correcto: se devuelve SOLO lo apostado a los aciertos + las ganancias.
        // Lo apostado a fallos se lo queda la casa. (El bug viejo sumaba TODO lo apostado
        // → reembolsaba también las apuestas perdedoras = nadie perdía nunca.)
        const winningStake = r.details.reduce((t, d) => t + (d.won ? d.amount : 0), 0);
        const payout = winningStake + r.total_win;
        const net = payout - r.total_bet; // cambio real de saldo en la ronda
        const user = await this._getUser(seat.user_id);
        if (user) {
          user.balance += payout;
          user.total_bet = (user.total_bet || 0) + r.total_bet;
          user.total_won = (user.total_won || 0) + r.total_win;
          user.rounds_played = (user.rounds_played || 0) + 1;
          await this._setUser(user);
          this._sendMe(user.id, user.balance);
          await this._appendTransaction(user.id, {
            type: 'round_payout', round_id: this.state.round_id, result: resultNumber,
            bet: r.total_bet, win: r.total_win, payout, balance_after: user.balance, ts: now,
          });
          if (r.total_win > 0) summaryWinners.push({ name: seat.name, won: r.total_win });
        }
        seat.last_result = { total_bet: r.total_bet, total_win: r.total_win, net, won: net > 0 };
        seatsDetail.push({ name: seat.name, user_id: seat.user_id, bets: seat.bets.map(b => ({ key: b.bet_key, amount: b.amount })), total_bet: r.total_bet, total_win: r.total_win, net, won: net > 0 });
        // ¿Ganó al PLENO? (apostó exactamente al número que salió) → celebración con video
        if (seat.bets.some(b => b.bet_key === 'number:' + resultNumber)) {
          plenoWinners.push({ name: seat.name, avatar_url: seat.avatar_url || null, win: r.total_win });
        }
        seat.rounds_without_bet = 0;
      } else {
        seat.rounds_without_bet = (seat.rounds_without_bet || 0) + 1;
        seat.last_result = null;
        seatsDetail.push({ name: seat.name, user_id: seat.user_id, bets: [], total_bet: 0, total_win: 0, won: false });
      }
      seat.bets = [];
      seat.ready = false;
    }

    const summary = {
      round_id: this.state.round_id, result: resultNumber, color: colorOf(resultNumber),
      winners: summaryWinners, seats_detail: seatsDetail,
      total_bet: seatsDetail.reduce((a, s) => a + s.total_bet, 0),
      total_win: seatsDetail.reduce((a, s) => a + s.total_win, 0), ts: now,
    };
    this.history.unshift(summary);
    this.history = this.history.slice(0, HISTORY_MAX);
    await this._appendRoundHistoryKV(summary);

    // Celebración: solo si alguien acertó el PLENO.
    this.state.bigwin = plenoWinners.length ? { number: resultNumber, winners: plenoWinners } : null;
    this.state.status = 'result';
    this.state.result_ends_at = now + this.config.result_duration * 1000;
  }

  _newRound() {
    // Limpiar asientos desconectados y por inactividad.
    this.seats = this.seats.filter(s => s.connected !== false && (s.rounds_without_bet || 0) < this.config.rounds_to_release_seat);
    for (const s of this.seats) { s.last_result = null; s.bets = []; s.ready = false; }
    this.state.status = 'betting';
    this.state.round_id += 1;
    this.state.result_number = null;
    this.state.result_index = null;
    this.state.spinning_ends_at = null;
    this.state.result_ends_at = null;
    this.state.betting_ends_at = null; // se arma con la primera apuesta
    this.state.bigwin = null;          // limpiar la celebración de la ronda anterior
  }

  async _scheduleAlarm() {
    let next = null;
    const s = this.state;
    if (s.status === 'betting' && s.betting_ends_at != null) next = s.betting_ends_at;
    else if (s.status === 'spinning' && s.spinning_ends_at != null) next = s.spinning_ends_at;
    else if (s.status === 'result' && s.result_ends_at != null) next = s.result_ends_at;
    if (next != null) {
      await this.ctx.storage.setAlarm(next + 50); // +50ms de margen
    }
  }

  // ════════════════════════════════════════════════════════════════
  //  Difusión
  // ════════════════════════════════════════════════════════════════
  _send(ws, obj) { try { ws.send(JSON.stringify(obj)); } catch (_) {} }

  _sendMe(userId, balance) {
    for (const ws of this.ctx.getWebSockets()) {
      const a = ws.deserializeAttachment() || {};
      if (a.session && a.session.user_id === userId) this._send(ws, { type: 'me', balance });
    }
  }

  _sendErr(session, message) {
    for (const ws of this.ctx.getWebSockets()) {
      const a = ws.deserializeAttachment() || {};
      if (a.session && a.session.user_id === session.user_id) this._send(ws, { type: 'error', message });
    }
  }

  _broadcast() {
    for (const ws of this.ctx.getWebSockets()) {
      const a = ws.deserializeAttachment() || {};
      this._send(ws, this._snapshotFor(a.session));
    }
  }

  _snapshotFor(session) {
    const cfg = this.config;
    const meId = session ? session.user_id : null;
    const publicSeats = [];
    for (let i = 0; i < cfg.max_seats; i++) {
      const sv = this.seats.find(s => s.seat === i + 1);
      if (!sv) { publicSeats.push({ seat: i + 1, name: null, avatar_url: null, bets: [], has_bet: false, bet_total: 0, ready: false, last_result: null, is_me: false }); continue; }
      publicSeats.push({
        seat: sv.seat, name: sv.name, avatar_url: sv.avatar_url || null,
        bets: (sv.bets || []).map(b => ({ bet_key: b.bet_key, amount: b.amount })),
        has_bet: !!(sv.bets && sv.bets.length), bet_total: (sv.bets || []).reduce((t, b) => t + (Number(b.amount) || 0), 0),
        ready: !!sv.ready, last_result: sv.last_result || null, is_me: meId && sv.user_id === meId,
      });
    }
    const mySeat = meId ? this.seats.find(s => s.user_id === meId) : null;
    return {
      type: 'state',
      config: {
        betting_duration: cfg.betting_duration, spinning_duration: cfg.spinning_duration,
        result_duration: cfg.result_duration, min_bet: cfg.min_bet, max_bet: cfg.max_bet,
        max_seats: cfg.max_seats, max_bets_per_round: cfg.max_bets_per_round,
      },
      state: {
        status: this.state.status, round_id: this.state.round_id,
        betting_ends_at: this.state.betting_ends_at, spinning_ends_at: this.state.spinning_ends_at,
        result_ends_at: this.state.result_ends_at,
        result_number: (this.state.status === 'spinning' || this.state.status === 'result') ? this.state.result_number : null,
        result_index: (this.state.status === 'spinning' || this.state.status === 'result') ? this.state.result_index : null,
        last_result: this.state.last_result, server_time: Date.now(),
        bigwin: this.state.status === 'result' ? (this.state.bigwin || null) : null,
      },
      seats: publicSeats.sort((a, b) => a.seat - b.seat),
      chat: this.chat.slice(-50),
      history: this.history.slice(0, HISTORY_MAX),
      my_seat: mySeat ? { seat: mySeat.seat, bets: mySeat.bets || [], ready: !!mySeat.ready } : null,
      logged_in: !!session,
    };
  }
}
