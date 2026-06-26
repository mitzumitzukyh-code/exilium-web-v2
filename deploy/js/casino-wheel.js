// casino-wheel.js — Ruleta europea Canvas 2D
// IIFE clásico que expone window.CasinoWheel con el mismo contrato que antes:
//   init(containerId) / spinTo(resultIndex, durationMs, onComplete)
//   startIdle / stopIdle / resize / isAnimating / getWheelAngle / WHEEL_SEQUENCE

(function (global) {
  'use strict';

  // ─────────── Secuencia europea (debe coincidir con worker/casino.js) ───────────
  const WHEEL_SEQUENCE = [
    0, 32, 15, 19, 4, 21, 2, 25, 17, 34, 6, 27, 13, 36, 11, 30, 8, 23, 10, 5,
    24, 16, 33, 1, 20, 14, 31, 9, 22, 18, 29, 7, 28, 12, 35, 3, 26
  ];
  const RED_NUMS = new Set([1, 3, 5, 7, 9, 12, 14, 16, 18, 19, 21, 23, 25, 27, 30, 32, 34, 36]);
  const SEG_COUNT = WHEEL_SEQUENCE.length; // 37
  const SEG_ANGLE = (Math.PI * 2) / SEG_COUNT;

  // ─────────── Estado ───────────
  let container  = null;
  let canvas     = null;
  let ctx        = null;
  let fallback   = null;
  let ready      = false;
  let rafId      = null;
  let animating  = false;
  let idleActive = true;

  let wheelAngle  = 0;      // ángulo de rotación actual de la rueda (rad)
  let ballAngle   = 0;      // ángulo de la bola en el espacio global (rad)
  let ballRadius  = 0;      // radio actual de la bola
  let ballVisible = false;

  let pendingSpin = null;   // { resultIndex, durationMs, onComplete }
  let currentDPR  = 1;

  // ─────────── Utilidades ───────────
  function colorOf(n) {
    if (n === 0) return 'green';
    return RED_NUMS.has(n) ? 'red' : 'black';
  }

  function easeOut3(t) { return 1 - Math.pow(1 - t, 3); }
  function easeOut5(t) { return 1 - Math.pow(1 - t, 5); }

  // ─────────── Render principal ───────────
  function drawFrame() {
    if (!ctx || !canvas || canvas.width <= 0 || canvas.height <= 0) return;

    const dpr = currentDPR;
    // Trabajamos en coordenadas lógicas (pixels CSS)
    const W  = canvas.width  / dpr;
    const H  = canvas.height / dpr;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, W, H);

    const cx     = W / 2;
    const cy     = H / 2;
    const radius = Math.min(cx, cy);

    // Radios
    const R_OUTER  = radius * 0.96;  // borde exterior del aro de madera
    const R_TRACK  = radius * 0.86;  // pista de la bola
    const R_SEG    = radius * 0.84;  // borde exterior de los sectores
    const R_IN     = radius * 0.30;  // cubo interior (hub)
    const R_NUM    = radius * 0.68;  // centro de los números
    const R_FRET   = radius * 0.82;  // radio exterior de las cuñas doradas

    // ── Sombra exterior ──
    ctx.save();
    ctx.beginPath();
    ctx.arc(cx, cy + radius * 0.02, R_OUTER, 0, Math.PI * 2);
    ctx.shadowColor  = 'rgba(0,0,0,0.85)';
    ctx.shadowBlur   = 28;
    ctx.shadowOffsetY = 8;
    ctx.fillStyle    = '#1a0f06';
    ctx.fill();
    ctx.restore();

    // ── Aro de madera / latón ──
    const woodGrad = ctx.createRadialGradient(cx, cy, R_SEG, cx, cy, R_OUTER);
    woodGrad.addColorStop(0,    '#3a1e08');
    woodGrad.addColorStop(0.25, '#6b3810');
    woodGrad.addColorStop(0.55, '#c49636');
    woodGrad.addColorStop(0.75, '#a07225');
    woodGrad.addColorStop(1,    '#2a1406');
    ctx.beginPath();
    ctx.arc(cx, cy, R_OUTER, 0, Math.PI * 2);
    ctx.fillStyle = woodGrad;
    ctx.fill();

    // Líneas decorativas en el aro (conic effect)
    for (let i = 0; i < 12; i++) {
      const a = (i / 12) * Math.PI * 2;
      const x1 = cx + Math.cos(a) * R_SEG;
      const y1 = cy + Math.sin(a) * R_SEG;
      const x2 = cx + Math.cos(a) * R_OUTER;
      const y2 = cy + Math.sin(a) * R_OUTER;
      ctx.beginPath();
      ctx.moveTo(x1, y1);
      ctx.lineTo(x2, y2);
      ctx.strokeStyle = 'rgba(212,175,55,0.25)';
      ctx.lineWidth   = 0.5;
      ctx.stroke();
    }

    // ── Sectores de la ruleta ──
    ctx.save();
    ctx.translate(cx, cy);
    // El sector 0 de la secuencia apunta arriba (−π/2)
    ctx.rotate(wheelAngle - Math.PI / 2);

    for (let i = 0; i < SEG_COUNT; i++) {
      const n  = WHEEL_SEQUENCE[i];
      const c  = colorOf(n);
      const a0 = i * SEG_ANGLE - SEG_ANGLE / 2;
      const a1 = i * SEG_ANGLE + SEG_ANGLE / 2;

      // Relleno del sector
      ctx.beginPath();
      ctx.moveTo(0, 0);
      ctx.arc(0, 0, R_SEG, a0, a1);
      ctx.closePath();
      if (c === 'red')        ctx.fillStyle = '#9a1818';
      else if (c === 'green') ctx.fillStyle = '#155c2e';
      else                    ctx.fillStyle = '#0e0e0e';
      ctx.fill();

      // Borde dorado entre sectores
      ctx.beginPath();
      ctx.moveTo(Math.cos(a0) * R_IN, Math.sin(a0) * R_IN);
      ctx.lineTo(Math.cos(a0) * R_FRET, Math.sin(a0) * R_FRET);
      ctx.strokeStyle = 'rgba(200,155,40,0.6)';
      ctx.lineWidth   = 0.9;
      ctx.stroke();

      // Cuña de latón en el borde exterior
      ctx.beginPath();
      ctx.arc(0, 0, R_FRET, a0, a1);
      ctx.arc(0, 0, R_SEG,  a1, a0, true);
      ctx.closePath();
      ctx.fillStyle = 'rgba(180,135,30,0.18)';
      ctx.fill();

      // Número del bolsillo
      const midA = i * SEG_ANGLE;
      const tx   = Math.cos(midA) * R_NUM;
      const ty   = Math.sin(midA) * R_NUM;
      ctx.save();
      ctx.translate(tx, ty);
      ctx.rotate(midA + Math.PI / 2);
      ctx.fillStyle    = '#f0e3c4';
      ctx.shadowColor  = 'rgba(0,0,0,0.9)';
      ctx.shadowBlur   = 3;
      const fs = Math.max(8, Math.floor(radius * 0.058));
      ctx.font         = `700 ${fs}px 'Cinzel',Arial,sans-serif`;
      ctx.textAlign    = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(String(n), 0, 0);
      ctx.shadowBlur = 0;
      ctx.restore();
    }
    ctx.restore(); // fin rotación sectores

    // ── Aro de latón (borde de la pista) ──
    ctx.beginPath();
    ctx.arc(cx, cy, R_TRACK, 0, Math.PI * 2);
    ctx.strokeStyle = 'rgba(212,175,55,0.7)';
    ctx.lineWidth   = 3;
    ctx.stroke();

    // Diamantes deflectores (8 puntos dorados en la pista)
    for (let i = 0; i < 8; i++) {
      const da = (i / 8) * Math.PI * 2;
      const dx = cx + Math.cos(da) * (R_TRACK + (R_OUTER - R_TRACK) * 0.42);
      const dy = cy + Math.sin(da) * (R_TRACK + (R_OUTER - R_TRACK) * 0.42);
      ctx.beginPath();
      ctx.arc(dx, dy, radius * 0.022, 0, Math.PI * 2);
      const dg = ctx.createRadialGradient(dx, dy, 0, dx, dy, radius * 0.022);
      dg.addColorStop(0, '#f3cf72');
      dg.addColorStop(1, '#8a5c10');
      ctx.fillStyle = dg;
      ctx.fill();
    }

    // ── Hub central (cubo interior) ──
    const hubGrad = ctx.createRadialGradient(
      cx - R_IN * 0.2, cy - R_IN * 0.2, 1,
      cx, cy, R_IN
    );
    hubGrad.addColorStop(0, '#3a2310');
    hubGrad.addColorStop(1, '#070503');
    ctx.beginPath();
    ctx.arc(cx, cy, R_IN, 0, Math.PI * 2);
    ctx.fillStyle = hubGrad;
    ctx.fill();
    ctx.strokeStyle = 'rgba(212,175,55,0.55)';
    ctx.lineWidth   = 2.5;
    ctx.stroke();

    // Torreta (cono dorado central)
    const tR     = R_IN * 0.35;
    const tGrad  = ctx.createRadialGradient(cx - tR * 0.3, cy - tR * 0.3, 0, cx, cy, tR);
    tGrad.addColorStop(0, '#f3cf72');
    tGrad.addColorStop(0.5,'#c9a030');
    tGrad.addColorStop(1, '#7a5510');
    ctx.beginPath();
    ctx.arc(cx, cy, tR, 0, Math.PI * 2);
    ctx.fillStyle = tGrad;
    ctx.fill();
    ctx.strokeStyle = 'rgba(255,255,255,0.15)';
    ctx.lineWidth   = 1;
    ctx.stroke();

    // ── Puntero (marcador en la parte superior) ──
    const ptrSize  = radius * 0.055;
    const ptrTipY  = cy - R_OUTER + radius * 0.012;
    const ptrBaseY = cy - R_TRACK  + radius * 0.008;
    ctx.beginPath();
    ctx.moveTo(cx, ptrTipY);
    ctx.lineTo(cx - ptrSize, ptrBaseY);
    ctx.lineTo(cx + ptrSize, ptrBaseY);
    ctx.closePath();
    ctx.fillStyle   = '#f3cf72';
    ctx.shadowColor = 'rgba(243,207,114,0.7)';
    ctx.shadowBlur  = 10;
    ctx.fill();
    ctx.shadowBlur  = 0;

    // ── Bola de la ruleta ──
    if (ballVisible && ballRadius > 0) {
      const bSize = Math.max(5, radius * 0.030);
      const bx    = cx + Math.cos(ballAngle) * ballRadius;
      const by    = cy + Math.sin(ballAngle) * ballRadius;
      ctx.beginPath();
      ctx.arc(bx, by, bSize, 0, Math.PI * 2);
      const bGrad = ctx.createRadialGradient(
        bx - bSize * 0.3, by - bSize * 0.3, 0,
        bx, by, bSize
      );
      bGrad.addColorStop(0,   '#ffffff');
      bGrad.addColorStop(0.4, '#ddd4be');
      bGrad.addColorStop(1,   '#8a7850');
      ctx.fillStyle   = bGrad;
      ctx.shadowColor = 'rgba(0,0,0,0.5)';
      ctx.shadowBlur  = 5;
      ctx.fill();
      ctx.shadowBlur  = 0;
      ctx.strokeStyle = 'rgba(80,60,20,0.5)';
      ctx.lineWidth   = 0.5;
      ctx.stroke();
    }
  }

  // ─────────── Resize ───────────
  function resize() {
    if (!container || !canvas) return;
    const rect = container.getBoundingClientRect();
    currentDPR  = Math.min(window.devicePixelRatio || 1, 2);
    const w     = Math.max(64, Math.round(rect.width));
    const h     = Math.max(64, Math.round(rect.height));
    canvas.width  = Math.round(w * currentDPR);
    canvas.height = Math.round(h * currentDPR);
    canvas.style.width  = w + 'px';
    canvas.style.height = h + 'px';
  }

  // ─────────── Loop de render ───────────
  function startLoop() {
    if (rafId) cancelAnimationFrame(rafId);
    function tick() {
      rafId = requestAnimationFrame(tick);
      if (idleActive && !animating) {
        wheelAngle += 0.0028; // rotación idle lenta (~0.16°/frame a 60fps)
      }
      drawFrame();
    }
    rafId = requestAnimationFrame(tick);
  }

  function stopLoop() {
    if (rafId) cancelAnimationFrame(rafId);
    rafId = null;
  }

  function startIdle() { idleActive = true; }
  function stopIdle()  { idleActive = false; }

  // ─────────── Spin ───────────
  function spinTo(resultIndex, durationMs, onComplete) {
    if (!ready) {
      pendingSpin = { resultIndex, durationMs, onComplete };
      return;
    }
    if (animating) return;
    animating    = true;
    ballVisible  = false;
    stopIdle();

    const total = durationMs || 5200;
    const radius = Math.min(canvas.width, canvas.height) / (2 * currentDPR);

    const R_TRACK  = radius * 0.86;
    const R_IN     = radius * 0.30;
    const ballStartR = R_TRACK * 0.97;
    const ballEndR   = R_IN   + (R_TRACK - R_IN) * 0.44; // radio del bolsillo

    const EXTRA_TURNS = 5;

    // La rueda necesita rotar para que el bolsillo `resultIndex` quede bajo el puntero (arriba).
    // En drawFrame: sector i apunta arriba cuando wheelAngle - π/2 + i*SEG_ANGLE = -π/2
    // => wheelAngle = -i * SEG_ANGLE (mod 2π)
    let targetWheelAngle = -(resultIndex * SEG_ANGLE);
    while (targetWheelAngle <= wheelAngle + EXTRA_TURNS * Math.PI * 2) {
      targetWheelAngle += Math.PI * 2;
    }

    const startWheelAngle = wheelAngle;
    let   ballA           = Math.random() * Math.PI * 2;
    ballAngle  = ballA;
    ballRadius = ballStartR;

    let t0 = null;
    function tick(ts) {
      if (!t0) t0 = ts;
      const elapsed = ts - t0;
      const p       = Math.min(1, elapsed / total);

      // Rueda: aceleración / desaceleración suave
      const eWheel = easeOut5(p);
      wheelAngle = startWheelAngle + (targetWheelAngle - startWheelAngle) * eWheel;

      // Bola: tres fases
      if (p < 0.60) {
        // Fase 1 — bola gira rápido en sentido contrario por la pista exterior
        const speed = (1 - p / 0.60) * 0.14 + 0.012;
        ballA      -= speed;
        ballAngle   = ballA;
        ballRadius  = ballStartR;
      } else if (p < 0.82) {
        // Fase 2 — espiral hacia adentro
        const lp   = (p - 0.60) / 0.22;
        const eIn  = easeOut3(lp);
        ballRadius = ballStartR + (ballEndR - ballStartR) * eIn;
        const speed = (1 - lp) * 0.04 + 0.004;
        ballA      -= speed;
        ballAngle   = ballA;
      } else {
        // Fase 3 — encajada en el bolsillo (sigue al eje rotado de la rueda)
        const lp  = (p - 0.82) / 0.18;
        // Posición angular del bolsillo en el mundo: wheelAngle - π/2 + resultIndex*SEG_ANGLE
        const pocketA = wheelAngle - Math.PI / 2 + resultIndex * SEG_ANGLE;
        let delta     = pocketA - ballA;
        while (delta >  Math.PI) delta -= Math.PI * 2;
        while (delta < -Math.PI) delta += Math.PI * 2;
        ballA     += delta * Math.min(1, lp * 3.5);
        ballAngle  = ballA;
        ballRadius = ballEndR;
      }

      if (p >= 1) {
        // Snap final exacto
        ballAngle  = targetWheelAngle - Math.PI / 2 + resultIndex * SEG_ANGLE;
        ballRadius = ballEndR;
        animating  = false;
        startIdle();
        if (onComplete) onComplete(WHEEL_SEQUENCE[resultIndex]);
        return;
      }
      requestAnimationFrame(tick);
    }
    requestAnimationFrame(tick);
  }

  // ─────────── Init (público) ───────────
  function init(containerId) {
    container = document.getElementById(containerId);
    if (!container) return false;

    // Buscar o crear el canvas
    canvas = container.querySelector('#wheel-canvas');
    fallback = container.querySelector('#bowlFallback');

    if (!canvas) {
      canvas = document.createElement('canvas');
      canvas.id = 'wheel-canvas';
      container.style.position = 'relative';
      container.appendChild(canvas);
    }

    canvas.style.cssText = 'position:absolute;inset:0;width:100%;height:100%;display:block;border-radius:50%;';

    ctx = canvas.getContext('2d', { alpha: true });
    if (!ctx) {
      if (fallback) fallback.style.display = '';
      return true;
    }

    if (fallback) fallback.style.display = 'none';

    // Dimensionar con pequeño delay para que el layout esté listo
    setTimeout(() => {
      resize();
      ready = true;
      startLoop();
      idleActive = true;

      if (pendingSpin) {
        const p = pendingSpin; pendingSpin = null;
        setTimeout(() => spinTo(p.resultIndex, p.durationMs, p.onComplete), 80);
      }
    }, 60);

    window.addEventListener('resize', () => {
      resize();
    });

    return true;
  }

  // ─────────── API pública ───────────
  global.CasinoWheel = {
    init,
    spinTo,
    startIdle,
    stopIdle,
    resize,
    isAnimating: ()   => animating,
    getWheelAngle: () => wheelAngle,
    WHEEL_SEQUENCE
  };

})(window);
