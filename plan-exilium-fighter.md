# Plan de Implementación — Exilium Fighter

## Resumen

Torneo PvP interno del gremio Exilium. 2 bandos (A vs B), cada uno con 5 equipos de 3 jugadores (1 healer + 2 DPS). 5 vidas compartidas por bando. Inscripción individual con pago de 2 PandaCoins. Retransmisión en vivo vía Discord webhook. Un solo día, una sola sesión.

**Total jugadores:** 30 · **Pozo:** 60 PandaCoins · **Stack:** Cloudflare Workers + KV + Pages

---

## Fase 1 — Backend: Endpoints del Worker (Días 1-2)

### 1.1 Crear `worker/fighter.js`

Nuevo módulo con toda la lógica del torneo. Exporta funciones que `index.js` importará.

### 1.2 Estructura de datos en KV

```
fighter:config          → { status: 'signup'|'coinflip'|'active'|'finished', entry_fee: 2, prize_pool: 0, started_at: null, winner: null }
fighter:band:a          → { name: 'Bando A', lives: 5, color: '#c2362f' }
fighter:band:b          → { name: 'Bando B', lives: 5, color: '#29b6f6' }
fighter:teams           → [ { id, band, num, status, players: [{name,cls,spec,role,discord}] } ]  (10 equipos)
fighter:signups         → [ { discord, name, cls, spec, role, band, team_id, paid, paid_at } ]
fighter:matches         → [ { num, side_a, side_b, winner, detail, timestamp } ]
fighter:coinflip        → { done: false, result: null, chooser: null }
fighter:standings       → { a: { lives: 5, teams_alive: 5 }, b: { lives: 5, teams_alive: 5 } }
```

### 1.3 Endpoints públicos

| Método | Ruta | Descripción |
|---|---|---|
| `GET` | `/api/fighter/status` | Estado del torneo (config, bandos, vidas, equipos, jugadores) |
| `GET` | `/api/fighter/matches` | Historial de enfrentamientos |
| `GET` | `/api/fighter/standings` | Tabla de posiciones en vivo |
| `POST` | `/api/fighter/signup` | Inscripción individual (paga 2 PandaCoins) |

### 1.4 Endpoints admin

| Método | Ruta | Descripción |
|---|---|---|
| `POST` | `/admin/fighter/init` | Inicializa torneo (crea bandos, equipos vacíos, resetea vidas) |
| `POST` | `/admin/fighter/assign` | Asigna jugador a equipo/bando (admin puede mover jugadores) |
| `DELETE` | `/admin/fighter/unassign` | Quita jugador de un equipo |
| `POST` | `/admin/fighter/coinflip` | Ejecuta lanzamiento de moneda (una sola vez) |
| `POST` | `/admin/fighter/match` | Registra resultado de enfrentamiento (resta vida al bando perdedor, marca equipo) |
| `POST` | `/admin/fighter/finish` | Finaliza torneo, reparte pozo al bando ganador |
| `POST` | `/admin/fighter/discord/sync` | Sincroniza estado actual a Discord webhook |
| `PUT` | `/admin/fighter/config` | Modifica config (entry_fee, fechas, etc.) |

### 1.5 Lógica de inscription (`POST /api/fighter/signup`)

```
1. Validar que el torneo esté en estado 'signup'
2. Validar que el jugador no esté ya inscrito (por Discord ID)
3. Validar que el bando elegido tenga < 15 jugadores
4. Validar que el equipo elegido tenga < 3 jugadores
5. Validar que el rol healer no exceda 1 por equipo
6. Debitar 2 PandaCoins del balance del jugador (KV: player:<id>)
7. Crear registro en fighter:signups
8. Agregar jugador al equipo en fighter:teams
9. Actualizar prize_pool += 2
10. Retornar confirmación
```

### 1.6 Lógica de enfrentamiento (`POST /admin/fighter/match`)

```
1. Validar que el torneo esté en estado 'active'
2. Recibir: { team_a_id, team_b_id, winner_id }
3. Determinar bando perdedor
4. Restar 1 vida al bando perdedor en fighter:band:<side>
5. Si el equipo perdedor era el que estaba en arena → marcar como 'eliminated'
6. Si el equipo ganador estaba en arena → mantener como 'in-arena'
7. Si el equipo ganador NO estaba en arena → marcar como 'in-arena', el anterior como 'ready'
8. Crear entrada en fighter:matches
9. Verificar si un bando llegó a 0 vidas → cambiar status a 'finished', asignar winner
10. Si terminó: repartir pozo (60 PandaCoins) entre los jugadores del bando ganador
11. Disparar Discord webhook con resultado
```

### 1.7 Integración en `worker/index.js`

Agregar dentro del bloque de rutas públicas (después de RBG Tracker):
```js
// --- Exilium Fighter routes ---
if (path.startsWith('/api/fighter/')) { ... }
```

