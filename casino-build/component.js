
const API='https://exilium-blizzard.mitzumitzukyhs.workers.dev';
const EURO=[0,32,15,19,4,21,2,25,17,34,6,27,13,36,11,30,8,23,10,5,24,16,33,1,20,14,31,9,22,18,29,7,28,12,35,3,26];
const RED=new Set([1,3,5,7,9,12,14,16,18,19,21,23,25,27,30,32,34,36]);
function colorOf(n){ return n===0?'green':(RED.has(n)?'red':'black'); }
function numBg(n){ if(n===0) return 'linear-gradient(150deg,#2f9c63,#155a34)'; return RED.has(n)?'linear-gradient(150deg,#b51a1a,#7a0606)':'linear-gradient(150deg,#26211d,#100c0a)'; }
function histBg(n){ if(n===0) return 'linear-gradient(150deg,#2f9c63,#155a34)'; return RED.has(n)?'linear-gradient(150deg,#c2362f,#8b0000)':'linear-gradient(150deg,#2a2422,#15110f)'; }
function fmt(n){ return Number(n||0).toLocaleString('es'); }
// Color determinista por nombre para el chat / asientos (no tenemos clase WoW del server)
const NAME_PALETTE=['#F58CBA','#3FC7EB','#C69B6D','#AAD372','#8788EE','#F0EBE0','#FFF468','#FF7C0A','#0070DD','#f0a52e'];
function nameColor(name){ let h=0; const s=String(name||''); for(let i=0;i<s.length;i++) h=(h*31+s.charCodeAt(i))>>>0; return NAME_PALETTE[h%NAME_PALETTE.length]; }

// ── Mapeo de claves de apuesta: UI (diseño) ↔ backend ──
// UI usa: red,black,even,odd,low,high,dozen:N,col:N,number:N
// Backend usa: color:red,color:black,parity:even,parity:odd,half:low,half:high,dozen:N,col:N,number:N
function keyToServer(k){
  if(k==='red'||k==='black') return 'color:'+k;
  if(k==='even'||k==='odd') return 'parity:'+k;
  if(k==='low'||k==='high') return 'half:'+k;
  return k; // dozen:N, col:N, number:N pasan igual
}
function keyFromServer(k){
  if(k.startsWith('color:')) return k.split(':')[1];
  if(k.startsWith('parity:')) return k.split(':')[1];
  if(k.startsWith('half:')) return k.split(':')[1];
  return k;
}

function token(){ try{ return localStorage.getItem('exi_tk')||''; }catch(e){ return ''; } }
function myName(){ try{ return localStorage.getItem('exi_nm')||'Tú'; }catch(e){ return 'Tú'; } }

class Component extends DCLogic {
  state = {
    // ── servidor ──
    connected: false,
    loggedIn: !!token(),
    balance: null,
    status: 'connecting',         // connecting | betting | spinning | result
    roundId: 0,
    cfg: { min_bet:50, max_bet:1000, max_seats:5, max_bets_per_round:3 },
    serverSeats: [],              // asientos públicos (longitud max_seats)
    mySeat: null,                 // {seat, bets:[{bet_key,amount}], ready}
    chat: [],
    history: [5,17,32,0,19,26,3,11,8,21],
    resultNumber: null,
    resultIndex: null,
    countdown: 0,                 // segundos restantes en la fase (reloj local)
    // ── UI local ──
    chip: 50,
    pendingBets: {},              // apuestas locales sin confirmar (clave diseño → monto)
    wheelDeg: 0,
    result: null,                 // callout de resultado
    stats: { wins:0, losses:0, net:0 },
    statusLine: 'Conectando con la mesa de Quel’Thalas…',
  };

  chatRef = React.createRef();
  chatInputRef = React.createRef();

