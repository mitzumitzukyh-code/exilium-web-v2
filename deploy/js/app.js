/*
 * EXILIUM BATTLE PASS (v3.2)
 * Lógica principal del Frontend
 */

document.addEventListener('DOMContentLoaded', () => {
    const API_URL = 'https://exilium-blizzard.mitzumitzukyhs.workers.dev/api';
    let state = { players: [], announcement: null, officers: [], hallOfFame: { entries: [] } };

    // Track page view (fire & forget)
    fetch(API_URL + '/pageview', { method: 'POST' }).catch(() => {});

    const EMBLEM_MAP = {
        'EXILIADO': 'assets/emblema_1.png',
        'INICIADO': 'assets/emblema_1.png',
        'PENITENTE': 'assets/emblema_2.png',
        'SOMBRA': 'assets/emblema_3.png',
        'APÓSTATA': 'assets/emblema_4.png',
        'ROMPEJURAMENTOS': 'assets/emblema_5.png',
        'HEREJE': 'assets/emblema_6.png',
        'PROFETA': 'assets/emblema_7.png',
        'EXARCA': 'assets/emblema_8.png',
    };

    const RANK_COLORS = {
        'EXILIADO': '#9a8878',
        'INICIADO': '#9a8878',
        'PENITENTE': '#7a9abb',
        'SOMBRA': '#8888cc',
        'APÓSTATA': '#cc6644',
        'ROMPEJURAMENTOS': '#dd4444',
        'HEREJE': '#ee2222',
        'PROFETA': '#ff8800',
        'EXARCA': '#d4a017',
    };

    function stripDiacritics(str) {
        return str ? str.normalize('NFD').replace(/[\u0300-\u036f]/g, '') : str;
    }

    const BRACKET_NAMES = {
        rs: 'Solo Shuffle', r2: 'Arena 2v2', r3: 'Arena 3v3', rbg: 'RBG', bgs: 'Blitz'
    };

    // KV guarda directamente: rs, r2, r3, rbg, bgs — sin conversión
    const BRACKET_MAP = {
        rs: 'rs',
        r2: 'r2', 
        r3: 'r3',
        rbg: 'rbg',
        bgs: 'bgs'
    };

    const BRACKET_ICONS = {
        rs: '⚔️', r2: '🗡️', r3: '⚡', rbg: '🏳️', bgs: '💨'
    };

    // Helper: SIEMPRE calcula level/rank localmente desde total_xp
    // Esto evita problemas si el backend almacena datos corruptos
    function getPlayerBattlePass(player) {
        const bp = player.battlepass || {};
        const totalXp = bp.total_xp || 0;
        const calc = getLevelFromXP(totalXp);
        return {
            total_xp: totalXp,
            level: calc.level,
            rank_name: calc.rank,
            xp_breakdown: bp.xp_breakdown || {}
        };
    }

    // --- SELECTORS ---
    const selectors = {
        announcementBanner: document.getElementById('announcement-banner'),
        header: document.getElementById('main-header'),
        hamburger: document.querySelector('.hamburger'),
        navMenu: document.querySelector('.nav-menu'),
        guildStats: document.getElementById('guild-stats'),
        bracketsContainer: document.getElementById('brackets-container'),
        podium: document.getElementById('podium'),
        leaderboardTable: document.getElementById('leaderboard-table'),
        leaderboardTableBody: document.querySelector('#leaderboard-table tbody'),
        rankingTabs: document.getElementById('ranking-tabs'),
        rankingContent: document.getElementById('ranking-content'),
        conquerorsContainer: document.getElementById('conquerors-container'),
        officersContainer: document.getElementById('officers-container'),
        guildRankingContainer: document.getElementById('guild-ranking-container'),
        modalOverlay: document.getElementById('player-modal'),
        modalBody: document.getElementById('modal-body'),
        modalClose: document.getElementById('modal-close'),
    };

    // --- DATA FETCHING ---
    function safeFetch(url, fallback) {
        return fetch(url).then(res => res.ok ? res.json() : fallback).catch(() => fallback);
    }

    async function fetchData() {
        const [playersRes, announcementRes, officersRes, guildRankingRes, hofRes, boostBannerRes, newsRes] = await Promise.all([
            safeFetch(`${API_URL}/players`, []),
            safeFetch(`${API_URL}/announcement`, { message: null }),
            safeFetch(`${API_URL}/officers`, []),
            safeFetch(`${API_URL}/guild-ranking`, { ranking: [] }),
            safeFetch(`${API_URL}/hall-of-fame`, { entries: [] }),
            safeFetch(`${API_URL}/boost-banner`, { visible: true }),
            safeFetch(`${API_URL}/news`, []),
        ]);
        state.players = Array.isArray(playersRes) ? playersRes : [];
        state.announcement = announcementRes;
        state.officers = Array.isArray(officersRes) ? officersRes : [];
        state.guildRanking = guildRankingRes;
        state.hallOfFame = hofRes && Array.isArray(hofRes.entries) ? hofRes : { entries: [] };
        state.news = Array.isArray(newsRes) ? newsRes : [];
        const boostBanner = document.querySelector('.carries-banner-v2');
        if (boostBanner) boostBanner.style.display = boostBannerRes.visible ? '' : 'none';
        renderAll();
    }

    // --- RENDER FUNCTIONS ---
    function renderAll() {
        renderAnnouncement();
        renderHeroStats();
        renderBrackets();
        renderBattlePass();
        renderRanking('all');
        renderConquerors();
        renderOfficers();
        renderHallOfFame();
        renderGuildRanking();
        renderNews();
    }

    function renderAnnouncement() {
        if (!selectors.announcementBanner) return;
        if (state.announcement?.message) {
            selectors.announcementBanner.textContent = state.announcement.message;
            selectors.announcementBanner.className = `announcement-banner ${state.announcement.type || 'info'}`;
            selectors.announcementBanner.style.display = 'block';
            if (selectors.header) selectors.header.style.top = `${selectors.announcementBanner.offsetHeight}px`;
        } else {
            selectors.announcementBanner.style.display = 'none';
            if (selectors.header) selectors.header.style.top = '0px';
        }
    }

    function getMaxRating(p) {
        const pvp = p.pvp || {};
        const c = pvp.current || {};
        const sm = pvp.season_max || {};
        return Math.max(0,
            sm.max_rs || 0, sm.max_r2 || 0, sm.max_r3 || 0, sm.max_rbg || 0, sm.max_bgs || 0,
            c.rs || 0, c.r2 || 0, c.r3 || 0, c.rbg || 0, c.bgs || 0
        );
    }

    function renderHeroStats() {
        if (!selectors.guildStats) return;
        const totalPlayers = state.players.length;
        let maxRating = 0;
        let maxLevel = 0;
        state.players.forEach(p => {
            const currentMax = getMaxRating(p);
            if (currentMax > maxRating) maxRating = currentMax;
            const bp = getPlayerBattlePass(p);
            if (bp.level > maxLevel) maxLevel = bp.level;
        });

        selectors.guildStats.innerHTML = `
            <div class="stat-card"><h3>${totalPlayers}</h3><p>Jugadores Inscritos</p></div>
            <div class="stat-card"><h3>${maxRating}</h3><p>Mayor Rating</p></div>
            <div class="stat-card"><h3>${maxLevel}</h3><p>Mayor Nivel</p></div>
        `;
    }

    function renderBrackets() {
        if (!selectors.bracketsContainer) return;
        const brackets = ['rs', 'r2', 'r3', 'rbg', 'bgs'];
        let html = '';
        brackets.forEach(bracket => {
            let topPlayer = null;
            let topRating = 0;
            state.players.forEach(p => {
                const rating = p.pvp?.current?.[bracket] || 0;
                if (rating > topRating) { topRating = rating; topPlayer = p; }
            });
            html += `
                <div class="bracket-card">
                    <div class="bracket-icon">${BRACKET_ICONS[bracket] || '⚔️'}</div>
                    <h3>${BRACKET_NAMES[bracket] || bracket}</h3>
                    <div class="bracket-top-player">${topPlayer ? topPlayer.name : '—'}</div>
                    <div class="bracket-top-rating">${topRating > 0 ? topRating.toLocaleString() : '—'}</div>
                </div>
            `;
        });
        selectors.bracketsContainer.innerHTML = html;
    }

    function renderBattlePass() {
        if (!selectors.leaderboardTableBody) return;
        const sortedPlayers = [...state.players].sort((a, b) => (b.battlepass?.total_xp || 0) - (a.battlepass?.total_xp || 0));
        renderPodium(sortedPlayers.slice(0, 3));
        renderLeaderboard(sortedPlayers);
    }

    function renderPodium(top3) {
        if (!selectors.podium) return;
        const podiumHTML = [1, 0, 2].map(index => {
            const player = top3[index];
            if (!player) return `<div class="podium-item p-${index + 1}"></div>`;
            const bp = getPlayerBattlePass(player);
            const level = bp.level;
            const rankName = bp.rank_name;
            const emblem = EMBLEM_MAP[rankName];
            return `
                <div class="podium-item p-${index + 1}" data-player-id="${player.id}">
                    <div class="podium-rank">${index + 1}</div>
                    <img src="${player.media?.avatar || 'assets/logo.png'}" class="podium-avatar" alt="${player.name}">
                    <h3 style="color: ${RANK_COLORS[rankName] || '#fff'}">${stripDiacritics(player.name)}</h3>
                    <p>${(bp.total_xp || 0).toLocaleString()} XP</p>
                    ${emblem ? `<img src="${emblem}" class="podium-emblem">` : ''}
                </div>
            `;
        }).join('');
        selectors.podium.innerHTML = podiumHTML;
    }

    function renderLeaderboard(players) {
        selectors.leaderboardTableBody.innerHTML = '';
        players.forEach((player, index) => {
            const bp = getPlayerBattlePass(player);
            const level = bp.level;
            const rankName = bp.rank_name;
            const emblem = EMBLEM_MAP[rankName];
            const xpStart = getXpForCurrentLevel(level);
            const xpEnd = getXpForNextLevel(level);
            const progress = xpEnd === xpStart ? 100 : (((bp.total_xp || 0) - xpStart) / (xpEnd - xpStart)) * 100;

            const row = document.createElement('tr');
            row.className = 'player-row';
            row.dataset.playerId = player.id;
            row.innerHTML = `
                <td>${index + 1}</td>
                <td class="player-cell">
                    <img src="${player.media?.avatar || 'assets/logo.png'}" alt="${player.name}" loading="lazy">
                    <span style="color: ${RANK_COLORS[rankName] || '#fff'}">${player.name}</span>
                    ${player.marriage ? '<span>💍</span>' : ''}
                </td>
                <td>${level}</td>
                <td>${(bp.total_xp || 0).toLocaleString()}</td>
                <td>${emblem ? `<img src="${emblem}" class="rank-badge" alt="" onerror="this.style.display='none'">` : ''} ${rankName}</td>
                <td><div class="progress-bar-container"><div class="progress-bar" style="width: ${progress.toFixed(2)}%;"></div></div></td>
                <td><a href="player-profile.html?id=${encodeURIComponent(player.id)}" target="_blank" rel="noopener" class="armory-btn" title="Ver perfil" onclick="event.stopPropagation()">🛡️</a></td>
            `;
            selectors.leaderboardTableBody.appendChild(row);
        });
    }

    // --- RANKING PVP ---
    function renderRanking(bracket) {
        if (!selectors.rankingContent) return;
        let sorted;
        if (bracket === 'all') {
            sorted = [...state.players].sort((a, b) => getMaxRating(b) - getMaxRating(a));
        } else {
            const kvBracket = BRACKET_MAP[bracket] || bracket;
            sorted = [...state.players].sort((a, b) => {
                return (b.pvp?.current?.[kvBracket] || 0) - (a.pvp?.current?.[kvBracket] || 0);
            });
        }

        if (!sorted.length) {
            selectors.rankingContent.innerHTML = '<p class="ranking-empty">Sin datos disponibles</p>';
            return;
        }

        let html = '<table class="ranking-table"><thead><tr><th>#</th><th>Jugador</th><th>Rating</th><th>W/L</th></tr></thead><tbody>';
        sorted.forEach((p, i) => {
            const kvBracket = bracket === 'all' ? null : (BRACKET_MAP[bracket] || bracket);
            const rating = bracket === 'all' ? getMaxRating(p) : (p.pvp?.current?.[kvBracket] || 0);
            const wins = bracket === 'all' ? 0 : (p.pvp?.wins?.[kvBracket] || 0);
            const losses = bracket === 'all' ? 0 : (p.pvp?.losses?.[kvBracket] || 0);
            const wl = bracket === 'all' ? '—' : `${wins}W / ${losses}L`;
            html += `
                <tr class="player-row" data-player-id="${p.id}">
                    <td>${i + 1}</td>
                    <td>${p.name}</td>
                    <td>${rating > 0 ? rating.toLocaleString() : '—'}</td>
                    <td>${wl}</td>
                </tr>
            `;
        });
        html += '</tbody></table>';
        selectors.rankingContent.innerHTML = html;
    }

    // --- CONQUISTADORES ---
    function renderConquerors() {
        if (!selectors.conquerorsContainer) return;
        const highRanks = ['APÓSTATA', 'ROMPEJURAMENTOS', 'HEREJE', 'PROFETA', 'EXARCA'];
        const conquerors = state.players.filter(p => {
            const bp = getPlayerBattlePass(p);
            return highRanks.includes(bp.rank_name);
        });

        if (!conquerors.length) {
            selectors.conquerorsContainer.innerHTML = '<p class="ranking-empty">Aún no hay conquistadores esta temporada.</p>';
            return;
        }

        let html = '';
        conquerors.forEach(p => {
            const bp = getPlayerBattlePass(p);
            const rankName = bp.rank_name;
            const emblem = EMBLEM_MAP[rankName];
            html += `
                <div class="conqueror-card" data-player-id="${p.id}">
                    <img src="${p.media?.avatar || 'assets/logo.png'}" class="conqueror-avatar" alt="${p.name}">
                    ${emblem ? `<img src="${emblem}" class="conqueror-emblem">` : ''}
                    <h4 style="color: ${RANK_COLORS[rankName] || '#fff'}">${stripDiacritics(p.name)}</h4>
                    <span class="conqueror-rank">${rankName}</span>
                </div>
            `;
        });
        selectors.conquerorsContainer.innerHTML = html;
    }

    // --- OFFICERS ---
    function renderOfficers() {
        if (!selectors.officersContainer) return;
        if (!state.officers.length) {
            selectors.officersContainer.innerHTML = '<p class="officers-empty">No hay oficiales configurados.</p>';
            return;
        }

        const sorted = [...state.officers].sort((a, b) => (a.order ?? 99) - (b.order ?? 99));
        let html = '';

        sorted.forEach(officer => {
            // Usa player_data embebido (funciona para inscritos y no inscritos)
            const player = officer.player_data;
            if (!player) return;

            const pvp = player.pvp || { current: {} };
            const cur = pvp.current || {};
            const wins = pvp.wins || {};
            const losses = pvp.losses || {};
            const avatar = player.media?.avatar || 'assets/logo.png';
            const className = player.class || '—';
            const realm = player.realm_display || player.realm || '';
            const title = officer.title || 'Oficial';
            const lore = officer.lore || '';
            const isInscribed = state.players.some(p => p.id === officer.player_id);
            const armoryUrl = player.media?.armory_url || '#';

            const brackets = [
                { key: 'rs', label: 'Shuffle' },
                { key: 'r2', label: '2v2' },
                { key: 'r3', label: '3v3' },
                { key: 'rbg', label: 'RBG' },
                { key: 'bgs', label: 'Blitz' },
            ];

            // Pick top 3 brackets by rating
            const topBrackets = brackets
                .map(b => ({ ...b, rating: cur[b.key] || 0, w: wins[b.key] || 0, l: losses[b.key] || 0 }))
                .sort((a, b) => b.rating - a.rating)
                .slice(0, 3);

            let pvpHTML = topBrackets.map(b => `
                <div class="officer-pvp-item">
                    <div class="officer-pvp-val">${b.rating > 0 ? b.rating.toLocaleString() : '—'}</div>
                    <div class="officer-pvp-label">${b.label}</div>
                </div>
            `).join('');

            html += `
                <div class="officer-card" data-player-id="${officer.player_id}" data-inscribed="${isInscribed}" data-armory="${armoryUrl}">
                    <div class="officer-card-header">
                        <img src="${avatar}" class="officer-avatar" alt="${player.name}" loading="lazy"
                             onerror="this.src='assets/logo.png'">
                        <div class="officer-info">
                            <h3 style="color: var(--accent-color)">${stripDiacritics(player.name)}</h3>
                            <div class="officer-class">${className} · ${realm}</div>
                            <div><span class="officer-title-badge">${title}</span></div>
                        </div>
                    </div>
                    <div class="officer-pvp-grid">${pvpHTML}</div>
                    ${lore ? `<div class="officer-lore"><p>${lore}</p></div>` : ''}
                </div>
            `;
        });

        if (!html) {
            selectors.officersContainer.innerHTML = '<p class="officers-empty">No se encontraron datos de los oficiales.</p>';
            return;
        }

        selectors.officersContainer.innerHTML = html;

        selectors.officersContainer.querySelectorAll('.officer-card').forEach(card => {
            card.addEventListener('click', () => {
                const playerId = card.dataset.playerId;
                const inscribed = card.dataset.inscribed === 'true';
                if (inscribed && playerId) {
                    openModal(playerId);
                } else {
                    const armory = card.dataset.armory;
                    if (armory && armory !== '#') window.open(armory, '_blank');
                }
            });
        });
    }

    // --- HALL OF FAME ---
    function hofParseYouTubeId(url) {
        if (!url) return null;
        const m = url.match(/(?:youtube\.com\/(?:watch\?v=|embed\/|shorts\/)|youtu\.be\/)([a-zA-Z0-9_-]{11})/);
        return m ? m[1] : null;
    }

    function hofGetEmbedUrl(url) {
        if (!url) return null;
        const ytId = hofParseYouTubeId(url);
        if (ytId) return 'https://www.youtube.com/embed/' + ytId + '?autoplay=1&mute=1&loop=1&playlist=' + ytId + '&controls=0&showinfo=0&modestbranding=1';
        const gd = url.match(/drive\.google\.com\/file\/d\/([a-zA-Z0-9_-]+)/);
        if (gd) return 'https://drive.google.com/file/d/' + gd[1] + '/preview';
        const st = url.match(/streamable\.com\/([a-zA-Z0-9]+)/);
        if (st) return 'https://streamable.com/e/' + st[1];
        return null;
    }

    function renderHallOfFame() {
        const section = document.getElementById('hall-of-fame');
        if (!section) return;

        const entries = state.hallOfFame.entries || [];
        const videoUrl = state.hallOfFame.video_url || '';

        const HOF_CAT = {
            weekly: { label: 'Jugador de la Semana', icon: '&#9876;' },
            monthly: { label: 'Jugador del Mes', icon: '&#127942;' },
            gold: { label: 'Recompensa de Oro', icon: '&#128176;' },
        };

        // Update main video
        if (videoUrl) {
            const frame = section.querySelector('.hof-video-frame');
            if (frame) {
                const embedUrl = hofGetEmbedUrl(videoUrl);
                if (embedUrl) {
                    frame.innerHTML = '<iframe src="' + embedUrl + '" style="width:100%;height:100%;border:0;position:absolute;top:0;left:0;" allow="autoplay;encrypted-media" allowfullscreen></iframe><div class="hof-video-overlay"></div>';
                    frame.style.position = 'relative';
                } else {
                    frame.innerHTML = '<video autoplay muted loop playsinline style="width:100%;height:100%;object-fit:contain;display:block;background:#000;"><source src="' + videoUrl + '" type="video/mp4"></video><div class="hof-video-overlay"></div>';
                }
            }
        }

        if (!entries.length) return;

        const featured = entries[0];

        // Update featured player info
        const nameEl = section.querySelector('.hof-player-name');
        if (nameEl) nameEl.textContent = featured.player_name || 'Jugador Destacado';

        const badgeLabel = section.querySelector('.hof-badge-label');
        if (badgeLabel) {
            const cat = HOF_CAT[featured.category] || HOF_CAT.weekly;
            badgeLabel.textContent = cat.label;
        }

        const descEl = section.querySelector('.hof-player-desc');
        if (descEl) descEl.textContent = featured.reason || 'Cada semana reconocemos al guerrero que más ha brillado en los campos de batalla de Exilium.';

        // Rebuild category cards (clickable to filter)
        const catContainer = section.querySelector('.hof-categories');
        if (catContainer) {
            const byCategory = {};
            entries.forEach(e => { if (!byCategory[e.category]) byCategory[e.category] = e; });
            let catHtml = '';
            ['weekly', 'monthly', 'gold'].forEach(catKey => {
                const cat = HOF_CAT[catKey];
                const entry = byCategory[catKey];
                const playerLabel = entry ? entry.player_name : '—';
                const sub = entry ? (entry.achievement || entry.reason || '') : '';
                catHtml += `<div class="hof-cat-card hof-cat-filter" data-cat="${catKey}" style="cursor:pointer;transition:border-color .2s,transform .15s;" onclick="hofFilterCategory('${catKey}')">
                    <div class="hof-cat-icon">${cat.icon}</div>
                    <div class="hof-cat-info">
                        <strong>${cat.label}</strong>
                        <span style="color:var(--accent-color);font-weight:600;">${playerLabel}</span>
                        ${sub ? `<span style="font-size:.78em;opacity:.65;">${sub}</span>` : ''}
                    </div>
                </div>`;
            });
            catContainer.innerHTML = catHtml;
        }

        // Player list with individual videos
        let listContainer = section.querySelector('.hof-players-list');
        if (!listContainer) {
            listContainer = document.createElement('div');
            listContainer.className = 'hof-players-list';
            listContainer.style.cssText = 'margin-top:2.5rem;';
            const showcase = section.querySelector('.hof-showcase');
            if (showcase) showcase.after(listContainer);
            else section.appendChild(listContainer);
        }

        let listHtml = '<h3 class="hof-list-title" style="color:var(--accent-color);margin-bottom:1.2rem;font-size:1.1rem;letter-spacing:.05em;text-transform:uppercase;">&#9733; Jugadores Destacados</h3>';
        listHtml += '<div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(300px,1fr));gap:1.2rem;">';

        entries.forEach((entry, i) => {
            const cat = HOF_CAT[entry.category] || HOF_CAT.weekly;
            const avatar = entry.player_avatar || 'assets/logo.png';
            const dateStr = entry.featured_at ? new Date(entry.featured_at).toLocaleDateString('es', { day:'2-digit', month:'short', year:'numeric' }) : '';
            const isFeatured = i === 0;
            const hasEntryVideo = !!(entry.entry_video_url);
            const embedUrl = hasEntryVideo ? hofGetEmbedUrl(entry.entry_video_url) : null;

            let videoHtml = '';
            if (hasEntryVideo) {
                if (embedUrl) {
                    videoHtml = `<div style="position:relative;padding-bottom:56.25%;height:0;overflow:hidden;border-radius:6px;margin-bottom:10px;">
                        <iframe src="${embedUrl}" style="position:absolute;top:0;left:0;width:100%;height:100%;border:0;" allow="autoplay;encrypted-media" allowfullscreen loading="lazy"></iframe>
                    </div>`;
                } else {
                    videoHtml = `<video src="${entry.entry_video_url}" style="width:100%;border-radius:6px;margin-bottom:10px;max-height:170px;object-fit:contain;background:#000;" muted loop playsinline controls></video>`;
                }
            }

            listHtml += `<div data-entry-cat="${entry.category || 'weekly'}" style="background:var(--card-bg,rgba(255,255,255,.04));border:1px solid ${isFeatured ? 'var(--accent-color)' : 'rgba(255,255,255,.08)'};border-radius:10px;padding:14px;position:relative;">
                ${isFeatured ? '<span style="position:absolute;top:10px;right:10px;background:var(--accent-color);color:#000;font-size:.65em;padding:2px 8px;border-radius:3px;font-weight:800;letter-spacing:.05em;">&#9733; DESTACADO</span>' : ''}
                ${videoHtml}
                <div style="display:flex;align-items:center;gap:10px;margin-bottom:8px;">
                    <img src="${avatar}" style="width:42px;height:42px;border-radius:50%;border:2px solid ${isFeatured ? 'var(--accent-color)' : 'rgba(255,255,255,.2)'};" onerror="this.src='assets/logo.png'" loading="lazy">
                    <div>
                        <div style="font-weight:700;color:var(--text-main,#fff);font-size:1rem;">${entry.player_name || '—'}</div>
                        <div style="font-size:.78em;color:var(--accent-color);opacity:.9;">${cat.icon} ${cat.label}</div>
                    </div>
                </div>
                ${entry.achievement ? `<div style="font-size:.82em;background:rgba(240,160,0,.1);border:1px solid rgba(240,160,0,.25);border-radius:5px;padding:4px 8px;margin-bottom:6px;color:var(--accent-color);">&#127941; ${entry.achievement}${entry.rating ? ' &middot; <strong>' + entry.rating + '</strong> rating' : ''}</div>` : (entry.rating ? `<div style="font-size:.82em;color:var(--accent-color);margin-bottom:6px;">&#9876; Rating: <strong>${entry.rating}</strong></div>` : '')}
                ${entry.reason ? `<p style="font-size:.83em;color:rgba(255,255,255,.6);margin:0 0 6px;line-height:1.4;">${entry.reason}</p>` : ''}
                ${entry.player_class ? `<div style="font-size:.75em;color:rgba(255,255,255,.4);">${entry.player_class}${entry.player_realm ? ' &middot; ' + entry.player_realm : ''}${dateStr ? ' &middot; ' + dateStr : ''}</div>` : ''}
            </div>`;
        });

        listHtml += '</div>';
        listContainer.innerHTML = listHtml;
    }

    // --- HOF CATEGORY FILTER ---
    let _hofActiveFilter = null;

    window.hofFilterCategory = function(catKey) {
        const section = document.getElementById('hall-of-fame');
        if (!section) return;

        // Toggle: si ya está activo, mostrar todos
        if (_hofActiveFilter === catKey) {
            _hofActiveFilter = null;
        } else {
            _hofActiveFilter = catKey;
        }

        // Actualizar estilo de las tarjetas de categoría
        section.querySelectorAll('.hof-cat-filter').forEach(function(card) {
            const isActive = card.dataset.cat === _hofActiveFilter;
            card.style.borderColor = isActive ? 'var(--accent-color)' : '';
            card.style.transform = isActive ? 'scale(1.03)' : '';
            card.style.background = isActive ? 'rgba(240,160,0,.08)' : '';
        });

        // Filtrar tarjetas de jugadores
        const listContainer = section.querySelector('.hof-players-list');
        if (!listContainer) return;
        listContainer.querySelectorAll('[data-entry-cat]').forEach(function(card) {
            if (!_hofActiveFilter || card.dataset.entryCat === _hofActiveFilter) {
                card.style.display = '';
            } else {
                card.style.display = 'none';
            }
        });

        // Actualizar título del filtro
        const HOF_CAT = { weekly: 'Jugador de la Semana', monthly: 'Jugador del Mes', gold: 'Recompensa de Oro' };
        const titleEl = listContainer.querySelector('.hof-list-title');
        if (titleEl) {
            titleEl.textContent = _hofActiveFilter ? '★ ' + HOF_CAT[_hofActiveFilter] : '★ Jugadores Destacados';
        }
    };

    // --- GUILD RANKING ---
    function renderGuildRanking() {
        const container = selectors.guildRankingContainer;
        if (!container) return;
        const data = state.guildRanking;
        if (!data || !data.ranking || !data.ranking.length) {
            container.innerHTML = '<p class="officers-empty">El ranking de la guild aun no ha sido generado.</p>';
            return;
        }

        const CLASS_COLORS = {
            'Warrior': '#C69B6D', 'Paladin': '#F48CBA', 'Hunter': '#AAD372',
            'Rogue': '#FFF468', 'Priest': '#FFFFFF', 'Death Knight': '#C41E3A',
            'Shaman': '#0070DD', 'Mage': '#3FC7EB', 'Warlock': '#8788EE',
            'Monk': '#00FF98', 'Druid': '#FF7C0A', 'Demon Hunter': '#A330C9',
            'Evoker': '#33937F',
        };

        function ratingColor(r) {
            if (r >= 2400) return '#f0a000';
            if (r >= 2100) return '#a335ee';
            if (r >= 1800) return '#0070dd';
            if (r >= 1400) return '#1eff00';
            if (r > 0) return '#ffffff';
            return 'var(--text-dim)';
        }

        let html = '<div class="guild-ranking-table-wrap"><table class="guild-ranking-table">';
        html += '<thead><tr>';
        html += '<th>#</th><th>Jugador</th><th>Clase</th>';
        html += '<th>Shuffle</th><th>2v2</th><th>3v3</th><th>RBG</th><th>Blitz</th><th>Mejor</th>';
        html += '</tr></thead><tbody>';

        data.ranking.forEach(function(p) {
            const classColor = CLASS_COLORS[p.class] || '#ffffff';
            const avatarSrc = p.avatar || 'assets/logo.png';
            const r = p.ratings;
            const best = p.best_rating || 0;

            html += '<tr>';
            html += '<td class="gr-pos">' + p.position + '</td>';
            html += '<td class="gr-player">'
                + '<img src="' + avatarSrc + '" class="gr-avatar" alt="' + p.name + '" loading="lazy" onerror="this.src=\'assets/logo.png\'">'
                + '<span class="gr-name">' + stripDiacritics(p.name) + '</span>'
                + '</td>';
            html += '<td class="gr-class" style="color:' + classColor + '">' + (p.class || '—') + '</td>';
            html += '<td style="color:' + ratingColor(r.shuffle) + '">' + (r.shuffle || '—') + '</td>';
            html += '<td style="color:' + ratingColor(r.arena_2v2) + '">' + (r.arena_2v2 || '—') + '</td>';
            html += '<td style="color:' + ratingColor(r.arena_3v3) + '">' + (r.arena_3v3 || '—') + '</td>';
            html += '<td style="color:' + ratingColor(r.rbg) + '">' + (r.rbg || '—') + '</td>';
            html += '<td style="color:' + ratingColor(r.blitz) + '">' + (r.blitz || '—') + '</td>';
            html += '<td class="gr-best" style="color:' + ratingColor(best) + '">' + best + '</td>';
            html += '</tr>';
        });

        html += '</tbody></table></div>';

        if (data.generated_at) {
            const d = new Date(data.generated_at);
            html += '<p class="gr-timestamp">Actualizado: ' + d.toLocaleString('es-MX') + ' · '
                + data.eligible_members + ' miembros nivel ' + data.max_level + ' de ' + data.total_members + ' totales</p>';
        }

        container.innerHTML = html;
    }

    // --- MODAL ---
    function openModal(playerId) {
        const player = state.players.find(p => p.id === playerId);
        if (!player || !selectors.modalBody || !selectors.modalOverlay) return;

        const bp = getPlayerBattlePass(player);
        const level = bp.level;
        const rankName = bp.rank_name;
        
        const pvp = player.pvp || { current: {}, wins: {}, losses: {}, season_max: {} };
        const brackets = ['rs', 'r2', 'r3', 'rbg', 'bgs'];

        let bracketsHTML = brackets.map(b => {
            const kvBracket = BRACKET_MAP[b] || b;
            const peakRating = pvp.season_max?.['max_' + kvBracket] || 0;
            const currentRating = pvp.current?.[kvBracket] || 0;
            const rating = Math.max(peakRating, currentRating);
            const wins = pvp.wins?.[kvBracket] || 0;
            const losses = pvp.losses?.[kvBracket] || 0;
            return `
                <div class="modal-bracket">
                    <strong>${BRACKET_NAMES[b]}</strong>
                    <span>${rating > 0 ? rating.toLocaleString() : '—'}</span>
                    <span class="modal-wl">${wins}W / ${losses}L</span>
                </div>
            `;
        }).join('');

        selectors.modalBody.innerHTML = `
            <div class="modal-player-header">
                <img src="${player.media?.avatar || 'assets/logo.png'}" alt="${player.name}" class="modal-avatar">
                <div>
                    <h3>${stripDiacritics(player.name)}</h3>
                    <p>${player.class || ''} · ${player.realm_display || player.realm || ''}</p>
                    <p>Nivel ${level} · ${(bp.total_xp || 0).toLocaleString()} XP · ${rankName}</p>
                </div>
            </div>
            <div class="modal-brackets">${bracketsHTML}</div>
            <div style="text-align:center;margin-top:1.25rem;">
                <a href="player-profile.html?id=${encodeURIComponent(player.id)}" target="_blank" rel="noopener"
                   style="display:inline-block;padding:.6rem 1.5rem;background:var(--accent-color);color:var(--bg-color);font-weight:700;border-radius:6px;text-decoration:none;transition:background .2s;">
                   🛡️ Ver Perfil del Pase de Batalla
                </a>
            </div>
        `;

        selectors.modalOverlay.classList.add('active');
        document.body.style.overflow = 'hidden';
    }

    function closeModal() {
        if (!selectors.modalOverlay) return;
        selectors.modalOverlay.classList.remove('active');
        document.body.style.overflow = '';
    }

    // --- EVENT LISTENERS ---
    function addEventListeners() {
        // Header scroll effect
        window.addEventListener('scroll', () => {
            if (selectors.header) {
                selectors.header.classList.toggle('scrolled', window.scrollY > 50);
            }
        });

        // Hamburger menu with X animation
        if (selectors.hamburger && selectors.navMenu) {
            selectors.hamburger.addEventListener('click', () => {
                selectors.navMenu.classList.toggle('active');
                selectors.hamburger.classList.toggle('active');
            });
            // Close menu when clicking a nav link
            selectors.navMenu.querySelectorAll('a').forEach(link => {
                link.addEventListener('click', () => {
                    selectors.navMenu.classList.remove('active');
                    selectors.hamburger.classList.remove('active');
                });
            });
        }

        if (selectors.leaderboardTable) {
            selectors.leaderboardTable.addEventListener('click', (e) => {
                const row = e.target.closest('.player-row');
                if (row && row.dataset.playerId) {
                    openModal(row.dataset.playerId);
                }
            });
        }

        if (selectors.rankingContent) {
            selectors.rankingContent.addEventListener('click', (e) => {
                const row = e.target.closest('.player-row');
                if (row && row.dataset.playerId) {
                    openModal(row.dataset.playerId);
                }
            });
        }

        if (selectors.podium) {
            selectors.podium.addEventListener('click', (e) => {
                const item = e.target.closest('[data-player-id]');
                if (item) openModal(item.dataset.playerId);
            });
        }

        if (selectors.conquerorsContainer) {
            selectors.conquerorsContainer.addEventListener('click', (e) => {
                const card = e.target.closest('[data-player-id]');
                if (card) openModal(card.dataset.playerId);
            });
        }

        if (selectors.rankingTabs) {
            selectors.rankingTabs.addEventListener('click', (e) => {
                const tab = e.target.closest('.ranking-tab');
                if (!tab) return;
                selectors.rankingTabs.querySelectorAll('.ranking-tab').forEach(t => t.classList.remove('active'));
                tab.classList.add('active');
                // Fade transition on tab change
                if (selectors.rankingContent) {
                    selectors.rankingContent.style.opacity = '0';
                    selectors.rankingContent.style.transform = 'translateY(8px)';
                    setTimeout(() => {
                        renderRanking(tab.dataset.bracket);
                        selectors.rankingContent.style.transition = 'opacity 0.3s ease, transform 0.3s ease';
                        selectors.rankingContent.style.opacity = '1';
                        selectors.rankingContent.style.transform = 'translateY(0)';
                    }, 150);
                } else {
                    renderRanking(tab.dataset.bracket);
                }
            });
        }

        if (selectors.modalClose) {
            selectors.modalClose.addEventListener('click', closeModal);
        }

        if (selectors.modalOverlay) {
            selectors.modalOverlay.addEventListener('click', (e) => {
                if (e.target === selectors.modalOverlay) closeModal();
            });
        }

        // Close modal on Escape key
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape') closeModal();
        });

        // Scroll to top button
        const scrollTopBtn = document.getElementById('scroll-top-btn');
        if (scrollTopBtn) {
            window.addEventListener('scroll', () => {
                scrollTopBtn.classList.toggle('visible', window.scrollY > 600);
            });
            scrollTopBtn.addEventListener('click', () => {
                window.scrollTo({ top: 0, behavior: 'smooth' });
            });
        }
    }

    // --- SCROLL REVEAL ---
    function initScrollReveal() {
        const revealElements = document.querySelectorAll('.reveal');
        if (!revealElements.length) return;

        const observer = new IntersectionObserver((entries) => {
            entries.forEach(entry => {
                if (entry.isIntersecting) {
                    entry.target.classList.add('visible');
                    observer.unobserve(entry.target);
                }
            });
        }, {
            threshold: 0.08,
            rootMargin: '0px 0px -40px 0px'
        });

        revealElements.forEach(el => observer.observe(el));
    }

    // --- ACTIVE NAV TRACKING ---
    function initActiveNav() {
        const sections = document.querySelectorAll('section[id]');
        const navLinks = document.querySelectorAll('.nav-menu a[href^="#"]');
        if (!sections.length || !navLinks.length) return;

        const observer = new IntersectionObserver((entries) => {
            entries.forEach(entry => {
                if (entry.isIntersecting) {
                    const id = entry.target.id;
                    navLinks.forEach(link => {
                        link.classList.toggle('active', link.getAttribute('href') === `#${id}`);
                    });
                }
            });
        }, {
            threshold: 0.2,
            rootMargin: '-80px 0px -50% 0px'
        });

        sections.forEach(section => observer.observe(section));
    }

    // --- ANIMATED COUNTERS ---
    function animateCounter(element, target, duration) {
        const start = 0;
        const startTime = performance.now();

        function step(currentTime) {
            const elapsed = currentTime - startTime;
            const progress = Math.min(elapsed / duration, 1);
            // Ease out cubic
            const eased = 1 - Math.pow(1 - progress, 3);
            const current = Math.floor(start + (target - start) * eased);
            element.textContent = current.toLocaleString();
            if (progress < 1) {
                requestAnimationFrame(step);
            }
        }
        requestAnimationFrame(step);
    }

    // Override renderHeroStats to add counter animation
    const _originalRenderHeroStats = renderHeroStats;
    renderHeroStats = function() {
        if (!selectors.guildStats) return;
        const totalPlayers = state.players.length;
        let maxRating = 0;
        let maxLevel = 0;
        state.players.forEach(p => {
            const currentMax = getMaxRating(p);
            if (currentMax > maxRating) maxRating = currentMax;
            const bp = getPlayerBattlePass(p);
            if (bp.level > maxLevel) maxLevel = bp.level;
        });

        selectors.guildStats.innerHTML = `
            <div class="stat-card">
                <h3 id="counter-players">0</h3><p>Jugadores Inscritos</p>
            </div>
            <div class="stat-card">
                <h3 id="counter-rating">0</h3><p>Mayor Rating</p>
            </div>
            <div class="stat-card">
                <h3 id="counter-level">0</h3><p>Mayor Nivel</p>
            </div>
        `;

        // Animate counters after a small delay
        setTimeout(() => {
            const cp = document.getElementById('counter-players');
            const cr = document.getElementById('counter-rating');
            const cl = document.getElementById('counter-level');
            if (cp) animateCounter(cp, totalPlayers, 1200);
            if (cr) animateCounter(cr, maxRating, 1500);
            if (cl) animateCounter(cl, maxLevel, 1000);
        }, 300);
    };

    addEventListeners();
    initScrollReveal();
    initActiveNav();
    fetchData();

    // ══════════════════════════════════════════════════════
    //  PAGE LIKES
    // ══════════════════════════════════════════════════════
    const LIKE_KEY = 'exilium_page_liked';
    let _pageLiked = localStorage.getItem(LIKE_KEY) === '1';

    function initPageLikes() {
        fetch(API_URL + '/page-likes').then(r => r.json()).then(data => {
            document.getElementById('page-like-count').textContent = data.total || 0;
        }).catch(() => {});
        updateLikeBtn();
    }

    function updateLikeBtn() {
        const btn = document.getElementById('page-like-btn');
        const icon = document.getElementById('page-like-icon');
        const label = document.getElementById('page-like-label');
        if (!btn) return;
        if (_pageLiked) {
            btn.style.borderColor = 'var(--accent-color)';
            btn.style.color = 'var(--accent-color)';
            btn.style.background = 'rgba(212,160,23,.1)';
            icon.textContent = '👍';
            label.textContent = 'Te gusta';
        } else {
            btn.style.borderColor = 'var(--border-color)';
            btn.style.color = 'var(--text-muted)';
            btn.style.background = 'none';
            icon.textContent = '👍';
            label.textContent = 'Me gusta';
        }
    }

    window.togglePageLike = function() {
        const icon = document.getElementById('page-like-icon');
        const countEl = document.getElementById('page-like-count');
        icon.style.transform = 'scale(1.4)';
        setTimeout(() => { icon.style.transform = 'scale(1)'; }, 200);

        fetch(API_URL + '/page-likes', { method: 'POST' })
            .then(r => r.json())
            .then(data => {
                countEl.textContent = data.total || 0;
                if (!data.already) {
                    _pageLiked = true;
                    localStorage.setItem(LIKE_KEY, '1');
                }
                updateLikeBtn();
            }).catch(() => {});
    };

    initPageLikes();

    // ══════════════════════════════════════════════════════
    //  COMMENTS
    // ══════════════════════════════════════════════════════
    let _comments = [];
    let _likedComments = JSON.parse(localStorage.getItem('exilium_liked_comments') || '[]');

    function timeAgo(ts) {
        const diff = Math.floor((Date.now() - ts) / 1000);
        if (diff < 60) return 'hace ' + diff + 's';
        if (diff < 3600) return 'hace ' + Math.floor(diff / 60) + 'm';
        if (diff < 86400) return 'hace ' + Math.floor(diff / 3600) + 'h';
        return 'hace ' + Math.floor(diff / 86400) + 'd';
    }

    function renderComments() {
        const list = document.getElementById('comments-list');
        if (!list) return;
        if (!_comments.length) {
            list.innerHTML = '<div style="color:var(--text-muted);font-size:.85em;text-align:center;padding:2rem 0;">Sé el primero en comentar ✨</div>';
            return;
        }
        list.innerHTML = _comments.map(c => {
            const liked = _likedComments.includes(c.id);
            const initials = (c.author || '?').slice(0, 2).toUpperCase();
            const colors = ['#d4a017','#8b5cf6','#3b82f6','#10b981','#ef4444','#f59e0b'];
            const color = colors[c.id % colors.length];
            return `<div style="background:var(--bg-card);border:1px solid var(--border-color);border-radius:10px;padding:12px 14px;">
                <div style="display:flex;align-items:center;gap:10px;margin-bottom:8px;">
                    <div style="width:36px;height:36px;border-radius:50%;background:${color};display:flex;align-items:center;justify-content:center;font-weight:800;font-size:.85rem;color:#000;flex-shrink:0;">${initials}</div>
                    <div style="flex:1;min-width:0;">
                        <div style="font-weight:700;color:var(--text-color);font-size:.9rem;">${escapeHtmlPublic(c.author)}</div>
                        <div style="font-size:.75em;color:var(--text-muted);">${timeAgo(c.ts)}</div>
                    </div>
                    <button onclick="likeComment(${c.id}, this)" style="display:flex;align-items:center;gap:4px;background:none;border:1px solid ${liked ? 'var(--accent-color)' : 'var(--border-color)'};border-radius:20px;padding:4px 10px;cursor:pointer;color:${liked ? 'var(--accent-color)' : 'var(--text-muted)'};font-size:.8rem;transition:all .2s;font-family:inherit;" ${liked ? 'disabled' : ''}>
                        <span>&#10084;</span> <span class="like-count">${c.likes || 0}</span>
                    </button>
                </div>
                <p style="font-size:.88rem;color:var(--text-color);line-height:1.5;margin:0;">${escapeHtmlPublic(c.text)}</p>
            </div>`;
        }).join('');
    }

    function escapeHtmlPublic(str) {
        return String(str).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
    }

    function loadComments() {
        fetch(API_URL + '/comments').then(r => r.json()).then(data => {
            _comments = Array.isArray(data) ? data : [];
            renderComments();
        }).catch(() => {
            const list = document.getElementById('comments-list');
            if (list) list.innerHTML = '<div style="color:var(--text-muted);font-size:.85em;text-align:center;padding:2rem 0;">Error cargando comentarios</div>';
        });
    }

    window.likeComment = function(id, btn) {
        fetch(API_URL + '/comments/' + id + '/like', { method: 'POST' })
            .then(r => r.json())
            .then(data => {
                if (data.ok) {
                    _likedComments.push(id);
                    localStorage.setItem('exilium_liked_comments', JSON.stringify(_likedComments));
                    btn.style.borderColor = 'var(--accent-color)';
                    btn.style.color = 'var(--accent-color)';
                    btn.disabled = true;
                    btn.querySelector('.like-count').textContent = data.likes;
                }
            }).catch(() => {});
    };

    window.submitComment = function() {
        const authorEl = document.getElementById('comment-author');
        const textEl = document.getElementById('comment-text');
        const feedbackEl = document.getElementById('comment-feedback');
        const btn = document.getElementById('comment-submit-btn');
        const author = authorEl.value.trim();
        const text = textEl.value.trim();

        function showFeedback(msg, ok) {
            feedbackEl.style.display = 'block';
            feedbackEl.style.background = ok ? 'rgba(16,185,129,.12)' : 'rgba(239,68,68,.12)';
            feedbackEl.style.color = ok ? '#10b981' : '#ef4444';
            feedbackEl.style.border = '1px solid ' + (ok ? 'rgba(16,185,129,.3)' : 'rgba(239,68,68,.3)');
            feedbackEl.textContent = msg;
        }

        if (!author) { showFeedback('Ingresa tu nombre o apodo', false); authorEl.focus(); return; }
        if (!text) { showFeedback('Escribe un comentario', false); textEl.focus(); return; }

        btn.disabled = true;
        btn.textContent = 'Enviando...';

        fetch(API_URL + '/comments', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ author, text }),
        }).then(r => r.json()).then(data => {
            if (data.ok) {
                showFeedback('✅ Comentario publicado. ¡Gracias!', true);
                authorEl.value = '';
                textEl.value = '';
                document.getElementById('comment-char-count').textContent = '0 / 300';
                loadComments();
            } else {
                showFeedback(data.error || 'Error al enviar', false);
            }
        }).catch(() => {
            showFeedback('Error de conexión', false);
        }).finally(() => {
            btn.disabled = false;
            btn.innerHTML = '&#128172; Enviar comentario';
        });
    };

    // Char counter for textarea
    const commentTextEl = document.getElementById('comment-text');
    if (commentTextEl) {
        commentTextEl.addEventListener('input', function() {
            const count = document.getElementById('comment-char-count');
            if (count) count.textContent = this.value.length + ' / 300';
        });
    }

    // ══════════════════════════════════════════════════════════
    //  NOTICIAS DE PARCHE
    // ══════════════════════════════════════════════════════════

    const NEWS_CLASS_ICONS = {
        warrior:     'assets/class-icons/Ability_warrior_savageblow.webp',
        paladin:     'assets/class-icons/Ability_paladin_shieldofthetemplar.webp',
        hunter:      'assets/class-icons/Spell_nature_magicimmunity.webp',
        rogue:       'assets/class-icons/Ability_rogue_eviscerate.webp',
        priest:      'assets/class-icons/Spell_holy_guardianspirit.webp',
        deathknight: 'assets/class-icons/Spell_deathknight_unholypresence.webp',
        shaman:      'assets/class-icons/Spell_shaman_improvedstormstrike.webp',
        mage:        'assets/class-icons/Spell_holy_holybolt.webp',
        warlock:     'assets/class-icons/Spell_shadow_shadowwordpain.webp',
        monk:        'assets/class-icons/Spell_monk_windwalker_spec.webp',
        druid:       'assets/class-icons/Ability_druid_catform.webp',
        demonhunter: 'assets/class-icons/Ability_stealth.webp',
        evoker:      'assets/class-icons/Spell_nature_lightning.webp'
    };

    function renderNews() {
        const container = document.getElementById('news-container');
        const badge = document.getElementById('news-live-badge');
        const trustBadge = document.getElementById('news-trust-badge');
        const updatedAt = document.getElementById('news-updated-at');

        if (!container || !state.news || !state.news.length) {
            if (badge) badge.style.display = 'none';
            if (trustBadge) trustBadge.style.display = 'none';
            return;
        }

        // Mostrar badges
        if (badge) badge.style.display = 'inline-block';
        if (trustBadge) trustBadge.style.display = 'flex';

        // Fecha del más reciente
        if (updatedAt && state.news[0].publishedAt) {
            updatedAt.textContent = timeAgo(state.news[0].publishedAt);
        }

        container.innerHTML = state.news.map(function(article, i) {
            var isFeatured = i === 0;
            var iconSrc = NEWS_CLASS_ICONS[article.class] || '';
            var iconHtml = iconSrc
                ? '<img src="' + iconSrc + '" class="news-class-icon" alt="' + (article.class || '') + '" width="24" height="24">'
                : '';
            var className = article.class ? article.class.charAt(0).toUpperCase() + article.class.slice(1) : 'General';
            var sourceDot = article.source === 'wowhead' ? 'wowhead' : 'blizzard';
            var sourceLabel = article.source === 'wowhead'
                ? 'Wowhead — Noticias PvP'
                : 'Blizzard — Notas de parche oficiales';
            var patchLabel = (article.expansion || '') + ' ' + (article.patchVersion || '');

            return '<article class="news-card' + (isFeatured ? ' featured' : '') + '">' +
                (isFeatured ? '<div class="news-card-glow"></div>' : '') +
                '<div class="news-card-header">' +
                iconHtml +
                '<span class="news-class-name">' + className + '</span>' +
                '<span class="news-patch-badge">' +
                '<span class="patch-expansion">' + escapeHtmlPublic(article.expansion || '') + '</span>' +
                '<span class="patch-version">' + escapeHtmlPublic(article.patchVersion || '') + '</span>' +
                '</span>' +
                '<span class="news-date">' + timeAgo(article.publishedAt || article.createdAt) + '</span>' +
                '</div>' +
                '<h3 class="news-title">' + escapeHtmlPublic(article.title) + '</h3>' +
                '<p class="news-summary">' + escapeHtmlPublic(article.summary) + '</p>' +
                '<div class="news-footer">' +
                '<div class="news-source">' +
                '<span class="source-dot ' + sourceDot + '"></span>' +
                '<span>' + sourceLabel + '</span>' +
                '</div>' +
                '<button class="news-expand-btn" onclick="toggleNewsBody(\'' + article.id + '\')">Leer m&aacute;s &#9662;</button>' +
                '</div>' +
                '<div class="news-body hidden" id="news-body-' + article.id + '">' +
                '<div class="news-body-divider"></div>' +
                formatNewsBody(article.body || '') +
                (article.sourceUrl ? '<p style="margin-top:12px;"><a href="' + escapeHtmlPublic(article.sourceUrl) + '" target="_blank" style="color:var(--accent-color);text-decoration:none;font-size:.88rem;">🔗 Fuente original →</a></p>' : '') +
                '</div>' +
                '</article>';
        }).join('');
    }

    function formatNewsBody(body) {
        // Conversión simple de Markdown: **texto** → negritas, \n → <br>
        return escapeHtmlPublic(body)
            .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
            .replace(/\n/g, '<br>');
    }

    window.toggleNewsBody = function(id) {
        var body = document.getElementById('news-body-' + id);
        var btn = body && body.parentElement ? body.parentElement.querySelector('.news-expand-btn') : null;
        if (!body) return;
        var isHidden = body.classList.contains('hidden');
        body.classList.toggle('hidden');
        if (btn) btn.textContent = isHidden ? 'Leer menos &#9652;' : 'Leer m&aacute;s &#9662;';
    };

}); // Fin DOMContentLoaded