Y dentro del bloque admin (después de Backup/Restore):
```js
// ── Exilium Fighter Admin ──
if (path.startsWith('/admin/fighter/')) { ... }
```

---

## Fase 2 — Discord Webhook Integration (Día 2)

### 2.1 Embed de estado del torneo

Función `sendDiscordUpdate(env, eventType, data)` en `worker/fighter.js`:

- **`signup`** — Nuevo jugador inscrito → embed con nombre, clase, bando, equipo
- **`coinflip`** — Resultado del lanzamiento → embed con bando que elige
- **`match_result`** — Fin de enfrentamiento → embed con ganador, perdedor, vidas restantes
- **`elimination`** — Equipo eliminado → embed de alerta roja
- **`tournament_end`** — Fin del torneo → embed dorado con bando ganador y pozo

### 2.2 Formato del embed

```json
{
  "embeds": [{
    "title": "⚔️ Exilium Fighter — Enfrentamiento #3",
    "color": 2121600,
    "fields": [
      { "name": "Bando A — Eq 3", "value": "⚔️ Thalion, 😈 Zareth, ✨ Mira", "inline": true },
      { "name": "Bando B — Eq 1", "value": "🏹 Nyxara, 🔥 Sylvara, 🧘 Elen", "inline": true },
      { "name": "Resultado", "value": "✅ Gana Bando A — Eq 3\n❌ Bando B pierde 1 vida (4 restantes)" }
    ],
    "timestamp": "ISO",
    "footer": { "text": "Exilium Fighter | En vivo" }
  }]
}
```

### 2.3 Webhook URL

Guardar en KV como `config:fighter_discord_webhook`. Configurable desde el panel admin.

---

## Fase 3 — Frontend: Conectar mockup al backend (Días 3-4)

### 3.1 Separar HTML/CSS/JS

Dividir `exilium-fighter.html` en:
- `deploy/exilium-fighter.html` (estructura)
- `deploy/css/fighter.css` (estilos)
- `deploy/js/fighter.js` (lógica + API calls)

### 3.2 Reemplazar datos hardcodeados por fetch

```js
// Estado inicial
async function loadStatus() {
  const res = await fetch('/api/fighter/status');
  const data = await res.json();
  BANDS = data.bands;
  TEAMS = data.teams;
  MATCHES = data.matches;
  renderAll();
}

// Polling cada 15s durante el torneo
setInterval(() => { if (tournamentActive) loadStatus(); }, 15000);
```

### 3.3 Inscripción funcional

```js
async function confirmSignup() {
  const res = await fetch('/api/fighter/signup', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      discord: 'TuTag#0001',
      name: 'TuPersonaje',
      cls: CLASSES[selectedClass].name,
      spec: selectedSpec,
      role: selectedSpecRole,
      band: selectedBand,
      team_id: selectedTeam
    })
  });
  const data = await res.json();
  if (data.error) { alert('Error: ' + data.error); return; }
  alert('✅ Inscrito correctamente. -2 PandaCoins');
  loadStatus(); // Refrescar
}
```

### 3.4 Vista de admin en vivo

Agregar sección oculta en `exilium-fighter.html` (visible solo con token admin):
- Panel de registro de resultados (select equipo A, select equipo B, botón ganador)
- Botón de lanzamiento de moneda
- Botón de finalizar torneo
- Arrastrar/soltar jugadores entre equipos
- Botón de sync manual a Discord

---

## Fase 4 — Panel Admin (Día 4)

### 4.1 Pestaña en `admin.html`

Agregar sección "Exilium Fighter" al panel admin existente con:

1. **Estado del torneo** — status, vidas de cada bando, equipos, jugadores
2. **Gestión de inscripciones** — lista de jugadores inscritos, asignar/reasignar
3. **Control del torneo** — iniciar, lanzar moneda, registrar resultados, finalizar
4. **Configuración** — entry_fee, webhook de Discord, fechas
5. **Log de transacciones** — pagos de PandaCoins, reparto del pozo

### 4.2 Flujo del admin

```
1. Admin inicializa torneo → status='signup'
2. Jugadores se inscriben (página pública)
3. Admin revisa inscripciones, reasigna jugadores si hace falta
4. Admin lanza moneda → status='coinflip' → status='active'
5. Admin registra cada enfrentamiento
6. Sistema resta vidas automáticamente
7. Al llegar a 0 un bando → status='finished', reparte pozo
8. Admin puede forzar finalización manual
```

---

## Fase 5 — Integración PandaCoins (Día 5)

### 5.1 Verificar sistema existente

El proyecto ya tiene un sistema de PandaCoins en KV (`player:<id>` → balance). Verificar:
- Cómo se almacena el balance actual
- Si hay endpoint de débito/crédito reusable
- Si el jugador necesita estar autenticado