  // ── ciclo de vida ──
  componentDidMount(){
    this._offset = 0;            // server_time - Date.now()
    this._spunRound = null;      // ronda ya animada
    this._resolvedRound = null;  // ronda ya contabilizada en stats
    this._busy = false;
    this.poll(true);
    this._clk = setInterval(()=>this.tickClock(), 250);
    this._vis = ()=>{ if(!document.hidden){ this.poll(true); } };
    document.addEventListener('visibilitychange', this._vis);
    window.addEventListener('storage', ()=>{ this.setState({ loggedIn: !!token() }); });
    this.scrollChat();
  }
  componentWillUnmount(){
    clearTimeout(this._pt); clearInterval(this._clk);
    document.removeEventListener('visibilitychange', this._vis);
  }

  // ── API ──
  async api(path, opts){
    opts=opts||{};
    const headers=Object.assign({}, opts.headers||{});
    const tk=token();
    if(tk) headers['Authorization']='Bearer '+tk;
    if(opts.body) headers['Content-Type']='application/json';
    const res=await fetch(API+path, { method:opts.method||'GET', headers, body:opts.body?JSON.stringify(opts.body):undefined });
    let data=null; try{ data=await res.json(); }catch(e){}
    if(res.status===401){ // token inválido/expirado
      try{ localStorage.removeItem('exi_tk'); }catch(e){}
      this.setState({ loggedIn:false });
    }
    return { ok:res.ok, status:res.status, data:data||{} };
  }

  // ── Polling adaptativo + pausa en pestaña oculta (KV-friendly) ──
  pollInterval(){
    const s=this.state.status;
    if(s==='spinning') return 1200;
    if(s==='result') return 1500;
    return 2600; // betting / connecting — el countdown se calcula localmente
  }
  schedule(){
    clearTimeout(this._pt);
    if(document.hidden) return; // no pollear oculto; visibilitychange reanuda
    this._pt=setTimeout(()=>this.poll(false), this.pollInterval());
  }
  async poll(immediate){
    if(document.hidden && !immediate){ this.schedule(); return; }
    try{
      const r=await this.api('/api/casino/state');
      if(r.ok && r.data && r.data.ok){ this.applyState(r.data); }
      else { this.setState({ connected:false }); }
    }catch(e){ this.setState({ connected:false }); }
    this.schedule();
  }

  applyState(d){
    const st=d.state||{};
    this._offset=(st.server_time||Date.now())-Date.now();
    const cfg=d.config||this.state.cfg;
    const seats=Array.isArray(d.seats)?d.seats:[];
    const history=(Array.isArray(d.history)?d.history:[]).map(h=>(typeof h==='number'?h:h.result));
    const me=d.me||null;
    const mySeat=d.my_seat||null;

    // animación de rueda al pasar a spinning (una vez por ronda)
    if(st.status==='spinning' && st.result_index!=null && this._spunRound!==st.round_id){
      this._spunRound=st.round_id;
      this.animateWheel(st.result_index);
    }
    // contabilizar stats al resolver (una vez por ronda)
    if(st.status==='result' && mySeat && mySeat.last_result && this._resolvedRound!==st.round_id){
      this._resolvedRound=st.round_id;
      const lr=mySeat.last_result;
      const net=(lr.total_win||0)-(lr.total_bet||0);
      const stats={ wins:this.state.stats.wins+(lr.won?1:0), losses:this.state.stats.losses+(lr.won?0:1), net:this.state.stats.net+net };
      this.setState({ stats });
    }

    // callout de resultado
    let result=null;
    if((st.status==='result'||st.status==='spinning') && st.result_number!=null){
      const n=st.result_number, col=colorOf(n);
      const lr=mySeat&&mySeat.last_result;
      const isWin=lr&&lr.won;
      const sw= col==='green'?'#2f9c63':(col==='red'?'#b51a1a':'#1d1816');
      result={ n, color:col, win:!!isWin,
        status: lr?(isWin?'¡Victoria!':'La casa gana'):'Resultado',
        statusColor: lr?(isWin?'#54d18a':'#e9d4a0'):'#e9d4a0',
        border: isWin?'#2f9c63':'rgba(240,165,46,.5)',
        glow: isWin?'0 0 30px rgba(47,156,99,.55)':'0 0 22px rgba(240,165,46,.35)',
        sw,
        detail: lr?(isWin?('+'+fmt(lr.total_win-lr.total_bet)+' C'):('−'+fmt(lr.total_bet)+' C')):('Salió el '+n),
      };
    }

    // ends_at de la fase actual para el reloj local (countdown)
    if(st.status==='betting') this._endsAt=st.betting_ends_at;
    else if(st.status==='spinning') this._endsAt=st.spinning_ends_at;
    else if(st.status==='result') this._endsAt=st.result_ends_at;
    else this._endsAt=null;

    // limpiar apuestas locales pendientes al salir de betting
    let pendingBets=this.state.pendingBets;
    if(st.status!=='betting') pendingBets={};

    // ajustar ficha seleccionada si quedó fuera de los límites de la config
    let chip=this.state.chip;
    if(chip<cfg.min_bet || chip>cfg.max_bet){
      const opts=this.chipValuesFor(cfg);
      chip=opts[Math.min(1,opts.length-1)]||cfg.min_bet;
    }

    this.setState({
      connected:true,
      loggedIn:!!token(),
      balance: me?me.balance:null,
      status: st.status,
      roundId: st.round_id,
      cfg,
      chip,
      serverSeats: seats,
      mySeat,
      chat: Array.isArray(d.chat)?d.chat:[],
      history: history.length?history:this.state.history,
      resultNumber: st.result_number,
      resultIndex: st.result_index,
      result,
      pendingBets,
      statusLine: this.buildStatusLine(st.status, mySeat),
    });
    this.scrollChat();
  }

