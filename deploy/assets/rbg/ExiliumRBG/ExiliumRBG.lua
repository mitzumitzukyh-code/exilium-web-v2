-- ============================================================
--  ExiliumRBG Tracker v1.1.0  (Midnight 12.x)
--  Core: Eventos, captura de scores, SavedVariables, comandos
--  Guild: Exilium - Quel'Thalas US
--  APIs: C_PvP.GetScoreInfo, C_PvP.GetRatedBGInfo (Midnight)
-- ============================================================

local ADDON_NAME = "ExiliumRBG"
local VERSION    = "1.1.0"

-- ─── Colores de consola ───────────────────────────────────────
local C = {
    red    = "|cffC41E3A",
    gold   = "|cffFFD700",
    white  = "|cffFFFFFF",
    green  = "|cff00FF7F",
    gray   = "|cff888888",
    reset  = "|r",
}

local function Print(msg)
    DEFAULT_CHAT_FRAME:AddMessage(C.red .. "[ExiliumRBG]" .. C.reset .. " " .. msg)
end

-- ─── Inicialización de SavedVariables ─────────────────────────
local function InitDB()
    if not ExiliumRBG_DB then
        ExiliumRBG_DB = {
            version  = VERSION,
            matches  = {},   -- historial de partidas
            settings = {
                syncEnabled    = true,
                discordReports = true,
                workerURL      = "https://exilium-blizzard.tu-worker.workers.dev",
            },
        }
    end
    -- migración de versión si es necesario
    ExiliumRBG_DB.version = VERSION
end

-- ─── Estado en tiempo real ────────────────────────────────────
local State = {
    inBG         = false,
    isRated      = false,
    bgName       = nil,
    bgMapID      = nil,
    matchStart   = nil,
    ratingBefore = 0,
    mmrBefore    = 0,
    seasonWins   = 0,
    seasonPlayed = 0,
}

-- ─── Utilidades (Midnight 12.x APIs) ────────────────────────
local function GetRBGInfo()
    -- C_PvP.GetRatedBGInfo() retorna tabla con:
    -- personalRating, bestSeasonRating, bestWeeklyRating,
    -- seasonPlayed, seasonWon, weeklyPlayed, weeklyWon, cap
    if C_PvP and C_PvP.GetRatedBGInfo then
        local info = C_PvP.GetRatedBGInfo()
        if info then
            return {
                rating       = info.personalRating or 0,
                bestSeason   = info.bestSeasonRating or 0,
                seasonPlayed = info.seasonPlayed or 0,
                seasonWon    = info.seasonWon or 0,
            }
        end
    end
    -- Fallback: bracket iteration
    if C_PvP and C_PvP.GetPvpBracketInfo then
        for i = 0, 10 do
            local info = C_PvP.GetPvpBracketInfo(i)
            if info and info.rating and info.rating > 0 then
                return {
                    rating       = info.rating or 0,
                    bestSeason   = info.bestSeasonRating or 0,
                    seasonPlayed = info.seasonPlayed or 0,
                    seasonWon    = info.seasonWon or 0,
                }
            end
        end
    end
    return { rating = 0, bestSeason = 0, seasonPlayed = 0, seasonWon = 0 }
end

local function GetCurrentRBGRating()
    return GetRBGInfo().rating
end

local function GetBGMapName()
    local mapID = C_Map.GetBestMapForUnit("player")
    if mapID then
        local info = C_Map.GetMapInfo(mapID)
        if info then return info.name, mapID end
    end
    return GetZoneText() or "Desconocido", mapID
end

local function GetTimestamp()
    return date("%Y-%m-%d %H:%M:%S")
end

