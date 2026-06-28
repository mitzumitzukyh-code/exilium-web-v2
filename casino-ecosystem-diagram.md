# Diagrama del Ecosistema de Casino Exilium

## 1. Arquitectura Actual (Frontend-Only)

```mermaid
flowchart TD
    A[Usuario Frontend] --> B[casino-preview.html<br>Página estática]
    B --> C[JavaScript Vanilla]
    C --> D[Estado en memoria<br>Sin persistencia]
    D --> E[Ruleta interactiva<br>6 resultados con probabilidades]
    D --> F[Sistema PandaCoins<br>1 🪙 = 5,000 oro]
    D --> G[Historial local<br>Máximo 8 movimientos]
    
    subgraph "Componentes Principales"
        E
        F
        G
    end
    
    subgraph "Mecánicas"
        H[Bono diario +300 🪙<br>24h cooldown]
        I[Límite 12 giros/día]
        J[RTP: ~92%]
        K[Comisión 5% al vender]
    end
```

## 2. Arquitectura Actual (Backend + Frontend)

```mermaid
flowchart TD
    A[Usuario Frontend] --> B[sala-pandacoins-standalone.html<br>SPA Vanilla JS]
    B --> C[API Requests]
    C --> D[Cloudflare Worker<br>worker/casino.js]
    
    D --> E[Autenticación<br>Token sesión KV]
    D --> F[Máquina de estados<br>Anti-abuse checks]
    D --> G[Persistencia de datos]
    
    G --> H[EXILIUM_KV Namespace]
    
    subgraph "KV Keys Schema"
        H1[casino:state]
        H2[casino:seats]
        H3[casino:chat]
        H4[casino:rounds_history]
        H5[casino:config]
        H6[casino:user:{id}]
        H7[casino:transactions:{id}]
    end
    
    subgraph "Endpoints REST API"
        I1[GET /api/casino/state]
        I2[POST /api/casino/seat]
        I3[POST /api/casino/bet]
        I4[POST /api/casino/clear-bets]
        I5[POST /api/casino/ready]
        I6[POST /api/casino/chat]
        I7[GET /api/casino/leaderboard]
        I8[GET /api/casino/me]
        I9[GET /api/casino/players]
    end
    
    J[Servidor] --> K[🎰 Ruleta Europea<br>37 sectores]
    
    U[Admin Panel] --> V[Auditoría transacciones]
    U --> W[Configuración sala]
    U --> X[Estadísticas avanzadas]
    U --> Y[Gestión usuarios]
```

## 3. Flujo de Datos

```mermaid
sequenceDiagram
    participant U as Usuario
    participant F as Frontend Casino
    participant W as Worker Backend
    participant K as KV Storage
    participant A as Admin
    
    U->>F: Accede sala-pandacoins.html
    F->>W: GET /api/casino/state (polling cada 1.5s)
    W->>K: tickStateMachine() + leer estado
    K-->>W: Estado actual de la sala
    W-->>F: Estado, asientos, historial, chat
    
    U->>F: Login/Register
    F->>W: POST /api/casino/auth/login
    W->>K: Verificar credenciales
    K-->>W: Token de sesión (TTL 7 días)
    W-->>F: { token, user }
    
    U->>F: Sentarse
    F->>W: POST /api/casino/seat
    W->>K: Asignar asiento
    K-->>W: Asiento #3 asignado
    W-->>F: { ok, seat: 3 }
    
    U->>F: Selecciona apuesta + monto
    F->>W: POST /api/casino/bet { bets: [{bet_key, amount}] }
    W->>K: Debitar saldo, registrar apuesta
    K-->>W: Saldo actualizado
    W-->>F: { ok, balance }
    
    U->>F: Marcar Listo
    F->>W: POST /api/casino/ready
    W->>K: Marcar jugador listo
    
    Note over W,K: Cuando todos listos o timer expira…
    W->>K: Generar número aleatorio (0-36)
    W->>K: Resolver apuestas, pagar ganadores
    K-->>W: Resultados
    W-->>F: Estado spinning → result
    
    F-->>U: Animar ruleta, mostrar resultado
    
    A->>W: GET /admin/casino/stats
    W->>K: Leer estadísticas globales
    W-->>A: Reporte de actividad, balances
```

## 4. Sistema de Juegos

```mermaid
graph TB
    subgraph "🎰 Ruleta Europea (37 sectores)"
        R1[Secuencia: 0,32,15,19,4,21…]
        R2[Resolución server-side]
        R3[Tipos de apuesta]
        R4[Animación 3-5 segundos]
        
        subgraph "Tipos de Apuesta"
            P1[Número directo ×35]
            P2[Split ×17]
            P3[Esquina ×8]
            P4[Seisena ×5]
            P5[DOCENA ×2]
            P6[Columna ×2]
            P7[Color/Par/Mitad ×1]
        end
        
        R3 --> P1
        R3 --> P2
        R3 --> P3
        R3 --> P4
        R3 --> P5
        R3 --> P6
        R3 --> P7
    end
```

## 5. Flujo de Sala Multijugador

```mermaid
stateDiagram-v2
    [*] --> betting: Sala abierta
    betting --> spinning: Timer expira o todos ready
    spinning --> result: Timer expira
    result --> betting: Timer expira (nueva ronda)
    
    state betting {
        [*] --> Apostando
        Apostando --> Listo
    }
    
    state spinning {
        GenerarNúmero --> AnimarRuleta
    }
    
    state result {
        ResolverApuestas --> MostrarResultado
        MostrarResultado --> PagarGanadores
    }
```

