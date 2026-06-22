// deploy/js/casino.js
// Sala de PandaCoins — Frontend multijugador con polling.
// v5.0 — Mobile-first, 1 giro compartido, 5 asientos, chat, ruleta animada.

(function(){
  "use strict";

  const API_BASE = 'https://exilium-blizzard.mitzumitzukyhs.workers.dev';
  const TOKEN_KEY = 'exilium_casino_token';
  const TUTORIAL_KEY = 'exilium_casino_tutorial_dismissed';

  // Secuencia europea (debe coincidir con el servidor)
  const WHEEL_SEQUENCE = [0,32,15,19,4,21,2,25,17,34,6,27,13,36,11,30,8,23,10,5,24,16,33,1,20,14,31,9,22,18,29,7,28,12,35,3,26];
  const RED_NUMBERS = new Set([1,3,5,7,9,12,14,16,18,19,21,23,25,27,30,32,34,36]);

  function colorOf(n){
    if(n === 0) return 'green';
    return RED_NUMBERS.has(n) ? 'red' : 'black';
  }

  const BET_LABELS = {
    'color:red':'Rojo','color:black':'Negro',
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
      'balancePill','balanceValue','sessionPill','sessionName','logoutBtn','hcToggle',
      'timerCircle','timerText','statusLine','historyStrip',
      'resultCallout','rcStatus','rcNumber','rcSwatch',
      'wheelGroup','ballGroup','dragonGuardLeft','dragonGuardRight',
      'chipsRow','betValue','tableGrid','tableOutside','myBetsList',
      'clearBetBtn','readyBtn','soundToggle','soundLabel',
      'seatsGrid','sitBtn','standBtn','seatsHelp',
      'chatList','chatInput','chatSend',
      'helpBtn','tutorialOverlay','tutorialCloseBtn','tutorialDontShow',
      'authOverlay','loginPanel','registerPanel','tabLogin','tabRegister',
      'loginName','loginPass','loginError','loginBtn',
      'regName','regPass','regPass2','regError','registerBtn',
      'switchToRegister','switchToLogin',
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

  // ─────────── Construir ruleta SVG ───────────
  const CX = 200, CY = 200, R_OUT = 188, R_NUM = 158, R_IN = 96;
  const segAngle = 360 / WHEEL_SEQUENCE.length;
  const svgns = 'http://www.w3.org/2000/svg';

  function polar(cx, cy, r, deg){
    const a = (deg - 90) * Math.PI / 180;
    return [cx + r*Math.cos(a), cy + r*Math.sin(a)];
  }

  function buildWheel(){
    const g = els.wheelGroup;
    if(!g) return;
    g.innerHTML = '';
    WHEEL_SEQUENCE.forEach((num, i) => {
      const startAngle = i * segAngle;
      const endAngle = startAngle + segAngle;
      const [x1,y1] = polar(CX,CY,R_OUT,startAngle);
      const [x2,y2] = polar(CX,CY,R_OUT,endAngle);
      const [x3,y3] = polar(CX,CY,R_IN,endAngle);
      const [x4,y4] = polar(CX,CY,R_IN,startAngle);
      const path = document.createElementNS(svgns,'path');
      path.setAttribute('d', `M ${x1} ${y1} A ${R_OUT} ${R_OUT} 0 0 1 ${x2} ${y2} L ${x3} ${y3} A ${R_IN} ${R_IN} 0 0 0 ${x4} ${y4} Z`);
      const c = colorOf(num);
      const fill = c === 'red' ? '#8b1a1a' : c === 'green' ? '#1f6b45' : '#15110f';
      path.setAttribute('fill', fill);
      path.setAttribute('stroke', 'rgba(212,175,55,0.25)');
      path.setAttribute('stroke-width', '0.6');
      g.appendChild(path);

      const midAngle = startAngle + segAngle/2;
      const [tx,ty] = polar(CX, CY, R_NUM, midAngle);
      const text = document.createElementNS(svgns,'text');
      text.setAttribute('x', tx); text.setAttribute('y', ty);
      text.setAttribute('fill', '#f0e3c4');
      text.setAttribute('font-family', "'Cinzel', serif");
      text.setAttribute('font-weight', '700');
      text.setAttribute('font-size', '12.5');
      text.setAttribute('text-anchor', 'middle');
      text.setAttribute('dominant-baseline', 'middle');
      text.setAttribute('transform', `rotate(${midAngle}, ${tx}, ${ty})`);
      text.textContent = num;
      g.appendChild(text);
    });
    // anillo divisorio
    const innerCircle = document.createElementNS(svgns,'circle');
    innerCircle.setAttribute('cx', CX); innerCircle.setAttribute('cy', CY);
    innerCircle.setAttribute('r', R_IN);
    innerCircle.setAttribute('fill', 'none');
    innerCircle.setAttribute('stroke', 'rgba(212,175,55,0.3)');
    innerCircle.setAttribute('stroke-width', '1');
    g.appendChild(innerCircle);
  }

  // ─────────── Construir tablero ───────────
  function buildTable(){
    const grid = els.tableGrid;
    grid.innerHTML = '';

    const zero = document.createElement('button');
    zero.className = 'table-zero';
    zero.type = 'button';
    zero.dataset.bet = 'number:0';
    zero.textContent = '0';
    grid.appendChild(zero);

    for(let row = 0; row < 3; row++){
      for(let col = 0; col < 12; col++){
        const n = col*3 + (3 - row);
        const btn = document.createElement('button');
        btn.className = 'table-num ' + colorOf(n);
        btn.type = 'button';
        btn.style.gridColumn = String(col + 2);
        btn.style.gridRow = String(row + 1);
        btn.dataset.bet = 'number:' + n;
        btn.textContent = n;
        grid.appendChild(btn);
      }
    }

    for(let row = 0; row < 3; row++){
      const colBtn = document.createElement('button');
      colBtn.className = 'table-col-btn';
      colBtn.type = 'button';
      colBtn.style.gridColumn = '14';
      colBtn.style.gridRow = String(row + 1);
      colBtn.dataset.bet = 'col:' + (3 - row);
      colBtn.textContent = '2:1';
      grid.appendChild(colBtn);
    }

    grid.addEventListener('click', (e) => {
      const btn = e.target.closest('.table-num, .table-zero, .table-col-btn');
      if(!btn) return;
      toggleBetSelection(btn.dataset.bet, btn);
    });

    // Exteriores
    const wrap = els.tableOutside;
    wrap.innerHTML = '';
    const spacer = document.createElement('div');
    spacer.className = 'outside-spacer';
    wrap.appendChild(spacer);

    const defs = [
      { bet:'dozen:1', label:'1ª' },
      { bet:'dozen:2', label:'2ª' },
      { bet:'dozen:3', label:'3ª' },
      { bet:'half:low', label:'1-18' },
      { bet:'parity:even', label:'Par' },
      { bet:'color:red', label:'R', swatch:'red' },
      { bet:'color:black', label:'N', swatch:'black' },
      { bet:'parity:odd', label:'Impar' },
      { bet:'half:high', label:'19-36' },
    ];

    defs.forEach(def => {
      const btn = document.createElement('button');
      btn.className = 'outside-btn';
      btn.type = 'button';
      btn.dataset.bet = def.bet;
      if(def.swatch){
        const sw = document.createElement('span');
        sw.className = 'swatch ' + def.swatch;
        btn.appendChild(sw);
      }
      const label = document.createElement('span');
      label.textContent = def.label;
      btn.appendChild(label);
      wrap.appendChild(btn);
    });

    wrap.addEventListener('click', (e) => {
      const btn = e.target.closest('.outside-btn');
      if(!btn) return;
      toggleBetSelection(btn.dataset.bet, btn);
    });
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
    const maxBets = state.config ? state.config.max_bets_per_round : 3;
    const idx = state.pendingBets.findIndex(b => b.bet_key === betKey);
    if(idx >= 0){
      // Quitar selección existente
      state.pendingBets.splice(idx, 1);
      btnEl.classList.remove('selected');
    } else {
      if(state.pendingBets.length >= maxBets){
        flashStatus(`Máximo ${maxBets} apuestas por ronda.`);
        return;
      }
      state.pendingBets.push({ bet_key: betKey, amount: state.betValue });
      btnEl.classList.add('selected');
    }
    renderMyBets();
    // Confirmar inmediatamente con el servidor (apuesta en vivo)
    submitBetsToServer();
  }

  function clearSelectionsUI(){
    document.querySelectorAll('.table-num.selected, .table-zero.selected, .table-col-btn.selected, .outside-btn.selected')
      .forEach(b => b.classList.remove('selected'));
  }

  function flashStatus(msg){
    els.statusLine.textContent = msg;
    els.statusLine.style.color = 'var(--blood-bright)';
    setTimeout(() => { els.statusLine.style.color = ''; }, 2000);
  }

  // ─────────── Enviar apuestas al servidor ───────────
  let submitInFlight = false;
  async function submitBetsToServer(){
    if(submitInFlight) return;
    if(!state.mySeat || state.pendingBets.length === 0) return;
    submitInFlight = true;
    const betsToSend = [...state.pendingBets];
    const res = await api('/api/casino/bet', 'POST', { bets: betsToSend });
    submitInFlight = false;
    if(res.error){
      flashStatus(res.error);
      // Si falla (ej. saldo insuficiente), revertir selecciones locales
      state.pendingBets = [];
      clearSelectionsUI();
      renderMyBets();
      return;
    }
    // Actualizar saldo local
    if(state.me && typeof res.balance === 'number'){
      updateBalance(res.balance);
    }
    // El servidor confirma las apuestas; mantenemos las locales como espejo
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
    els.readyBtn.textContent = '✓ Listo!';
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
    els.balanceValue.textContent = newBal.toLocaleString('es-VE');
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
    // Mostrar las apuestas confirmadas del servidor (mySeat.bets) + pendientes locales
    const confirmed = (state.mySeat && state.mySeat.bets) || [];
    const all = confirmed.length > 0 ? confirmed : state.pendingBets;
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
    if(state.history.length === 0){
      strip.innerHTML = '<span class="history-empty">Aún no hay tiradas.</span>';
      return;
    }
    strip.innerHTML = state.history.slice(0, 12).map(h => {
      const c = h.color || colorOf(h.result);
      return '<span class="hist-chip ' + c + '">' + h.result + '</span>';
    }).join('');
  }

  function renderTicker(){
    const track = els.tickerTrack;
    if(!track) return;
    // Generar items desde el historial de rondas (ganadores)
    const items = [];
    state.history.forEach(h => {
      if(h.winners && h.winners.length){
        h.winners.forEach(w => {
          items.push('<span class="ticker-item"><span class="ti-dot"></span><span class="ti-name">' + escapeHtml(w.name) + '</span> ganó +' + w.won + ' ₡</span>');
        });
      }
    });
    if(items.length === 0){
      track.innerHTML = '<span class="ticker-item"><span class="ti-name">Sala abierta</span> — Entra y apuesta</span>';
      return;
    }
    // Duplicar para loop infinito
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

  // ─────────── Animación de giro de ruleta ───────────
  let currentWheelAngle = 0;
  let spinningNow = false;

  function spinWheelTo(resultIndex, callback){
    if(spinningNow) return;
    spinningNow = true;

    // Calcular ángulo objetivo (igual que la versión anterior)
    const segCenter = resultIndex * segAngle + segAngle/2;
    const targetMod = ((360 - segCenter) % 360 + 360) % 360;
    const idleMod = ((currentWheelAngle % 360) + 360) % 360;
    let deltaToTarget = targetMod - idleMod;
    if(deltaToTarget < 0) deltaToTarget += 360;

    const extraTurns = 6 + Math.floor(Math.random() * 3);
    const wheelFinalAngle = currentWheelAngle + extraTurns * 360 + deltaToTarget;

    const ballExtraTurns = 9 + Math.floor(Math.random() * 3);
    const ballFinalAngle = ballExtraTurns * 360;

    const duration = state.config ? state.config.spinning_duration * 1000 : 4000;

    // Tick sounds
    let tickCount = 0;
    const tickInterval = setInterval(() => {
      tick(0.05);
      tickCount++;
      if(tickCount > 14) clearInterval(tickInterval);
    }, 90);

    requestAnimationFrame(() => {
      els.wheelGroup.style.transition = 'transform ' + (duration/1000) + 's cubic-bezier(0.12, 0.7, 0.18, 1)';
      els.wheelGroup.style.transform = 'rotate(' + wheelFinalAngle + 'deg)';
      els.ballGroup.style.transition = 'transform ' + (duration/1000 + 0.4) + 's cubic-bezier(0.1, 0.4, 0.15, 1)';
      els.ballGroup.style.transform = 'rotate(' + ballFinalAngle + 'deg)';
    });

    setTimeout(() => {
      clearInterval(tickInterval);
      tick(0.08);
      currentWheelAngle = wheelFinalAngle % 360;
      spinningNow = false;
      if(callback) callback();
    }, duration + 200);
  }

  // ─────────── Resultado ───────────
  function showResult(number, won){
    const c = colorOf(number);
    els.rcNumber.textContent = number;
    els.rcSwatch.className = 'rc-swatch ' + c;
    els.rcStatus.textContent = won ? '¡Ganaste!' : 'Sin premio';
    els.resultCallout.className = 'result-callout show ' + (won ? 'win' : 'lose');
    els.dragonGuardLeft && els.dragonGuardLeft.classList.toggle('is-win', won);
    els.dragonGuardRight && els.dragonGuardRight.classList.toggle('is-win', won);
    fanfare(won);
    setTimeout(() => {
      els.resultCallout.classList.remove('show');
      els.dragonGuardLeft && els.dragonGuardLeft.classList.remove('is-win');
      els.dragonGuardRight && els.dragonGuardRight.classList.remove('is-win');
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
      els.balancePill.style.display = '';
      els.balanceValue.textContent = data.me.balance.toLocaleString('es-VE');
    }

    renderSeats();
    renderMyBets();
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
      // Inició el giro → animar
      els.statusLine.innerHTML = 'La rueda <strong>acelera</strong>…';
      // Limpiar selecciones UI
      clearSelectionsUI();
      state.pendingBets = [];
      // Animar
      if(resultIndex != null){
        spinWheelTo(resultIndex);
      }
    } else if(curStatus === 'result' && prevStatus !== 'result'){
      // Resultado disponible
      if(resultNumber != null){
        // ¿Gané yo?
        let myWin = false;
        if(state.mySeat && state.mySeat.last_result){
          myWin = state.mySeat.last_result.won;
        }
        showResult(resultNumber, myWin);
        const c = colorOf(resultNumber);
        els.statusLine.innerHTML = '<strong>' + resultNumber + '</strong> (' + c + '). ' +
          (myWin ? '¡Ganaste!' : 'Sin premio esta vez.');
      }
    } else if(curStatus === 'betting' && prevStatus && prevStatus !== 'betting'){
      // Nueva ronda
      els.statusLine.innerHTML = 'Nueva ronda #' + curRound + '. ¡Elige tu apuesta!';
      els.readyBtn.classList.remove('active');
      els.readyBtn.textContent = '✓ Listo';
      clearSelectionsUI();
      state.pendingBets = [];
      renderMyBets();
    } else if(curStatus === 'betting'){
      // Mensaje genérico
      if(!prevStatus){
        els.statusLine.innerHTML = 'Ronda #' + curRound + '. Elige ficha y apuesta.';
      }
    }

    state.lastStatus = curStatus;
    state.lastRoundId = curRound;

    // Botón ready según mySeat
    if(state.mySeat){
      els.readyBtn.classList.toggle('active', !!state.mySeat.ready);
      els.readyBtn.textContent = state.mySeat.ready ? '✓ Listo!' : '✓ Listo';
    }
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
    const res = await api('/api/casino/chat', 'POST', { message: msg });
    if(res.error){
      flashStatus(res.error);
      els.chatInput.value = msg; // restaurar
      return;
    }
    // Refrescar inmediatamente para ver nuestro mensaje
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
    els.balancePill.style.display = '';
    updateBalance(user.balance);
    // Mostrar tutorial si es primera vez
    let dismissed = false;
    try { dismissed = localStorage.getItem(TUTORIAL_KEY) === '1'; } catch(_){}
    if(!dismissed) setTimeout(openTutorial, 500);
    refreshState();
  }

  function logout(){
    api('/api/casino/auth/logout', 'POST');
    setToken(null);
    state.me = null;
    state.mySeat = null;
    state.pendingBets = [];
    els.sessionPill.style.display = 'none';
    els.balancePill.style.display = 'none';
    showAuth();
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
    buildWheel();
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

    // Verificar sesión existente
    if(state.token){
      // Validar con /me
      api('/api/casino/me').then(res => {
        if(res.ok){
          applySession(res.user);
        } else {
          setToken(null);
          showAuth();
        }
      });
    } else {
      showAuth();
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
