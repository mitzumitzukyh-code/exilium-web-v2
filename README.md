# Exilium Web — Battle Pass & Casino

Ecosistema web para la hermandad **Exilium** en World of Warcraft (Quel'Thalas).  
Incluye sistema de progresión PvP (Battle Pass), Sala de PandaCoins (casino multijugador), panel admin, y más.

## URLs en producción

| Componente | URL |
|---|---|
| 🌐 **Web principal** | [exilium-battlepass.pages.dev](https://exilium-battlepass.pages.dev) |
| 🎰 **Casino PandaCoins** | [exilium-battlepass.pages.dev/sala-pandacoins-standalone.html](https://exilium-battlepass.pages.dev/sala-pandacoins-standalone.html) |
| 🔧 **Panel Admin** | [exilium-battlepass.pages.dev/admin.html](https://exilium-battlepass.pages.dev/admin.html) |
| ⚙️ **API Backend** | `https://exilium-blizzard.mitzumitzukyhs.workers.dev` |

> **Nota:** Si ves caracteres raros o la página no carga, haz **Ctrl+F5** (hard refresh) para limpiar la caché del navegador.

## Arquitectura

| Componente | Tecnología | URL |
|---|---|---|
| Frontend | HTML/CSS/JS estático (Cloudflare Pages) | [exilium-battlepass.pages.dev](https://exilium-battlepass.pages.dev) |
| Backend API | Cloudflare Workers | `exilium-blizzard.mitzumitzukyhs.workers.dev` |
| Base de datos | Cloudflare KV | Namespace `EXILIUM_KV` |
| Media Storage | Cloudflare R2 | Bucket `exilium-media` |
| Automatización | N8N Cloud | Webhook → Discord |

## Estructura del Proyecto

```
exilium-web-v2/
├── deploy/                          # Frontend (Cloudflare Pages)
│   ├── index.html                   # Página pública principal
│   ├── admin.html                   # Panel de administración
│   ├── sala-pandacoins-standalone.html  # 🎰 Casino PandaCoins (SPA)
│   ├── player-profile.html          # Perfil individual de jugador
│   ├── booster-*.html               # Portal boosting
│   ├── exilium-fighter.html         # Torneo PvP (próximamente)
│   ├── css/
│   │   ├── main.css                 # Estilos públicos
│   │   ├── admin.css                # Estilos del admin
│   │   ├── casino.css               # Estilos del casino
│   │   └── portal.css               # Estilos del portal boosting
│   ├── js/
│   │   ├── app.js                   # Lógica pública
│   │   ├── admin.js                 # Panel admin (CRUD, sync, casino admin)
│   │   ├── casino.js                # 🎰 Frontend del casino (multi-apuesta, chat, asientos)
│   │   ├── casino-wheel.js          # 🎡 Ruleta 3D (Three.js, con fallback SVG)
│   │   └── xp-engine.js             # Motor de XP (frontend)
│   └── assets/                      # Imágenes, fuentes, emblemas, videos
│
├── worker/                          # Backend (Cloudflare Worker)
│   ├── index.js                     # Router principal + endpoints API
│   ├── casino.js                    # 🎰 Lógica del casino (máquina de estados, apuestas, pagos)
│   ├── casino-auth.js               # 🔐 Autenticación del casino (sesiones KV)
│   ├── discord-auth.js              # 🔗 Login con Discord OAuth
│   ├── players.js                   # CRUD jugadores, sync, XP, bodas
│   ├── blizzard.js                  # OAuth + API Blizzard
│   ├── xp-engine.js                 # Motor de XP (backend)
│   ├── officers.js                  # Gestión de oficiales
│   ├── guild-ranking.js             # Ranking Top 20 guild
│   ├── auth.js                      # Autenticación admin
│   ├── boosting-auth.js             # Auth del portal boosting
│   ├── boosting-orders.js           # Órdenes de boosting
│   ├── rbg-tracker.js               # Tracker RBG
│   ├── news.js / news-cron.js       # Sistema de noticias
│   ├── addon.js                     # Export addon WoW
│   ├── announcement.js              # Anuncios
│   ├── backup.js                    # Backup/restore KV
│   ├── errors.js                    # Log de errores
│   └── season.js                    # Cierre de temporada
│
├── tests/                           # Tests unitarios (Vitest)
│   ├── casino.test.js               # 🎰 Tests del motor de ruleta (42 tests)
│   ├── blizzard.test.js             # 17 tests
│   ├── players.test.js              # 10 tests
│   └── xp-engine.test.js            # 26 tests
│
├── wrangler.toml                    # Config Cloudflare Worker
├── package.json                     # Dependencias (vitest)
└── README.md                        # Este archivo
```

## 🎰 Sala de PandaCoins (Casino)

Casino multijugador en tiempo real con ruleta europea (37 sectores).

### Características

- 🎡 **Ruleta europea** — 37 números (0-36), resolución server-side
- 👥 **Multijugador** — Hasta 5 asientos, todos comparten el mismo giro
- 💰 **Multi-apuesta** — Hasta 3 apuestas por ronda (número directo ×35, split ×17, esquina ×8, calle ×11, seisena ×5, docena/columna ×2, color/par/mitad ×1)
- 💬 **Chat en vivo** — Con rate limiting anti-spam
- ⏱️ **Ready system** — Los jugadores marcan listo para acelerar la ronda (o esperan el timer)
- 🔐 **Autenticación** — Registro por nombre+contraseña o Discord OAuth
- 📊 **Panel admin** — Estadísticas avanzadas, RTP real, usuarios, transacciones, rondas

### Flujo de una ronda

1. Los jugadores se sientan en la mesa
2. Cada uno coloca sus apuestas en el tapete
3. Marcan "LISTO" o esperan el timer (20s)
4. El servidor genera un número aleatorio (0-36)
5. Se resuelven las apuestas y se actualizan los saldos
6. Comienza una nueva ronda

### APIs del Casino

| Método | Ruta | Descripción |
|---|---|---|
| `GET` | `/api/casino/state` | Estado completo de la sala (polling) |
| `POST` | `/api/casino/seat` | Sentarse / levantarse |
| `POST` | `/api/casino/bet` | Colocar apuesta(s) |
| `POST` | `/api/casino/clear-bets` | Limpiar apuestas |
| `POST` | `/api/casino/ready` | Marcar listo |
| `POST` | `/api/casino/chat` | Enviar mensaje |
| `GET` | `/api/casino/leaderboard` | Top 10 ganadores |
| `GET` | `/api/casino/me` | Datos del usuario autenticado |
| `POST` | `/api/casino/auth/login` | Iniciar sesión |
| `POST` | `/api/casino/auth/register` | Registrarse |
| `GET`  | `/api/casino/auth/discord` | Inicia OAuth con Discord (redirect) |
| `GET`  | `/api/casino/auth/discord/callback` | Callback OAuth (code → sesión) |

### Lógica de negocio: Registro Discord, Chat y Asientos

> **Estado actual:** `sala-pandacoins-standalone.html` es un **rediseño visual ("Ruleta Exilium Guild")** que hoy funciona como **maqueta autónoma**: todo el estado (saldo, asientos, chat, giro) está *hardcodeado* en el JS del propio HTML y la ruleta gira con `Math.random()` local. El backend (`worker/casino.js`, `casino-auth.js`, `discord-auth.js`) ya existe; falta **cablear** esta UI a esos endpoints. Abajo el diseño objetivo.

**1. Registro / Login con Discord (OAuth2)**

```
[Botón "Entrar con Discord"]
      │  redirect
      ▼
discord.com/oauth2/authorize?client_id=DISCORD_CLIENT_ID
   &redirect_uri=FRONTEND_URL/api/casino/auth/discord/callback
   &response_type=code&scope=identify%20guilds
      │  el usuario autoriza → Discord redirige con ?code=...
      ▼
Worker /api/casino/auth/discord/callback
   1. Intercambia `code` por access_token (usa DISCORD_CLIENT_SECRET)
   2. GET /users/@me           → id, username, avatar
   3. GET /users/@me/guilds    → verifica que pertenece a EXILIUM_GUILD_ID
   4. KV upsert casino:user:{discordId}  (saldo inicial si es nuevo)
   5. Crea sesión: casino:session:{token} → { userId, exp }
   6. Devuelve el token (cookie httpOnly o localStorage) y redirige al casino
```

- Cada request posterior manda el token; `casino-auth.js` lo valida contra `casino:session:{token}`.
- Solo miembros del Discord de Exilium pueden jugar (gate por `EXILIUM_GUILD_ID`).
- El saldo vive server-side en `casino:user:{id}` — nunca confiar en el saldo del cliente.

**2. Chat de sala**

- Enviar: `POST /api/casino/chat { text }` con token → el worker valida sesión, aplica **rate-limit anti-spam** (p. ej. 1 msg / 2 s por usuario), sanitiza y hace *append* a `casino:chat` (lista en KV, se conservan los últimos ~30-50 mensajes).
- Recibir: el cliente **hace polling** de `GET /api/casino/state` cada ~1-2 s y renderiza el array `chat`. KV no tiene pub/sub, por eso polling. Para chat verdaderamente en tiempo real conviene un **Durable Object + WebSocket** (pendiente).
- Mensajes de sistema (entradas/salidas, resultados de giro) los inyecta el propio worker en `casino:chat`.

**3. Asientos (mesa multijugador)**

- Sentarse / levantarse: `POST /api/casino/seat { action:'sit'|'leave' }` con token → el worker actualiza `casino:seats` (array de 5: `null` o `{ userId, name, cls, ready }`) de forma atómica para evitar choques de concurrencia.
- El estado de asientos se propaga a todos vía el polling de `/api/casino/state`.
- **Máquina de estados de la ronda** (`casino:state`, en `worker/casino.js`):
  1. `betting` — los sentados colocan apuestas (`/api/casino/bet`) y marcan `ready` (`/api/casino/ready`).
  2. Cuando **todos los sentados están listos** o **expira el timer** (~20 s) → el servidor genera el número ganador (**RNG autoritativo server-side**, nunca el cliente).
  3. `resolving` — resuelve apuestas, actualiza saldos en `casino:user:{id}`, registra en `casino:transactions:{id}` y `casino:rounds_history`, añade el número al historial.
  4. Vuelve a `betting`. Todos los clientes ven el mismo giro porque leen el mismo `casino:state`.

> **Nota KV (free tier):** KV es *eventually consistent* y tiene límite de escrituras. El casino usa un **snapshot cacheado** para no escribir en cada request (ver memoria del proyecto). Real-time fuerte (giro sincronizado al milisegundo, chat instantáneo) requiere migrar a **Durable Objects**; el modelo actual de polling es el compromiso barato sobre Pages+KV.

## Variables de Entorno (Worker)

Configurar en Cloudflare Dashboard → Workers → Settings → Variables:

| Variable | Descripción |
|---|---|
| `ADMIN_KEY` | Contraseña del panel admin |
| `BLIZZARD_CLIENT_ID` | OAuth client ID de Blizzard |
| `BLIZZARD_CLIENT_SECRET` | OAuth client secret de Blizzard |
| `DISCORD_WEBHOOK_URL` | Webhook Discord para errores (opcional) |
| `DISCORD_CLIENT_ID` | OAuth client ID de Discord (para login casino) |
| `DISCORD_CLIENT_SECRET` | OAuth client secret de Discord |
| `FRONTEND_URL` | URL del frontend (para redirect OAuth) |
| `EXILIUM_GUILD_ID` | ID del servidor Discord de Exilium |
| `CORS_ORIGIN` | Origen CORS permitido (default: `*`) |
| `API_RATINGS_TOKEN` | Token para endpoint de addon (opcional) |

## Despliegue

```bash
# Worker (backend) - actualiza la API
npx wrangler deploy

# Pages (frontend) - actualiza preview
npx wrangler pages deploy deploy/ --project-name exilium-battlepass

# Pages a producción (branch main)
npx wrangler pages deploy deploy/ --project-name exilium-battlepass --branch main
```

> La URL principal (`exilium-battlepass.pages.dev`) se actualiza automáticamente al hacer `git push` a la rama `main`.

## Tests

```bash
npm test          # Ejecuta todos los tests
npm run test:watch  # Modo watch
```

Actualmente **95 tests** pasando en 4 archivos.

## Cron (Sync automático)

El worker ejecuta cada 30 minutos (`*/30 * * * *`):
1. Sincroniza jugadores (round-robin)
2. Detecta milestones de rating (1800/2100/2400) → notifica vía N8N → Discord
3. Construye/continúa el ranking de guild por fases

## KV Keys principales

| Key | Descripción |
|---|---|
| `player:{id}` | Datos de cada jugador |
| `casino:state` | Estado de la sala del casino |
| `casino:seats` | Asientos ocupados |
| `casino:chat` | Mensajes del chat |
| `casino:user:{id}` | Usuario del casino |
| `casino:transactions:{id}` | Transacciones del casino |
| `casino:rounds_history` | Historial de rondas |
| `casino:config` | Configuración del casino |
| `config:hall_of_fame` | Salón de la Fama |
| `config:officers` | Oficiales de la guild |
| `config:battlepass_rewards` | Recompensas del pase |
| `config:healer_bonus` | Config multiplicador healer |
| `public:comments` | Comentarios de visitantes |
| `cache:guild-ranking` | Ranking top 20 cacheado |
| `cron:last_run` | Resultado del último sync |

## 📓 Changelog / Diario de cambios

> Registro cronológico de cambios y estado de cada función de la web.

### 2026-06-27 (tarde) — Casino reconstruido como web limpia + cableado + perfil de jugador

- **`sala-pandacoins-standalone.html` reconstruido como HTML/JS vanilla limpio** (~54 KB), cableado al backend (polling `/state`, sentarse/apostar/listo/limpiar/chat, rueda SVG animada al número del servidor, fichas/min/max desde `config`). Reemplaza el **bundle de 514 KB** del diseñador, que crasheaba al servirse por HTTP (errores `image-slot` y React #231: era un artefacto de previsualización `file://`). Mismo diseño (dragones, hover de iluminación, asientos), ahora **editable directamente y estable**. En producción.
- **Perfil de jugador Discord** (`casino-profile.html`): saldo, ganadas/perdidas/neto, rondas, win rate, ranking e historial. Endpoint nuevo `GET /api/casino/my-transactions`. Enlazado desde la barra del casino ("Mi Perfil").
- Backups del bundle viejo + maqueta en `casino-build/` (ya no se usan para editar el casino).

### 2026-06-27 — Fix de KV (escrituras, causa raíz del agotamiento) + login Discord robusto

> ⚠️ **Versión oficial del casino:** `sala-pandacoins-standalone.html` es el **bundle del
> diseño nuevo "Ruleta Exilium Guild" mejorado** (asientos, tamaños, hover de iluminación),
> hecho el 26-jun. **Esa es la única versión.** El diseño viejo basado en Three.js +
> `js/casino.js` quedó **deprecado**. (Durante esta sesión se restauró el bundle correcto
> tras un git checkout equivocado.) Estos cambios de hoy son **backend** y aplican a cualquier
> frontend que use `/api/casino/*`.

- **KV — causa raíz del agotamiento corregida** 🔴→✅: el tick reescribía `casino:state` cada minuto con la mesa vacía (cron `* * * * *`) → ~1.440 escrituras/día solo en reposo, agotando el límite del free tier (**1.000 escrituras/día**), lo que tumbaba casino y página principal. Ahora el tick **no escribe en reposo**; la ventana de 20s se renueva al llegar la primera apuesta (`handlePlaceBet`). Además `cacheTtl` en config (120s) e historial de vista (45s); el admin lee config fresca.
- **Login con Discord robusto**: el callback (`worker/discord-auth.js`) ahora envuelve el upsert de usuario + creación de sesión en `try/catch`. Antes, si las escrituras KV estaban agotadas, el `put` lanzaba sin capturar → **500 "Error interno del servidor"** crudo en pantalla (el error que rompía el login). Ahora redirige al frontend con un mensaje legible.
- **Auditoría de admin.html**: la sección casino del panel está bien cableada (todos los handlers coinciden con el backend), sin datos hardcodeados ni funciones muertas.
- **Nota importante:** para multijugador sostenido, el free tier de KV (1.000 escrituras/día) es estrecho. Solución correcta: **Workers Paid ($5/mes → 1M escrituras/día)** y/o migrar el estado a **Durable Objects**.

### 2026-06-26 (noche) — Pase de pulido UI/UX del casino (9 mejoras)

Solo UI/UX (el juego sigue siendo maqueta local). Cada edit valida el JSON del template del bundler.

- **Avatar de Discord en tu asiento:** al sentarte, tu silla muestra tu avatar de Discord (background-image) y un **anillo dorado + glow** que distingue tu asiento del resto. `toggleSeat()` lee `localStorage` (`exi_nm`/`exi_av`); el view añade `avBg`/`txtColor`/`ring`/`glow`.
- **Rueda más grande + menos espacio muerto:** `min(40vw,50vh,470px)`; columnas laterales más estrechas y mejor centrado.
- **Contraste del texto de estado:** ahora en píldora con borde dorado y color claro (`#e9d4a0`), legible.
- **Panel derecho compacto:** `align-self:start` + gaps reducidos (sin hueco flotante en GANADAS/PERDIDAS/NETO).
- **Barra superior responsive:** oculta el texto (solo iconos) bajo 900px; no colisiona.
- **Chat con timestamps + autoscroll:** hora `HH:MM` en mensajes nuevos; tu nombre de Discord en el chat.
- **Sonido (Web Audio API sintetizado):** `chip` al apostar, `spin` al girar, `win`/`lose` al resolver (vía `MutationObserver` sobre `#exi-status`). Botón **mute** en la barra superior (persistente en `localStorage`). Sin archivos de audio.
- **Animación pop de fichas:** keyframe `exiBadge` al aparecer el monto sobre cada casilla.
- **Responsive:** ids `#exi-stage`/`#exi-arena`/`#exi-board` + media queries (`!important` por estilos inline). <1100px aprieta columnas; <820px apila a 1 columna con scroll y tapete con scroll horizontal.

### 2026-06-26 (tarde) — Login Discord + tutorial + asientos arriba

- **Login con Discord reimplementado (con avatar):** widget fijo en la barra superior. Si no hay sesión muestra **"Entrar con Discord"** → redirige a `{API}/api/casino/auth/discord?redirect=<pagina>`; el worker hace OAuth, verifica membresía en el Discord de Exilium y vuelve con `?token=&name=&avatar=`. El frontend guarda eso en `localStorage` (`exi_tk`/`exi_nm`/`exi_av`), limpia la URL y muestra el **avatar de Discord + nombre + Salir**. (Backend ya existente en `worker/discord-auth.js`.)
- **Mini-tutorial "Cómo jugar":** botón ❔ en la barra superior abre un modal con 3 pasos: **Sentarse → Apostar → Retirarse**.
- **Asientos movidos ARRIBA de la ruleta:** fila horizontal compacta de 5 avatares justo encima de la rueda (se descartó la versión "alrededor de la ruleta" por estética/colisiones).

### 2026-06-26 — Rediseño "Ruleta Exilium Guild" (casino)

- **Reemplazo de diseño:** `sala-pandacoins-standalone.html` ahora usa el nuevo diseño *Ruleta Exilium Guild* (tema infernal/dracónico Quel'Thalas). Empaquetado como página *bundler* (template + assets en `<script type="__bundler/template">`).
- **Layout responsive sin scroll:** la sala completa entra en una sola pantalla (`height:100vh`, flex column, alturas/paddings ajustados). Sin scroll vertical.
- **Ruleta más grande:** `min(36vw,44vh,420px)`.
- **Assets integrados:** `assets/logo.png` (header), `assets/pandadragon.png` (dragones laterales, derecho espejado), `assets/coin_3.png` (centro de la ruleta + icono de saldo), `assets/fondo-casino.png` (fondo).
- **Hover highlight del tapete (nuevo):** al pasar el mouse sobre un número se ilumina + se resaltan sus apuestas relacionadas (color, par/impar, mitad, docena, columna 2:1); sobre apuestas externas/docenas/columnas se iluminan los números que cubren. Implementado con `data-bet-key` + delegación de eventos, inyectado **dentro** del template del bundler (si no, `documentElement.replaceWith` lo borra).
- **Asientos reposicionados:** de una barra full-width (que tapaba el panel de fichas y el chat) a **avatares alrededor de la ruleta** (estilo mesa de póker, 5 posiciones). Botón Sentarse/Levantarse reubicado bajo la ruleta.
- **Pendiente:** cablear esta UI al backend (`/api/casino/*`). Hoy es maqueta con estado local. Ver *Lógica de negocio: Registro Discord, Chat y Asientos*.

### Funciones de la web (estado actual)

| Función | Estado |
|---|---|
| Web pública (Battle Pass, ranking, perfil) | ✅ En producción |
| Panel admin (CRUD, sync, casino admin) | ✅ En producción |
| Casino — motor de ruleta backend (`worker/casino.js`) | ✅ Implementado + 42 tests |
| Casino — auth (nombre+pass / Discord OAuth) | ✅ Backend listo |
| 🎰 **`sala-pandacoins-standalone.html`** — diseño "Ruleta Exilium Guild" (HTML/JS limpio, asientos, tamaños, hover de iluminación) | 🟢 **VERSIÓN ÚNICA Y OFICIAL del casino.** Cableada al backend y en producción. Editable directamente (ya NO es bundle) |
| Casino — diseño VIEJO Three.js (`js/casino.js` + `js/casino-wheel.js`) | ⚪ **DEPRECADO** — reemplazado; no usar |
| Casino — hover highlight del tapete | ✅ Implementado (standalone) |
| Casino — asientos (fila arriba de la ruleta) | ✅ Implementado (standalone, visual) |
| Casino — login Discord con avatar (standalone) | ✅ Frontend cableado a `/api/casino/auth/discord` |
| Casino — avatar Discord en tu asiento | ✅ Implementado (standalone) |
| Casino — mini-tutorial "Cómo jugar" | ✅ Implementado (standalone) |
| Casino — sonido (chip/spin/win/lose) + mute | ✅ Implementado (Web Audio API, standalone) |
| Casino — responsive (breakpoints 1100/820px) | ✅ Implementado (standalone) |
| Portal boosting | ✅ En producción |
| Sistema de noticias (CRUD + RSS + IA) | ✅ En producción |
| Torneo PvP (`exilium-fighter.html`) | 🟡 En desarrollo |

## Tests

```bash
npm test
```
