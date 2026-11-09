// ============================================================
//  js/rbg.js — Liga RBG (inscripción + roster)
//  Sesión: reutiliza el token Discord del casino (exi_tk).
//  API: /api/rbg/* (worker/rbg-league.js)
//  Iconos: assets físicos en assets/rbg/ (specs/clases/roles de
//  Blizzard + banderas PNG — nada de emojis, Windows no los pinta).
// ============================================================
(function () {
  'use strict';

  const API = 'https://api.guild-exilium.com';

  // ── Sesión (mismo esquema que el casino) ────────────────────
  // El callback de Discord vuelve con ?token=&name=&avatar= (o en el hash)
  (function captureToken() {
    try {
      const q = new URLSearchParams(location.search);
      const hp = new URLSearchParams((location.hash || '').replace(/^#/, ''));
      const t = hp.get('token') || q.get('token');
      if (t) {
        localStorage.setItem('exi_tk', t);
        localStorage.setItem('exi_nm', hp.get('name') || q.get('name') || '');
        localStorage.setItem('exi_av', hp.get('avatar') || q.get('avatar') || '');
        history.replaceState({}, '', location.pathname);
      }
    } catch (e) {}
  })();

  function token() { try { return localStorage.getItem('exi_tk') || ''; } catch (e) { return ''; } }
  function myName() { try { return localStorage.getItem('exi_nm') || ''; } catch (e) { return ''; } }
  function myAvatar() { try { return localStorage.getItem('exi_av') || ''; } catch (e) { return ''; } }

  async function api(path, opts) {
    opts = opts || {};
    opts.headers = Object.assign({}, opts.headers);
    if (token()) opts.headers['Authorization'] = 'Bearer ' + token();
    if (opts.body && typeof opts.body !== 'string') {
      opts.body = JSON.stringify(opts.body);
      opts.headers['Content-Type'] = 'application/json';
    }
    const res = await fetch(API + path, opts);
    if (res.status === 401) {
      try { localStorage.removeItem('exi_tk'); } catch (e) {}
    }
    const data = await res.json().catch(() => ({ error: 'Respuesta inválida del servidor' }));
    if (!res.ok && !data.error) data.error = 'Error ' + res.status;
    return data;
  }

  // ── Helpers de render ───────────────────────────────────────
  function esc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  const COUNTRY_NAMES = {
    VE: 'Venezuela', MX: 'México', AR: 'Argentina', CL: 'Chile', PE: 'Perú',
    CO: 'Colombia', EC: 'Ecuador', BO: 'Bolivia', UY: 'Uruguay', PY: 'Paraguay',
    BR: 'Brasil', DO: 'Rep. Dominicana', CR: 'Costa Rica', PA: 'Panamá',
    GT: 'Guatemala', HN: 'Honduras', SV: 'El Salvador', NI: 'Nicaragua',
    CU: 'Cuba', PR: 'Puerto Rico', HT: 'Haití', ES: 'España',
    US: 'Estados Unidos', CA: 'Canadá', OTRO: 'Otro',
  };

  // Banderas físicas (assets/rbg/flags/*.png); OTRO usa la de la ONU
  function flagImg(cc, w) {
    const file = (!cc || cc === 'OTRO') ? 'un' : cc.toLowerCase();
    return '<img class="rbg-flag-img" src="assets/rbg/flags/' + file + '.png" alt="' +
      esc(COUNTRY_NAMES[cc] || cc || '') + '" title="' + esc(COUNTRY_NAMES[cc] || cc || '') +
      '"' + (w ? ' style="width:' + w + 'px"' : '') + ' loading="lazy">';
  }

  // Mismo mapa que DECO_CLASS del casino (solo name_effect aplica acá)
  const NE_CLASS = { name_gold: 'ne-gold', name_fire: 'ne-fire', name_rainbow: 'ne-rainbow' };

  const ROLE_LABEL = { tank: 'Tanque', healer: 'Healer', dps: 'DPS' };
  // Iconos de rol oficiales de Blizzard (escudo/cruz/espada)
  const ROLE_FILE = { tank: 'tank', healer: 'heal', dps: 'dps' };

  function roleImg(role, size) {
    const s = size || 18;
    return '<img class="rbg-role-ico" src="assets/rbg/roles/' + (ROLE_FILE[role] || 'dps') +
      '.webp" alt="' + esc(ROLE_LABEL[role] || role) + '" title="' + esc(ROLE_LABEL[role] || role) +
      '" style="width:' + s + 'px;height:' + s + 'px" loading="lazy">';
  }

  // Icono de clase (logo oficial). El id de spec codifica la clase en el prefijo.
  const CLASS_FILE = { dk: 'deathknight', dh: 'demonhunter' };
  function classFileOf(specId) {
    const prefix = String(specId).split('_')[0];
    return CLASS_FILE[prefix] || prefix;
  }
  function classImg(specId, size) {
    const s = size || 20;
    return '<img class="rbg-class-ico" src="assets/rbg/classes/' + classFileOf(specId) +
      '.jpg" alt="" style="width:' + s + 'px;height:' + s + 'px" loading="lazy">';
  }

  // Icono de spec oficial, recortado circular con borde del color de clase
  function specIcon(specId, size) {
    const spec = CATALOG && CATALOG.specs[specId];
    if (!spec) return '';
    const s = size || 26;
    return '<span class="rbg-spec-frame" style="width:' + s + 'px;height:' + s + 'px;border-color:' + spec.color +
      '" title="' + esc(spec.name + ' — ' + spec.cls) + '">' +
      '<img src="assets/rbg/specs/' + esc(specId) + '.jpg" alt="' + esc(spec.name) + '" loading="lazy"></span>';
  }

  function siluetaSvg() {
    return '<svg class="rbg-silueta" viewBox="0 0 150 186" aria-hidden="true">' +
      '<ellipse cx="75" cy="78" rx="27" ry="31" fill="#23232e"/>' +
      '<path d="M18 186 Q24 126 60 114 L75 122 L90 114 Q126 126 132 186 Z" fill="#23232e"/></svg>';
  }

  function photoUrl(p) {
    return API + '/api/rbg/photo/' + encodeURIComponent(p.user_id) + '?v=' + encodeURIComponent(p.updated_at || '');
  }

  // ── Estado ──────────────────────────────────────────────────
  let CATALOG = null;
  let MY_PROFILE = null;
  let ROSTER = [];
  let pickedRole = null;
  const form = { photo: undefined, country: null, spec: null, starter: true };

  const $ = (id) => document.getElementById(id);

  // ── Arranque ────────────────────────────────────────────────
  document.addEventListener('DOMContentLoaded', function () {
    init().catch(function (e) {
      const wrap = $('rbgr-starters') || $('rbg-form-section');
      if (wrap) wrap.innerHTML = '<div class="rbg-loading">Error al cargar: ' + esc(e.message) + '. Recargá la página.</div>';
    });
  });

  function gotoLogin() {
    location.href = API + '/api/casino/auth/discord?redirect=' + encodeURIComponent(location.origin + location.pathname);
  }

  async function init() {
    wireEvents();

    const cat = await api('/api/rbg/catalog');
    if (cat.error) {
      const wrap = $('rbgr-starters') || $('rbg-form-section');
      if (wrap) wrap.innerHTML = '<div class="rbg-loading">No se pudo cargar el catálogo. Recargá la página.</div>';
      return;
    }
    CATALOG = cat;

    // ¿Qué página es? Roster oficial (liga-rbg-roster.html) o registro (liga-rbg.html)
    if ($('rbgr-starters')) {
      await loadRosterPage();
      return;
    }

    if (!token()) {
      $('rbg-login').hidden = false;
    } else {
      const me = await api('/api/rbg/profile');
      if (!token()) {
        // el 401 limpió la sesión vencida → mostrar login
        $('rbg-login').hidden = false;
      } else if (me.profile) {
        MY_PROFILE = me.profile;
        showMineBar();
      } else {
        openForm(null);
      }
    }
  }

  // ── Eventos: TODO por delegación (robusto ante re-renders) ──
  let _wired = false;
  function wireEvents() {
    if (_wired) return;
    _wired = true;
    document.addEventListener('click', function (ev) {
      const t = ev.target;

      const loginBtn = t.closest('#rbg-login-btn');
      if (loginBtn) { gotoLogin(); return; }

      const editBtn = t.closest('#rbg-mine-edit');
      if (editBtn) { openForm(MY_PROFILE); return; }

      // Botón "Ver el roster" del aviso de éxito (tras guardar)
      if (t.closest('#rbg-goto-roster')) {
        location.href = 'liga-rbg-roster.html';
        return;
      }

      // Popover país
      if (t.closest('#rbg-country-btn')) {
        $('rbg-pop-spec').hidden = true;
        $('rbg-pop-country').hidden = !$('rbg-pop-country').hidden;
        return;
      }
      // Popover clase/spec
      if (t.closest('#rbg-spec-btn')) {
        $('rbg-pop-country').hidden = true;
        const pop = $('rbg-pop-spec');
        pop.hidden = !pop.hidden;
        if (!pop.hidden && !pickedRole && form.spec && CATALOG.specs[form.spec]) {
          pickedRole = CATALOG.specs[form.spec].role;
          renderSpecPick();
        }
        return;
      }

      // Elegir bandera
      const flag = t.closest('.rbg-flag[data-cc]');
      if (flag) {
        form.country = flag.dataset.cc;
        $('rbg-pop-country').hidden = true;
        renderCountryPick();
        return;
      }
      // Elegir rol (paso 1 del selector anti-troll)
      const roleBtn = t.closest('.rbg-role-btn[data-role]');
      if (roleBtn) { pickedRole = roleBtn.dataset.role; renderSpecPick(); return; }
      // Elegir spec (paso 2)
      const specBtn = t.closest('.rbg-spec[data-spec]');
      if (specBtn) {
        form.spec = specBtn.dataset.spec;
        $('rbg-pop-spec').hidden = true;
        renderSpecPick();
        return;
      }

      // Titular / Banca
      if (t.closest('#rbg-seg-titular')) { form.starter = true; renderSeg(); return; }
      if (t.closest('#rbg-seg-banca')) { form.starter = false; renderSeg(); return; }

      // Guardar
      if (t.closest('#rbg-save')) { saveProfile(); return; }

      // Ficha del jugador: cerrar (X o clic en el fondo oscuro)
      if (t.closest('#rbg-modal-close') || t === $('rbg-modal')) { closeCard(); return; }
      // Ficha del jugador: abrir al hacer clic en un banner del roster
      const card = t.closest('.rbgr-hcard[data-userid]');
      if (card && $('rbg-modal')) { openPlayerCard(card.dataset.userid); return; }

      // Click afuera → cerrar popovers
      if (!t.closest('.rbg-pick-group')) {
        const pc = $('rbg-pop-country'), ps = $('rbg-pop-spec');
        if (pc) pc.hidden = true;
        if (ps) ps.hidden = true;
      }
    });

    document.addEventListener('keydown', function (ev) {
      if (ev.key === 'Escape') closeCard();
    });

    const photoInput = $('rbg-photo-input');
    if (photoInput) {
      photoInput.addEventListener('change', async function () {
        const file = this.files && this.files[0];
        if (!file) return;
        try {
          const dataUrl = await resizePhoto(file);
          form.photo = dataUrl;
          setPhotoPreview(dataUrl);
          setMsg('', '');
        } catch (e) {
          setMsg(e.message || 'No se pudo procesar la imagen', 'err');
        }
        this.value = '';
      });
    }
  }

  // Tarjeta de perfil ya inscrito: foto del PJ si la subió, si no el avatar
  // de Discord por defecto (y silueta solo si tampoco hay avatar).
  function mineAvatarHtml(p) {
    if (p.has_photo || p.photo) {
      return '<img src="' + esc(photoUrl(p)) + '" alt="Foto de ' + esc(p.nickname) + '">';
    }
    if (p.avatar_url) {
      return '<img src="' + esc(p.avatar_url) + '" alt="Avatar de Discord">';
    }
    return siluetaSvg();
  }

  function showMineBar() {
    const p = MY_PROFILE;
    const spec = CATALOG.specs[p.spec] || {};
    $('rbg-mine').innerHTML =
      '<div class="rbg-mine-photo">' + mineAvatarHtml(p) + '</div>' +
      '<div class="rbg-mine-info">' +
        '<div class="rbg-mine-name">' + flagImg(p.country, 20) + esc(p.nickname) + '</div>' +
        '<div class="rbg-mine-meta">' + specIcon(p.spec, 22) + ' ' +
          esc((spec.name || '') + ' — ' + (spec.cls || '')) +
          ' <span class="rbg-mine-badge">' + (p.starter ? 'Titular' : 'Banca') + '</span>' +
        '</div>' +
      '</div>' +
      '<div class="rbg-mine-actions">' +
        '<button type="button" id="rbg-mine-edit">Editar mi perfil</button>' +
      '</div>';
    $('rbg-mine').hidden = false;
  }

  // Aviso transitorio tras guardar (registro nuevo o edición)
  function showSuccess() {
    const el = $('rbg-success');
    if (!el) return;
    el.hidden = false;
    try { el.scrollIntoView({ behavior: 'smooth', block: 'start' }); } catch (e) {}
  }

  // ── Formulario ──────────────────────────────────────────────
  function openForm(existing) {
    $('rbg-form-section').hidden = false;
    $('rbg-mine').hidden = true;
    $('rbg-success').hidden = true;

    $('rbg-dc-name').textContent = (existing && existing.discord_name) || myName() || 'Jugador';
    const av = (existing && existing.avatar_url) || myAvatar();
    if (av) { $('rbg-dc-avatar').src = av; $('rbg-dc-avatar').hidden = false; }

    if (existing) {
      $('rbg-char').value = existing.char_name || '';
      if (existing.realm) $('rbg-realm').value = existing.realm;
      form.country = existing.country || null;
      form.spec = existing.spec || null;
      form.starter = existing.starter !== false;
      form.photo = undefined; // conservar la del servidor salvo que suba otra
      if (existing.has_photo || existing.photo) {
        setPhotoPreview(photoUrl(existing));
      }
      pickedRole = existing.spec && CATALOG.specs[existing.spec] ? CATALOG.specs[existing.spec].role : null;
    }
    renderCountryPick();
    renderSpecPick();
    renderSeg();

    try { $('rbg-form-section').scrollIntoView({ behavior: 'smooth', block: 'start' }); } catch (e) {}
  }

  function setPhotoPreview(src) {
    $('rbg-photo-frame').innerHTML = '<img src="' + esc(src) + '" alt="Foto de tu PJ">';
  }

  // Foto: input → canvas 256×320 contain (conserva transparencia) → dataURL
  function resizePhoto(file) {
    return new Promise(function (resolve, reject) {
      if (!/^image\/(png|webp|jpe?g)$/.test(file.type)) {
        return reject(new Error('El archivo debe ser una imagen PNG (o WebP/JPG)'));
      }
      const img = new Image();
      img.onload = function () {
        try {
          const W = 256, H = 320;
          const canvas = document.createElement('canvas');
          canvas.width = W; canvas.height = H;
          const cx = canvas.getContext('2d');
          const scale = Math.min(W / img.width, H / img.height);
          const w = Math.round(img.width * scale), h = Math.round(img.height * scale);
          cx.drawImage(img, Math.round((W - w) / 2), Math.round((H - h) / 2), w, h);
          URL.revokeObjectURL(img.src);

          let out = canvas.toDataURL('image/png');
          if (out.length > 290000) out = canvas.toDataURL('image/webp', 0.85);
          if (out.length > 290000) out = canvas.toDataURL('image/webp', 0.6);
          if (out.length > 290000) return reject(new Error('La imagen es muy pesada incluso comprimida. Probá con una más simple.'));
          resolve(out);
        } catch (e) { reject(new Error('No se pudo procesar la imagen')); }
      };
      img.onerror = function () { URL.revokeObjectURL(img.src); reject(new Error('No se pudo leer la imagen')); };
      img.src = URL.createObjectURL(file);
    });
  }

  // País
  function renderCountryPick() {
    $('rbg-country-btn').innerHTML = form.country
      ? flagImg(form.country, 36)
      : '<span class="rbg-pick-q">?</span>';

    $('rbg-flag-grid').innerHTML = CATALOG.countries.map(function (c) {
      return '<button type="button" class="rbg-flag' + (form.country === c ? ' rbg-sel' : '') +
        '" data-cc="' + c + '" title="' + esc(COUNTRY_NAMES[c] || c) + '">' + flagImg(c) +
        '<span class="rbg-flag-cc">' + esc(c === 'OTRO' ? 'Otro' : c) + '</span></button>';
    }).join('');
  }

  // Clase/spec — selector anti-troll: rol (iconos Blizzard) → specs agrupadas por clase
  function renderSpecPick() {
    const btn = $('rbg-spec-btn');
    btn.innerHTML = (form.spec && CATALOG.specs[form.spec])
      ? specIcon(form.spec, 42)
      : '<span class="rbg-pick-q">?</span>';

    // Paso 1: roles con los iconos oficiales
    $('rbg-role-row').innerHTML = ['tank', 'healer', 'dps'].map(function (r) {
      const sel = pickedRole === r ? ' rbg-sel-' + r : '';
      return '<button type="button" class="rbg-role-btn' + sel + '" data-role="' + r + '">' +
        roleImg(r, 26) + ROLE_LABEL[r] + '</button>';
    }).join('');

    // Paso 2: specs del rol elegido, agrupadas por clase con su logo
    const grid = $('rbg-spec-grid');
    if (!pickedRole) {
      grid.innerHTML = '<div class="rbg-spec-hint">Elegí primero tu rol</div>';
      return;
    }
    const entries = Object.entries(CATALOG.specs).filter(function (e) { return e[1].role === pickedRole; });

    // Agrupar por clase manteniendo el orden del catálogo
    const byClass = [];
    entries.forEach(function (e) {
      let g = byClass.find(function (x) { return x.cls === e[1].cls; });
      if (!g) { g = { cls: e[1].cls, color: e[1].color, firstId: e[0], specs: [] }; byClass.push(g); }
      g.specs.push(e);
    });

    grid.innerHTML = byClass.map(function (g) {
      return '<div class="rbg-class-group">' +
        '<div class="rbg-class-head" style="color:' + g.color + '">' + classImg(g.firstId, 20) +
          '<span>' + esc(g.cls) + '</span></div>' +
        '<div class="rbg-class-specs">' +
        g.specs.map(function (e) {
          const id = e[0], s = e[1];
          return '<button type="button" class="rbg-spec' + (form.spec === id ? ' rbg-sel' : '') + '" data-spec="' + id + '">' +
            specIcon(id, 34) + '<span>' + esc(s.name) + '</span></button>';
        }).join('') +
        '</div></div>';
    }).join('');
  }

  // Titular / Banca
  function renderSeg() {
    $('rbg-seg-titular').className = form.starter ? 'rbg-sel' : '';
    $('rbg-seg-banca').className = form.starter ? '' : 'rbg-sel';
  }

  function setMsg(text, cls) {
    const el = $('rbg-msg');
    el.textContent = text;
    el.className = 'rbg-msg ' + (cls || '');
  }

  // Guardar (el botón siempre está activo: si falta algo, se explica QUÉ falta)
  async function saveProfile() {
    const charVal = ($('rbg-char').value || '').trim();
    if (charVal.length < 2) { setMsg('Te falta el nombre exacto de tu personaje en WoW.', 'err'); return; }
    if (!form.country) { setMsg('Te falta elegir tu país (clic en el círculo de la bandera).', 'err'); return; }
    if (!form.spec) { setMsg('Te falta elegir tu clase y especialización.', 'err'); return; }

    const btn = $('rbg-save');
    btn.disabled = true;
    setMsg('Guardando…', '');

    const body = {
      country: form.country, spec: form.spec, starter: form.starter,
      char_name: charVal,
      realm: ($('rbg-realm').value || '').trim(),
    };
    if (form.photo !== undefined) body.photo = form.photo;

    const res = await api('/api/rbg/profile', { method: 'PUT', body: body });
    btn.disabled = false;
    if (res.error) { setMsg(res.error, 'err'); return; }

    MY_PROFILE = res.profile;
    setMsg('', '');
    $('rbg-form-section').hidden = true;
    showMineBar();
    showSuccess();
  }

  // ── Roster oficial (liga-rbg-roster.html) ──────────────────
  // Tarjetas VERTICALES estilo esports; el capitán del core va AL CENTRO,
  // destacado. Las bancas en su propia fila. El modelo 2D de Blizzard se
  // carga en diferido tarjeta por tarjeta (cada ficha está cacheada 5 min).
  async function loadRosterPage() {
    const data = await api('/api/rbg/roster?t=' + Date.now());
    if (data.error) {
      $('rbgr-starters').innerHTML = '<div class="rbg-loading">No se pudo cargar el roster.</div>';
      return;
    }
    ROSTER = data.roster || [];
    renderRosterPage(data.core || {});
    hydrateRenders();
  }

  // Banner horizontal (como la referencia del jefe: PJ asomando por arriba,
  // placa diagonal, glow de clase, nombre display itálico, rating a la derecha)
  function hcard(p, isCaptain) {
    const spec = CATALOG.specs[p.spec] || {};
    const ne = NE_CLASS[p.name_effect] || '';
    const cls = spec.color || '#d4a017';
    let model;
    if (p.has_photo) {
      model = '<img class="rbgr-foto" src="' + esc(photoUrl(p)) + '" alt="" loading="lazy">';
    } else {
      model = siluetaBustoSvg();
    }
    return '<button type="button" class="rbgr-hcard' + (isCaptain ? ' rbgr-captain' : '') +
      '" style="--class:' + cls + '" data-userid="' + esc(p.user_id) +
      '" aria-label="Ver ficha de ' + esc(p.nickname) + '">' +
      '<span class="rbgr-hplate"></span>' +
      (isCaptain
        ? '<span class="rbgr-ribbon"><svg class="rbgr-crown" viewBox="0 0 20 15" fill="currentColor" aria-hidden="true"><path d="M1 5l4 3 5-7 5 7 4-3-2 9H3z"/></svg>CAPITÁN</span>'
        : (p.starter ? '' : '<span class="rbgr-bench-tag">BANCA</span>')) +
      '<span class="rbgr-chr">' + model + '</span>' +
      '<span class="rbgr-hbody">' +
        specIcon(p.spec, 48) +
        '<span class="rbgr-names">' +
          '<span class="rbgr-nick' + (ne ? ' ' + ne : '') + '">' + esc(p.nickname) + '</span>' +
          '<span class="rbgr-meta">' + flagImg(p.country, 17) + ' ' +
            esc((spec.name || '') + ' · ' + (spec.cls || '') + ' · ' + p.discord_name) + '</span>' +
        '</span>' +
        '<span class="rbgr-rating"><span class="rbgr-num na" data-rating="' + esc(p.user_id) + '">—</span><span class="rbgr-lbl">RBG</span></span>' +
        roleImg(p.role, 28).replace('rbg-role-ico', 'rbg-role-ico rbgr-role') +
      '</span>' +
      '</button>';
  }

  // Silueta de busto (para el hueco horizontal, distinta de la vertical del form)
  function siluetaBustoSvg() {
    return '<svg viewBox="0 0 150 130" aria-hidden="true">' +
      '<ellipse cx="75" cy="46" rx="25" ry="29"/>' +
      '<path d="M20 130 Q26 84 58 74 L75 81 L92 74 Q124 84 130 130 Z"/></svg>';
  }

  function emptyCard(label) {
    return '<div class="rbgr-hcard rbgr-empty"><span class="rbgr-plus">+</span>' + esc(label) + '</div>';
  }

  function renderRosterPage(core) {
    const captainId = core.captain || null;
    // El capitán lo elige el admin y puede no coincidir con el toggle
    // titular/banca que el jugador marcó al inscribirse — buscarlo en TODO
    // el roster (no solo en titulares) para que la corona nunca se pierda,
    // y sacarlo de ambas listas para no duplicar su tarjeta.
    const captain = captainId ? ROSTER.find(function (p) { return p.user_id === captainId; }) : null;
    const titulares = ROSTER.filter(function (p) { return p.starter && p.user_id !== captainId; });
    const bancas = ROSTER.filter(function (p) { return !p.starter && p.user_id !== captainId; });

    // CAPITÁN DE PRIMERO (croquis del jefe), luego el resto en orden de inscripción
    const cards = [];
    if (captain) cards.push(hcard(captain, true));
    titulares.forEach(function (p) { cards.push(hcard(p, false)); });
    // Plazas libres hasta 10 titulares (cuenta el capitán como uno de los 10)
    const starterCount = (captain ? 1 : 0) + titulares.length;
    for (let i = starterCount; i < 10; i++) cards.push(emptyCard('¿Serás tú?'));

    $('rbgr-starters').innerHTML = cards.length
      ? cards.join('')
      : '<div class="rbg-loading">Todavía no hay inscritos — <a href="liga-rbg.html" style="color:var(--accent-color-hover)">sé el primero</a>.</div>';
    const cs = $('rbgr-count-starters');
    if (cs) cs.textContent = starterCount + ' / 10';

    const benchCards = bancas.map(function (p) { return hcard(p, false); });
    for (let i = bancas.length; i < 2; i++) benchCards.push(emptyCard('Banca libre'));
    $('rbgr-bench').innerHTML = benchCards.join('');
    const cb = $('rbgr-count-bench');
    if (cb) cb.textContent = bancas.length + ' / 2';
  }

  // ── Auto-encuadre de renders de Blizzard ────────────────────
  // El lienzo main-raw es 1600×1200 pero el PJ ocupa un alto/posición que
  // varía según la raza: la cabeza de un no-muerto está al ~31% del lienzo
  // y la de un gnomo al ~41% (medido). Un recorte CSS fijo decapitaba a las
  // razas bajas, así que se mide el bounding box real de píxeles opacos en
  // un canvas chico (Blizzard permite CORS) y se posiciona cada render para
  // encuadrar SIEMPRE al personaje. Si no se puede medir, queda el CSS.
  // URL para cargas con crossorigin: agrega un query param para que el
  // navegador NO reutilice una copia cacheada sin cabeceras CORS (si la
  // imagen se cargó antes como <img> normal, esa entrada de caché no trae
  // Access-Control-Allow-Origin y la carga anónima falla en seco).
  function corsUrl(url) {
    return url + (url.indexOf('?') >= 0 ? '&' : '?') + 'exicors=1';
  }

  function measureRenderBox(imgEl) {
    try {
      const SW = 80, SH = 60;
      const c = document.createElement('canvas');
      c.width = SW; c.height = SH;
      const cx = c.getContext('2d', { willReadFrequently: true });
      cx.drawImage(imgEl, 0, 0, SW, SH);
      const d = cx.getImageData(0, 0, SW, SH).data;
      let minX = SW, maxX = -1, minY = SH, maxY = -1;
      for (let y = 0; y < SH; y++) {
        for (let x = 0; x < SW; x++) {
          if (d[(y * SW + x) * 4 + 3] > 16) {
            if (x < minX) minX = x;
            if (x > maxX) maxX = x;
            if (y < minY) minY = y;
            if (y > maxY) maxY = y;
          }
        }
      }
      if (maxX < 0 || maxY - minY < 4) return null;
      return { x0: minX / SW, x1: (maxX + 1) / SW, y0: minY / SH, y1: (maxY + 1) / SH };
    } catch (e) { return null; } // canvas tainted u otro fallo → recorte CSS default
  }

  // Banner del roster: de la cabeza a la cadera (~55% del PJ), cabeza arriba.
  function frameBannerRender(imgEl, chr) {
    const b = measureRenderBox(imgEl);
    if (!b) return;
    const W = chr.clientWidth, H = chr.clientHeight;
    if (!W || !H || !imgEl.naturalWidth) return;
    const bh = b.y1 - b.y0, bcx = (b.x0 + b.x1) / 2;
    const mTop = H * 0.06;
    let Hi = (H - mTop) / 0.55 / bh;
    let Wi = Hi * (imgEl.naturalWidth / imgEl.naturalHeight);
    const maxWi = W * 9, minWi = W * 2; // límites por si el bbox sale raro
    if (Wi > maxWi) { Wi = maxWi; Hi = Wi * imgEl.naturalHeight / imgEl.naturalWidth; }
    if (Wi < minWi) { Wi = minWi; Hi = Wi * imgEl.naturalHeight / imgEl.naturalWidth; }
    imgEl.style.width = Wi.toFixed(0) + 'px';
    imgEl.style.left = (W / 2 - bcx * Wi).toFixed(0) + 'px';
    imgEl.style.top = (mTop - b.y0 * Hi).toFixed(0) + 'px';
    imgEl.style.transform = 'none';
  }

  function mountBannerRender(chr, url) {
    const el = new Image();
    el.className = 'rbgr-render';
    el.alt = '';
    el.crossOrigin = 'anonymous';
    el.onload = function () { frameBannerRender(el, chr); };
    el.onerror = function () {
      // sin CORS no se puede medir: mostrarla igual con el recorte CSS
      const plain = new Image();
      plain.className = 'rbgr-render';
      plain.alt = '';
      plain.src = url;
      chr.innerHTML = '';
      chr.appendChild(plain);
    };
    el.src = corsUrl(url);
    chr.innerHTML = '';
    chr.appendChild(el);
  }

  // Ficha (modal): el PJ completo ocupando ~88% del marco (contain por
  // bounding box, no por lienzo — un gnomo ya no se ve diminuto).
  function frameModalRender(imgEl) {
    const b = measureRenderBox(imgEl);
    if (!b) return;
    const box = imgEl.parentElement;
    imgEl.style.position = 'absolute';
    imgEl.style.maxWidth = 'none';
    imgEl.style.maxHeight = 'none';
    const CW = box.clientWidth, CH = box.clientHeight;
    if (!CW || !CH || !imgEl.naturalWidth) return;
    const bw = b.x1 - b.x0, bh = b.y1 - b.y0;
    const ar = imgEl.naturalWidth / imgEl.naturalHeight;
    let Hi = (CH * 0.88) / bh;
    let Wi = Hi * ar;
    if (Wi * bw > CW * 0.92) { Wi = (CW * 0.92) / bw; Hi = Wi / ar; }
    imgEl.style.width = Wi.toFixed(0) + 'px';
    imgEl.style.left = (CW / 2 - (b.x0 + bw / 2) * Wi).toFixed(0) + 'px';
    imgEl.style.top = (CH / 2 - (b.y0 + bh / 2) * Hi).toFixed(0) + 'px';
  }

  // Trae de Blizzard el modelo 2D + rating RBG de cada banner con PJ vinculado
  // (en diferido para no bloquear el primer render; cada ficha se cachea 5 min).
  function hydrateRenders() {
    ROSTER.filter(function (p) { return p.has_char; }).forEach(async function (p) {
      try {
        const data = await api('/api/rbg/player/' + encodeURIComponent(p.user_id));
        if (!data || !data.wow || data.wow.not_found) return;
        if (data.wow.render) {
          const chr = document.querySelector('.rbgr-hcard[data-userid="' + p.user_id + '"] .rbgr-chr');
          if (chr) mountBannerRender(chr, data.wow.render);
        }
        const num = document.querySelector('.rbgr-num[data-rating="' + p.user_id + '"]');
        if (num && typeof data.wow.rating === 'number') {
          num.textContent = data.wow.rating || 0;
          num.classList.remove('na');
        }
      } catch (e) {}
    });
  }

  // ── Ficha del jugador (rating RBG + modelo 2D de Blizzard) ──
  function closeCard() {
    const m = $('rbg-modal');
    if (m) m.hidden = true;
  }

  async function openPlayerCard(userId) {
    const modal = $('rbg-modal'), body = $('rbg-modal-body');
    modal.hidden = false;
    body.innerHTML = '<div class="rbg-loading">Cargando ficha…</div>';

    const data = await api('/api/rbg/player/' + encodeURIComponent(userId));
    if (data.error || !data.player) {
      body.innerHTML = '<div class="rbg-loading">' + esc(data.error || 'No se pudo cargar la ficha.') + '</div>';
      return;
    }
    const p = data.player, wow = data.wow;
    const spec = CATALOG.specs[p.spec] || {};
    const ne = NE_CLASS[p.name_effect] || '';

    // Imagen: modelo 2D de Blizzard > foto subida > silueta
    let img, cap;
    if (wow && wow.render) {
      img = '<img src="' + esc(corsUrl(wow.render)) + '" crossorigin="anonymous" alt="Modelo de ' + esc(p.nickname) + '">';
      cap = 'Modelo 2D · ' + esc(p.char_name + ' — ' + p.realm);
    } else if (p.has_photo) {
      img = '<img src="' + esc(photoUrl(p)) + '" alt="Foto de ' + esc(p.nickname) + '">';
      cap = 'Foto subida por el jugador';
    } else {
      img = siluetaSvg();
      cap = 'Sin foto ni personaje vinculado';
    }

    // Bloque de rating
    let ratingHtml = '';
    if (wow && !wow.not_found) {
      ratingHtml =
        '<div class="rbg-rating-box">' +
          '<div><div class="rbg-rating-lbl">Rating RBG</div>' +
          '<div class="rbg-rating-num">' + (wow.rating || 0) + '</div></div>' +
          '<div class="rbg-rating-wl"><b class="w">' + (wow.wins || 0) + 'V</b> · <b class="l">' + (wow.losses || 0) + 'D</b><br>esta temporada</div>' +
        '</div>';
    } else if (wow && wow.not_found) {
      ratingHtml = '<div class="rbg-nota">No se encontró <b>' + esc(p.char_name + '-' + p.realm) + '</b> en Blizzard. Revisá el nombre exacto y el reino en tu perfil.</div>';
    } else if (data.wow_error) {
      ratingHtml = '<div class="rbg-nota">Blizzard no respondió ahora mismo. Probá de nuevo en un rato.</div>';
    } else {
      ratingHtml = '<div class="rbg-nota">Sin personaje de WoW vinculado — el jugador puede agregarlo editando su perfil para mostrar su rating RBG y su modelo 2D.</div>';
    }

    const rows = [];
    rows.push('<div class="rbg-card-row"><span class="rbg-lbl">Spec</span>' + specIcon(p.spec, 28) + ' ' +
      esc((spec.name || '') + ' — ' + (spec.cls || '')) + ' ' + roleImg(p.role, 18) + '</div>');
    rows.push('<div class="rbg-card-row"><span class="rbg-lbl">País</span>' + flagImg(p.country, 22) + ' ' +
      esc(COUNTRY_NAMES[p.country] || p.country || '—') + '</div>');
    rows.push('<div class="rbg-card-row"><span class="rbg-lbl">Inscripto como</span>' + (p.starter ? 'Titular' : 'Banca') + '</div>');
    if (wow && !wow.not_found && (wow.level || wow.race)) {
      rows.push('<div class="rbg-card-row"><span class="rbg-lbl">Personaje</span>' +
        esc((wow.race ? wow.race + ' ' : '') + (wow.class_name || '')) +
        (wow.level ? ' · Nivel ' + wow.level : '') + (wow.ilvl ? ' · ' + wow.ilvl + ' ilvl' : '') + '</div>');
    }

    body.innerHTML =
      '<div class="rbg-card-grid">' +
        '<div><div class="rbg-render">' + img + '</div><div class="rbg-render-cap">' + cap + '</div></div>' +
        '<div>' +
          '<div class="rbg-card-nick' + (ne ? ' ' + ne : '') + '">' + esc(p.nickname) + '</div>' +
          '<div class="rbg-card-sub">' +
            (p.avatar_url ? '<img class="rbg-davatar" src="' + esc(p.avatar_url) + '" alt="">' : '') +
            esc(p.discord_name) + '</div>' +
          '<div class="rbg-card-rows">' + rows.join('') + '</div>' +
          ratingHtml +
        '</div>' +
      '</div>';

    // Auto-encuadre del modelo 2D (razas bajas como gnomos se veían diminutas)
    if (wow && wow.render) {
      const rimg = body.querySelector('.rbg-render img');
      if (rimg) {
        if (rimg.complete && rimg.naturalWidth) frameModalRender(rimg);
        else rimg.onload = function () { frameModalRender(rimg); };
        rimg.onerror = function () {
          // si la carga CORS falla, mostrar la imagen normal sin medición
          rimg.onerror = null;
          rimg.removeAttribute('crossorigin');
          rimg.src = wow.render;
        };
      }
    }
  }

})();