  chipValuesFor(cfg){
    const {min_bet,max_bet}=cfg;
    const cand=[10,25,50,100,200,500,1000].filter(v=>v>=min_bet && v<=max_bet);
    if(cand.length===0) return [min_bet, Math.round((min_bet+max_bet)/2), max_bet];
    if(cand.length<=3) return cand;
    return [cand[0], cand[Math.floor(cand.length/2)], cand[cand.length-1]];
  }
  chipValues(){ return this.chipValuesFor(this.state.cfg); }

  tickClock(){
    const now=Date.now()+(this._offset||0);
    const cd=this._endsAt!=null?Math.max(0, Math.ceil((this._endsAt-now)/1000)):0;
    if(cd!==this.state.countdown) this.setState({ countdown: cd });
  }

  buildStatusLine(status, mySeat){
    if(!token()) return 'Entra con Discord para sentarte y apostar.';
    if(status==='spinning') return 'La rueda gira… que la suerte arcana te acompañe.';
    if(status==='result') return 'Resultado en la mesa. Nueva ronda en breve…';
    if(status==='betting'){
      if(!mySeat) return 'Siéntate en la mesa para unirte a la ronda.';
      if(mySeat.ready) return 'Listo ✓ — esperando a la mesa…';
      if(mySeat.bets&&mySeat.bets.length) return 'Apuesta confirmada. Pulsa LISTO o añade más fichas.';
      return 'Coloca tu ficha y apuesta en el tablero.';
    }
    return 'Conectando…';
  }

  flash(msg){ this.setState({ statusLine:msg }); }

  // ── selección de ficha y apuestas locales ──
  selectChip(v){ this.setState({ chip:v }); }

  mergedBets(){
    const m={};
    const ms=this.state.mySeat;
    if(ms&&Array.isArray(ms.bets)){ for(const b of ms.bets){ const k=keyFromServer(b.bet_key||b.key); m[k]=(m[k]||0)+(Number(b.amount)||0); } }
    for(const k in this.state.pendingBets){ m[k]=(m[k]||0)+this.state.pendingBets[k]; }
    return m;
  }