-- ─── Captura de scores al finalizar (Midnight 12.x) ────────
local function CaptureMatchScores()
    -- Solicitar datos actualizados
    if RequestBattlefieldScoreData then
        RequestBattlefieldScoreData()
    end

    local numScores = GetNumBattlefieldScores and GetNumBattlefieldScores() or 0
    local players = {}

    for i = 1, numScores do
        local info = nil

        -- Midnight API: C_PvP.GetScoreInfo(i) retorna tabla structurada
        if C_PvP and C_PvP.GetScoreInfo then
            info = C_PvP.GetScoreInfo(i)
        end

        if info and not info.isEnemy then
            local fullName = info.name or ""
            local charName, realm = strsplit("-", fullName, 2)

            -- Resolver spec name si disponible
            local specName = ""
            if info.talentSpec and info.talentSpec > 0 then
                if C_SpecializationInfo and C_SpecializationInfo.GetSpecializationInfoByID then
                    local _, name = C_SpecializationInfo.GetSpecializationInfoByID(info.talentSpec)
                    specName = name or ""
                end
            end

            table.insert(players, {
                name          = charName or fullName,
                realm         = realm or GetRealmName(),
                class         = info.classToken or "UNKNOWN",
                spec          = specName,
                specID        = info.talentSpec or 0,
                role          = info.roleAssigned or info.role or "DAMAGER",
                killingBlows  = info.killingBlows or 0,
                honorKills    = info.honorableKills or 0,
                deaths        = info.deaths or 0,
                honor         = info.honorGained or 0,
                damage        = info.damageDone or 0,
                healing       = info.healingDone or 0,
                ratingChange  = info.ratingChange or 0,
                mmrChange     = info.mmrChange or 0,
                prematchMMR   = info.prematchMMR or 0,
                guid          = info.guid or "",
            })
        end
    end

    return players
end

-- ─── Capturar stats específicas del BG (bases, flags, etc) ──
local function CaptureBGStats()
    local bgStats = {}
    if C_PvP and C_PvP.GetMatchPVPStatColumns then
        local columns = C_PvP.GetMatchPVPStatColumns()
        if columns then
            for _, col in ipairs(columns) do
                table.insert(bgStats, {
                    name  = col.name or "stat",
                    icon  = col.iconName or "",
                })
            end
        end
    end
    return bgStats
end

-- ─── Determinar si ganamos ────────────────────────────────────
local function DidWeWin()
    local status = GetBattlefieldWinner()
    -- 0 = Horde, 1 = Alliance, nil = en curso
    if status == nil then return nil end
    local myFaction = UnitFactionGroup("player")
    if myFaction == "Horde" and status == 0 then return true end
    if myFaction == "Alliance" and status == 1 then return true end
    return false
end

-- ─── Guardar partida en SavedVariables ───────────────────────
local function SaveMatch(won)
    local players = CaptureMatchScores()
    local rbgInfo = GetRBGInfo()
    local ratingAfter = rbgInfo.rating
    local ratingDelta = ratingAfter - State.ratingBefore
    local duration = State.matchStart and (time() - State.matchStart) or 0
    local bgStats = CaptureBGStats()

    local match = {
        id           = #ExiliumRBG_DB.matches + 1,
        addonVersion = VERSION,
        timestamp    = GetTimestamp(),
        map          = State.bgName or "Desconocido",
        mapID        = State.bgMapID,
        isRated      = State.isRated,
        won          = won,
        duration     = duration,
        ratingBefore = State.ratingBefore,
        ratingAfter  = ratingAfter,
        ratingDelta  = ratingDelta,
        mmrBefore    = State.mmrBefore,
        seasonWins   = rbgInfo.seasonWon,
        seasonPlayed = rbgInfo.seasonPlayed,
        bestSeason   = rbgInfo.bestSeason,
        bgStats      = bgStats,
        players      = players,
        synced       = false,
    }

    table.insert(ExiliumRBG_DB.matches, match)

    -- Resumen en chat
    local result   = won and (C.green .. "VICTORIA") or (C.red .. "DERROTA")
    local deltaStr = ratingDelta >= 0 and (C.green .. "+" .. ratingDelta) or (C.red .. ratingDelta)
    Print(result .. C.reset .. " en " .. C.gold .. match.map .. C.reset
          .. " | Rating: " .. deltaStr .. C.reset
          .. " (" .. ratingAfter .. ")")
    Print("Jugadores registrados: " .. C.gold .. #players .. C.reset
          .. " | Duración: " .. C.gold .. SecondsToTime(duration) .. C.reset)

    -- Intentar sync automático
    if ExiliumRBG_DB.settings.syncEnabled then
        C_Timer.After(2, function()
            ExiliumRBG_Sync_Upload(match)
        end)
    end

    return match
end

