-- ============================================================
--  ExiliumRBG_UI.lua
--  Panel en pantalla durante BG + ventana de historial
--  Estilo visual: MitzuMPlus_Historial (Blizzard nativo + gold)
-- ============================================================

-- ─── Theme (basado en MitzuMPlus_Historial) ─────────────────
local PANEL_W, PANEL_H = 880, 580
local BAR_H = 26
local FONT_TITLE = "Fonts\\FRIZQT__.TTF"
local FONT_NORMAL = "Fonts\\FRIZQT__.TTF"

local T = {
    -- Backgrounds
    window     = {0.06, 0.06, 0.07, 0.97},
    panel      = {0.08, 0.08, 0.09, 0.97},
    titlebar   = {0.05, 0.05, 0.06, 1.0},
    rowOdd     = {0.11, 0.11, 0.12, 0.95},
    rowEven    = {0.07, 0.07, 0.08, 0.95},
    rowHover   = {0.22, 0.20, 0.12, 1.0},
    btnPrim    = {0.25, 0.20, 0.06, 1.0},
    btnSec     = {0.18, 0.18, 0.18, 1.0},
    btnClose   = {0.20, 0.06, 0.06, 1.0},
    btnCloseH  = {0.32, 0.06, 0.06, 1.0},
    tableHdr   = {0.10, 0.10, 0.11, 0.97},
    footer     = {0.04, 0.04, 0.05, 0.98},
    -- Borders
    bdrWindow  = {0.40, 0.40, 0.40, 1.0},
    bdrPanel   = {0.28, 0.28, 0.28, 1.0},
    bdrGold    = {0.29, 0.24, 0.09, 1.0},
    bdrGoldH   = {0.78, 0.62, 0.19, 1.0},
    -- Gold text
    gold3      = {0.78, 0.62, 0.19},
    gold5      = {0.97, 0.83, 0.44},
    -- Status
    ok         = {0.13, 0.87, 0.40},
    bad        = {0.93, 0.20, 0.20},
    warn       = {1.00, 0.60, 0.13},
    -- Text
    t1         = {1.0, 1.0, 1.0},
    t2         = {0.80, 0.80, 0.80},
    t3         = {0.60, 0.60, 0.60},
    dim        = {0.42, 0.42, 0.42},
}

local BACKDROP_WINDOW = {
    bgFile   = "Interface\\DialogFrame\\UI-DialogBox-Background",
    edgeFile = "Interface\\DialogFrame\\UI-DialogBox-Border",
    tile     = true, tileSize = 32, edgeSize = 26,
    insets   = { left = 8, right = 6, top = 8, bottom = 8 },
}
local BACKDROP_PANEL = {
    bgFile   = "Interface\\DialogFrame\\UI-DialogBox-Background",
    edgeFile = "Interface\\Tooltips\\UI-Tooltip-Border",
    tile     = true, tileSize = 32, edgeSize = 10,
    insets   = { left = 3, right = 3, top = 3, bottom = 3 },
}
local BACKDROP_FLAT = {
    bgFile   = "Interface\\Buttons\\WHITE8X8",
    edgeFile = "Interface\\Buttons\\WHITE8X8",
    tile     = false, tileSize = 0, edgeSize = 1,
    insets   = { left = 0, right = 0, top = 0, bottom = 0 },
}

local COL_COLORS = {
    DEATHKNIGHT  = {0.77, 0.12, 0.23},
    DEMONHUNTER  = {0.64, 0.19, 0.79},
    DRUID        = {1.00, 0.49, 0.04},
    EVOKER       = {0.20, 0.58, 0.50},
    HUNTER       = {0.67, 0.83, 0.45},
    MAGE         = {0.25, 0.89, 0.96},
    MONK         = {0.00, 1.00, 0.60},
    PALADIN      = {0.96, 0.55, 0.73},
    PRIEST       = {1.00, 1.00, 1.00},
    ROGUE        = {1.00, 0.96, 0.41},
    SHAMAN       = {0.00, 0.44, 0.87},
    WARLOCK      = {0.53, 0.53, 0.94},
    WARRIOR      = {0.78, 0.61, 0.43},
}

local function GetClassColor(classToken)
    local c = COL_COLORS[classToken and classToken:upper()] or {0.8, 0.8, 0.8}
    return c[1], c[2], c[3]
end

local function FormatNumber(n)
    n = n or 0
    if n >= 1000000 then return string.format("%.1fM", n / 1000000)
    elseif n >= 1000 then return string.format("%.0fk", n / 1000)
    else return tostring(n) end
end

local function MakeFont(parent, fontPath, size, flags)
    local fs = parent:CreateFontString(nil, "OVERLAY")
    fs:SetFont(fontPath, size, flags or "")
    return fs
end

