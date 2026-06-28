# Dependencias del Sistema de Casino Exilium

## 1. Dependencias Existentes en el Ecosistema

### Sistema Base:
```javascript
// Sistema de Jugadores (players.js)
{
  "estructura_jugador": {
    "name": "string",           // Nombre del personaje
    "realm": "string",          // Realm slug normalizado
    "class": "string",          // Clase WoW
    "spec": "string",           // Especialización
    "battlepass": {
      "total_xp": "number",     // XP acumulado
      "level": "number",        // Nivel actual
      "rank_name": "string"     // Rango del BP
    },
    "pvp": {                    // Datos PvP
      "current": {              // Ratings actuales
        "rs": "number",         // Solo Shuffle
        "r2": "number",         // 2v2
        "r3": "number",         // 3v3
        "rbg": "number",        // RBG
        "bgs": "number"         // Battleground Blitz
      }
    },
    "sync": {                   // Estado de sincronización
      "last_update": "string",  // Última actualización
      "sync_status": "string"   // Estado sync
    }
  }
}
```

### Autenticación Existente (auth.js):
```javascript
// auth.js proporciona:
1. handleAdminLogin(request, env)    // Login administrador
2. handleAdminAuth(request, env)     // Verificar admin
3. handlePublicAuth(request, env)    // Verificar público

// Tokens JWT existentes utilizados para:
- Admin panel (/admin/*)
- Boosting portal (/api/boost/*)
- API pública con rate limiting
```

## 2. Nuevas Dependencias para el Casino

### Módulos Requeridos:
```javascript
// Módulo casino.js (backend)
import {
  tickStateMachine, getCasinoState,
  handleSeat, handlePlaceBet, handleMarkReady, handleClearBets, handleSendChat,
  handleGetLeaderboard, handleGetPlayers,
} from './casino.js';
```

### Keys KV utilizadas:
```javascript
// Schema KV para casino (gestionado por worker/casino.js)
const CASINO_KEYS = {
  // Estado de la sala
  state: 'casino:state',                              // CasinoState
  seats: 'casino:seats',                              // Seat[]
  chat: 'casino:chat',                                // ChatMessage[]
  rounds_history: 'casino:rounds_history',             // RoundSummary[]
  
  // Configuración
  config: 'casino:config',                            // CasinoConfig
  
  // Usuarios
  user: `casino:user:${userId}`,                      // CasinoUser
  user_index: 'casino:user_index',                    // string[]
  session: `casino:session:${token}`,                 // Session
  
  // Transacciones (auditoría)
  transactions: `casino:transactions:${userId}`,      // Transaction[]
};
```

## 3. Tipos de Datos Requeridos

### Transacción:
```typescript
interface CasinoTransaction {
  id: string;                    // UUID o timestamp
  playerId: string;              // ID del jugador
  type: 'round_payout' | 'admin_adjust' | 'stand_refund' | 'kick_refund';
  amount: number;                // Cantidad en PandaCoins
  balanceBefore?: number;        // Saldo antes
  balanceAfter: number;          // Saldo después
  timestamp: number;             // Unix timestamp
  metadata?: {
    round_id?: number;
    result?: number;
    bet?: number;
    win?: number;
  };
}
```

### Configuración del Casino:
```typescript
interface CasinoConfig {
  betting_duration: number;      // 20 segundos
  spinning_duration: number;     // 4 segundos
  result_duration: number;       // 4 segundos
  min_bet: number;               // 50
  max_bet: number;               // 1000
  max_seats: number;             // 5
  max_bets_per_round: number;    // 3
  initial_balance: number;       // 1000
  rounds_to_release_seat: number; // 3
}
```

## 4. Seguridad

### Validaciones implementadas en el backend:
- Autenticación por token de sesión (Bearer token en KV con TTL 7 días)
- Rate limiting de login: máximo 10 intentos por IP en 15 minutos
- Rate limiting de chat: máximo 5 mensajes por usuario en 60 segundos
- Validación de saldo suficiente antes de cada apuesta
- Validación de rango de apuesta (min_bet / max_bet)
- Las transacciones se registran en KV para auditoría
- Los asientos inactivos se liberan automáticamente tras 3 rondas sin apostar
```

## 6. Dependencias de Frontend

### Scripts y Estilos Requeridos:
```html
<!-- casino.html -->
<head>
  <!-- Estilos casino -->
  <link rel="stylesheet" href="/css/casino.css">
  
  <!-- Fuentes premium -->
  <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&display=swap" rel="stylesheet">
  
  <!-- Font personalizada Exilium -->
  <style>
    @font-face {
      font-family: 'Sport Break';
      src: url('/assets/Sport_Break_Free_Version.otf') format('opentype');
    }
  </style>