-- ─── Frame principal y eventos ────────────────────────────────
local frame = CreateFrame("Frame", "ExiliumRBGFrame", UIParent)

frame:RegisterEvent("ADDON_LOADED")
frame:RegisterEvent("PLAYER_ENTERING_WORLD")
frame:RegisterEvent("UPDATE_BATTLEFIELD_STATUS")
frame:RegisterEvent("PVP_MATCH_COMPLETE")
frame:RegisterEvent("UPDATE_BATTLEFIELD_SCORE")
frame:RegisterEvent("ZONE_CHANGED_NEW_AREA")

frame:SetScript("OnEvent", function(self, event, ...)
    if event == "ADDON_LOADED" then
        local addonName = ...
        if addonName == ADDON_NAME then
            InitDB()
            ExiliumRBG_MinimapButton_Create()
            Print("v" .. VERSION .. " cargado. Escribe " .. C.gold .. "/exirbg help" .. C.reset .. " para ayuda.")
        end

    elseif event == "PLAYER_ENTERING_WORLD" then
        -- Detectar si ya estamos en un BG al recargar
        local inBG = false
        for i = 1, MAX_BATTLEFIELD_QUEUES do
            local status = GetBattlefieldStatus(i)
            if status == "active" then inBG = true break end
        end
        State.inBG = inBG

    elseif event == "UPDATE_BATTLEFIELD_STATUS" then
        for i = 1, MAX_BATTLEFIELD_QUEUES do
            local status, mapName, teamSize, registeredMatch, suspend, queueType = GetBattlefieldStatus(i)
            if status == "active" and not State.inBG then
                -- Entramos a un BG
                State.inBG       = true
                State.matchStart = time()
                -- Detectar si es RBG rated
                State.isRated = (C_PvP and C_PvP.IsRatedBattleground and C_PvP.IsRatedBattleground()) or false
                local rbgInfo = GetRBGInfo()
                State.ratingBefore = rbgInfo.rating
                State.mmrBefore    = 0  -- MMR pre-match se captura del score al final
                State.seasonWins   = rbgInfo.seasonWon
                State.seasonPlayed = rbgInfo.seasonPlayed
                local name, mapID = GetBGMapName()
                State.bgName  = mapName or name
                State.bgMapID = mapID
                local ratedTag = State.isRated and (C.green .. "RATED") or (C.gray .. "CASUAL")
                Print(ratedTag .. C.reset .. " BG iniciado: " .. C.gold .. State.bgName .. C.reset
                      .. " | Rating: " .. C.gold .. State.ratingBefore .. C.reset)
                -- Mostrar UI
                ExiliumRBG_UI_Show()
            elseif status ~= "active" and State.inBG then
                -- Salimos del BG sin PVP_MATCH_COMPLETE (abandonamos)
                -- No guardamos si fue abandono
                State.inBG = false
                State.isRated = false
                ExiliumRBG_UI_Hide()
            end
        end

    elseif event == "PVP_MATCH_COMPLETE" then
        -- Esperar 1s para que los scores se actualicen
        C_Timer.After(1, function()
            local won = DidWeWin()
            if won == nil then won = false end
            SaveMatch(won)
            State.inBG = false
            ExiliumRBG_UI_Hide()
        end)

    elseif event == "UPDATE_BATTLEFIELD_SCORE" then
        -- Actualizar UI en tiempo real
        if State.inBG then
            ExiliumRBG_UI_Update()
        end

    elseif event == "ZONE_CHANGED_NEW_AREA" then
        if State.inBG then
            local name, mapID = GetBGMapName()
            State.bgName  = name
            State.bgMapID = mapID
        end
    end
end)