local function StyleBtn(btn, isPrimary)
    btn:SetBackdrop(BACKDROP_FLAT)
    if isPrimary then
        btn:SetBackdropColor(unpack(T.btnPrim))
        btn:SetBackdropBorderColor(unpack(T.bdrGold))
        btn:GetFontString():SetTextColor(unpack(T.gold5))
    else
        btn:SetBackdropColor(unpack(T.btnSec))
        btn:SetBackdropBorderColor(unpack(T.bdrPanel))
        btn:GetFontString():SetTextColor(unpack(T.gold3))
    end
    btn:SetScript("OnEnter", function(self)
        btn:SetBackdropBorderColor(unpack(T.bdrGoldH))
        if isPrimary then
            btn:SetBackdropColor(0.30, 0.24, 0.08, 1)
        else
            btn:SetBackdropColor(0.25, 0.20, 0.06, 1)
        end
    end)
    btn:SetScript("OnLeave", function(self)
        if isPrimary then
            btn:SetBackdropColor(unpack(T.btnPrim))
            btn:SetBackdropBorderColor(unpack(T.bdrGold))
        else
            btn:SetBackdropColor(unpack(T.btnSec))
            btn:SetBackdropBorderColor(unpack(T.bdrPanel))
        end
    end)
end

-- ─── Mini HUD (visible durante el BG) ────────────────────────
local HUD = nil

local function CreateHUD()
    if HUD then return end
    HUD = CreateFrame("Frame", "ExiliumRBG_HUD", UIParent, "BackdropTemplate")
    HUD:SetSize(250, 86)
    HUD:SetPoint("TOPRIGHT", UIParent, "TOPRIGHT", -220, -140)
    HUD:SetMovable(true)
    HUD:EnableMouse(true)
    HUD:RegisterForDrag("LeftButton")
    HUD:SetScript("OnDragStart", HUD.StartMoving)
    HUD:SetScript("OnDragStop", HUD.StopMovingOrSizing)
    HUD:SetBackdrop(BACKDROP_PANEL)
    HUD:SetBackdropColor(unpack(T.panel))
    HUD:SetBackdropBorderColor(unpack(T.bdrPanel))
    HUD:SetFrameStrata("HIGH")

    -- Titlebar background
    local titleBg = HUD:CreateTexture(nil, "BACKGROUND", nil, 1)
    titleBg:SetPoint("TOPLEFT", 3, -3)
    titleBg:SetPoint("TOPRIGHT", -3, -3)
    titleBg:SetHeight(20)
    titleBg:SetColorTexture(unpack(T.titlebar))

    -- Header
    local header = MakeFont(HUD, FONT_TITLE, 12, "OUTLINE")
    header:SetPoint("TOPLEFT", 10, -6)
    header:SetTextColor(unpack(T.gold3))
    header:SetText("|cffC41E3A[EXILIUM]|r RBG Tracker")
    HUD.header = header

    -- Rated/Casual tag
    local modeLabel = MakeFont(HUD, FONT_NORMAL, 11, "OUTLINE")
    modeLabel:SetPoint("TOPRIGHT", -10, -6)
    modeLabel:SetText("")
    HUD.modeLabel = modeLabel

    -- Rating
    local ratingLabel = MakeFont(HUD, FONT_NORMAL, 12)
    ratingLabel:SetPoint("TOPLEFT", 10, -26)
    ratingLabel:SetTextColor(unpack(T.t2))
    ratingLabel:SetText("Rating: |cffFFD700—|r")
    HUD.ratingLabel = ratingLabel

    -- Mapa
    local mapLabel = MakeFont(HUD, FONT_NORMAL, 11)
    mapLabel:SetPoint("TOPLEFT", 10, -40)
    mapLabel:SetTextColor(unpack(T.t3))
    mapLabel:SetText("Mapa: —")
    HUD.mapLabel = mapLabel

    -- Season progress
    local seasonLabel = MakeFont(HUD, FONT_NORMAL, 11)
    seasonLabel:SetPoint("TOPLEFT", 10, -54)
    seasonLabel:SetTextColor(unpack(T.t3))
    seasonLabel:SetText("")
    HUD.seasonLabel = seasonLabel

    -- Botón historial (gold styled)
    local btn = CreateFrame("Button", nil, HUD, "BackdropTemplate")
    btn:SetSize(78, 22)
    btn:SetPoint("BOTTOMRIGHT", -6, 6)
    local btnFs = MakeFont(btn, FONT_NORMAL, 11)
    btnFs:SetPoint("CENTER")
    btnFs:SetText("Historial")
    btn:SetFontString(btnFs)
    StyleBtn(btn, true)
    btn:SetScript("OnClick", function() ExiliumRBG_UI_Toggle() end)
    HUD.btn = btn

    HUD:Hide()
end

function ExiliumRBG_UI_Show()
    CreateHUD()
    HUD:Show()
    ExiliumRBG_UI_Update()