  placeBet(key){
    if(!token()){ this.flash('Entra con Discord para apostar.'); return; }
    if(this.state.status!=='betting'){ this.flash('Solo puedes apostar en la fase de apuestas.'); return; }
    if(!this.state.mySeat){ this.flash('Siéntate primero (botón bajo la ruleta).'); return; }
    if(this.state.mySeat.ready){ this.flash('Ya marcaste LISTO. Limpia para cambiar tu apuesta.'); return; }
    const {min_bet,max_bet,max_bets_per_round}=this.state.cfg;
    const merged=this.mergedBets();
    const pending={ ...this.state.pendingBets };
    const newAmt=(merged[key]||0)+this.state.chip;
    if(newAmt>max_bet){ this.flash('Máximo '+max_bet+' por apuesta.'); return; }
    const distinct=new Set(Object.keys(merged)); distinct.add(key);
    if(distinct.size>max_bets_per_round){ this.flash('Máximo '+max_bets_per_round+' apuestas por ronda.'); return; }
    const totalPending=Object.values(pending).reduce((a,b)=>a+b,0)+this.state.chip;
    if(this.state.balance!=null && totalPending>this.state.balance){ this.flash('No tienes PandaCoins suficientes.'); return; }
    pending[key]=(pending[key]||0)+this.state.chip;
    this.setState({ pendingBets:pending, result:null });
  }

  half(){
    if(this.state.status!=='betting') return;
    const pending={}; for(const k in this.state.pendingBets){ const v=Math.round(this.state.pendingBets[k]/2); if(v>0) pending[k]=v; }
    this.setState({ pendingBets:pending });
  }
  double(){
    if(this.state.status!=='betting') return;
    const {max_bet}=this.state.cfg; const merged=this.mergedBets();
    const pending={}; for(const k in this.state.pendingBets){ const committed=(merged[k]||0)-this.state.pendingBets[k]; pending[k]=Math.min(this.state.pendingBets[k]*2, max_bet-committed); }
    this.setState({ pendingBets:pending });
  }
  async clear(){
    if(this.state.status!=='betting') return;
    this.setState({ pendingBets:{} });
    const ms=this.state.mySeat;
    if(ms && ms.bets && ms.bets.length){
      const r=await this.api('/api/casino/clear-bets',{ method:'POST' });
      if(r.ok) this.poll(true); else this.flash((r.data&&r.data.error)||'No se pudo limpiar.');
    }
  }

  totalBet(){ const m=this.mergedBets(); let t=0; for(const k in m) t+=m[k]; return t; }

  // ── botón LISTO: confirma apuestas pendientes + marca ready ──
  async spin(){
    if(this._busy) return;
    if(!token()){ this.flash('Entra con Discord para jugar.'); return; }
    if(this.state.status!=='betting'){ this.flash('Espera a la siguiente ronda.'); return; }
    if(!this.state.mySeat){ this.flash('Siéntate primero para apostar.'); return; }
    const pend=this.state.pendingBets;
    const keys=Object.keys(pend);
    const committed=(this.state.mySeat.bets||[]).length;
    if(keys.length===0 && committed===0){ this.flash('Coloca una apuesta en el tablero primero.'); return; }
    this._busy=true;
    try{
      if(keys.length>0){
        const bets=keys.map(k=>({ bet_key:keyToServer(k), amount:pend[k] }));
        const rb=await this.api('/api/casino/bet',{ method:'POST', body:{ bets } });
        if(!rb.ok){ this.flash((rb.data&&rb.data.error)||'No se pudo apostar.'); this._busy=false; return; }
        this.setState({ pendingBets:{}, balance: rb.data.balance!=null?rb.data.balance:this.state.balance });
      }
      const rr=await this.api('/api/casino/ready',{ method:'POST' });
      if(!rr.ok){ this.flash((rr.data&&rr.data.error)||'No se pudo marcar listo.'); }
    } finally { this._busy=false; this.poll(true); }
  }

  // ── sentarse / levantarse ──
  async toggleSeat(){
    if(this._busy) return;
    if(!token()){ this.flash('Entra con Discord para sentarte.'); return; }
    const action=this.state.mySeat?'stand':'sit';
    this._busy=true;
    try{
      const r=await this.api('/api/casino/seat',{ method:'POST', body:{ action } });
      if(!r.ok) this.flash((r.data&&r.data.error)||'No se pudo cambiar de asiento.');
    } finally { this._busy=false; this.poll(true); }
  }

