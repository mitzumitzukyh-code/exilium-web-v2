// deploy/js/casino.js
// Sala de PandaCoins — Frontend multijugador con polling.
// v6.0 — Layout Playtech, ruleta canvas PNG, multijugador KV.

(function(){
  "use strict";

  const API_BASE = 'https://exilium-blizzard.mitzumitzukyhs.workers.dev';
  const TOKEN_KEY = 'exilium_casino_token';
  const TUTORIAL_KEY = 'exilium_casino_tutorial_dismissed';
  const CACHE_HISTORY_KEY = 'exilium_casino_history_cache';
  const CACHE_CONFIG_KEY = 'exilium_casino_config_cache';
  const CACHE_USER_KEY = 'exilium_casino_user_cache';
  const CACHE_TS_KEY = 'exilium_casino_cache_ts';

  // Secuencia europea (debe coincidir con el servidor)
  const WHEEL_SEQUENCE = [0,32,15,19,4,21,2,25,17,34,6,27,13,36,11,30,8,23,10,5,24,16,33,1,20,14,31,9,22,18,29,7,28,12,35,3,26];
  const RED_NUMBERS = new Set([1,3,5,7,9,12,14,16,18,19,21,23,25,27,30,32,34,36]);

  function colorOf(n){
    if(n === 0) return 'green';
    return RED_NUMBERS.has(n) ? 'red' : 'black';
  }

  const BET_LABELS = {
    'color:red':'♦ Rojo','color:black':'♦ Negro',
    'parity:even':'Par','parity:odd':'Impar',
    'half:low':'1-18','half:high':'19-36',
    'dozen:1':'1ª Docena','dozen:2':'2ª Docena','dozen:3':'3ª Docena',
    'col:1':'Col 1','col:2':'Col 2','col:3':'Col 3',
  };

  function betLabel(key){
    if(key.startsWith('number:')){
      const n = parseInt(key.split(':')[1],10);
      const c = colorOf(n) === 'red' ? 'R' : colorOf(n) === 'black' ? 'N' : '0';
      return '#' + n + ' ' + c;
    }
    return BET_LABELS[key] || key;
  }

  // ─────────── Estado local ───────────
  const state = {
    token: localStorage.getItem(TOKEN_KEY) || null,
    me: null,                 // { id, name, balance }
    config: null,             // del servidor
    serverState: null,        // status, round_id, timers, result
    seats: [],                // [{ seat, name, has_bet, bet_total, ready, is_me, last_result }]
    mySeat: null,             // bets, ready
    chat: [],
    history: [],
    betValue: 100,
    pendingBets: [],          // selecciones locales antes de confirmar
    spinning: false,
    soundOn: true,
    lastRoundId: null,
    lastStatus: null,
    pollTimer: null,
  };

  // ─────────── Elementos ───────────
  const $ = (id) => document.getElementById(id);
  const els = {};

  function cacheEls(){
    [
      'balancePill','balanceValue','totalBetValue',
      'sessionPill','sessionName','logoutBtn','hcToggle',
      'timerCircle','timerText','statusLine','historyStrip',
      'resultCallout','rcStatus','rcNumber','rcSwatch',
      'chipsRow','betValue','tableGrid','tableColumns','tableDozens','tableOutside','myBetsList',
      'clearBetBtn','readyBtn','readyBtnLabel','soundToggle','soundLabel',
      'limitMin','limitMax','limitMaxBets',
      'seatsGrid','sitBtn','standBtn','seatsHelp',
      'chatList','chatInput','chatSend',
      'helpBtn','tutorialOverlay','tutorialCloseBtn','tutorialDontShow',
      'authOverlay','loginPanel','registerPanel','tabLogin','tabRegister',
      'loginName','loginPass','loginError','loginBtn',
      'regName','regPass','regPass2','regError','registerBtn',
      'switchToRegister','switchToLogin',
      'discordLoginBtn','discordRegisterBtn','authCloseBtn','dashboardCloseBtn','dashboardBtn',
      'tickerTrack',
      'betsHeader','seatsHeader','chatHeader','panelBets','panelSeats','panelChat',
    ].forEach(id => { els[id] = $(id); });
  }

  // ─────────── API helpers ───────────
  async function api(path, method='GET', body=null){
    const headers = { 'Content-Type':'application/json' };
    if(state.token) headers['Authorization'] = 'Bearer ' + state.token;
    const opts = { method, headers };
    if(body) opts.body = JSON.stringify(body);
    try {
      const res = await fetch(API_BASE + path, opts);
      const data = await res.json().catch(() => ({}));
      if(!res.ok){
        // 401 → sesión expirada
        if(res.status === 401 && state.token){
          state.token = null;
          localStorage.removeItem(TOKEN_KEY);
          showAuth();
        }
        return { error: data.error || ('HTTP ' + res.status), status: res.status, ...data };
      }
      return data;
    } catch(err){
      return { error: 'Error de red: ' + err.message };
    }
  }

  function setToken(token){
    state.token = token;
    if(token) localStorage.setItem(TOKEN_KEY, token);
    else localStorage.removeItem(TOKEN_KEY);
  }

  // ─────────── Ruleta canvas (casino-wheel.js) ───────────
  function initWheel(){
    if(typeof CasinoWheel !== 'undefined'){
      CasinoWheel.init('rouletteContainer');
      const ro = new ResizeObserver(() => {
        if(typeof CasinoWheel.resize === 'function') CasinoWheel.resize();
      });
      const el = document.getElementById('rouletteContainer');
      if(el) ro.observe(el);
    }
  }

  function spinWheelTo(resultIndex, callback){
    if(typeof CasinoWheel === 'undefined') return;
    const dur = state.config ? state.config.spinning_duration * 1000 : 5200;
    const scaled = Math.max(3500, Math.min(6000, dur * 1.15));
    let tickCount = 0;
    const tickInterval = setInterval(() => {
      tick(0.05);
      if(++tickCount > 14) clearInterval(tickInterval);
    }, 90);
    if(els.readyBtn) els.readyBtn.disabled = true;
    CasinoWheel.spinTo(resultIndex, scaled, () => {
      clearInterval(tickInterval);
      tick(0.08);
      if(els.readyBtn) els.readyBtn.disabled = false;
      if(callback) callback();
    });
  }

  // ─────────── Construir tapete de apuestas (estilo casino real) ───────────
  function buildTable(){
    // 1) Cero (separado, a la izquierda como en ruleta real)
    // El botón del cero ya está en el HTML estático (felt-zero).

    // 2) Grid de números 1-36 (3 filas x 12 columnas)
    const grid = els.tableGrid;
    grid.innerHTML = '';
    // Orden real del tapete: fila superior = 3,6,9...; media = 2,5,8...; inferior = 1,4,7...
    for(let row = 0; row < 3; row++){
      for(let col = 0; col < 12; col++){
        const n = col*3 + (3 - row);
        const btn = document.createElement('button');
        btn.className = 'felt-num ' + colorOf(n);
        btn.type = 'button';
        btn.dataset.bet = 'number:' + n;
        btn.textContent = n;
        grid.appendChild(btn);
      }
    }

    // 3) Columnas 2to1 (a la derecha del grid de números)
    const cols = els.tableColumns;
    cols.innerHTML = '';
    for(let row = 0; row < 3; row++){
      const colBtn = document.createElement('button');
      colBtn.className = 'felt-col';
      colBtn.type = 'button';
      colBtn.dataset.bet = 'col:' + (3 - row);
      colBtn.textContent = '2to1';
      cols.appendChild(colBtn);
    }

    // Listener unificado para números + cero + columnas
    const feltTable = document.querySelector('.felt-table');
    if(feltTable && !feltTable.dataset.boundNums){
      feltTable.addEventListener('click', (e) => {
        const btn = e.target.closest('.felt-num, .felt-zero, .felt-col');
        if(!btn) return;
        toggleBetSelection(btn.dataset.bet, btn);
      });
      feltTable.dataset.boundNums = '1';
    }

    // 4) Docenas (1st 12, 2nd 12, 3rd 12)
    const dozens = els.tableDozens;
    dozens.innerHTML = '';
    [
      { bet:'dozen:1', label:'1st 12', title:'Números 1 – 12' },
      { bet:'dozen:2', label:'2nd 12', title:'Números 13 – 24' },
      { bet:'dozen:3', label:'3rd 12', title:'Números 25 – 36' },
    ].forEach(def => {
      const btn = document.createElement('button');
      btn.className = 'felt-dozen';
      btn.type = 'button';
      btn.dataset.bet = def.bet;
      btn.textContent = def.label;
      if (def.title) btn.title = def.title;
      dozens.appendChild(btn);
    });

    // 5) Apuestas exteriores (1 - 18, Par, Rojo, Negro, Impar, 19 - 36)
    const wrap = els.tableOutside;
    wrap.innerHTML = '';
    const defs = [
      { bet:'half:low', label:'1 - 18' },
      { bet:'parity:even', label:'Par' },
      { bet:'color:red', isRedDiamond: true },
      { bet:'color:black', isBlackDiamond: true },
      { bet:'parity:odd', label:'Impar' },
      { bet:'half:high', label:'19 - 36' },
    ];
    defs.forEach(def => {
      const btn = document.createElement('button');
      btn.className = 'felt-outside';
      btn.type = 'button';
      btn.dataset.bet = def.bet;

      if(def.isRedDiamond){
        // Diamante rojo: relleno oscuro con borde rojo
        btn.innerHTML = '<svg class="felt-diamond-svg" viewBox="0 0 40 30" aria-hidden="true"><polygon points="20,2 38,15 20,28 2,15" fill="#7a0000" stroke="#fff" stroke-width="1.5"/></svg>';
      } else if(def.isBlackDiamond){
        // Diamante negro: relleno negro con borde blanco
        btn.innerHTML = '<svg class="felt-diamond-svg" viewBox="0 0 40 30" aria-hidden="true"><polygon points="20,2 38,15 20,28 2,15" fill="#111" stroke="#fff" stroke-width="1.5"/></svg>';
      } else {
        const label = document.createElement('span');
        label.textContent = def.label;
        btn.appendChild(label);
      }
      wrap.appendChild(btn);
    });

    // Listener unificado para docenas + exteriores
    const feltExtras = document.querySelector('.felt-dozens, .felt-outside');
    const feltWrap = document.querySelector('.felt-table');
    if(feltWrap && !feltWrap.dataset.bound){
      feltWrap.addEventListener('click', (e) => {
        const btn = e.target.closest('.felt-dozen, .felt-outside');
        if(!btn) return;
        toggleBetSelection(btn.dataset.bet, btn);
      });
      feltWrap.dataset.bound = '1';
    }
  }

  function toggleBetSelection(betKey, btnEl){
    // Solo permitir durante betting y si estoy sentado
    if(state.serverState && state.serverState.status !== 'betting'){
      flashStatus('La ronda ya empezó. Espera a la próxima.');
      return;
    }
    if(!state.mySeat){
      flashStatus('Siéntate primero para poder apostar.');
      return;
    }
    // Contar apuestas confirmadas en el servidor + pendientes locales
    const confirmed = (state.mySeat && state.mySeat.bets) || [];
    const maxBets = state.config ? state.config.max_bets_per_round : 3;
    if(confirmed.length + state.pendingBets.length >= maxBets){
      // Verificar si es un toggle-off (quitar selección pendiente local)
      const idx = state.pendingBets.findIndex(b => b.bet_key === betKey);
      if(idx >= 0){
        state.pendingBets.splice(idx, 1);
        btnEl.classList.remove('selected');
        renderMyBets();
        return;
      }
      flashStatus(`Máximo ${maxBets} apuestas por ronda.`);
      return;
    }
    const idx = state.pendingBets.findIndex(b => b.bet_key === betKey);
    if(idx >= 0){
      // Quitar selección existente (solo local — el dinero ya fue debitado si fue enviada)
      state.pendingBets.splice(idx, 1);
      btnEl.classList.remove('selected');
    } else {
      // Verificar si ya existe en confirmadas del servidor
      if(confirmed.some(b => b.bet_key === betKey)){
        flashStatus('Ya apostaste a eso esta ronda.');
        return;
      }
      const newBet = { bet_key: betKey, amount: state.betValue };
      state.pendingBets.push(newBet);
      btnEl.classList.add('selected');
      // Enviar SOLO esta apuesta nueva al servidor (no reenviar todas)
      submitSingleBet(newBet);
    }
    renderMyBets();
  }

  function clearSelectionsUI(){
    document.querySelectorAll('.felt-num.selected, .felt-zero.selected, .felt-col.selected, .felt-dozen.selected, .felt-outside.selected')
      .forEach(b => b.classList.remove('selected'));
  }

  function flashStatus(msg){
    setStatusMessage(msg);
    if(els.statusLine) els.statusLine.style.color = '#ff8a80';
    setTimeout(() => { if(els.statusLine) els.statusLine.style.color = ''; }, 2000);
  }

  // ─────────── Enviar apuestas al servidor ───────────
  let submitQueue = [];
  let submitBusy = false;
  async function processSubmitQueue(){
    if(submitBusy || submitQueue.length === 0) return;
    submitBusy = true;
    const bet = submitQueue.shift();
    const res = await api('/api/casino/bet', 'POST', { bets: [bet] });
    submitBusy = false;
    if(res.error){
      flashStatus(res.error);
      // Si falla, quitar de pendientes locales y de la UI
      const idx = state.pendingBets.findIndex(b => b.bet_key === bet.bet_key);
      if(idx >= 0) state.pendingBets.splice(idx, 1);
      clearSelectionsUI();
      syncSelectionsUI();
      renderMyBets();
    } else {
      // Actualizar saldo local
      if(state.me && typeof res.balance === 'number'){
        updateBalance(res.balance);
      }
      // Quitar de pendientes locales (ya está en el servidor)
      const idx = state.pendingBets.findIndex(b => b.bet_key === bet.bet_key);
      if(idx >= 0) state.pendingBets.splice(idx, 1);
      renderMyBets();
    }
    // Procesar siguiente en cola
    processSubmitQueue();
  }
  function submitSingleBet(bet){
    submitQueue.push(bet);
    processSubmitQueue();
  }

  /** Sincroniza la UI de selecciones con las apuestas confirmadas del servidor */
  function syncSelectionsUI(){
    const confirmed = (state.mySeat && state.mySeat.bets) || [];
    const confirmedKeys = new Set(confirmed.map(b => b.bet_key));
    document.querySelectorAll('.felt-num, .felt-zero, .felt-col, .felt-dozen, .felt-outside').forEach(btn => {
      const key = btn.dataset.bet;
      if(confirmedKeys.has(key)) btn.classList.add('selected');
    });
  }

  async function clearAllBets(){
    if(!state.mySeat) return;
    const res = await api('/api/casino/clear-bets', 'POST');
    if(res.error){ flashStatus(res.error); return; }
    state.pendingBets = [];
    clearSelectionsUI();
    renderMyBets();
    if(typeof res.balance === 'number') updateBalance(res.balance);
    els.readyBtn.classList.remove('active');
    if(els.readyBtnLabel) els.readyBtnLabel.textContent = 'LISTO';
    toast('Apuestas quitadas');
  }

  async function markReady(){
    if(!state.mySeat){ flashStatus('Siéntate primero.'); return; }
    if(!state.mySeat.bets || state.mySeat.bets.length === 0){
      flashStatus('Apuesta algo antes de marcar Listo.');
      return;
    }
    const res = await api('/api/casino/ready', 'POST');
    if(res.error){ flashStatus(res.error); return; }
    els.readyBtn.classList.add('active');
    if(els.readyBtnLabel) els.readyBtnLabel.textContent = '¡LISTO!';
    toast('¡Listo! Esperando a los demás.');
  }

  // ─────────── Asientos ───────────
  async function sitDown(){
    if(!state.me){ showAuth(); return; }
    const res = await api('/api/casino/seat', 'POST', { action: 'sit' });
    if(res.error){ flashStatus(res.error); return; }
    toast('Te has sentado en el asiento ' + res.seat);
    await refreshState();
  }

  async function standUp(){
    if(!state.mySeat) return;
    const res = await api('/api/casino/seat', 'POST', { action: 'stand' });
    if(res.error){ flashStatus(res.error); return; }
    state.pendingBets = [];
    clearSelectionsUI();
    renderMyBets();
    toast('Te has levantado');
    await refreshState();
  }

  // ─────────── Render ───────────
  function updateBalance(newBal){
    if(!state.me) return;
    const old = state.me.balance;
    state.me.balance = newBal;
    const formatted = newBal.toLocaleString('es-VE');
    if(els.balanceValue) els.balanceValue.textContent = formatted;
    if(els.balanceValue){
      if(newBal > old){
        els.balanceValue.classList.remove('balance-down');
        els.balanceValue.classList.add('balance-up');
      } else if(newBal < old){
        els.balanceValue.classList.remove('balance-up');
        els.balanceValue.classList.add('balance-down');
      }
      setTimeout(() => {
        els.balanceValue.classList.remove('balance-up','balance-down');
      }, 1300);
    }
  }

  function getTotalBet(){
    const confirmed = (state.mySeat && state.mySeat.bets) || [];
    return confirmed.reduce((s, b) => s + (Number(b.amount) || 0), 0);
  }

  function updateTotalBet(){
    if(els.totalBetValue) els.totalBetValue.textContent = getTotalBet().toLocaleString('es-VE');
  }

  function renderSeats(){
    const grid = els.seatsGrid;
    if(!grid) return;
    grid.innerHTML = '';
    const maxSeats = state.config ? state.config.max_seats : 5;
    for(let i = 1; i <= maxSeats; i++){
      const seat = state.seats.find(s => s.seat === i);
      const card = document.createElement('div');
      card.className = 'seat-card';
      if(!seat){
        card.classList.add('empty');
        card.innerHTML = '<span class="seat-num">Asiento ' + i + '</span><span class="seat-bet">— Vacío —</span>';
      } else {
        card.classList.add('occupied');
        if(seat.is_me) card.classList.add('mine');
        if(seat.last_result && seat.last_result.won) card.classList.add('winner');
        let resultHtml = '';
        if(seat.last_result){
          const win = seat.last_result.won;
          resultHtml = '<span class="seat-result ' + (win ? 'win' : 'lose') + '">' +
            (win ? '+' + seat.last_result.total_win : '-' + seat.last_result.total_bet) + '</span>';
        }
        const betHtml = seat.has_bet
          ? '<span class="seat-bet has-bet">' + seat.bet_total + ' ₡</span>'
          : '<span class="seat-bet">sin apuesta</span>';
        const readyHtml = seat.ready ? '<span class="seat-ready">✓ LISTO</span>' : '';
        card.innerHTML =
          '<span class="seat-num">Asiento ' + i + '</span>' +
          '<span class="seat-name">' + escapeHtml(seat.name) + '</span>' +
          betHtml + readyHtml + resultHtml;
      }
      grid.appendChild(card);
    }
    // Botones
    if(state.mySeat){
      els.sitBtn.style.display = 'none';
      els.standBtn.style.display = '';
    } else {
      els.sitBtn.style.display = state.me ? '' : 'none';
      els.standBtn.style.display = 'none';
    }
  }

  function renderMyBets(){
    const list = els.myBetsList;
    if(!list) return;
    // Mostrar apuestas confirmadas del servidor + pendientes locales (ambas)
    const confirmed = (state.mySeat && state.mySeat.bets) || [];
    const all = confirmed.concat(state.pendingBets.filter(p => !confirmed.some(c => c.bet_key === p.bet_key)));
    if(all.length === 0){
      list.innerHTML = '<span style="font-size:11px;color:var(--ink-dim);opacity:0.6;">Selecciona en el tablero.</span>';
      return;
    }
    list.innerHTML = all.map(b => {
      const key = b.bet_key;
      const color = key.startsWith('color:') ? key.split(':')[1] : (key.startsWith('number:') ? colorOf(parseInt(key.split(':')[1],10)) : null);
      const swatch = color ? '<span class="swatch ' + (color === 'red' ? 'red' : color === 'black' ? 'black' : 'green') + '"></span>' : '';
      return '<span class="my-bet-chip">' + swatch + escapeHtml(betLabel(key)) + ' · ' + b.amount + '</span>';
    }).join('');
    updateTotalBet();
  }

  function renderChat(){
    const list = els.chatList;
    if(!list) return;
    if(state.chat.length === 0){
      list.innerHTML = '<div class="chat-msg system"><span class="chat-text">Sé el primero en escribir algo…</span></div>';
      return;
    }
    // Últimos 30
    const msgs = state.chat.slice(-30);
    list.innerHTML = msgs.map(m => {
      if(m.system) return '<div class="chat-msg system"><span class="chat-text">' + escapeHtml(m.message) + '</span></div>';
      return '<div class="chat-msg"><span class="chat-name">' + escapeHtml(m.name) + ':</span> <span class="chat-text">' + escapeHtml(m.message) + '</span></div>';
    }).join('');
    list.scrollTop = list.scrollHeight;
  }

  function renderHistory(){
    const strip = els.historyStrip;
    if(!strip) return;
    const items = state.history.slice(0, 10);
    if(items.length === 0){
      strip.innerHTML = '<span class="history-empty">—</span>';
      return;
    }
    let html = items.map(h => {
      const c = h.color || colorOf(h.result);
      return '<span class="hist-chip ' + c + '">' + h.result + '</span>';
    }).join('');
    const pad = 10 - items.length;
    for(let i = 0; i < pad; i++) html += '<span class="hist-chip empty" aria-hidden="true"></span>';
    strip.innerHTML = html;
  }

  function renderTicker(){
    const track = els.tickerTrack;
    if(!track) return;
    const items = [];
    state.history.forEach(h => {
      if(h.winners && h.winners.length){
        h.winners.forEach(w => {
          const wonAmt = w.won || w.amount || w.payout || 0;
          items.push('<span class="ticker-item"><span class="ti-dot"></span><span class="ti-name">' + escapeHtml(w.name) + '</span> ganó +' + wonAmt + ' ₡</span>');
        });
      } else if(h.name && h.amount){
        // Fallback: datos planos en el historial
        items.push('<span class="ticker-item"><span class="ti-dot"></span><span class="ti-name">' + escapeHtml(h.name) + '</span> ganó +' + (h.amount || 0) + ' ₡</span>');
      }
    });
    if(items.length === 0){
      track.innerHTML = '<span class="ticker-item"><span class="ti-name">Sala abierta</span> — Entra y apuesta</span>';
      return;
    }
    track.innerHTML = items.concat(items).join('');
  }

  // ─────────── Timer ───────────
  let timerInterval = null;
  const TIMER_CIRCUMFERENCE = 138.23; // 2 * PI * 22

  function updateTimer(){
    if(!state.serverState || !state.config){
      els.timerCircle.style.display = 'none';
      return;
    }
    const s = state.serverState;
    if(s.status === 'betting'){
      els.timerCircle.style.display = '';
      const remaining = Math.max(0, Math.ceil((s.betting_ends_at - s.server_time) / 1000));
      const total = state.config.betting_duration;
      const ratio = Math.max(0, Math.min(1, remaining / total));
      const fg = els.timerCircle.querySelector('.timer-fg');
      fg.style.strokeDashoffset = String(TIMER_CIRCUMFERENCE * (1 - ratio));
      els.timerText.textContent = remaining;
      els.timerCircle.classList.toggle('urgent', remaining <= 5);
    } else if(s.status === 'spinning'){
      els.timerCircle.style.display = '';
      const remaining = Math.max(0, Math.ceil((s.spinning_ends_at - s.server_time) / 1000));
      els.timerText.textContent = '🎯';
      const fg = els.timerCircle.querySelector('.timer-fg');
      fg.style.strokeDashoffset = '0';
    } else if(s.status === 'result'){
      els.timerCircle.style.display = '';
      const remaining = Math.max(0, Math.ceil((s.result_ends_at - s.server_time) / 1000));
      els.timerText.textContent = remaining;
    } else {
      els.timerCircle.style.display = 'none';
    }
  }

  // ─────────── Resultado ───────────
  function showResult(number, won){
    const c = colorOf(number);
    els.rcNumber.textContent = number;
    els.rcSwatch.className = 'rc-swatch ' + c;
    els.rcStatus.textContent = won ? '¡Ganaste!' : 'Sin premio';
    els.resultCallout.className = 'result-callout show ' + (won ? 'win' : 'lose');
    fanfare(won);
    setTimeout(() => {
      els.resultCallout.classList.remove('show');
    }, 4000);
  }

  // ─────────── Polling ───────────
  async function refreshState(){
    const res = await api('/api/casino/state');
    if(res.error){
      els.statusLine.textContent = 'Error: ' + res.error;
      return;
    }
    applyState(res);
  }

  function applyState(data){
    state.config = data.config;
    state.serverState = data.state;
    state.seats = data.seats;
    state.mySeat = data.my_seat;
    state.chat = data.chat || [];
    state.history = data.history || [];
    if(data.me){
      state.me = data.me;
      if(els.balancePill) els.balancePill.style.display = '';
      updateBalance(data.me.balance);
    } else if(els.balancePill){
      els.balancePill.style.display = '';
      if(els.balanceValue) els.balanceValue.textContent = '—';
    }

    if(data.config){
      if(els.limitMin) els.limitMin.textContent = (data.config.min_bet || 50).toLocaleString('es-VE');
      if(els.limitMax) els.limitMax.textContent = (data.config.max_bet || 1000).toLocaleString('es-VE');
      if(els.limitMaxBets) els.limitMaxBets.textContent = String(data.config.max_bets_per_round || 3);
    }

    renderSeats();
    renderMyBets();
    syncSelectionsUI();
    renderChat();
    renderHistory();
    renderTicker();
    updateTimer();

    // Detección de transición de estado (para animar ruleta)
    const prevStatus = state.lastStatus;
    const prevRound = state.lastRoundId;
    const curStatus = data.state.status;
    const curRound = data.state.round_id;
    const resultNumber = data.state.result_number;
    const resultIndex = data.state.result_index;

    if(curStatus === 'spinning' && prevStatus !== 'spinning'){
      setStatusMessage('NO HAY MÁS APUESTAS');
      clearSelectionsUI();
      state.pendingBets = [];
      if(resultIndex != null && !(typeof CasinoWheel !== 'undefined' && CasinoWheel.isAnimating && CasinoWheel.isAnimating())){
        spinWheelTo(resultIndex, () => {
          // animación completada
        });
      }
    } else if(curStatus === 'result' && prevStatus !== 'result'){
      if(resultNumber != null){
        let myWin = false;
        if(state.mySeat && state.mySeat.last_result){
          myWin = state.mySeat.last_result.won;
        }
        showResult(resultNumber, myWin);
        setStatusMessage('RESULTADO: ' + resultNumber + ' (' + colorOf(resultNumber) + ')' +
          (myWin ? ' — ¡GANASTE!' : ''));
      }
    } else if(curStatus === 'betting' && prevStatus && prevStatus !== 'betting'){
      setStatusMessage('HAGA SUS APUESTAS, POR FAVOR');
      els.readyBtn.classList.remove('active');
      if(els.readyBtnLabel) els.readyBtnLabel.textContent = 'LISTO';
      clearSelectionsUI();
      state.pendingBets = [];
      renderMyBets();
    } else if(curStatus === 'betting'){
      if(!prevStatus) setStatusMessage('HAGA SUS APUESTAS, POR FAVOR');
    } else if(curStatus === 'spinning'){
      setStatusMessage('LA RULETA GIRA…');
    }

    state.lastStatus = curStatus;
    state.lastRoundId = curRound;

    if(state.mySeat){
      els.readyBtn.classList.toggle('active', !!state.mySeat.ready);
      if(els.readyBtnLabel){
        els.readyBtnLabel.textContent = state.mySeat.ready ? '¡LISTO!' : 'LISTO';
      }
    }
    if(els.readyBtn){
      els.readyBtn.disabled = curStatus === 'spinning' || curStatus === 'result';
    }
  }

  function setStatusMessage(msg){
    if(els.statusLine) els.statusLine.textContent = msg;
  }

  function startPolling(){
    stopPolling();
    const tick = async () => {
      await refreshState();
      // Polling más rápido durante spinning/result para UX fluida
      let interval = 1500;
      if(state.serverState){
        if(state.serverState.status === 'spinning') interval = 400;
        else if(state.serverState.status === 'result') interval = 800;
      }
      state.pollTimer = setTimeout(tick, interval);
    };
    tick();
  }

  function stopPolling(){
    if(state.pollTimer){ clearTimeout(state.pollTimer); state.pollTimer = null; }
  }

  // ─────────── Chat ───────────
  async function sendChat(){
    const msg = els.chatInput.value.trim();
    if(!msg) return;
    if(!state.me){ showAuth(); return; }
    els.chatInput.value = '';
    // Optimistic UI: agregar localmente primero
    if(state.me && state.me.name){
      state.chat.push({ name: state.me.name, message: msg, system: false });
      renderChat();
    }
    const res = await api('/api/casino/chat', 'POST', { message: msg });
    if(res.error){
      flashStatus(res.error);
      // Revertir optimistic
      state.chat.pop();
      renderChat();
      els.chatInput.value = msg;
      return;
    }
    // Refrescar para obtener el orden real del servidor
    await refreshState();
  }

  // ─────────── AUTH UI ───────────
  function showAuthMode(mode){
    if(mode === 'login'){
      els.loginPanel.style.display = '';
      els.registerPanel.style.display = 'none';
      els.tabLogin.classList.add('active'); els.tabLogin.setAttribute('aria-selected','true');
      els.tabRegister.classList.remove('active'); els.tabRegister.setAttribute('aria-selected','false');
      els.loginError.textContent = '';
    } else {
      els.loginPanel.style.display = 'none';
      els.registerPanel.style.display = '';
      els.tabLogin.classList.remove('active'); els.tabLogin.setAttribute('aria-selected','false');
      els.tabRegister.classList.add('active'); els.tabRegister.setAttribute('aria-selected','true');
      els.regError.textContent = '';
    }
  }

  function showAuth(){
    els.authOverlay.classList.add('show');
    els.authOverlay.removeAttribute('aria-hidden');
  }
  function hideAuth(){
    els.authOverlay.classList.remove('show');
  }

  async function doLogin(){
    const name = els.loginName.value.trim();
    const pass = els.loginPass.value;
    if(!name || !pass){ els.loginError.textContent = 'Completa todos los campos.'; return; }
    els.loginBtn.disabled = true; els.loginBtn.textContent = '⏳';
    const res = await api('/api/casino/auth/login', 'POST', { name, password: pass });
    els.loginBtn.disabled = false; els.loginBtn.textContent = 'Entrar al Casino';
    if(res.error){ els.loginError.textContent = res.error; return; }
    setToken(res.token);
    applySession(res.user);
  }

  async function doRegister(){
    const name = els.regName.value.trim();
    const pass = els.regPass.value;
    const pass2 = els.regPass2.value;
    if(!name){ els.regError.textContent = 'El nombre no puede estar vacío.'; return; }
    if(name.length < 3){ els.regError.textContent = 'Mínimo 3 caracteres.'; return; }
    if(pass.length < 4){ els.regError.textContent = 'Contraseña mínimo 4 caracteres.'; return; }
    if(pass !== pass2){ els.regError.textContent = 'Las contraseñas no coinciden.'; return; }
    els.registerBtn.disabled = true; els.registerBtn.textContent = '⏳';
    const res = await api('/api/casino/auth/register', 'POST', { name, password: pass });
    els.registerBtn.disabled = false; els.registerBtn.textContent = 'Crear cuenta y entrar';
    if(res.error){ els.regError.textContent = res.error; return; }
    setToken(res.token);
    applySession(res.user);
  }

  function applySession(user){
    hideAuth();
    state.me = user;
    els.sessionPill.style.display = 'flex';
    els.sessionName.textContent = user.name;
    if(els.sessionIcon) els.sessionIcon.textContent = '';
    if(els.sessionAvatar){
      els.sessionAvatar.style.display = '';
      els.sessionAvatar.src = user.avatar_url || 'assets/logo.png';
      els.sessionAvatar.alt = 'Avatar de ' + user.name;
    }
    els.balancePill.style.display = '';
    updateBalance(user.balance);
    // Mostrar tutorial si es primera vez
    let dismissed = false;
    try { dismissed = localStorage.getItem(TUTORIAL_KEY) === '1'; } catch(_){}
    if(!dismissed) setTimeout(openTutorial, 500);
    refreshState();
  }

  async function logout(){
    await api('/api/casino/auth/logout', 'POST');
    setToken(null);
    state.me = null;
    state.mySeat = null;
    state.pendingBets = [];
    els.sessionPill.style.display = 'none';
    els.balancePill.style.display = 'none';
    showAuth();
  }

  function doDiscordAuth(){
    // Redirige al endpoint OAuth del worker; el worker redirige a Discord
    // y Discord devuelve al callback, que a su vez redirige al frontend con ?token=
    const redirectBack = encodeURIComponent(window.location.href.split('?')[0]);
    window.location.href = API_BASE + '/api/casino/auth/discord?redirect=' + redirectBack;
  }

  /** Maneja el retorno del callback de Discord (?token= o ?error=) */
  function handleOAuthCallback(){
    const params = new URLSearchParams(window.location.search);
    const token = params.get('token');
    const error = params.get('error');
    if(token){
      // Limpiar la URL para que no quede el token visible
      window.history.replaceState({}, document.title, window.location.pathname);
      setToken(token);
      api('/api/casino/me').then(res => {
        if(res.user && !res.error){
          applySession(res.user);
        } else {
          setToken(null);
          showAuth();
          setTimeout(() => { if(els.loginError) els.loginError.textContent = 'Error al verificar la sesión de Discord.'; }, 400);
        }
      });
      return true;
    }
    if(error){
      window.history.replaceState({}, document.title, window.location.pathname);
      showAuth();
      const msg = {
        'missing_code': 'Discord no devolvió un código de autorización.',
        'guild_required': 'Debes ser miembro del servidor de Discord de Exilium.',
        'no_guild_token': 'No se pudo verificar tu membresía en Discord.',
        'discord_error': 'Error al comunicarse con Discord. Intenta de nuevo.',
      }[error] || 'Error de autenticación con Discord.';
      setTimeout(() => { if(els.loginError) els.loginError.textContent = msg; }, 400);
      return true;
    }
    return false;
  }

  // ─────────── Tutorial ───────────
  function openTutorial(){ els.tutorialOverlay.classList.add('show'); }
  function closeTutorial(){
    els.tutorialOverlay.classList.remove('show');
    try{ if(els.tutorialDontShow.checked) localStorage.setItem(TUTORIAL_KEY, '1'); }catch(_){}
  }

  // ─────────── Audio ───────────
  let audioCtx = null;
  function ensureAudio(){
    if(!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    return audioCtx;
  }
  function tick(volume){
    if(!state.soundOn) return;
    try{
      const ctx = ensureAudio();
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'square'; osc.frequency.value = 1400;
      gain.gain.value = volume;
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.04);
      osc.connect(gain).connect(ctx.destination);
      osc.start(); osc.stop(ctx.currentTime + 0.05);
    }catch(_){}
  }
  function fanfare(success){
    if(!state.soundOn) return;
    try{
      const ctx = ensureAudio();
      const notes = success ? [523.25,659.25,783.99,1046.5] : [392,329.6];
      notes.forEach((freq, i) => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = success ? 'triangle' : 'sine';
        osc.frequency.value = freq;
        const t0 = ctx.currentTime + i * (success ? 0.11 : 0.16);
        gain.gain.setValueAtTime(0.0001, t0);
        gain.gain.exponentialRampToValueAtTime(success ? 0.18 : 0.12, t0 + 0.02);
        gain.gain.exponentialRampToValueAtTime(0.0001, t0 + (success ? 0.4 : 0.5));
        osc.connect(gain).connect(ctx.destination);
        osc.start(t0); osc.stop(t0 + (success ? 0.45 : 0.55));
      });
    }catch(_){}
  }

  // ─────────── Toast ───────────
  let toastTimer = null;
  function toast(msg){
    let el = document.getElementById('casinoToast');
    if(!el){
      el = document.createElement('div');
      el.id = 'casinoToast';
      el.style.cssText = 'position:fixed;bottom:60px;left:50%;transform:translateX(-50%);background:var(--surface-solid);color:var(--gold-pale);padding:10px 18px;border-radius:8px;border:1px solid var(--border-gold);z-index:200;font-size:12px;box-shadow:var(--shadow-deep);opacity:0;transition:opacity .25s,bottom .25s;pointer-events:none;';
      document.body.appendChild(el);
    }
    el.textContent = msg;
    el.style.opacity = '1';
    el.style.bottom = '70px';
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => { el.style.opacity = '0'; el.style.bottom = '60px'; }, 2500);
  }

  // ─────────── Util ───────────
  function escapeHtml(s){
    return String(s == null ? '' : s)
      .replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')
      .replace(/"/g,'&quot;').replace(/'/g,'&#039;');
  }

  // ─────────── Init ───────────
  function init(){
    cacheEls();
    initWheel();
    buildTable();

    // Fichas
    els.chipsRow.addEventListener('click', (e) => {
      const chip = e.target.closest('.chip');
      if(!chip) return;
      els.chipsRow.querySelectorAll('.chip').forEach(c => { c.classList.remove('active'); c.setAttribute('aria-pressed','false'); });
      chip.classList.add('active'); chip.setAttribute('aria-pressed','true');
      state.betValue = parseInt(chip.dataset.value, 10);
      els.betValue.textContent = state.betValue;
    });

    // Acciones
    els.clearBetBtn.addEventListener('click', clearAllBets);
    els.readyBtn.addEventListener('click', markReady);
    els.sitBtn.addEventListener('click', sitDown);
    els.standBtn.addEventListener('click', standUp);

    // Chat
    els.chatSend.addEventListener('click', sendChat);
    els.chatInput.addEventListener('keydown', (e) => { if(e.key === 'Enter') sendChat(); });

    // Sound
    els.soundToggle.addEventListener('click', () => {
      state.soundOn = !state.soundOn;
      els.soundToggle.setAttribute('aria-pressed', String(state.soundOn));
      els.soundLabel.textContent = state.soundOn ? 'Sonido' : 'Silencio';
    });

    // Alto contraste
    els.hcToggle.addEventListener('click', () => {
      const active = document.body.classList.toggle('high-contrast');
      els.hcToggle.classList.toggle('active', active);
      els.hcToggle.setAttribute('aria-pressed', String(active));
    });

    // Logout
    els.logoutBtn.addEventListener('click', logout);

    // Paneles colapsables
    [['betsHeader','panelBets'],['seatsHeader','panelSeats'],['chatHeader','panelChat']].forEach(([hdr, pnl]) => {
      const h = els[hdr], p = els[pnl];
      if(h && p) h.addEventListener('click', () => p.classList.toggle('collapsed'));
    });

    // Tutorial
    els.helpBtn.addEventListener('click', openTutorial);
    els.tutorialCloseBtn.addEventListener('click', closeTutorial);
    els.tutorialOverlay.addEventListener('click', (e) => { if(e.target === els.tutorialOverlay) closeTutorial(); });
    document.addEventListener('keydown', (e) => {
      if(e.key === 'Escape' && els.tutorialOverlay.classList.contains('show')) closeTutorial();
    });

    // Auth
    els.tabLogin.addEventListener('click', () => showAuthMode('login'));
    els.tabRegister.addEventListener('click', () => showAuthMode('register'));
    els.switchToRegister.addEventListener('click', () => showAuthMode('register'));
    els.switchToLogin.addEventListener('click', () => showAuthMode('login'));
    els.loginBtn.addEventListener('click', doLogin);
    els.registerBtn.addEventListener('click', doRegister);
    els.loginPass.addEventListener('keydown', (e) => { if(e.key === 'Enter') doLogin(); });
    els.regPass2.addEventListener('keydown', (e) => { if(e.key === 'Enter') doRegister(); });

    // Discord OAuth
    if(els.discordLoginBtn) els.discordLoginBtn.addEventListener('click', doDiscordAuth);
    if(els.discordRegisterBtn) els.discordRegisterBtn.addEventListener('click', doDiscordAuth);

    // Botones cerrar modales
    if(els.authCloseBtn) els.authCloseBtn.addEventListener('click', hideAuth);
    if(els.dashboardCloseBtn) els.dashboardCloseBtn.addEventListener('click', () => {
      const overlay = document.getElementById('dashboardOverlay');
      if(overlay) overlay.classList.remove('show');
    });
    if(els.dashboardBtn) els.dashboardBtn.addEventListener('click', () => {
      const overlay = document.getElementById('dashboardOverlay');
      if(overlay) overlay.classList.add('show');
    });

    // Manejar callback OAuth (Discord devuelve ?token= o ?error=)
    const handledOAuth = handleOAuthCallback();

    // Verificar sesión existente
    if(!handledOAuth){
      if(state.token){
        // Validar con /me
        api('/api/casino/me').then(res => {
          if(res.user && !res.error){
            applySession(res.user);
          } else {
            setToken(null);
            showAuth();
          }
        });
      } else {
        showAuth();
      }
    }

    // Iniciar polling SIEMPRE (para ver la sala aunque no estés logueado)
    startPolling();

    // Refrescar sesión al volver el tab al primer plano
    document.addEventListener('visibilitychange', () => {
      if(!document.hidden) refreshState();
    });
  }

  if(document.readyState === 'loading'){
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
