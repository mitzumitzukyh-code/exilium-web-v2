-- ============================================================
--  ExiliumRBG_Sync.lua
--  Integración con Cloudflare Worker + KV de Exilium
--  Endpoint: POST /rbg/match → Worker guarda en KV
-- ============================================================

local SYNC_VERSION = "1.1"

-- ─── Helper: construir payload JSON manual ─────────────────--
-- (WoW Lua no tiene json.encode nativo, lo hacemos manual)
local function EscapeStr(s)
    if type(s) ~= "string" then return tostring(s or "") end
    s = s:gsub('\\', '\\\\')
    s = s:gsub('"',  '\\"')
    s = s:gsub('\n', '\\n')
    return s
end

local function BuildPlayerJSON(p)
    return string.format(
        '{"name":"%s","realm":"%s","class":"%s","spec":"%s","specID":%d,"role":"%s",' ..
        '"killingBlows":%d,"deaths":%d,"damage":%d,"healing":%d,' ..
        '"ratingChange":%d,"mmrChange":%d,"prematchMMR":%d}',
        EscapeStr(p.name), EscapeStr(p.realm), EscapeStr(p.class or "UNKNOWN"),
        EscapeStr(p.spec or ""), p.specID or 0, EscapeStr(p.role or "DAMAGER"),
        p.killingBlows or 0, p.deaths or 0,
        p.damage or 0, p.healing or 0,
        p.ratingChange or 0, p.mmrChange or 0, p.prematchMMR or 0
    )
end

local function BuildMatchJSON(match)
    local playerParts = {}
    for _, p in ipairs(match.players or {}) do
        table.insert(playerParts, BuildPlayerJSON(p))
    end

    return string.format(
        '{"id":%d,"guild":"Exilium","realm":"Quel_Thalas","timestamp":"%s",' ..
        '"map":"%s","won":%s,"isRated":%s,"duration":%d,' ..
        '"ratingBefore":%d,"ratingAfter":%d,"ratingDelta":%d,' ..
        '"mmrBefore":%d,"seasonWins":%d,"seasonPlayed":%d,"bestSeason":%d,' ..
        '"addonVersion":"%s","players":[%s],"syncVersion":"%s"}',
        match.id or 0,
        EscapeStr(match.timestamp or ""),
        EscapeStr(match.map or ""),
        match.won and "true" or "false",
        match.isRated and "true" or "false",
        match.duration or 0,
        match.ratingBefore or 0,
        match.ratingAfter or 0,
        match.ratingDelta or 0,
        match.mmrBefore or 0,
        match.seasonWins or 0,
        match.seasonPlayed or 0,
        match.bestSeason or 0,
        EscapeStr(match.addonVersion or "1.1.0"),
        table.concat(playerParts, ","),
        SYNC_VERSION
    )
end