### 5.2 Endpoints necesarios

Si no existen, agregar a `worker/players.js`:
- `debitPandaCoins(env, playerId, amount)` — resta monedas
- `creditPandaCoins(env, playerId, amount)` — suma monedas (para reparto del pozo)

### 5.3 Validación de pago

```js
// En fighter signup
const player = await env.EXILIUM_KV.get(`player:${discord}`);
const balance = player?.panda_coins || 0;
if (balance < 2) return { error: 'PandaCoins insuficientes' };
// Debitar
player.panda_coins -= 2;
await env.EXILIUM_KV.put(`player:${discord}`, JSON.stringify(player));
```

---

## Fase 6 — Testing y Deploy (Día 5-6)

### 6.1 Tests

- Test de inscripción: jugador nuevo, jugador duplicado, sin saldo, equipo lleno
- Test de moneda: una sola vez, no repetible
- Test de enfrentamiento: resta vida correcta, eliminación de equipo, fin de torneo
- Test de pozo: reparto correcto al bando ganador (60 coins / 15 jugadores = 4 c/u)
- Test de Discord: webhook se envía correctamente

### 6.2 Deploy

```bash
# Worker
npx wrangler deploy

# Pages (frontend)
npx wrangler pages deploy deploy --project-name exilium-battlepass
```

### 6.3 Checklist final

- [ ] `worker/fighter.js` creado con toda la lógica
- [ ] Rutas agregadas en `worker/index.js`
- [ ] `fighter.css` y `fighter.js` separados del HTML
- [ ] Frontend hace fetch a la API en lugar de datos hardcodeados
- [ ] Sección Fighter en `admin.html`
- [ ] Discord webhook funcional
- [ ] Sistema de PandaCoins integrado
- [ ] `sitemap.xml` actualizado con `exilium-fighter.html`
- [ ] Navegación en `index.html` (link a Fighter)
- [ ] Deploy a Cloudflare
- [ ] Test end-to-end en producción

---

## Cronograma estimado

| Fase | Duración | Entregable |
|---|---|---|
| 1. Backend Worker | 2 días | `worker/fighter.js` + rutas en `index.js` |
| 2. Discord Webhook | Medio día | Función `sendDiscordUpdate()` |
| 3. Frontend conectado | 1.5 días | HTML/CSS/JS separados + fetch API |
| 4. Panel Admin | 1 día | Sección Fighter en `admin.html` |
| 5. PandaCoins | Medio día | Débito/crédito integrado |
| 6. Testing + Deploy | 1 día | En producción |
| **Total** | **~6 días** | **Torneo funcional end-to-end** |

---

## Riesgos y mitigaciones

| Riesgo | Mitigación |
|---|---|
| Concurrencia en inscripciones (2 jugadores eligen el mismo slot) | Usar KV atomic writes o cola de inscripción |
| PandaCoins duplicados o negativos | Validar balance antes y después del débito |
| Webhook de Discord cae | Retry con backoff (3 intentos, no bloquear torneo) |
| Admin cierra navegador a mitad del torneo | Estado persistente en KV, no en memoria |
| Jugador se desconecta el día del evento | Regla: equipo juega con 2, no hay reembolso |

---

## Arquitectura final

```
┌──────────────────────────────────────────────────┐
│                  Cloudflare Pages                 │
│                                                   │
│  exilium-fighter.html  ←→  fighter.js  ←→  API   │
│  admin.html (tab Fighter)                         │
└──────────────────────────────────────────────────┘
                        │
                        ▼
┌──────────────────────────────────────────────────┐
│               Cloudflare Worker                   │
│                                                   │
│  index.js (router)                                │
│   ├── /api/fighter/*  (público)                   │
│   └── /admin/fighter/* (admin auth)               │
│                                                   │
│  fighter.js (lógica)                              │
│   ├── signup()        → debita PandaCoins         │
│   ├── coinflip()      → una sola vez              │
│   ├── registerMatch() → resta vidas, verifica fin │
│   ├── finishTournament() → reparte pozo           │
│   └── sendDiscordUpdate() → webhook embed         │
└──────────────────────────────────────────────────┘
                        │
                        ▼
┌──────────────────────────────────────────────────┐
│              Cloudflare KV + R2                   │
│                                                   │
│  fighter:config    fighter:band:a    fighter:band:b│
│  fighter:teams     fighter:signups   fighter:matches│
│  fighter:coinflip  fighter:standings               │
│  player:<id> (balance PandaCoins)                 │
│  config:fighter_discord_webhook                   │
└──────────────────────────────────────────────────┘
                        │
                        ▼
┌──────────────────────────────────────────────────┐
│               Discord Webhook                     │
│                                                   │
│  Embeds en vivo: inscripciones, resultados,       │
│  eliminaciones, fin del torneo                    │
└──────────────────────────────────────────────────┘
```