## 6. Características Implementadas

```yaml
caracteristicas:
  - ruleta_europea_multijugador: true
  - persistencia_kv: true
  - autenticacion_con_token: true
  - login_discord_oauth: true
  - polling_tiempo_real: true
  - animacion_ruleta_svg: true
  - panel_admin_completo: true
  - historial_rondas: true
  - estadisticas_avanzadas: true
  - sistema_asientos: true
  - chat_en_vivo: true
  - leaderboard: true
  - rate_limiting: true
  - auditoria_transacciones: true
```

### Estado Propuesto (Completo)
```yaml
caracteristicas:
  - ruleta_funcional: true
  - sistema_moneda: true
  - bono_diario: true
  - historial: true
  - persistencia: true
  - autenticacion: true
  - integracion_battlepass: true
  - backend_api: true
  - anti_abuse_measures: true
  - juegos_adicionales: 4+
  - estadisticas: true
  - admin_panel: true
  - auditoria: true
  - sistema_rangos: true
  - jackpot_semanal: true
```

## 8. Plan de Implementación

```mermaid
gantt
    title Plan de Implementación Casino Completo
    dateFormat  YYYY-MM-DD
    section Fase 1: Backend Básico
    Crear casino.js en worker       :2026-06-19, 3d
    Endpoints balance/spin/daily    :2026-06-21, 2d
    KV schema implementación        :2026-06-22, 2d
    Integración auth existente      :2026-06-24, 1d
    
    section Fase 2: Frontend Actualizado
    Migrar casino.html a API        :2026-06-25, 3d
    Manejo de errores/tokens        :2026-06-28, 2d
    Persistencia estado             :2026-06-30, 2d
    
    section Fase 3: Integración Sistema
    Conectar con players.js         :2026-07-02, 2d
    Sistema compra/venta real       :2026-07-04, 2d
    Integración battle pass         :2026-07-06, 3d
    
    section Fase 4: Juegos Adicionales
    Duelo de Dados                  :2026-07-09, 3d
    Cofre Misterioso                :2026-07-12, 3d
    Jackpot Semanal                 :2026-07-15, 3d
    Racha de Gloria                 :2026-07-18, 2d
    
    section Fase 5: Mejoras & Admin
    Panel admin estadísticas        :2026-07-20, 3d
    Sistema anti-abuse completo     :2026-07-23, 2d
    Auditoría y logs                :2026-07-25, 2d
    Testing y despliegue            :2026-07-27, 3d
```

## 9. Resumen Técnico

### Tecnologías Utilizadas:
- **Frontend**: HTML5, CSS3, JavaScript Vanilla (actual), posible migración a React
- **Backend**: Cloudflare Workers (JavaScript)
- **Base de datos**: Cloudflare KV (key-value store)
- **Almacenamiento**: Cloudflare R2 para assets multimedia
- **Autenticación**: Sistema JWT existente en auth.js
- **Despliegue**: Cloudflare Pages + Workers

### Estructura de Archivos:
```
exilium-web-v2/
├── deploy/
│   ├── casino-preview.html      # Preview actual
│   ├── casino.html              # Futura implementación completa
│   └── CASINO_CONTEXT.txt       # Documentación contexto
├── worker/
│   ├── index.js                 # Router principal
│   ├── casino.js                # Futuro módulo casino
│   ├── players.js               # Sistema jugadores (existente)
│   └── auth.js                  # Autenticación (existente)
└── wrangler.toml                # Config KV bindings
```

### Variables de Entorno KV:
```javascript
// Keys propuestas para casino
casino:balance:{playerId}        // Saldo actual PandaCoins
casino:history:{playerId}        // Array de transacciones
casino:daily:{playerId}          // Timestamp último bono
casino:spins:{playerId}:{date}   // Contador giros diarios
casino:jackpot_pool              // Pool jackpot semanal
casino:stats:{playerId}          // Estadísticas jugador
casino:transactions:{playerId}   // Log detallado transacciones
casino:config:probabilities      // Probabilidades configurables
casino:config:limits             // Límites configurables
```

### Endpoints REST Propuestos:
```http
# Públicos (requieren auth)
GET    /api/casino/balance      # Obtener saldo
POST   /api/casino/spin         # Girar ruleta
POST   /api/casino/daily        # Reclamar bono
POST   /api/casino/buy          # Comprar PandaCoins
POST   /api/casino/sell         # Vender PandaCoins
GET    /api/casino/history      # Historial movimientos
GET    /api/casino/jackpot      # Estado jackpot
GET    /api/casino/stats        # Estadísticas jugador
GET    /api/casino/leaderboard  # Top jugadores

# Admin (requieren admin auth)
GET    /api/admin/casino/stats  # Estadísticas globales
GET    /api/admin/casino/audit  # Auditoría transacciones
PUT    /api/admin/casino/config # Configurar probabilidades
POST   /api/admin/casino/reset  # Resetear datos (emergencia)
```

## Conclusión

El ecosistema de casino de Exilium tiene una base sólida con el preview frontend actual, pero necesita:
1. **Backend persistente** en Cloudflare Workers + KV
2. **Integración real** con el sistema de jugadores existente
3. **Mecánicas anti-abuse** del lado servidor
4. **Juegos adicionales** para variedad
5. **Panel de administración** para monitoreo

La implementación propuesta mantiene la arquitectura existente de Exilium (Workers + KV) mientras añade un sistema de casino completo, integrado y seguro.