-- ─── Subir una partida al Worker ──────────────────────────────
function ExiliumRBG_Sync_Upload(match)
    if not ExiliumRBG_DB or not ExiliumRBG_DB.settings then return end
    local url = ExiliumRBG_DB.settings.workerURL

    if not url or url == "" then
        DEFAULT_CHAT_FRAME:AddMessage("|cffC41E3A[ExiliumRBG]|r Sync: URL del Worker no configurada. Usa /exirbg url <url>")
        return
    end

    -- Construir endpoint
    local endpoint = url:gsub("/$", "") .. "/rbg/match"
    local payload  = BuildMatchJSON(match)

    -- Mostrar en chat que se está intentando
    DEFAULT_CHAT_FRAME:AddMessage("|cffC41E3A[ExiliumRBG]|r |cff888888Sync #" .. match.id .. " → Worker...|r")

    -- WoW no tiene fetch/XMLHttpRequest; usamos el sistema de macros o HTTP nativo
    -- La forma correcta en WoW addon es usar C_WebAPI si disponible, o notificar que
    -- debe hacerse desde el Companion (C# app de Exilium) que ya tienen.
    -- Por eso guardamos el payload en SavedVariables y el Companion lo lee y sube.

    -- Guardar payload pendiente
    if not ExiliumRBG_DB.pendingSync then
        ExiliumRBG_DB.pendingSync = {}
    end

    table.insert(ExiliumRBG_DB.pendingSync, {
        matchId   = match.id,
        payload   = payload,
        endpoint  = endpoint,
        attempts  = 0,
        timestamp = time(),
    })

    -- Marcar como pendiente (no confirmada)
    match.synced = false

    DEFAULT_CHAT_FRAME:AddMessage(
        "|cffC41E3A[ExiliumRBG]|r Partida #" .. match.id ..
        " en cola para sync. El |cffFFD700Exilium Companion|r la subirá automáticamente."
    )
end

-- ─── Subir todas las partidas pendientes ─────────────────────
function ExiliumRBG_Sync_PendingAll()
    if not ExiliumRBG_DB then return end

    local pending = 0
    for _, match in ipairs(ExiliumRBG_DB.matches) do
        if not match.synced then
            pending = pending + 1
            ExiliumRBG_Sync_Upload(match)
        end
    end

    if pending == 0 then
        DEFAULT_CHAT_FRAME:AddMessage("|cffC41E3A[ExiliumRBG]|r Todo sincronizado ✓")
    else
        DEFAULT_CHAT_FRAME:AddMessage(
            "|cffC41E3A[ExiliumRBG]|r |cffFFD700" .. pending ..
            " partidas|r en cola para el Companion."
        )
    end
end

-- ─── Marcar partida como sincronizada (llamado por Companion) ─
-- El Companion escribe en SavedVariables al confirmar el upload
function ExiliumRBG_Sync_MarkDone(matchId)
    if not ExiliumRBG_DB then return end
    for _, match in ipairs(ExiliumRBG_DB.matches) do
        if match.id == matchId then
            match.synced = true
            break
        end
    end
    -- Limpiar de pendingSync
    if ExiliumRBG_DB.pendingSync then
        for i = #ExiliumRBG_DB.pendingSync, 1, -1 do
            if ExiliumRBG_DB.pendingSync[i].matchId == matchId then
                table.remove(ExiliumRBG_DB.pendingSync, i)
            end
        end
    end
end

-- ─── Exportar JSON para copiar manualmente ───────────────────
-- /exirbg export → abre un EditBox con el JSON de la última partida
local function ExportLastMatch()
    local matches = ExiliumRBG_DB and ExiliumRBG_DB.matches
    if not matches or #matches == 0 then
        DEFAULT_CHAT_FRAME:AddMessage("|cffC41E3A[ExiliumRBG]|r Sin partidas para exportar.")
        return
    end

    local match   = matches[#matches]
    local payload = BuildMatchJSON(match)

    -- Crear EditBox popup para copiar
    local popup = CreateFrame("Frame", "ExiliumRBG_ExportPopup", UIParent, "BackdropTemplate")
    popup:SetSize(500, 200)
    popup:SetPoint("CENTER")
    popup:SetBackdrop({
        bgFile   = "Interface\\Buttons\\WHITE8x8",
        edgeFile = "Interface\\Buttons\\WHITE8x8",
        edgeSize = 1,
    })
    popup:SetBackdropColor(0.04, 0.04, 0.07, 0.98)
    popup:SetBackdropBorderColor(0.77, 0.12, 0.23, 1)
    popup:SetFrameStrata("TOOLTIP")

    local label = popup:CreateFontString(nil, "OVERLAY", "GameFontNormal")
    label:SetPoint("TOPLEFT", 10, -10)
    label:SetText("|cffFFD700ExiliumRBG|r — JSON Export (Ctrl+A → Ctrl+C)")

    local editBox = CreateFrame("EditBox", nil, popup, "InputBoxTemplate")
    editBox:SetSize(480, 120)
    editBox:SetPoint("TOPLEFT", 10, -30)
    editBox:SetAutoFocus(true)
    editBox:SetMultiLine(true)
    editBox:SetText(payload)
    editBox:HighlightText()

    local closeBtn = CreateFrame("Button", nil, popup, "UIPanelButtonTemplate")
    closeBtn:SetSize(80, 22)
    closeBtn:SetPoint("BOTTOMRIGHT", -8, 8)
    closeBtn:SetText("Cerrar")
    closeBtn:SetScript("OnClick", function() popup:Hide() end)

    popup:Show()
end

-- Registrar sub-comando export
local oldSlash = SlashCmdList["EXIRBG"]
SlashCmdList["EXIRBG"] = function(msg)
    local cmd = strsplit(" ", msg:lower())
    if cmd == "export" then
        ExportLastMatch()
    else
        if oldSlash then oldSlash(msg) end
    end
end