</head>

<body>
  <!-- Scripts casino -->
  <script src="/js/casino-api.js"></script>
  <script src="/js/casino-ui.js"></script>
  <script src="/js/casino-games.js"></script>
  <script src="/js/casino-animations.js"></script>
  
  <!-- Dependencias de animación -->
  <script src="https://cdn.jsdelivr.net/npm/canvas-confetti@1.6.0/dist/confetti.browser.min.js"></script>
</body>
```

## 7. Dependencias de Despliegue

### Configuración Wrangler:
```toml
# wrangler.toml actual con casino
name = "exilium-blizzard"
main = "worker/index.js"
compatibility_date = "2024-01-01"

[triggers]
crons = ["*/30 * * * *", "0 */6 * * *"]

[[kv_namespaces]]
binding = "EXILIUM_KV"
id = "2d6d2badfc184b408f6c5af7e380d6be"

[[r2_buckets]]
binding = "EXILIUM_MEDIA"
bucket_name = "exilium-media"

[ai]
binding = "AI"

# Nueva configuración para casino
[build]
command = "npm run build"  # Si se migra a TypeScript/React

[site]
bucket = "./deploy"        # Directorio de deploy
```

### Variables de Entorno:
```bash
# Variables opcionales para configuración
CASINO_RTP=0.92
CASINO_MAX_SPINS=12
CASINO_DAILY_BONUS=300
CASINO_COMMISSION_RATE=0.05
CASINO_GOLD_RATE=5000

# Configuración de probabilidades (JSON)
CASINO_PROBABILITIES='{"roulette":{"no_prize":0.34,"x1":0.28,"x2":0.20,"x3":0.11,"x5":0.05,"jackpot":0.02}}'
```

## 8. Dependencias de Testing

### Tests Unitarios Requeridos:
```javascript
// tests/casino.test.js
describe('Sistema de Casino', () => {
  test('Balance inicial correcto para nuevo jugador', () => {});
  test('Giro de ruleta resta apuesta del balance', () => {});
  test('Victoria en ruleta suma premio al balance', () => {});
  test('Límite diario de giros funciona', () => {});
  test('Bono diario respeta cooldown 24h', () => {});
  test('Compra de PandaCoins actualiza balance', () => {});
  test('Venta aplica comisión del 5%', () => {});
  test('Probabilidades suman 100%', () => {});
  test('Integración con sistema de jugadores', () => {});
  test('Validaciones anti-abuse funcionan', () => {});
});
```

### Tests de Integración:
```javascript
// tests/casino-integration.test.js
describe('Integración Casino', () => {
  test('API balance devuelve datos correctos', () => {});
  test('API spin requiere autenticación', () => {});
  test('Transacciones se registran en historial', () => {});
  test('Jackpot crece con premios grandes', () => {});
  test('Integración con Battle Pass misiones', () => {});
  test('Panel admin muestra estadísticas', () => {});
});
```

## 9. Resumen de Dependencias Críticas

### Críticas (bloqueantes):
1. **Sistema de autenticación existente** (auth.js) - para proteger endpoints
2. **KV namespace configurado** (EXILIUM_KV) - para persistencia de datos
3. **Sistema de jugadores** (players.js) - para integración de perfiles
4. **Configuración wrangler** - para despliegue correcto

### Importantes (requeridas para funcionalidad completa):
1. **Módulo casino.js** - lógica de negocio principal
2. **Frontend actualizado** - migración de casino-preview.html
3. **Sistema de XP** (xp-engine.js) - para integración BP
4. **Configuración de probabilidades** - en KV o variables

### Opcionales (mejoras):
1. **Sistema de sonido** - efectos de audio opcionales
2. **Animaciones avanzadas** - canvas/WebGL para efectos
3. **Panel admin detallado** - estadísticas avanzadas
4. **Notificaciones push** - para jackpot/eventos

## 10. Checklist de Implementación

- [ ] Módulo casino.js creado en /worker/
- [ ] Endpoints REST definidos en index.js
- [ ] Schema KV implementado
- [ ] Integración con auth.js completada
- [ ] Validaciones anti-abuse implementadas
- [ ] Frontend migrado a usar API real
- [ ] Sistema de misiones casino para BP
- [ ] Panel admin básico implementado
- [ ] Tests unitarios escritos
- [ ] Despliegue en staging/testing
- [ ] Documentación completa
- [ ] Plan de rollback definido