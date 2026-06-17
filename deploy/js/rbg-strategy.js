/* ============================================================
   EXILIUM - RBG Tactical Command Center
   Guild Master Control Panel
   ============================================================ */
const API_URL = 'https://exilium-blizzard.mitzumitzukyhs.workers.dev';
const RBG_MAPS = [
    { id: 'warsong_gulch',      name: 'Warsong Gulch',        short: 'WSG',  type: 'Capture the Flag', color: '#8B0000' },
    { id: 'arathi_basin',       name: 'Arathi Basin',         short: 'AB',   type: 'Resource Race',     color: '#1B5E20' },
    { id: 'eye_of_the_storm',   name: 'Eye of the Storm',     short: 'EotS', type: 'Hybrid',            color: '#4A148C' },
    { id: 'battle_for_gilneas', name: 'Battle for Gilneas',   short: 'BfG',  type: 'Resource Race',     color: '#4E342E' },
    { id: 'twin_peaks',         name: 'Twin Peaks',           short: 'TP',   type: 'Capture the Flag',  color: '#BF360C' },
    { id: 'temple_of_kotmogu',  name: 'Temple of Kotmogu',    short: 'ToK',  type: 'Orb Control',       color: '#880E4F' },
    { id: 'deepwind_gorge',     name: 'Deepwind Gorge',       short: 'DWG',  type: 'Resource Race',     color: '#33691E' },
    { id: 'silvershard_mines',  name: 'Silvershard Mines',    short: 'SSM',  type: 'Escort',            color: '#4E342E' },
    { id: 'deephaul_ravine',    name: 'Deephaul Ravine',      short: 'DHR',  type: 'Resource Race',     color: '#5D4037' },
];
function mapImage(id) {
    if (id === 'deephaul_ravine') return 'assets/rbg/deephaul_ravine_tactical.png?v=20260509tactical2';
    return 'assets/rbg/' + id + '.jpg';
}

const CLASS_ICONS = {
    'Death Knight':'https://wow.zamimg.com/images/wow/icons/medium/classicon_deathknight.jpg',
    'Demon Hunter':'https://wow.zamimg.com/images/wow/icons/medium/classicon_demonhunter.jpg',
    'Druid':'https://wow.zamimg.com/images/wow/icons/medium/classicon_druid.jpg',
    'Evoker':'https://wow.zamimg.com/images/wow/icons/medium/classicon_evoker.jpg',
    'Hunter':'https://wow.zamimg.com/images/wow/icons/medium/classicon_hunter.jpg',
    'Mage':'https://wow.zamimg.com/images/wow/icons/medium/classicon_mage.jpg',
    'Monk':'https://wow.zamimg.com/images/wow/icons/medium/classicon_monk.jpg',
    'Paladin':'https://wow.zamimg.com/images/wow/icons/medium/classicon_paladin.jpg',
    'Priest':'https://wow.zamimg.com/images/wow/icons/medium/classicon_priest.jpg',
    'Rogue':'https://wow.zamimg.com/images/wow/icons/medium/classicon_rogue.jpg',
    'Shaman':'https://wow.zamimg.com/images/wow/icons/medium/classicon_shaman.jpg',
    'Warlock':'https://wow.zamimg.com/images/wow/icons/medium/classicon_warlock.jpg',
    'Warrior':'https://wow.zamimg.com/images/wow/icons/medium/classicon_warrior.jpg',
};

const ROLE_TAGS = ['FC','Healer','DPS','Tank','Roamer','Defensa','Ofensa'];
const ROLE_COLORS = { FC:'#f59e0b', Healer:'#22c55e', DPS:'#ef4444', Tank:'#3b82f6', Roamer:'#a855f7', Defensa:'#3b82f6', Ofensa:'#ef4444', attack:'#ef4444', defense:'#3b82f6', fc:'#f59e0b' };

const DRAW_TOOLS = [
    { id:'select',      icon:'☝',  label:'Seleccionar/Mover', tooltip:'Arrastra para mover el mapa' },
    { id:'marker',      icon:'📍', label:'Marcador',          tooltip:'Click para colocar un marcador con etiqueta personalizada' },
    { id:'marker_tank', icon:'assets/rbg/role_tank.png',  label:'Tank',    tooltip:'Click para colocar un marcador de Tank (azul)', role:'Tank', isImg:true },
    { id:'marker_heal', icon:'assets/rbg/role_healer.png', label:'Healer',  tooltip:'Click para colocar un marcador de Healer (verde)', role:'Healer', isImg:true },
    { id:'marker_dps',  icon:'assets/rbg/role_dps.png',    label:'DPS',     tooltip:'Click para colocar un marcador de DPS (rojo)', role:'DPS', isImg:true },
    { id:'arrow',       icon:'➡',  label:'Flecha',            tooltip:'Arrastra para dibujar una flecha de dirección' },
    { id:'xmark',       icon:'❌', label:'X',                  tooltip:'Click para marcar una posición con X roja' },
    { id:'text',        icon:'📝', label:'Texto',             tooltip:'Click para agregar texto en el mapa' },
    { id:'erase',       icon:'🗑', label:'Borrar',            tooltip:'Click sobre un marcador o dibujo para eliminarlo' },
];