-- ─── Generador de reporte Discord ────────────────────────────
local function GenerateDiscordReport(match)
    if not match then
        match = ExiliumRBG_DB.matches[#ExiliumRBG_DB.matches]
    end
    if not match then Print("No hay partidas registradas.") return end

    local lines = {}
    local result = match.won and "🟢 VICTORIA" or "🔴 DERROTA"
    local delta  = match.ratingDelta >= 0 and ("+" .. match.ratingDelta) or tostring(match.ratingDelta)

    table.insert(lines, "**[ExiliumRBG]** " .. result)
    table.insert(lines, "🗺️ **Mapa:** " .. match.map)
    table.insert(lines, "⭐ **Rating:** " .. match.ratingBefore .. " → " .. match.ratingAfter .. " (" .. delta .. ")")
    table.insert(lines, "⏱️ **Duración:** " .. SecondsToTime(match.duration))
    table.insert(lines, "")
    table.insert(lines, "**📊 Top jugadores:**")

    -- Ordenar por daño + healing
    local sorted = {}
    for _, p in ipairs(match.players) do
        table.insert(sorted, p)
    end
    table.sort(sorted, function(a, b)
        return (a.damage + a.healing) > (b.damage + b.healing)
    end)

    for i = 1, math.min(5, #sorted) do
        local p = sorted[i]
        local dmgK  = math.floor(p.damage / 1000)
        local healK = math.floor(p.healing / 1000)
        table.insert(lines, string.format("• **%s** — DMG: %dk | HPS: %dk | KB: %d | Deaths: %d",
            p.name, dmgK, healK, p.killingBlows, p.deaths))
    end

    local report = table.concat(lines, "\n")

    -- Copiar al chat input (el jugador lo pega donde quiera)
    ChatEdit_ActivateChat(DEFAULT_CHAT_FRAME.editBox)
    DEFAULT_CHAT_FRAME.editBox:SetText(report)
    Print("Reporte generado. Pégalo en Discord con Ctrl+A → Ctrl+C.")
    return report
end

-- ─── Comandos slash ──────────────────────────────────────────
SLASH_EXIRBG1 = "/exirbg"
SlashCmdList["EXIRBG"] = function(msg)
    local cmd, arg = strsplit(" ", msg:lower(), 2)

    if cmd == "help" or cmd == "" then
        Print(C.gold .. "Comandos disponibles:" .. C.reset)
        Print(C.gold .. "/exirbg show" .. C.reset .. " — Abre el panel de historial")
        Print(C.gold .. "/exirbg report" .. C.reset .. " — Genera reporte de la última partida para Discord")
        Print(C.gold .. "/exirbg report all" .. C.reset .. " — Reporte de sesión completa")
        Print(C.gold .. "/exirbg sync" .. C.reset .. " — Sync manual de partidas pendientes al Worker")
        Print(C.gold .. "/exirbg stats" .. C.reset .. " — Stats de temporada")
        Print(C.gold .. "/exirbg clear" .. C.reset .. " — Limpiar historial local")
        Print(C.gold .. "/exirbg url <url>" .. C.reset .. " — Configurar URL del Worker")

    elseif cmd == "show" then
        ExiliumRBG_UI_Toggle()

    elseif cmd == "report" then
        GenerateDiscordReport()

    elseif cmd == "sync" then
        ExiliumRBG_Sync_PendingAll()

    elseif cmd == "stats" then
        local db = ExiliumRBG_DB
        local total = #db.matches
        if total == 0 then Print("Sin partidas registradas.") return end
        local wins, totalDelta = 0, 0
        for _, m in ipairs(db.matches) do
            if m.won then wins = wins + 1 end
            totalDelta = totalDelta + (m.ratingDelta or 0)
        end
        local wr = math.floor((wins / total) * 100)
        Print(C.gold .. "Stats de Temporada:" .. C.reset)
        Print("Partidas: " .. C.gold .. total .. C.reset
              .. " | Victorias: " .. C.green .. wins .. C.reset
              .. " | WR: " .. C.gold .. wr .. "%" .. C.reset)
        local deltaStr = totalDelta >= 0 and (C.green .. "+" .. totalDelta) or (C.red .. totalDelta)
        Print("Rating neto: " .. deltaStr .. C.reset)

    elseif cmd == "clear" then
        ExiliumRBG_DB.matches = {}
        Print("Historial limpiado.")

    elseif cmd == "url" then
        if arg and arg ~= "" then
            ExiliumRBG_DB.settings.workerURL = arg
            Print("Worker URL actualizada: " .. C.gold .. arg .. C.reset)
        else
            Print("URL actual: " .. C.gold .. ExiliumRBG_DB.settings.workerURL .. C.reset)
        end

    else
        Print("Comando desconocido. Escribe " .. C.gold .. "/exirbg help" .. C.reset)
    end
end
