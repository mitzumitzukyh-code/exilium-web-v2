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
    async function fetchData() {
        try {
            const [playersRes, announcementRes, officersRes, guildRankingRes, hofRes] = await Promise.all([
                fetch(`${API_URL}/players`).then(res => res.json()),
                fetch(`${API_URL}/announcement`).then(res => res.json()),
                fetch(`${API_URL}/officers`).then(res => res.json()).catch(() => []),
                fetch(`${API_URL}/guild-ranking`).then(res => res.json()).catch(() => ({ ranking: [] })),
                fetch(`${API_URL}/hall-of-fame`).then(res => res.json()).catch(() => ({ entries: [] }))
            ]);
            state.players = Array.isArray(playersRes) ? playersRes : [];
            state.announcement = announcementRes;
            state.officers = Array.isArray(officersRes) ? officersRes : [];
            state.guildRanking = guildRankingRes;
            state.hallOfFame = hofRes && Array.isArray(hofRes.entries) ? hofRes : { entries: [] };
            renderAll();
        } catch (error) {
            console.error('Error fetching data:', error);
        }
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
            weekly: { label: 'Mejor Jugador de la Semana', icon: '&#9876;', desc: 'Rating más alto en arenas' },
            monthly: { label: 'Mejor Jugador del Mes', icon: '&#127942;', desc: 'Máximo rendimiento global' },
            gold: { label: 'Recompensa de Oro', icon: '&#128176;', desc: 'Premio en oro para el destacado' },
        };

        // Update video from admin-configured URL
        if (videoUrl) {
            const frame = section.querySelector('.hof-video-frame');
            if (frame) {
                const embedUrl = hofGetEmbedUrl(videoUrl);
                if (embedUrl) {
                    frame.innerHTML = '<iframe src="' + embedUrl + '" style="width:100%;height:100%;border:0;position:absolute;top:0;left:0;" allow="autoplay;encrypted-media" allowfullscreen></iframe><div class="hof-video-overlay"></div>';
                    frame.style.position = 'relative';
                } else {
                    frame.innerHTML = '<video autoplay muted loop playsinline style="width:100%;height:100%;object-fit:cover;display:block;"><source src="' + videoUrl + '" type="video/mp4"></video><div class="hof-video-overlay"></div>';
                }
            }
        }

        if (!entries.length) return;

        const featured = entries[0];

        // Update featured player name
        const nameEl = section.querySelector('.hof-player-name');
        if (nameEl) {
            nameEl.textContent = featured.player_name || 'Jugador Destacado';
        }

        // Update badge label
        const badgeLabel = section.querySelector('.hof-badge-label');
        if (badgeLabel) {
            const cat = HOF_CAT[featured.category] || HOF_CAT.weekly;
            badgeLabel.textContent = cat.label;
        }

        // Update description
        const descEl = section.querySelector('.hof-player-desc');
        if (descEl && featured.reason) {
            descEl.textContent = featured.reason;
        }

        // Rebuild category cards from all entries (group by category, show latest of each)
        const catContainer = section.querySelector('.hof-categories');
        if (catContainer) {
            const byCategory = {};
            entries.forEach(e => {
                if (!byCategory[e.category]) byCategory[e.category] = e;
            });

            let catHtml = '';
            ['weekly', 'monthly', 'gold'].forEach(catKey => {
                const cat = HOF_CAT[catKey];
                const entry = byCategory[catKey];
                const playerLabel = entry ? entry.player_name : '—';
                const desc = entry && entry.reason ? entry.reason : cat.desc;

                catHtml += `
                    <div class="hof-cat-card">
                        <div class="hof-cat-icon">${cat.icon}</div>
                        <div class="hof-cat-info">
                            <strong>${cat.label}</strong>
                            <span>${playerLabel}${entry ? ' — ' + desc : ''}</span>
                        </div>
                    </div>`;
            });
            catContainer.innerHTML = catHtml;
        }
    }

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
});