/* ── State ── */
let strategies = [], players = [], activeMapId = RBG_MAPS[0].id;
let tacticalData = { markers:[], drawings:[], groups:{ group1:[], group2:[] } };
let selectedPlayerId = null, activeTool = 'select', mapZoom = 1, mapPan = {x:0,y:0};
let isPanning = false, panStart = {x:0,y:0};
let pointerStart = {x:0,y:0}, drawingTemp = null, dragTarget = null, dragIdx = -1, isAdmin = false;

document.addEventListener('DOMContentLoaded', async () => {
    isAdmin = !!localStorage.getItem('exilium_admin_token');
    renderSidebar();
    selectMap(RBG_MAPS[0].id);
    await Promise.all([loadStrategies(), loadPlayers()]);
    renderTrackerSection();
});

async function loadStrategies() {
    try { const r = await fetch(API_URL+'/api/rbg-strategies'); strategies = await r.json(); }
    catch(e) { strategies = []; }
    loadTacticalData(); renderActiveMap();
}
async function loadPlayers() {
    try { const r = await fetch(API_URL+'/api/players'); players = await r.json(); }
    catch(e) { players = []; }
    renderActiveMap();
}
function loadTacticalData() {
    const s = strategies.find(x => x.map===activeMapId);
    tacticalData = (s&&s.tactical) ? s.tactical : { markers:[], drawings:[], groups:{group1:[],group2:[]} };
}
function saveTacticalData() {
    const s = strategies.find(x => x.map===activeMapId);
    if(s) s.tactical = tacticalData;
}
async function saveToServer() {
    const s = strategies.find(x => x.map===activeMapId);
    if(!s) return alert('No hay estrategia base para este mapa.');
    s.tactical = tacticalData;
    try {
        const token = localStorage.getItem('exilium_admin_token');
        const r = await fetch(API_URL+'/api/rbg-strategies/'+s.id, {
            method:'PUT', headers:{'Content-Type':'application/json', 'Authorization':'Bearer '+token},
            body:JSON.stringify({tactical:tacticalData})
        });
        if(r.ok) { alert('Guardado en el servidor.'); }
        else { alert('Error al guardar. Verifica permisos de admin.'); }
    } catch(e) { alert('Error de conexion: '+e.message); }
}
function escapeHtml(str) { return String(str).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;'); }

function renderSidebar() {
    const sb = document.getElementById('rbg-sidebar');
    sb.innerHTML = '<div class=\"rbg-sidebar-title\">Mapas RBG</div>' +
        RBG_MAPS.map(m => '<button class=\"map-btn'+(m.id===activeMapId?' active':'')+'\" id=\"btn-'+m.id+'\" onclick=\"selectMap(\''+m.id+'\')\"><img class=\"map-btn-img\" src=\"'+mapImage(m.id)+'\" alt=\"'+m.name+'\" width=\"44\" height=\"44\" loading=\"lazy\" onerror=\"this.style.display=\'none\';this.nextElementSibling.style.display=\'flex\';\"><div class=\"map-btn-fallback\" style=\"display:none;width:44px;height:44px;border-radius:6px;flex-shrink:0;background:'+m.color+';align-items:center;justify-content:center;font-size:9px;font-weight:700;color:rgba(255,255,255,.85);font-family:Inter,sans-serif;\">'+m.short+'</div><div class=\"map-btn-info\"><div class=\"map-btn-name\">'+m.name+'</div><div class=\"map-btn-status status-empty\" id=\"status-'+m.id+'\">Sin estrategia</div></div></button>').join('');
}
function updateSidebarStatuses() {
    RBG_MAPS.forEach(m => {
        const el = document.getElementById('status-'+m.id); if(!el) return;
        const s = strategies.find(x => x.map===m.id);
        if(!s) { el.textContent='Sin estrategia'; el.className='map-btn-status status-empty'; }
        else if(s.status==='confirmed') { el.textContent='Confirmada'; el.className='map-btn-status status-confirmed'; }
        else { el.textContent='En revision'; el.className='map-btn-status status-review'; }
    });
}
function selectMap(mapId) {
    activeMapId=mapId;
    document.querySelectorAll('.map-btn').forEach(b=>b.classList.remove('active'));
    const btn=document.getElementById('btn-'+mapId); if(btn) btn.classList.add('active');
    mapZoom=1; mapPan={x:0,y:0}; activeTool='select'; loadTacticalData(); renderActiveMap();
}

function renderActiveMap() {
    updateSidebarStatuses();
    const mapDef = RBG_MAPS.find(m => m.id===activeMapId); if(!mapDef) return;
    const strat = strategies.find(s => s.map===activeMapId);
    const content = document.getElementById('rbg-main-content');
    let badge = '<span class=\"status-badge empty\">Sin estrategia</span>';
    if(strat&&strat.status==='confirmed') badge='<span class=\"status-badge confirmed\">Confirmada</span>';
    else if(strat&&strat.status==='review') badge='<span class=\"status-badge review\">En revision</span>';
    const notes = (strat&&strat.notes) ? strat.notes : '';
    const updatedAt = (strat&&strat.updated_at) ? new Date(strat.updated_at).toLocaleString('es-MX') : null;

    // Group panels (2 groups of 5)
    let groupsHTML = '';
    [['group1','Grupo 1 - Ataque','#ef4444'],['group2','Grupo 2 - Defensa','#3b82f6']].forEach(([gid,glabel,gcol]) => {
        const members = tacticalData.groups[gid] || [];
        let slots = '';
        for(let i=0;i<5;i++) {
            const pid = members[i];
            const player = pid ? players.find(p => p.id===pid||p.name===pid) : null;
            if(player) {
                const icon = CLASS_ICONS[player.class]||'';
                const roleTag = player.roleTag || '';
                slots += '<div class=\"tac-slot filled\" onclick=\"removeFromGroup(\''+gid+'\','+i+')\" title=\"Click para quitar\">'+(icon?'<img src=\"'+icon+'\" class=\"tac-slot-icon\">':'')+'<span>'+escapeHtml(player.name)+'</span>'+ (roleTag?'<small class=\"tac-role-tag\" style=\"background:'+(ROLE_COLORS[roleTag]||'#666')+'\">'+roleTag+'</small>':'') +'</div>';
            } else {
                slots += '<div class=\"tac-slot empty\" onclick=\"assignToGroup(\''+gid+'\','+i+')\" title=\"Click para asignar\">+</div>';
            }
        }
        groupsHTML += '<div class=\"tac-group\" style=\"border-top:3px solid '+gcol+'\"><div class=\"tac-group-header\"><span>'+glabel+'</span><small>5 jugadores</small></div><div class=\"tac-group-slots\">'+slots+'</div></div>';
    });

    // Player roster
    const assigned = new Set();
    Object.values(tacticalData.groups).forEach(arr => arr.forEach(p => assigned.add(p)));
    const avail = players.filter(p => !assigned.has(p.id) && !assigned.has(p.name));
    let rosterHTML = avail.slice(0,20).map(p => {
        const icon = CLASS_ICONS[p.class]||'';
        const sel = selectedPlayerId===(p.id||p.name) ? ' selected' : '';
        return '<div class=\"tac-player'+sel+'\" onclick=\"selectPlayer(\''+(p.id||p.name)+'\')\" title=\"'+(p.class||'')+' '+(p.spec||'')+'\">'+(icon?'<img src=\"'+icon+'\" class=\"tac-player-icon\">':'')+'<span>'+escapeHtml(p.name)+'</span><small>'+(p.class||'')+' '+(p.spec||'')+'</small></div>';
    }).join('');

    // Drawing toolbar
    let toolbarHTML = DRAW_TOOLS.map(t => {
        let sep = (t.id === 'arrow') ? '<span class="map-tool-sep">|</span>' : '';
        const roleClass = t.role ? ' draw-tool-role draw-tool-role-' + t.role.toLowerCase() : '';
        const inner = t.isImg ? '<img src="' + t.icon + '" alt="' + t.label + '" style="width:22px;height:22px;border-radius:50%;">' : t.icon;
        return sep + '<button class="draw-tool-btn' + roleClass + (activeTool===t.id?' active':'') + '" onclick="setTool(\'' + t.id + '\')" data-tooltip="' + (t.tooltip||t.label) + '">' + inner + '</button>';
    }).join('');

    content.innerHTML =
        '<div class=\"rbg-content-header\"><h2>'+mapDef.name+' <span class=\"header-type\">'+mapDef.type+'</span></h2>'+badge+'</div>'+
        '<div class=\"rbg-map-card\">'+
            '<div class=\"map-toolbar\"><span class=\"map-toolbar-title\">Mapa tactico - <strong>'+mapDef.short+'</strong></span>'+
                '<div class=\"map-controls\">'+toolbarHTML+'<span class=\"map-tool-sep\">|</span><button onclick=\"zoomMap(0.2)\">+</button><button onclick=\"zoomMap(-0.2)\">-</button><button onclick=\"resetMap()\">Reset</button><span class=\"map-zoom-label\">'+Math.round(mapZoom*100)+'%</span></div></div>'+
            '<div class=\"map-viewport\" id=\"map-viewport\" onwheel=\"wheelZoom(event)\" onmousedown=\"onViewportDown(event)\" onmousemove=\"onViewportMove(event)\" onmouseup=\"onViewportUp(event)\" onmouseleave=\"onViewportUp(event)\">'+
                '<div class=\"map-layer\" id=\"map-layer\" style=\"transform:translate('+mapPan.x+'px,'+mapPan.y+'px) scale('+mapZoom+')\">'+
                    '<img class=\"rbg-map-image\" src=\"'+mapImage(mapDef.id)+'\" alt=\"'+mapDef.name+'\" draggable=\"false\" onerror=\"this.style.display=\'none\';this.nextElementSibling.style.display=\'flex\';\">'+
                    '<div class=\"map-fallback-overlay\" style=\"display:none;position:absolute;inset:0;background:linear-gradient(135deg,'+mapDef.color+'cc,'+mapDef.color+'44);align-items:center;justify-content:center;font-family:Sport Break,sans-serif;font-size:3rem;color:rgba(255,255,255,.15);letter-spacing:6px;\">'+mapDef.short+'</div>'+
                    '<canvas class=\"map-canvas\" id=\"map-canvas\"></canvas>'+
                    '<div class=\"map-markers-layer\" id=\"map-markers-layer\"></div>'+
                '</div>'+
            '</div>'+
            '<div class=\"map-card-footer\"><span>Herramienta: <strong id=\"tool-label\">'+ (DRAW_TOOLS.find(t=>t.id===activeTool)||{}).label || 'Seleccionar' +'</strong> | Click/Arrastra en el mapa</span><span><strong>'+mapDef.short+'</strong> RBG</span></div>'+
        '</div>'+
        '<div class=\"tac-panel\">'+
            '<div class=\"tac-panel-left\"><h3 class=\"tac-section-title\">Grupos (Raid 5+5)</h3><div class=\"tac-groups-grid\">'+groupsHTML+'</div>'+
                (selectedPlayerId ? '<div class=\"tac-selected-info\">Seleccionado: <strong>'+escapeHtml(selectedPlayerId)+'</strong> - haz click en un + para asignar <button onclick=\"selectedPlayerId=null;renderActiveMap();\" class=\"tac-clear-btn\">X</button></div>' : '')+
                (isAdmin ? '<button class=\"tac-save-btn\" onclick=\"saveToServer()\">Guardar en servidor</button>' : '<div class=\"tac-admin-note\">Los cambios son locales. El GM puede guardar desde el panel admin.</div>')+
            '</div>'+
            '<div class=\"tac-panel-right\"><h3 class=\"tac-section-title\">Jugadores</h3><div class=\"tac-roster\">'+(rosterHTML||'<div class=\"tac-empty-msg\">Cargando...</div>')+'</div></div>'+
        '</div>'+
        '<div class=\"rbg-notes-card\" style=\"margin-top:1rem;\"><h3>Notas de estrategia</h3>'+(notes?'<div class=\"notes-text\">'+escapeHtml(notes)+'</div>':'<div class=\"notes-empty\">Sin notas aun.</div>')+(updatedAt?'<div class=\"notes-updated\">Actualizado: '+updatedAt+'</div>':'')+'</div>';

    setTimeout(() => { initCanvas(); renderMarkersDOM(); renderDrawingsCanvas(); }, 60);
}

/* ── Canvas drawing ── */
function initCanvas() {
    const canvas = document.getElementById('map-canvas');
    if(!canvas) return;
    const vp = document.getElementById('map-viewport');
    canvas.width = vp.offsetWidth;
    canvas.height = vp.offsetHeight;
    canvas.style.width = '100%';
    canvas.style.height = '100%';
    canvas.style.position = 'absolute';
    canvas.style.top = '0';
    canvas.style.left = '0';
    canvas.style.pointerEvents = 'none';
    renderDrawingsCanvas();
}

function renderDrawingsCanvas() {
    const canvas = document.getElementById('map-canvas');
    if(!canvas) return;
    const ctx = canvas.getContext('2d');
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    const vp = document.getElementById('map-viewport');
    const vw = vp.offsetWidth, vh = vp.offsetHeight;

    (tacticalData.drawings||[]).forEach(d => {
        const [sx,sy] = pctToScreen(d.x1||d.x, d.y1||d.y, vw, vh);
        ctx.save();
        if(d.type==='arrow') {
            const [ex,ey] = pctToScreen(d.x2, d.y2, vw, vh);
            ctx.strokeStyle = d.color||'#ff0';
            ctx.lineWidth = 3;
            ctx.beginPath(); ctx.moveTo(sx,sy); ctx.lineTo(ex,ey); ctx.stroke();
            // Arrowhead
            const ang = Math.atan2(ey-sy, ex-sx);
            const hsize = 12;
            ctx.fillStyle = d.color||'#ff0';
            ctx.beginPath();
            ctx.moveTo(ex, ey);
            ctx.lineTo(ex - hsize*Math.cos(ang-Math.PI/6), ey - hsize*Math.sin(ang-Math.PI/6));
            ctx.lineTo(ex - hsize*Math.cos(ang+Math.PI/6), ey - hsize*Math.sin(ang+Math.PI/6));
            ctx.closePath(); ctx.fill();
        } else if(d.type==='xmark') {
            const s = d.size||16;
            ctx.strokeStyle = d.color||'#f00';
            ctx.lineWidth = 3;
            ctx.beginPath(); ctx.moveTo(sx-s, sy-s); ctx.lineTo(sx+s, sy+s); ctx.stroke();
            ctx.beginPath(); ctx.moveTo(sx+s, sy-s); ctx.lineTo(sx-s, sy+s); ctx.stroke();
        } else if(d.type==='text') {
            ctx.font = 'bold 14px Inter,sans-serif';
            ctx.fillStyle = d.color||'#fff';
            ctx.strokeStyle = '#000';
            ctx.lineWidth = 3;
            const txt = d.text||'';
            ctx.strokeText(txt, sx, sy);
            ctx.fillText(txt, sx, sy);
        }
        ctx.restore();
    });

    // Draw temp preview
    if(drawingTemp && drawingTemp.type==='arrow') {
        const [sx,sy] = pctToScreen(drawingTemp.x1, drawingTemp.y1, vw, vh);
        const [ex,ey] = pctToScreen(drawingTemp.x2, drawingTemp.y2, vw, vh);
        ctx.strokeStyle = '#ff0'; ctx.lineWidth = 2; ctx.setLineDash([6,4]);
        ctx.beginPath(); ctx.moveTo(sx,sy); ctx.lineTo(ex,ey); ctx.stroke();
        ctx.setLineDash([]);
    }
}

function pctToScreen(px, py, vw, vh) {
    return [px/100*vw, py/100*vh];
}
function screenToPct(sx, sy, vw, vh) {
    return [((sx - mapPan.x)/mapZoom)/vw*100, ((sy - mapPan.y)/mapZoom)/vh*100];
}

/* ── Markers (DOM) ── */
const ROLE_MARKER_ICONS = { Tank:'assets/rbg/role_tank.png', Healer:'assets/rbg/role_healer.png', DPS:'assets/rbg/role_dps.png' };
function renderMarkersDOM() {
    const layer = document.getElementById('map-markers-layer');
    if(!layer) return;
    layer.innerHTML = (tacticalData.markers||[]).map((mk,i) => {
        const col = ROLE_COLORS[mk.group] || '#d4a017';
        const imgSrc = ROLE_MARKER_ICONS[mk.group];
        const inner = imgSrc ? '<img src="'+imgSrc+'" style="width:20px;height:20px;border-radius:50%;pointer-events:none;">' : (i+1);
        return '<div class="map-marker' + (imgSrc ? ' map-marker-role' : '') + '" style="left:'+mk.x+'%;top:'+mk.y+'%;background:'+col+';" title="'+escapeHtml(mk.label||'P'+(i+1))+'" onmousedown="event.stopPropagation();startDragMarker('+i+',event)">'+inner+'</div>';
    }).join('');
}

/* ── Viewport events ── */
function onViewportDown(e) {
    if(e.target.closest('.map-marker')) return;
    const vp = document.getElementById('map-viewport');
    const rect = vp.getBoundingClientRect();
    const [px,py] = screenToPct(e.clientX-rect.left, e.clientY-rect.top, rect.width, rect.height);
    pointerStart = {x:e.clientX, y:e.clientY};

    if(activeTool==='select') {
        isPanning = true; panStart = {x:e.clientX-mapPan.x, y:e.clientY-mapPan.y};
    } else if(activeTool==='marker' || activeTool.startsWith('marker_')) {
        isPanning = false;
    } else if(activeTool==='arrow') {
        drawingTemp = {type:'arrow', x1:clampPct(px), y1:clampPct(py), x2:clampPct(px), y2:clampPct(py), color:'#ff0'};
    } else if(activeTool==='xmark') {
        tacticalData.drawings.push({type:'xmark', x:roundPct(px), y:roundPct(py), size:16, color:'#f00'});
        saveTacticalData(); renderDrawingsCanvas();
    } else if(activeTool==='text') {
        const txt = prompt('Texto:','');
        if(txt) { tacticalData.drawings.push({type:'text', x:roundPct(px), y:roundPct(py), text:txt, color:'#fff'}); saveTacticalData(); renderDrawingsCanvas(); }
    } else if(activeTool==='erase') {
        const hit = findDrawingAt(px, py);
        if(hit.type==='marker') { tacticalData.markers.splice(hit.index,1); saveTacticalData(); renderMarkersDOM(); }
        else if(hit.type==='drawing') { tacticalData.drawings.splice(hit.index,1); saveTacticalData(); renderDrawingsCanvas(); }
    }
}

function onViewportMove(e) {
    const vp = document.getElementById('map-viewport');
    const rect = vp.getBoundingClientRect();
    if(isPanning && activeTool==='select') {
        mapPan = {x:e.clientX-panStart.x, y:e.clientY-panStart.y}; applyTransform();
    } else if(drawingTemp && drawingTemp.type==='arrow') {
        const [px,py] = screenToPct(e.clientX-rect.left, e.clientY-rect.top, rect.width, rect.height);
        drawingTemp.x2 = roundPct(px);
        drawingTemp.y2 = roundPct(py);
        renderDrawingsCanvas();
    }
}

function onViewportUp(e) {
    if(isPanning && activeTool==='select') {
        isPanning = false;
    } else if((activeTool==='marker' || activeTool.startsWith('marker_')) && Math.abs(e.clientX-pointerStart.x)<4 && Math.abs(e.clientY-pointerStart.y)<4) {
        const vp = document.getElementById('map-viewport');
        const rect = vp.getBoundingClientRect();
        const [px,py] = screenToPct(e.clientX-rect.left, e.clientY-rect.top, rect.width, rect.height);
        if(px>=0&&px<=100&&py>=0&&py<=100) {
            const toolDef = DRAW_TOOLS.find(t=>t.id===activeTool);
            if(toolDef && toolDef.role) {
                const count = tacticalData.markers.filter(m=>m.group===toolDef.role).length + 1;
                tacticalData.markers.push({x:roundPct(px), y:roundPct(py), label:toolDef.role+' '+count, group:toolDef.role});
                saveTacticalData(); renderMarkersDOM();
            } else {
                const label = prompt('Etiqueta:','Punto '+(tacticalData.markers.length+1));
                if(label!==null) {
                    let g='attack'; if(label.toLowerCase().includes('def')) g='defense'; else if(label.toLowerCase().includes('flag')||label.toLowerCase().includes('bandera')) g='fc';
                    tacticalData.markers.push({x:roundPct(px), y:roundPct(py), label, group:g});
                    saveTacticalData(); renderMarkersDOM();
                }
            }
        }
    }
    if(drawingTemp && drawingTemp.type==='arrow') {
        if(Math.abs(drawingTemp.x2-drawingTemp.x1)>1 || Math.abs(drawingTemp.y2-drawingTemp.y1)>1) {
            tacticalData.drawings.push({...drawingTemp});
            saveTacticalData();
        }
        drawingTemp = null;
        renderDrawingsCanvas();
    }
}

function findDrawingAt(px, py) {
    for(let i=(tacticalData.markers||[]).length-1; i>=0; i--) {
        const mk = tacticalData.markers[i];
        const dx = (mk.x||0) - px, dy = (mk.y||0) - py;
        if(Math.sqrt(dx*dx+dy*dy) < 3) return {type:'marker', index:i};
    }
    for(let i=tacticalData.drawings.length-1; i>=0; i--) {
        const d = tacticalData.drawings[i];
        if(d.type==='arrow') {
            if(distanceToSegment(px, py, d.x1, d.y1, d.x2, d.y2) < 2.5) return {type:'drawing', index:i};
        } else {
            const dx = (d.x||0) - px, dy = (d.y||0) - py;
            if(Math.sqrt(dx*dx+dy*dy) < 3) return {type:'drawing', index:i};
        }
    }
    return {type:null, index:-1};
}

function clampPct(v) {
    return Math.max(0,Math.min(100,v));
}

function roundPct(v) {
    return Math.round(clampPct(v)*10)/10;
}

function distanceToSegment(px, py, x1, y1, x2, y2) {
    const dx = x2 - x1, dy = y2 - y1;
    if(dx===0 && dy===0) return Math.sqrt((px-x1)*(px-x1)+(py-y1)*(py-y1));
    const t = Math.max(0,Math.min(1,((px-x1)*dx+(py-y1)*dy)/(dx*dx+dy*dy)));
    const x = x1 + t*dx, y = y1 + t*dy;
    return Math.sqrt((px-x)*(px-x)+(py-y)*(py-y));
}

function startDragMarker(idx, e) {
    e.preventDefault();
    const mk = tacticalData.markers[idx];
    const vp = document.getElementById('map-viewport');
    const rect = vp.getBoundingClientRect();
    function onMove(ev) {
        const [px,py] = screenToPct(ev.clientX-rect.left, ev.clientY-rect.top, rect.width, rect.height);
        mk.x = Math.max(0,Math.min(100,Math.round(px*10)/10));
        mk.y = Math.max(0,Math.min(100,Math.round(py*10)/10));
        saveTacticalData(); renderMarkersDOM();
    }
    function onUp() { document.removeEventListener('mousemove',onMove); document.removeEventListener('mouseup',onUp); }
    document.addEventListener('mousemove',onMove);
    document.addEventListener('mouseup',onUp);
}

/* ── Zoom/Pan ── */
function zoomMap(d) { mapZoom=Math.max(0.5,Math.min(3,mapZoom+d)); applyTransform(); renderDrawingsCanvas(); }
function resetMap() { mapZoom=1; mapPan={x:0,y:0}; applyTransform(); renderDrawingsCanvas(); }
function wheelZoom(e) { e.preventDefault(); zoomMap(e.deltaY<0?0.15:-0.15); }
function applyTransform() {
    const layer = document.getElementById('map-layer');
    if(layer) layer.style.transform = 'translate('+mapPan.x+'px,'+mapPan.y+'px) scale('+mapZoom+')';
    const label = document.querySelector('.map-zoom-label');
    if(label) label.textContent = Math.round(mapZoom*100)+'%';
}

/* ── Tool selection ── */
function setTool(toolId) {
    activeTool = toolId;
    document.querySelectorAll('.draw-tool-btn').forEach(b => b.classList.remove('active'));
    const btns = document.querySelectorAll('.draw-tool-btn');
    DRAW_TOOLS.forEach((t,i) => { if(t.id===toolId && btns[i]) btns[i].classList.add('active'); });
    const tl = document.getElementById('tool-label');
    if(tl) tl.textContent = (DRAW_TOOLS.find(t=>t.id===toolId)||{}).label || 'Seleccionar';
    isPanning = false; drawingTemp = null;
}

/* ── Player assignment ── */
function selectPlayer(pid) { selectedPlayerId=pid; renderActiveMap(); }

function assignToGroup(gid, idx) {
    if(!selectedPlayerId) { alert('Selecciona un jugador primero - haz click en uno de la lista de la derecha.'); return; }
    if(!tacticalData.groups[gid]) tacticalData.groups[gid]=[];
    Object.keys(tacticalData.groups).forEach(k => { tacticalData.groups[k] = tacticalData.groups[k].filter(p => p!==selectedPlayerId); });
    tacticalData.groups[gid][idx] = selectedPlayerId;
    selectedPlayerId=null; saveTacticalData(); renderActiveMap();
}

function removeFromGroup(gid, idx) {
    tacticalData.groups[gid][idx]=null;
    tacticalData.groups[gid]=tacticalData.groups[gid].filter(p=>p!=null);
    saveTacticalData(); renderActiveMap();
}

/* ── RBG Tracker Dashboard ── */
let rbgTrackerLoaded = false;

function renderTrackerSection() {
    if (rbgTrackerLoaded) return;
    rbgTrackerLoaded = true;

    // Insert tracker section after .rbg-layout
    const layout = document.querySelector('.rbg-layout');
    if (!layout) return;

    const section = document.createElement('section');
    section.className = 'rbg-tracker-section';
    section.id = 'rbg-tracker';
    section.innerHTML =
        '<div class="tracker-header">' +
            '<h2><img src="assets/rbg/role_dps.png" style="width:28px;height:28px;vertical-align:middle;border-radius:50%;margin-right:8px;">RBG Match Tracker</h2>' +
            '<span class="tracker-badge">LIVE</span>' +
        '</div>' +
        '<div class="tracker-addon-banner">' +
            '<div class="addon-info">' +
                '<span class="addon-icon">⚔️</span>' +
                '<div><strong>ExiliumRBG Tracker</strong><span class="addon-version">v1.1.0 · Midnight</span></div>' +
                '<span class="addon-desc">Addon oficial — registra cada RBG automaticamente</span>' +
            '</div>' +
            '<a href="assets/rbg/ExiliumRBG.zip" class="addon-download-btn" download>⬇ Descargar Addon</a>' +
        '</div>' +
        '<div class="tracker-stats-grid" id="tracker-stats">' +
            '<div class="tracker-stat-card"><div class="stat-label">Partidas</div><div class="stat-value" id="ts-total">—</div></div>' +
            '<div class="tracker-stat-card win"><div class="stat-label">Victorias</div><div class="stat-value" id="ts-wins">—</div></div>' +
            '<div class="tracker-stat-card loss"><div class="stat-label">Derrotas</div><div class="stat-value" id="ts-losses">—</div></div>' +
            '<div class="tracker-stat-card"><div class="stat-label">Winrate</div><div class="stat-value" id="ts-wr">—</div></div>' +
            '<div class="tracker-stat-card"><div class="stat-label">Rating Neto</div><div class="stat-value" id="ts-rating">—</div></div>' +
        '</div>' +
        '<div class="tracker-panels">' +
            '<div class="tracker-panel" id="tracker-history">' +
                '<h3>Ultimas Partidas</h3>' +
                '<div class="tracker-table-wrap"><table class="tracker-table"><thead><tr>' +
                    '<th>#</th><th>Mapa</th><th>Res.</th><th>Rating</th><th>Dur.</th><th>Jugadores</th>' +
                '</tr></thead><tbody id="tracker-rows"><tr><td colspan="6" style="text-align:center;color:var(--text-muted);">Cargando...</td></tr></tbody></table></div>' +
            '</div>' +
            '<div class="tracker-panel" id="tracker-top">' +
                '<h3>Top Jugadores</h3>' +
                '<div id="tracker-top-players"><div style="color:var(--text-muted);padding:1rem;">Cargando...</div></div>' +
            '</div>' +
        '</div>' +
        '<div class="tracker-panel" id="tracker-maps" style="margin-top:1rem;">' +
            '<h3>Stats por Mapa</h3>' +
            '<div id="tracker-map-stats"><div style="color:var(--text-muted);padding:1rem;">Cargando...</div></div>' +
        '</div>';

    layout.parentNode.insertBefore(section, layout.nextSibling);
    fetchTrackerData();
}

async function fetchTrackerData() {
    try {
        const [statsRes, historyRes] = await Promise.all([
            fetch(API_URL + '/rbg/stats'),
            fetch(API_URL + '/rbg/history?limit=20'),
        ]);
        const stats = await statsRes.json();
        const history = await historyRes.json();
        renderTrackerStats(stats);
        renderTrackerHistory(history.matches || []);
        renderTrackerTopPlayers(stats.playerContrib || {});
        renderTrackerMapStats(stats.topMaps || {});
    } catch (e) {
        console.warn('Tracker fetch error:', e);
        const el = document.getElementById('tracker-rows');
        if (el) el.innerHTML = '<tr><td colspan="6" style="text-align:center;color:#888;">Sin datos del tracker aun. Instala el addon para empezar a registrar partidas.</td></tr>';
    }
}

function renderTrackerStats(s) {
    const total = s.totalMatches || 0;
    const wins = s.wins || 0;
    const losses = s.losses || 0;
    const wr = total > 0 ? Math.round((wins / total) * 100) : 0;
    const delta = s.ratingDelta || 0;

    const set = (id, v) => { const el = document.getElementById(id); if (el) el.textContent = v; };
    set('ts-total', total);
    set('ts-wins', wins);
    set('ts-losses', losses);
    set('ts-wr', wr + '%');
    const rd = document.getElementById('ts-rating');
    if (rd) {
        rd.textContent = (delta >= 0 ? '+' : '') + delta;
        rd.style.color = delta >= 0 ? '#22c55e' : '#ef4444';
    }
}

function renderTrackerHistory(matches) {
    const tbody = document.getElementById('tracker-rows');
    if (!tbody) return;
    if (!matches.length) {
        tbody.innerHTML = '<tr><td colspan="6" style="text-align:center;color:#888;">Sin partidas registradas.</td></tr>';
        return;
    }
    tbody.innerHTML = matches.slice(0, 15).map((m, i) => {
        const res = m.won ? '<span style="color:#22c55e;font-weight:700;">W</span>' : '<span style="color:#ef4444;font-weight:700;">L</span>';
        const delta = (m.ratingDelta || 0);
        const deltaStr = '<span style="color:' + (delta >= 0 ? '#22c55e' : '#ef4444') + ';">' + (delta >= 0 ? '+' : '') + delta + '</span>';
        const dur = m.duration ? Math.floor(m.duration / 60) + 'm' : '—';
        const np = (m.players || []).length;
        const shortMap = (m.map || '').replace('Battle for ', '').replace('Temple of ', '').replace('Eye of the ', '');
        return '<tr>' +
            '<td>' + (i + 1) + '</td>' +
            '<td title="' + escapeHtml(m.map || '') + '">' + escapeHtml(shortMap) + '</td>' +
            '<td>' + res + '</td>' +
            '<td>' + (m.ratingAfter || '—') + ' ' + deltaStr + '</td>' +
            '<td>' + dur + '</td>' +
            '<td>' + np + '</td>' +
        '</tr>';
    }).join('');
}

function renderTrackerTopPlayers(contrib) {
    const el = document.getElementById('tracker-top-players');
    if (!el) return;
    const entries = Object.entries(contrib);
    if (!entries.length) { el.innerHTML = '<div style="color:#888;padding:0.5rem;">Sin datos.</div>'; return; }
    entries.sort((a, b) => (b[1].damage + b[1].healing) - (a[1].damage + a[1].healing));
    el.innerHTML = '<div class="top-players-list">' + entries.slice(0, 10).map(([name, s], i) => {
        const dmg = s.damage >= 1e6 ? (s.damage / 1e6).toFixed(1) + 'M' : Math.floor(s.damage / 1000) + 'k';
        const heal = s.healing >= 1e6 ? (s.healing / 1e6).toFixed(1) + 'M' : Math.floor(s.healing / 1000) + 'k';
        return '<div class="top-player-row">' +
            '<span class="top-rank">#' + (i + 1) + '</span>' +
            '<span class="top-name">' + escapeHtml(name) + '</span>' +
            '<span class="top-stat">DMG: ' + dmg + '</span>' +
            '<span class="top-stat">Heal: ' + heal + '</span>' +
            '<span class="top-stat">KB: ' + (s.kills || 0) + '</span>' +
            '<span class="top-stat">' + (s.matches || 0) + ' juegos</span>' +
        '</div>';
    }).join('') + '</div>';
}

function renderTrackerMapStats(topMaps) {
    const el = document.getElementById('tracker-map-stats');
    if (!el) return;
    const entries = Object.entries(topMaps);
    if (!entries.length) { el.innerHTML = '<div style="color:#888;padding:0.5rem;">Sin datos.</div>'; return; }
    entries.sort((a, b) => (b[1].wins + b[1].losses) - (a[1].wins + a[1].losses));
    el.innerHTML = '<div class="map-stats-grid">' + entries.map(([map, s]) => {
        const total = s.wins + s.losses;
        const wr = total > 0 ? Math.round((s.wins / total) * 100) : 0;
        const barColor = wr >= 60 ? '#22c55e' : wr >= 40 ? '#f59e0b' : '#ef4444';
        const shortMap = map.replace('Battle for ', '').replace('Temple of ', '').replace('Eye of the ', '');
        return '<div class="map-stat-item">' +
            '<div class="map-stat-name">' + escapeHtml(shortMap) + '</div>' +
            '<div class="map-stat-bar"><div class="map-stat-fill" style="width:' + wr + '%;background:' + barColor + ';"></div></div>' +
            '<div class="map-stat-wr">' + wr + '% <small>(' + s.wins + 'W/' + s.losses + 'L)</small></div>' +
        '</div>';
    }).join('') + '</div>';
}
