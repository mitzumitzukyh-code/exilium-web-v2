/*
 * EXILIUM BATTLE PASS (v3.1)
 * Módulo del Motor de XP (Frontend)
 * Lógica compartida con el worker.
 */

const XP_TABLES = {
    STANDARD: [
        { rating: 2400, xp: 4550 },
        { rating: 2100, xp: 2550 },
        { rating: 1800, xp: 1050 },
        { rating: 1600, xp: 550 },
        { rating: 1400, xp: 300 },
        { rating: 1200, xp: 150 },
        { rating: 1000, xp: 50 },
    ],
    THREE_V_THREE: [
        { rating: 2400, xp: 5800 },
        { rating: 2100, xp: 3300 },
        { rating: 1800, xp: 1300 },
        { rating: 1600, xp: 550 },
        { rating: 1400, xp: 300 },
        { rating: 1200, xp: 150 },
        { rating: 1000, xp: 50 },
    ]
};

const LEVELS_TABLE = [
    { level: 40, xp: 15500, rank: 'EXARCA' },
    { level: 39, xp: 15420, rank: 'PROFETA' },
    { level: 38, xp: 15320, rank: 'PROFETA' },
    { level: 37, xp: 15170, rank: 'PROFETA' },
    { level: 36, xp: 14400, rank: 'PROFETA' },
    { level: 35, xp: 13650, rank: 'PROFETA' },
    { level: 34, xp: 12920, rank: 'HEREJE' },
    { level: 33, xp: 12210, rank: 'HEREJE' },
    { level: 32, xp: 11520, rank: 'HEREJE' },
    { level: 31, xp: 10850, rank: 'HEREJE' },
    { level: 30, xp: 10200, rank: 'HEREJE' },
    { level: 29, xp: 9570, rank: 'ROMPEJURAMENTOS' },
    { level: 28, xp: 8960, rank: 'ROMPEJURAMENTOS' },
    { level: 27, xp: 8370, rank: 'ROMPEJURAMENTOS' },
    { level: 26, xp: 7800, rank: 'ROMPEJURAMENTOS' },
    { level: 25, xp: 7250, rank: 'ROMPEJURAMENTOS' },
    { level: 24, xp: 6720, rank: 'ROMPEJURAMENTOS' },
    { level: 23, xp: 6210, rank: 'APÓSTATA' },
    { level: 22, xp: 5720, rank: 'APÓSTATA' },
    { level: 21, xp: 5250, rank: 'APÓSTATA' },
    { level: 20, xp: 4800, rank: 'APÓSTATA' },
    { level: 19, xp: 4370, rank: 'APÓSTATA' },
    { level: 18, xp: 3960, rank: 'APÓSTATA' },
    { level: 17, xp: 3570, rank: 'SOMBRA' },
    { level: 16, xp: 3200, rank: 'SOMBRA' },
    { level: 15, xp: 2850, rank: 'SOMBRA' },
    { level: 14, xp: 2520, rank: 'SOMBRA' },
    { level: 13, xp: 2210, rank: 'SOMBRA' },
    { level: 12, xp: 1920, rank: 'SOMBRA' },
    { level: 11, xp: 1400, rank: 'PENITENTE' },
    { level: 10, xp: 1170, rank: 'PENITENTE' },
    { level: 9, xp: 960, rank: 'PENITENTE' },
    { level: 8, xp: 850, rank: 'PENITENTE' },
    { level: 7, xp: 770, rank: 'PENITENTE' },
    { level: 6, xp: 600, rank: 'PENITENTE' },
    { level: 5, xp: 450, rank: 'INICIADO' },
    { level: 4, xp: 320, rank: 'INICIADO' },
    { level: 3, xp: 210, rank: 'INICIADO' },
    { level: 2, xp: 120, rank: 'INICIADO' },
    { level: 1, xp: 50, rank: 'INICIADO' },
    { level: 0, xp: 0, rank: 'EXILIADO' },
];

function getXpForNextLevel(currentLevel) {
    if (currentLevel >= 40) return LEVELS_TABLE[0].xp;
    const nextLevelData = LEVELS_TABLE.find(l => l.level === currentLevel + 1) || LEVELS_TABLE[0];
    return nextLevelData.xp;
}

function getXpForCurrentLevel(currentLevel) {
    const levelData = LEVELS_TABLE.find(l => l.level === currentLevel);
    return levelData ? levelData.xp : 0;
}

function getLevelFromXP(totalXp) {
    if (!totalXp || totalXp <= 0) return { level: 0, rank: 'EXILIADO' };
    
    // La tabla está en orden DESCENDENTE (nivel 40 → 0).
    // El primer entry donde totalXp >= entry.xp es el nivel correcto.
    for (const levelData of LEVELS_TABLE) {
        if (totalXp >= levelData.xp) {
            return { level: levelData.level, rank: levelData.rank };
        }
    }
    
    return { level: 0, rank: 'EXILIADO' };
}