end

function ExiliumRBG_UI_Hide()
    if HUD then HUD:Hide() end
end

function ExiliumRBG_UI_Update()
    if not HUD or not HUD:IsShown() then return end
    local rbgInfo = GetRBGInfo and GetRBGInfo() or { rating = 0, seasonWon = 0, seasonPlayed = 0 }
    HUD.ratingLabel:SetText("Rating: |cffFFD700" .. rbgInfo.rating .. "|r")
    if State and State.bgName then
        HUD.mapLabel:SetText("Mapa: |cffFFFFFF" .. State.bgName .. "|r")
    end
    -- Rated/Casual tag
    if State and State.isRated then
        HUD.modeLabel:SetText("|cff00FF7FRATED|r")
    else
        HUD.modeLabel:SetText("|cff888888CASUAL|r")
    end
    -- Season W/L
    local sw = rbgInfo.seasonWon or 0
    local sp = rbgInfo.seasonPlayed or 0
    local sl = sp - sw
    local wr = sp > 0 and math.floor((sw / sp) * 100) or 0
    HUD.seasonLabel:SetText("Season: |cff00FF7F" .. sw .. "W|r/|cffC41E3A" .. sl .. "L|r (|cffFFD700" .. wr .. "%%|r)")
end

-- ─── Ventana de historial (estilo MitzuMPlus_Historial) ─────
local MainWindow = nil
local currentPage = 1
local MATCHES_PER_PAGE = 14