  // ── chat ──
  async sendChat(){
    const el=this.chatInputRef.current; if(!el) return;
    const text=el.value.trim(); if(!text) return;
    if(!token()){ this.flash('Entra con Discord para chatear.'); return; }
    el.value='';
    const r=await this.api('/api/casino/chat',{ method:'POST', body:{ message:text } });
    if(!r.ok){ this.flash((r.data&&r.data.error)||'No se pudo enviar el mensaje.'); return; }
    this.poll(true);
  }
  onChatKey(e){ if(e.key==='Enter'){ e.preventDefault(); this.sendChat(); } }
  scrollChat(){ requestAnimationFrame(()=>{ const el=this.chatRef.current; if(el) el.scrollTop=el.scrollHeight; }); }

  // ── rueda ──
  animateWheel(idx){
    const step=360/37;
    const cur=this.state.wheelDeg;
    const base=cur-(cur%360);
    const target=base+360*6+((360-idx*step)%360);
    this.setState({ wheelDeg:target });
  }
  buildWheel(){
    const cx=100, cy=100, rOut=99, rIn=60, rT=80, step=360/37, els=[];
    EURO.forEach((num,k)=>{
      const a0=(k*step-step/2-90)*Math.PI/180;
      const a1=(k*step+step/2-90)*Math.PI/180;
      const x0o=cx+rOut*Math.cos(a0), y0o=cy+rOut*Math.sin(a0);
      const x1o=cx+rOut*Math.cos(a1), y1o=cy+rOut*Math.sin(a1);
      const x1i=cx+rIn*Math.cos(a1), y1i=cy+rIn*Math.sin(a1);
      const x0i=cx+rIn*Math.cos(a0), y0i=cy+rIn*Math.sin(a0);
      const d=`M${x0o.toFixed(2)},${y0o.toFixed(2)} A${rOut},${rOut} 0 0 1 ${x1o.toFixed(2)},${y1o.toFixed(2)} L${x1i.toFixed(2)},${y1i.toFixed(2)} A${rIn},${rIn} 0 0 0 ${x0i.toFixed(2)},${y0i.toFixed(2)} Z`;
      const fill=num===0?'#1f7d4d':(RED.has(num)?'#9e1414':'#1a1614');
      els.push(React.createElement('path',{ key:'s'+k, d, fill, stroke:'#0a0a0c', strokeWidth:0.6 }));
      const am=(k*step-90)*Math.PI/180;
      const tx=cx+rT*Math.cos(am), ty=cy+rT*Math.sin(am);
      els.push(React.createElement('text',{ key:'t'+k, x:tx, y:ty, fill:'#f3ead6', fontSize:8, fontWeight:700, textAnchor:'middle', dominantBaseline:'central', fontFamily:'Cinzel, serif', transform:`rotate(${(k*step).toFixed(2)},${tx.toFixed(2)},${ty.toFixed(2)})` }, String(num)));
    });
    els.push(React.createElement('circle',{ key:'ic', cx, cy, r:rIn, fill:'none', stroke:'#caa15a', strokeWidth:1.2, opacity:0.5 }));
    els.push(React.createElement('circle',{ key:'oc', cx, cy, r:rOut, fill:'none', stroke:'#caa15a', strokeWidth:1, opacity:0.4 }));
    return React.createElement('svg',{ viewBox:'0 0 200 200', width:'100%', height:'100%', style:{ display:'block' } }, els);
  }

  labelFor(key){
    const [type,val]=key.split(':');
    if(type==='number') return 'Pleno '+val;
    if(key==='red') return 'Rojo'; if(key==='black') return 'Negro';
    if(key==='even') return 'Par'; if(key==='odd') return 'Impar';
    if(key==='low') return '1–18'; if(key==='high') return '19–36';
    if(type==='dozen') return val+'ª docena';
    if(type==='col') return 'Columna '+val;
    return key;
  }