local function CreateMainWindow()
    if MainWindow then return end

    -- ══════════════════════════════════════════════════════════
    -- VENTANA PRINCIPAL (Blizzard DialogBox, tamaño grande)
    -- ══════════════════════════════════════════════════════════
    MainWindow = CreateFrame("Frame", "ExiliumRBG_Main", UIParent, "BackdropTemplate")
    MainWindow:SetSize(PANEL_W, PANEL_H)
    MainWindow:SetPoint("CENTER")
    MainWindow:SetMovable(true)
    MainWindow:EnableMouse(true)
    MainWindow:RegisterForDrag("LeftButton")
    MainWindow:SetScript("OnDragStart", MainWindow.StartMoving)
    MainWindow:SetScript("OnDragStop", MainWindow.StopMovingOrSizing)
    MainWindow:SetFrameStrata("DIALOG")
    MainWindow:SetBackdrop(BACKDROP_WINDOW)
    MainWindow:SetBackdropColor(unpack(T.window))
    MainWindow:SetBackdropBorderColor(unpack(T.bdrWindow))
    tinsert(UISpecialFrames, "ExiliumRBG_Main")

    -- ══ TITLEBAR ══════════════════════════════════════════════
    local titleBar = CreateFrame("Frame", nil, MainWindow, "BackdropTemplate")
    titleBar:SetPoint("TOPLEFT", 10, -10)
    titleBar:SetPoint("TOPRIGHT", -10, -10)
    titleBar:SetHeight(34)
    titleBar:SetBackdrop(BACKDROP_FLAT)
    titleBar:SetBackdropColor(unpack(T.titlebar))
    titleBar:SetBackdropBorderColor(unpack(T.bdrGold))

    -- Icon
    local titleIcon = titleBar:CreateTexture(nil, "ARTWORK")
    titleIcon:SetTexture("Interface\\Icons\\Achievement_BG_winAB")
    titleIcon:SetSize(24, 24)
    titleIcon:SetPoint("LEFT", 8, 0)

    -- Title text
    local title = MakeFont(titleBar, FONT_TITLE, 14, "OUTLINE")
    title:SetPoint("LEFT", titleIcon, "RIGHT", 8, 2)
    title:SetTextColor(unpack(T.gold5))
    title:SetText("|cffC41E3AExiliumRBG|r HISTORIAL")

    -- Subtitle
    local subtitle = MakeFont(titleBar, FONT_NORMAL, 10)
    subtitle:SetPoint("LEFT", titleIcon, "RIGHT", 8, -10)
    subtitle:SetTextColor(unpack(T.dim))
    subtitle:SetText("Rated Battleground Tracker & Analysis")

    -- Status dot (green = activa)
    local statusDot = MakeFont(titleBar, FONT_TITLE, 12, "OUTLINE")
    statusDot:SetPoint("RIGHT", -40, 0)
    statusDot:SetTextColor(unpack(T.ok))
    statusDot:SetText("● ACTIVA")

    -- Close button
    local closeBtn = CreateFrame("Button", nil, titleBar, "BackdropTemplate")
    closeBtn:SetSize(22, 22)
    closeBtn:SetPoint("RIGHT", -6, 0)
    closeBtn:SetBackdrop(BACKDROP_FLAT)
    closeBtn:SetBackdropColor(unpack(T.btnClose))
    closeBtn:SetBackdropBorderColor(0.35, 0.10, 0.10, 1)
    local closeTxt = MakeFont(closeBtn, FONT_TITLE, 13, "OUTLINE")
    closeTxt:SetPoint("CENTER", 0, 1)
    closeTxt:SetText("X")
    closeTxt:SetTextColor(unpack(T.bad))
    closeBtn:SetScript("OnClick", function() MainWindow:Hide() end)
    closeBtn:SetScript("OnEnter", function(self)
        self:SetBackdropColor(unpack(T.btnCloseH))
        self:SetBackdropBorderColor(unpack(T.bad))
    end)
    closeBtn:SetScript("OnLeave", function(self)
        self:SetBackdropColor(unpack(T.btnClose))
        self:SetBackdropBorderColor(0.35, 0.10, 0.10, 1)
    end)

    -- ══ SUMMARY STATS BAR ═════════════════════════════════════
    local summaryBar = CreateFrame("Frame", nil, MainWindow, "BackdropTemplate")
    summaryBar:SetPoint("TOPLEFT", 10, -48)
    summaryBar:SetPoint("TOPRIGHT", -10, -48)
    summaryBar:SetHeight(22)
    summaryBar:SetBackdrop(BACKDROP_FLAT)
    summaryBar:SetBackdropColor(0.08, 0.08, 0.10, 0.95)
    summaryBar:SetBackdropBorderColor(unpack(T.bdrPanel))

    MainWindow.summaryLabel = MakeFont(summaryBar, FONT_NORMAL, 11)
    MainWindow.summaryLabel:SetPoint("LEFT", 10, 0)
    MainWindow.summaryLabel:SetTextColor(unpack(T.t2))
    MainWindow.summaryLabel:SetText("")

    -- ══ TABLE HEADER BAR ══════════════════════════════════════
    local hdrBar = CreateFrame("Frame", nil, MainWindow, "BackdropTemplate")
    hdrBar:SetPoint("TOPLEFT", 10, -72)
    hdrBar:SetPoint("TOPRIGHT", -10, -72)
    hdrBar:SetHeight(22)
    hdrBar:SetBackdrop(BACKDROP_FLAT)
    hdrBar:SetBackdropColor(unpack(T.tableHdr))
    hdrBar:SetBackdropBorderColor(unpack(T.bdrGold))

    -- Columns: #, MAPA, RESULTADO, RATING, DELTA, MMR, DURACIÓN, KB, MUERTES, FECHA
    local cols = {
        {label="#",         x=6},
        {label="MAPA",      x=30},
        {label="RESULTADO", x=200},
        {label="RATING",    x=290},
        {label="DELTA",     x=350},
        {label="MMR",       x=410},
        {label="DURACION",  x=470},
        {label="KB",        x=548},
        {label="MUERTES",   x=590},
        {label="FECHA",     x=660},
    }
    for _, col in ipairs(cols) do
        local fs = MakeFont(hdrBar, FONT_NORMAL, 10, "OUTLINE")
        fs:SetPoint("LEFT", col.x, 0)
        fs:SetTextColor(unpack(T.gold3))
        fs:SetText(col.label)
    end

    -- ══ DATA ROWS ═════════════════════════════════════════════
    local contentTop = -96
    MainWindow.rows = {}
    for i = 1, MATCHES_PER_PAGE do
        local row = {}
        local yOff = contentTop - ((i - 1) * BAR_H)

        -- Alternating row background
        row.bg = MainWindow:CreateTexture(nil, "BACKGROUND")
        row.bg:SetPoint("TOPLEFT", 10, yOff)
        row.bg:SetSize(PANEL_W - 20, BAR_H)
        if i % 2 == 0 then
            row.bg:SetColorTexture(unpack(T.rowEven))
        else
            row.bg:SetColorTexture(unpack(T.rowOdd))
        end

        -- FontStrings for each column
        row.num     = MakeFont(MainWindow, FONT_NORMAL, 11)
        row.map     = MakeFont(MainWindow, FONT_NORMAL, 11)
        row.result  = MakeFont(MainWindow, FONT_TITLE, 11, "OUTLINE")
        row.rating  = MakeFont(MainWindow, FONT_NORMAL, 11)
        row.delta   = MakeFont(MainWindow, FONT_NORMAL, 11)
        row.mmr     = MakeFont(MainWindow, FONT_NORMAL, 11)
        row.dur     = MakeFont(MainWindow, FONT_NORMAL, 11)
        row.kb      = MakeFont(MainWindow, FONT_NORMAL, 11)
        row.deaths  = MakeFont(MainWindow, FONT_NORMAL, 11)
        row.fecha   = MakeFont(MainWindow, FONT_NORMAL, 10)

        -- Default colors
        row.num:SetTextColor(unpack(T.dim))
        row.map:SetTextColor(unpack(T.t1))
        row.rating:SetTextColor(unpack(T.t2))
        row.delta:SetTextColor(unpack(T.t2))
        row.mmr:SetTextColor(unpack(T.t3))
        row.dur:SetTextColor(unpack(T.t3))
        row.kb:SetTextColor(unpack(T.t2))
        row.deaths:SetTextColor(unpack(T.t3))
        row.fecha:SetTextColor(unpack(T.dim))

        -- Position each column
        local yC = yOff - BAR_H / 2 + 1
        row.num:SetPoint("LEFT",    MainWindow, "TOPLEFT", 16,  yC)
        row.map:SetPoint("LEFT",    MainWindow, "TOPLEFT", 40,  yC)
        row.result:SetPoint("LEFT", MainWindow, "TOPLEFT", 210, yC)
        row.rating:SetPoint("LEFT", MainWindow, "TOPLEFT", 300, yC)
        row.delta:SetPoint("LEFT",  MainWindow, "TOPLEFT", 360, yC)
        row.mmr:SetPoint("LEFT",    MainWindow, "TOPLEFT", 420, yC)
        row.dur:SetPoint("LEFT",    MainWindow, "TOPLEFT", 480, yC)
        row.kb:SetPoint("LEFT",     MainWindow, "TOPLEFT", 558, yC)
        row.deaths:SetPoint("LEFT", MainWindow, "TOPLEFT", 600, yC)
        row.fecha:SetPoint("LEFT",  MainWindow, "TOPLEFT", 670, yC)

        -- Hover highlight (gold tint)
        row.hitArea = CreateFrame("Button", nil, MainWindow)
        row.hitArea:SetPoint("TOPLEFT", 10, yOff)
        row.hitArea:SetSize(PANEL_W - 20, BAR_H)
        local hlTex = row.hitArea:CreateTexture(nil, "HIGHLIGHT")
        hlTex:SetAllPoints()
        hlTex:SetColorTexture(T.rowHover[1], T.rowHover[2], T.rowHover[3], 0.25)

        -- Tooltip on hover: show full player list
        local rowIndex = i
        row.hitArea:SetScript("OnEnter", function(self)
            local matchIndex = (#ExiliumRBG_DB.matches - (currentPage - 1) * MATCHES_PER_PAGE) - rowIndex + 1
            local match = ExiliumRBG_DB.matches[matchIndex]
            if not match or not match.players or #match.players == 0 then return end
            GameTooltip:SetOwner(self, "ANCHOR_RIGHT")
            GameTooltip:ClearLines()
            GameTooltip:AddLine("|cffFFD700" .. (match.map or "?") .. "|r", 1, 1, 1)
            GameTooltip:AddLine(" ")
            GameTooltip:AddDoubleLine("|cff888888Jugador|r", "|cff888888DMG / Heal / KB|r")
            local sorted = {}
            for _, p in ipairs(match.players) do table.insert(sorted, p) end
            table.sort(sorted, function(a, b) return (a.damage or 0) > (b.damage or 0) end)
            for _, p in ipairs(sorted) do
                local r, g, b = GetClassColor(p.class)
                local left  = string.format("|cff%02x%02x%02x%s|r", r*255, g*255, b*255, p.name or "?")
                local right = string.format("%s / %s / %d",
                    FormatNumber(p.damage), FormatNumber(p.healing), p.killingBlows or 0)
                GameTooltip:AddDoubleLine(left, right, 1, 1, 1, 0.8, 0.8, 0.8)
            end
            GameTooltip:Show()
        end)
        row.hitArea:SetScript("OnLeave", function() GameTooltip:Hide() end)

        table.insert(MainWindow.rows, row)
    end

    -- ══ FOOTER BAR ════════════════════════════════════════════
    local footerBar = CreateFrame("Frame", nil, MainWindow, "BackdropTemplate")
    footerBar:SetPoint("BOTTOMLEFT", 10, 30)
    footerBar:SetPoint("BOTTOMRIGHT", -10, 30)
    footerBar:SetHeight(26)
    footerBar:SetBackdrop(BACKDROP_FLAT)
    footerBar:SetBackdropColor(unpack(T.panel))
    footerBar:SetBackdropBorderColor(unpack(T.bdrPanel))

    -- Pagination label
    MainWindow.pageLabel = MakeFont(footerBar, FONT_NORMAL, 11)
    MainWindow.pageLabel:SetPoint("LEFT", 10, 0)
    MainWindow.pageLabel:SetTextColor(unpack(T.t3))
    MainWindow.pageLabel:SetText("Página 1 de 1 - 0 partidas totales")

    -- Page buttons
    local prevBtn = CreateFrame("Button", nil, footerBar, "BackdropTemplate")
    prevBtn:SetSize(24, 18)
    prevBtn:SetPoint("RIGHT", -100, 0)
    local prevFs = MakeFont(prevBtn, FONT_NORMAL, 12)
    prevFs:SetPoint("CENTER")
    prevFs:SetText("«")
    prevBtn:SetFontString(prevFs)
    StyleBtn(prevBtn, false)
    prevBtn:SetScript("OnClick", function()
        local maxPage = math.ceil(#ExiliumRBG_DB.matches / MATCHES_PER_PAGE)
        if currentPage < maxPage then
            currentPage = currentPage + 1
            ExiliumRBG_UI_Refresh()
        end
    end)

    MainWindow.pageNumLabel = MakeFont(footerBar, FONT_NORMAL, 11)
    MainWindow.pageNumLabel:SetPoint("RIGHT", -72, 0)
    MainWindow.pageNumLabel:SetTextColor(unpack(T.gold5))
    MainWindow.pageNumLabel:SetText("1")

    local nextBtn = CreateFrame("Button", nil, footerBar, "BackdropTemplate")
    nextBtn:SetSize(24, 18)
    nextBtn:SetPoint("RIGHT", -44, 0)
    local nextFs = MakeFont(nextBtn, FONT_NORMAL, 12)
    nextFs:SetPoint("CENTER")
    nextFs:SetText("»")
    nextBtn:SetFontString(nextFs)
    StyleBtn(nextBtn, false)
    nextBtn:SetScript("OnClick", function()
        if currentPage > 1 then
            currentPage = currentPage - 1
            ExiliumRBG_UI_Refresh()
        end
    end)

    -- Sync KV button
    local syncBtn = CreateFrame("Button", nil, footerBar, "BackdropTemplate")
    syncBtn:SetSize(70, 18)
    syncBtn:SetPoint("RIGHT", -6, 0)
    local syncFs = MakeFont(syncBtn, FONT_NORMAL, 10)
    syncFs:SetPoint("CENTER")
    syncFs:SetText("Sync KV")
    syncBtn:SetFontString(syncFs)
    StyleBtn(syncBtn, true)
    syncBtn:SetScript("OnClick", function()
        ExiliumRBG_Sync_PendingAll()
    end)

    -- ══ STATUS BAR (bottom) ═══════════════════════════════════
    local statusBar = CreateFrame("Frame", nil, MainWindow, "BackdropTemplate")
    statusBar:SetPoint("BOTTOMLEFT", 10, 8)
    statusBar:SetPoint("BOTTOMRIGHT", -10, 8)
    statusBar:SetHeight(20)
    statusBar:SetBackdrop(BACKDROP_FLAT)
    statusBar:SetBackdropColor(unpack(T.footer))
    statusBar:SetBackdropBorderColor(unpack(T.bdrPanel))

    local statusLeft = MakeFont(statusBar, FONT_NORMAL, 10)
    statusLeft:SetPoint("LEFT", 8, 0)
    statusLeft:SetTextColor(unpack(T.dim))
    statusLeft:SetText("ExiliumRBG Tracker · by mItz")

    MainWindow.statusRight = MakeFont(statusBar, FONT_NORMAL, 10)
    MainWindow.statusRight:SetPoint("RIGHT", -8, 0)
    MainWindow.statusRight:SetTextColor(unpack(T.dim))
    MainWindow.statusRight:SetText("v1.1.0")

    MainWindow:Hide()
end

-- ══════════════════════════════════════════════════════════════
-- REFRESH DATA
-- ══════════════════════════════════════════════════════════════
function ExiliumRBG_UI_Refresh()
    if not MainWindow then return end
    local matches = ExiliumRBG_DB.matches
    local total   = #matches
    local maxPage = math.max(1, math.ceil(total / MATCHES_PER_PAGE))
    currentPage   = math.min(currentPage, maxPage)

    -- ── Summary bar stats ──
    local wins, losses, totalDelta = 0, 0, 0
    for _, m in ipairs(matches) do
        if m.won then wins = wins + 1 else losses = losses + 1 end
        totalDelta = totalDelta + (m.ratingDelta or 0)
    end
    local wr = total > 0 and math.floor((wins / total) * 100) or 0
    local lastRating = total > 0 and (matches[total].ratingAfter or 0) or 0

    MainWindow.summaryLabel:SetText(
        "Rating: |cffFFD700" .. lastRating .. "|r    " ..
        "Mostrando: |cffFFD700" .. total .. " partidas|r    " ..
        "|cff21de66Victorias: " .. wins .. "|r    " ..
        "|cffee3333Derrotas: " .. losses .. "|r    " ..
        "WR: |cffFFD700" .. wr .. "%%|r"
    )

    -- ── Populate rows ──
    local startIdx = total - (currentPage - 1) * MATCHES_PER_PAGE
    local endIdx   = math.max(1, startIdx - MATCHES_PER_PAGE + 1)

    local rowI = 1
    for i = startIdx, endIdx, -1 do
        local row   = MainWindow.rows[rowI]
        local match = matches[i]

        if match then
            -- #
            if not match.synced then
                row.num:SetText("|cffFFD700" .. i .. "|r")
            else
                row.num:SetText("|cff666666" .. i .. "|r")
            end

            -- Mapa (shortened)
            local shortMap = (match.map or "?"):gsub("Battle for ", ""):gsub("Temple of ", ""):gsub("Eye of the ", ""):gsub("The ", "")
            if #shortMap > 22 then shortMap = shortMap:sub(1, 20) .. ".." end
            row.map:SetText(shortMap)

            -- Resultado
            if match.won then
                row.result:SetText("|cff21de66VICTORIA|r")
            else
                row.result:SetText("|cffee3333DERROTA|r")
            end

            -- Rating
            row.rating:SetText("|cffFFD700" .. tostring(match.ratingAfter or 0) .. "|r")

            -- Delta
            local delta = match.ratingDelta or 0
            if delta >= 0 then
                row.delta:SetText("|cff21de66+" .. delta .. "|r")
            else
                row.delta:SetText("|cffee3333" .. delta .. "|r")
            end

            -- MMR
            local mmr = match.mmrBefore or match.mmr or 0
            row.mmr:SetText(tostring(mmr))

            -- Duration
            local dur = match.duration or 0
            local mins = math.floor(dur / 60)
            local secs = dur - mins * 60
            row.dur:SetText(string.format("%d:%02d", mins, secs))

            -- KB (sum of player KB or match-level)
            local totalKB = 0
            if match.players then
                for _, p in ipairs(match.players) do
                    totalKB = totalKB + (p.killingBlows or 0)
                end
            end
            row.kb:SetText("|cffFFD700" .. totalKB .. "|r")

            -- Deaths (if available)
            local totalDeaths = 0
            if match.players then
                for _, p in ipairs(match.players) do
                    totalDeaths = totalDeaths + (p.deaths or 0)
                end
            end
            row.deaths:SetText(tostring(totalDeaths))

            -- Fecha (relative)
            local fecha = ""
            if match.timestamp then
                local diff = time() - match.timestamp
                if diff < 3600 then
                    fecha = math.floor(diff / 60) .. " min"
                elseif diff < 86400 then
                    fecha = math.floor(diff / 3600) .. " horas"
                else
                    fecha = math.floor(diff / 86400) .. " dias"
                end
                fecha = "Hace " .. fecha
            end
            row.fecha:SetText(fecha)

            row.bg:Show()
            row.hitArea:Show()
        else
            row.num:SetText("")   row.map:SetText("")
            row.result:SetText("") row.rating:SetText("")
            row.delta:SetText("") row.mmr:SetText("")
            row.dur:SetText("")   row.kb:SetText("")
            row.deaths:SetText("") row.fecha:SetText("")
            row.bg:Hide()         row.hitArea:Hide()
        end
        rowI = rowI + 1
    end

    -- Hide unused rows
    for j = rowI, MATCHES_PER_PAGE do
        local row = MainWindow.rows[j]
        row.num:SetText("")   row.map:SetText("")
        row.result:SetText("") row.rating:SetText("")
        row.delta:SetText("") row.mmr:SetText("")
        row.dur:SetText("")   row.kb:SetText("")
        row.deaths:SetText("") row.fecha:SetText("")
        row.bg:Hide()         row.hitArea:Hide()
    end

    -- ── Footer pagination ──
    MainWindow.pageLabel:SetText(
        "Página " .. currentPage .. " de " .. maxPage .. " - " .. total .. " partidas totales"
    )
    MainWindow.pageNumLabel:SetText(tostring(currentPage))

    -- Status bar right
    local dStr = totalDelta >= 0 and ("|cff21de66+" .. totalDelta .. "|r") or ("|cffee3333" .. totalDelta .. "|r")
    MainWindow.statusRight:SetText("v1.1.0  ·  Rating neto: " .. dStr .. "  ·  " .. total .. " RUNS")
end

function ExiliumRBG_UI_Toggle()
    CreateMainWindow()
    if MainWindow:IsShown() then
        MainWindow:Hide()
    else
        ExiliumRBG_UI_Refresh()
        MainWindow:Show()
    end
end

-- ─── Botón de Minimapa ──────────────────────────────────────
local MinimapBtn = nil
local isDragging = false

local function GetMinimapRadius()
    local w = Minimap:GetWidth() or 140
    return (w / 2) + 12
end

local function UpdateMinimapPosition(angle)
    if not MinimapBtn then return end
    local rad = math.rad(angle)
    local radius = GetMinimapRadius()
    local x = math.cos(rad) * radius
    local y = math.sin(rad) * radius
    MinimapBtn:ClearAllPoints()
    MinimapBtn:SetPoint("CENTER", Minimap, "CENTER", x, y)
end

local function GetMinimapAngleFromCursor()
    local cx, cy = GetCursorPosition()
    local scale = Minimap:GetEffectiveScale()
    local mx, my = Minimap:GetCenter()
    mx, my = mx * scale, my * scale
    return math.deg(math.atan2(cy - my, cx - mx))
end

function ExiliumRBG_MinimapButton_Create()
    if MinimapBtn then return end

    MinimapBtn = CreateFrame("Button", "ExiliumRBG_MinimapButton", Minimap)
    MinimapBtn:SetSize(32, 32)
    MinimapBtn:SetFrameStrata("MEDIUM")
    MinimapBtn:SetFrameLevel(8)

    -- Icono
    local icon = MinimapBtn:CreateTexture(nil, "ARTWORK")
    icon:SetTexture("Interface\\Icons\\Achievement_BG_winAB")
    icon:SetSize(20, 20)
    icon:SetPoint("CENTER", 0, 0)
    MinimapBtn.icon = icon

    -- Borde circular (estilo minimap standard)
    local border = MinimapBtn:CreateTexture(nil, "OVERLAY")
    border:SetTexture("Interface\\Minimap\\MiniMap-TrackingBorder")
    border:SetSize(54, 54)
    border:SetPoint("TOPLEFT", 0, 0)
    MinimapBtn.border = border

    -- Highlight
    local highlight = MinimapBtn:CreateTexture(nil, "HIGHLIGHT")
    highlight:SetTexture("Interface\\Minimap\\UI-Minimap-ZoomButton-Highlight")
    highlight:SetSize(24, 24)
    highlight:SetPoint("CENTER", 0, 0)
    highlight:SetBlendMode("ADD")

    -- Tooltip
    MinimapBtn:SetScript("OnEnter", function(self)
        GameTooltip:SetOwner(self, "ANCHOR_LEFT")
        GameTooltip:ClearLines()
        GameTooltip:AddLine("|cffC41E3AExiliumRBG|r Tracker", 1, 1, 1)
        GameTooltip:AddLine(" ")
        GameTooltip:AddLine("|cffFFD700Click izquierdo:|r Abrir historial", 0.8, 0.8, 0.8)
        GameTooltip:AddLine("|cffFFD700Click derecho:|r Toggle HUD", 0.8, 0.8, 0.8)
        GameTooltip:AddLine("|cffFFD700Arrastrar:|r Mover botón", 0.8, 0.8, 0.8)
        -- Stats rápidos
        if ExiliumRBG_DB and ExiliumRBG_DB.matches then
            local total = #ExiliumRBG_DB.matches
            if total > 0 then
                local wins = 0
                for _, m in ipairs(ExiliumRBG_DB.matches) do
                    if m.won then wins = wins + 1 end
                end
                local wr = math.floor((wins / total) * 100)
                GameTooltip:AddLine(" ")
                GameTooltip:AddLine("Partidas: |cffFFD700" .. total .. "|r  WR: |cff00FF7F" .. wr .. "%|r", 0.6, 0.6, 0.6)
            end
        end
        GameTooltip:Show()
    end)
    MinimapBtn:SetScript("OnLeave", function()
        GameTooltip:Hide()
    end)

    -- Click handlers
    MinimapBtn:RegisterForClicks("LeftButtonUp", "RightButtonUp")
    MinimapBtn:SetScript("OnClick", function(self, button)
        if isDragging then return end
        if button == "LeftButton" then
            ExiliumRBG_UI_Toggle()
        elseif button == "RightButton" then
            if HUD and HUD:IsShown() then
                ExiliumRBG_UI_Hide()
            else
                ExiliumRBG_UI_Show()
            end
        end
    end)

    -- Drag around minimap
    MinimapBtn:RegisterForDrag("LeftButton")
    MinimapBtn:SetScript("OnDragStart", function()
        isDragging = true
        MinimapBtn:SetScript("OnUpdate", function()
            local angle = GetMinimapAngleFromCursor()
            UpdateMinimapPosition(angle)
            if ExiliumRBG_DB then
                ExiliumRBG_DB.minimapAngle = angle
            end
        end)
    end)
    MinimapBtn:SetScript("OnDragStop", function()
        MinimapBtn:SetScript("OnUpdate", nil)
        C_Timer.After(0.05, function() isDragging = false end)
    end)

    -- Posición inicial desde SavedVariables o default 225°
    local angle = 225
    if ExiliumRBG_DB and ExiliumRBG_DB.minimapAngle then
        angle = ExiliumRBG_DB.minimapAngle
    end
    UpdateMinimapPosition(angle)

    MinimapBtn:Show()
end