  renderVals(){
    const p=this.props;
    const showDragons=p.showDragons??true;
    const feltStyle=p.feltStyle??'arcane';
    const highContrast=p.highContrast??true;
    const feltBg=feltStyle==='emerald'
      ? 'radial-gradient(ellipse at 50% 30%, rgba(31,125,77,.4), rgba(8,40,24,.92)), #082818'
      : 'linear-gradient(180deg, rgba(20,14,10,.92), rgba(10,7,6,.95))';
    const cellBorder=highContrast?'1.5px solid rgba(240,165,46,.5)':'1px solid rgba(255,255,255,.1)';

    // guardar ends_at para el reloj local
    // (se setea en applyState vía this._endsAt)
    const s=this.state;
    const bets=this.mergedBets();
    const sel=s.chip;
    const {min_bet,max_bet,max_seats}=s.cfg;

    const chipDefs=[
      { edgeBg:'repeating-conic-gradient(#fff 0 7deg, #caa15a 7deg 30deg)', face:'radial-gradient(circle at 35% 30%, #f1d79a, #a87623)', text:'#3a2808' },
      { edgeBg:'repeating-conic-gradient(#f3ead6 0 7deg, #b51a1a 7deg 30deg)', face:'radial-gradient(circle at 35% 30%, #d94b4b, #7a0d0d)', text:'#ffe9e0' },
      { edgeBg:'repeating-conic-gradient(#f0a52e 0 7deg, #1a1a1f 7deg 30deg)', face:'radial-gradient(circle at 35% 30%, #34343c, #0c0c10)', text:'#f0c56b' },
    ];
    const chipVals=this.chipValues();
    const chips=chipVals.map((value,i)=>{
      const c=chipDefs[i%chipDefs.length];
      return { value, edgeBg:c.edgeBg, face:c.face, text:c.text,
        scale: sel===value?'translateY(-3px) scale(1.07)':'translateY(0) scale(1)',
        glow: sel===value?'0 0 0 2px #f0a52e, 0 0 18px rgba(240,165,46,.6),':'',
        select:()=>this.selectChip(value) };
    });

    const board=[];
    for(let j=1;j<=12;j++){
      [ {n:3*j,row:1}, {n:3*j-1,row:2}, {n:3*j-2,row:3} ].forEach(t=>{
        const key='number:'+t.n;
        board.push({ n:t.n, col:j+1, row:t.row, bg:numBg(t.n), key, has:!!bets[key], amt:bets[key]||0, place:()=>this.placeBet(key) });
      });
    }
    const zeroBet={ has:!!bets['number:0'], amt:bets['number:0']||0 };
    const betZero=()=>this.placeBet('number:0');
    const columns=[ {row:1,key:'col:3'}, {row:2,key:'col:2'}, {row:3,key:'col:1'} ].map(c=>({ row:c.row, key:c.key, has:!!bets[c.key], amt:bets[c.key]||0, place:()=>this.placeBet(c.key) }));
    const dozens=[ {key:'dozen:1',label:'1ª 1–12'}, {key:'dozen:2',label:'2ª 13–24'}, {key:'dozen:3',label:'3ª 25–36'} ].map(d=>({ label:d.label, key:d.key, has:!!bets[d.key], amt:bets[d.key]||0, place:()=>this.placeBet(d.key) }));
    const outDefs=[
      {key:'low',label:'1–18'}, {key:'even',label:'PAR'},
      {key:'red',label:'ROJO',swatch:true,swColor:'#b51a1a',bg:'rgba(139,0,0,.22)'},
      {key:'black',label:'NEGRO',swatch:true,swColor:'#1d1816',bg:'rgba(0,0,0,.4)'},
      {key:'odd',label:'IMPAR'}, {key:'high',label:'19–36'},
    ];
    const outside=outDefs.map(o=>({ label:o.label, key:o.key, swatch:!!o.swatch, swColor:o.swColor||'#000', bg:o.bg||'rgba(0,0,0,.24)', has:!!bets[o.key], amt:bets[o.key]||0, place:()=>this.placeBet(o.key) }));

    const keys=Object.keys(bets);
    let selectionText='Ninguna';
    if(keys.length===1) selectionText=this.labelFor(keys[0]);
    else if(keys.length>1) selectionText=keys.length+' apuestas';

    // asientos: server → vista (longitud max_seats)
    const seats=[];
    for(let i=0;i<max_seats;i++){
      const sv=s.serverSeats[i];
      if(!sv || !sv.name){
        seats.push({ avBg:'rgba(240,165,46,.15)', txtColor:'#6e5d3f', ring:'2px dashed rgba(240,165,46,.3)', glow:'0 3px 9px rgba(0,0,0,.5)', name:'Libre', sub:'Asiento '+(i+1), initial:'+', nameColor:'#6e5d3f', subColor:'#5a4c34' });
      } else {
        const cc=nameColor(sv.name); const me=!!sv.is_me;
        seats.push({ name:sv.name, sub: me?'Tú':(sv.ready?'Listo ✓':(sv.has_bet?'Apostando…':'En mesa')),
          initial:sv.name[0].toUpperCase(),
          avBg:cc, txtColor:'#0a0a0c',
          ring: me?'3px solid #f7c168':'2px solid rgba(240,165,46,.5)',
          glow: me?'0 0 0 3px rgba(240,165,46,.4), 0 0 16px rgba(240,165,46,.55), 0 4px 12px rgba(0,0,0,.6)':'0 3px 9px rgba(0,0,0,.6)',
          nameColor: me?'#f0a52e':'#e9d4a0',
          subColor: sv.ready?'#54d18a':'#9c8156' });
      }
    }
    const occupied=s.serverSeats.filter(x=>x&&x.name).length;

    // chat: server → vista
    const chat=(s.chat||[]).map(m=>{
      const ts=m.ts?new Date(m.ts).toLocaleTimeString('es',{hour:'2-digit',minute:'2-digit'}):'';
      if(m.system) return { system:true, ts, text:m.message||m.text };
      return { user:true, ts, name:m.name, color:nameColor(m.name), text:m.message||m.text };
    });

    const stats=s.stats;
    const netColor=stats.net>0?'#54d18a':(stats.net<0?'#cf6a64':'#e9d4a0');
    const netFmt=(stats.net>0?'+':(stats.net<0?'−':'±'))+fmt(Math.abs(stats.net));

    // etiqueta del botón LISTO segun contexto
    let readyLabel='LISTO · Apostar', spinDisabled=false;
    if(!s.loggedIn){ readyLabel='Entra con Discord'; spinDisabled=true; }
    else if(s.status==='spinning'){ readyLabel='Girando…'; spinDisabled=true; }
    else if(s.status==='result'){ readyLabel='Ronda en curso'; spinDisabled=true; }
    else if(!s.mySeat){ readyLabel='Siéntate primero'; spinDisabled=true; }
    else if(s.mySeat.ready){ readyLabel='Listo ✓'; spinDisabled=true; }

    const cd=s.countdown||0;
    let statusLine=s.statusLine;
    if(s.status==='betting' && s.mySeat && cd>0) statusLine=statusLine+'  ('+cd+'s)';

    return {
      balanceFmt: s.balance==null?'—':fmt(s.balance),
      minBet:min_bet, maxBet:max_bet,
      history: (s.history||[]).map(n=>({ n, bg:histBg(n) })),
      showDragons, feltBg, cellBorder,
      chips,
      board, zeroBet, betZero, columns, dozens, outside,
      totalBet: fmt(this.totalBet()),
      betCount: keys.length,
      selectionText,
      spin:()=>this.spin(), half:()=>this.half(), double:()=>this.double(), clear:()=>this.clear(),
      spinDisabled,
      readyLabel,
      readyOpacity: spinDisabled?0.6:1,
      wheel: this.buildWheel(),
      wheelDeg: s.wheelDeg,
      result: s.result,
      statusLine,
      seats,
      seatBtnLabel: s.mySeat?'Levantarse':'Sentarse',
      toggleSeat:()=>this.toggleSeat(),
      chat,
      onlineCount: occupied,
      chatRef:this.chatRef, chatInputRef:this.chatInputRef,
      sendChat:()=>this.sendChat(), onChatKey:(e)=>this.onChatKey(e),
      stats:{ wins:stats.wins, losses:stats.losses, netColor, netFmt },
    };
  }
}
