# Exilium Web — Battle Pass & Casino

Ecosistema web para la hermandad **Exilium** en World of Warcraft (Quel'Thalas).  
Incluye sistema de progresión PvP (Battle Pass), Sala de PandaCoins (casino multijugador), panel admin, y más.

## URLs en producción

| Componente | URL |
|---|---|
| 🌐 **Web principal** | [www.guild-exilium.com](https://www.guild-exilium.com) |
| 🎰 **Casino PandaCoins** | [www.guild-exilium.com/sala-pandacoins-standalone](https://www.guild-exilium.com/sala-pandacoins-standalone) |
| 🔧 **Panel Admin** | [www.guild-exilium.com/admin.html](https://www.guild-exilium.com/admin.html) |
| ⚙️ **API Backend** | `https://api.guild-exilium.com` |

> **Dominio propio** `guild-exilium.com` (Cloudflare Registrar): el apex redirige a `www`.
> URLs antiguas siguen activas como respaldo: `exilium-battlepass.pages.dev` (web) y
> `exilium-blizzard.mitzumitzukyhs.workers.dev` (API).
>
> **Nota:** Si ves algo raro o no carga, haz **Ctrl+Shift+R** (hard refresh) para limpiar la caché.

## Arquitectura

| Componente | Tecnología | URL / Recurso |
|---|---|---|
| Frontend | HTML/CSS/JS estático (Cloudflare Pages) | `www.guild-exilium.com` (proyecto Pages `exilium-battlepass`) |
| Backend API | Cloudflare Workers | `api.guild-exilium.com` (worker `exilium-blizzard`) |
| **Casino tiempo real** | **Cloudflare Durable Object + WebSockets** | DO `CasinoTable` (binding `CASINO_TABLE`) |
| Base de datos | Cloudflare KV | Namespace `EXILIUM_KV` (saldos, usuarios, config, historial) |
| Media Storage | Cloudflare R2 | Bucket `exilium-media` |
| Automatización | N8N Cloud | Webhook → Discord |
| Plan | **Workers Paid ($5/mes)** | Habilita Durable Objects y sube límites KV |

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
│   ├── casino-do.js                 # 🔴 Durable Object CasinoTable (tiempo real: WebSockets, ronda, pagos) — ACTUAL
│   ├── casino.js                    # 🎰 Funciones puras (resolveBets, validación) + path KV viejo (deprecado)
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
| `WS`   | `/api/casino/ws?token=...` | 🔴 **Tiempo real** — conexión WebSocket al Durable Object (estado, apuestas, chat, giro) |

> Los endpoints HTTP `GET /api/casino/state` y los `POST` de juego pertenecen al **sistema viejo KV (deprecado)**; el casino actual usa el **WebSocket** del Durable Object para todo el juego en vivo. Siguen presentes pero el frontend ya no los usa.

### Cómo funciona el casino en TIEMPO REAL (Durable Object + WebSockets)

> Desde **28-jun-2026** la mesa es un **Durable Object** (`worker/casino-do.js`, clase `CasinoTable`) con **WebSockets**. Reemplaza el viejo polling a KV (que era *eventualmente consistente* → cada jugador veía un estado distinto/retrasado). Ahora **todos los conectados a la misma mesa ven lo mismo al instante**: mismo countdown, mismas apuestas, mismo giro.

**1. Login con Discord (OAuth2)** — sin cambios respecto al backend existente:

```
[Entrar con Discord] → discord.com/oauth2/authorize (scope identify guilds)
   → Worker /api/casino/auth/discord/callback
        1. code → access_token (DISCORD_CLIENT_SECRET)
        2. GET /users/@me  → id, username, avatar_url
        3. GET /users/@me/guilds → verifica pertenencia a EXILIUM_GUILD_ID
        4. KV upsert casino:user:{id}  (saldo + avatar_url; saldo inicial si es nuevo)
        5. casino:session:{token} → { user_id, name }   (TTL)
        6. redirige al casino con ?token=&name=&avatar=
```
El `redirect_uri` lo deriva el worker del host de la petición → debe estar registrado en el portal de Discord (`api.guild-exilium.com/.../callback` y los de respaldo).

**2. Conexión WebSocket** — `wss://api.guild-exilium.com/api/casino/ws?token=<exi_tk>`:
- El worker enruta a la **única instancia** del DO (`idFromName('main')`). El DO valida el token contra `casino:session:{token}`.
- **Mensajes cliente → servidor:** `{type: sit | stand | bet | clear | ready | chat | ping}`.
- **Mensajes servidor → cliente:** `{type:'state', ...}` (snapshot completo con seats[].bets, avatares, countdown, `bigwin`), `{type:'me', balance}` (saldo por jugador), `{type:'error', message}`.

**3. Motor de ronda** (en el DO, no por request):
- Estado/seats/chat persistidos en `ctx.storage`; el reloj de la ronda lo lleva `ctx.storage.setAlarm()`. **Saldos en KV** `casino:user:{id}` (perfil/leaderboard/admin lo siguen leyendo).
- `betting` → `spinning` cuando **TODOS los sentados marcan LISTO** o **vence el timer (20s)**. Solo (1 sentado) gira al instante con LISTO. RNG **server-side**.
- `spinning` (4s) → `resolving` → `result` (4s): paga **solo lo apostado a aciertos + ganancias** (lo perdido se lo queda la casa), registra transacción e historial.
- Si alguien **acierta el PLENO** (`number:X`), el DO marca `bigwin` → el frontend reproduce el **video de celebración** para todos.

**4. Robustez:** al conectar, el DO hace *catch-up* (`_advance`) por si un temporizador venció estando inactivo (tras redeploy/hibernación) → nunca queda "atascado".

> **Saldo siempre server-side** en `casino:user:{id}` — nunca se confía en el cliente. Solo miembros del Discord de Exilium pueden jugar (gate `EXILIUM_GUILD_ID`).

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

> ⚠️ **El frontend NO se despliega con `git push`.** Cloudflare Pages está como **subida directa**:
> hay que ejecutar `wrangler pages deploy`. El `git push` solo guarda el código en el repo.

```bash
# Worker (backend + Durable Object CasinoTable) — actualiza la API
npx wrangler deploy

# Frontend a producción (sube TODA la carpeta deploy/ tal cual está en disco)
npx wrangler pages deploy deploy/ --project-name exilium-battlepass --branch main --commit-dirty=true
```

- El worker sirve en `api.guild-exilium.com` (custom domain en `wrangler.toml` con `custom_domain = true`)
  y también en `...workers.dev` (mantener `workers_dev = true`; si se quita, wrangler **desactiva** esa URL).
- El Durable Object se declara en `wrangler.toml` (`[[durable_objects.bindings]]` + `[[migrations]] new_sqlite_classes`). Requiere **Workers Paid**.
- Tras desplegar, **Ctrl+Shift+R** en el navegador (el HTML va con `max-age=0` pero las pestañas abiertas no recargan solas).

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
| `casino:user:{id}` | Usuario del casino (saldo, avatar_url, stats) — **fuente de verdad del saldo** |
| `casino:session:{token}` | Sesión activa (validada en cada conexión WS) |
| `casino:transactions:{id}` | Transacciones del casino |
| `casino:rounds_history` | Historial de rondas (también lo lee el admin) |
| `casino:config` | Configuración del casino (duraciones, min/max, asientos) |
| ~~`casino:state` / `casino:seats` / `casino:chat`~~ | ⚪ Estado/asientos/chat — ahora viven en el **Durable Object** (`ctx.storage`), no en KV. Estas keys son del path viejo |
| `config:hall_of_fame` | Salón de la Fama |
| `config:officers` | Oficiales de la guild |
| `config:battlepass_rewards` | Recompensas del pase |
| `config:healer_bonus` | Config multiplicador healer |
| `public:comments` | Comentarios de visitantes |
| `cache:guild-ranking` | Ranking top 20 cacheado |
| `cron:last_run` | Resultado del último sync |

## 📓 Changelog / Diario de cambios

> Registro cronológico de cambios y estado de cada función de la web.

### 2026-06-28 — Dominio propio + casino TIEMPO REAL (Durable Object + WebSockets) + video de pleno

**🌐 Dominio `guild-exilium.com`** (Cloudflare Registrar):
- Web → `www.guild-exilium.com` (apex 301 → www). API → `api.guild-exilium.com` (worker custom domain en `wrangler.toml`, `workers.dev` mantenido). Frontend del casino + Mi Perfil apuntan a la API nueva; resto del sitio sigue en workers.dev (CORS `*`).
- Tags `canonical`/`og:`/`twitter:`/schema → `www.guild-exilium.com` (arregla el preview al compartir en redes). Callback de Discord añadido para `api.guild-exilium.com`.

**🔴 Casino multijugador en TIEMPO REAL** (el cambio grande):
- Nuevo **Durable Object `CasinoTable`** (`worker/casino-do.js`) + **WebSockets**. Reemplaza el polling a KV (que era eventualmente consistente → cada jugador veía un estado distinto/retrasado; chat con lag; giros desincronizados). Ahora **todos ven lo mismo al instante**: mismo countdown, apuestas de los demás en vivo, mismo giro.
- Frontend reescrito a WebSocket (`connectWS`/`wsSend` en `sala-pandacoins-standalone.html`); saldo por mensajes `me`; reconexión automática; *catch-up* al conectar (no queda atascado).
- **Regla de giro corregida**: espera a que **TODOS los sentados** marquen LISTO (antes solo esperaba a los que ya habían apostado → giraba sin esperar a los demás). Solo (1 sentado) gira al instante.
- **🔴 Fix económico**: el pago era `total_bet + total_win` → reembolsaba también las apuestas perdedoras (**nadie perdía nunca**). Ahora paga `apuestas_ganadoras + ganancias`; lo perdido se lo queda la casa. (Saldos viejos quedaron inflados; no se revirtió.)
- **Avatares de Discord** en los asientos; **apuestas de otros** visibles en el tablero (puntos de color por jugador).

**🎬 Video de celebración de PLENO**:
- Cuando un jugador acierta un **número pleno** (`number:X`, ej. apuesta al 3 y sale 3) — **nunca** con color/par/docena/columna — se reproduce `assets/celebration.mp4` a pantalla completa con el **avatar(es) + número + ganancia**, ocultando el casino; al terminar reaparece. Lo ven **todos**. Degrada a un cartel 6s si falta el archivo.

**🎨 UI del casino**: popup grande de apuestas (barra de tiempo + avatares + qué apostó cada uno + confirmar); fichas **1 / 5 / 10** (antes 10/50/200); quitados los recuadros GANADAS/PERDIDAS/NETO; hover en ½ · ×2 · Limpiar.

**🩹 Bugs corregidos (sesión)**:
- Casino: chat 500 (`expirationTtl:35` < mínimo 60s de KV) · ruleta mostraba el resultado antes de frenar · sonidos win/lose (sonaba "perder" en cada giro por la palabra "acompañe", "ganar" nunca) · detección de victorias (`last_result` se leía de `my_seat` en vez de `seats[is_me]`) · chat reubicado abajo.
- Sitio: `player-profile.html` XSS reflejado vía `?id` (escapado) · `dashboard.html` `event.currentTarget` reventaba al crear pedido · `login.html` open-redirect vía `?redirect` · `boosting.html` el orden por precio destruía el orden original.
- **Sistema de diagnóstico** (`?debug=1`): panel 🐞, toasts con el error real, log persistente (consola + localStorage).

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
| 🔴 **Casino TIEMPO REAL — Durable Object + WebSockets** (`worker/casino-do.js`) | ✅ **En producción.** Mesa compartida sincronizada (estado/apuestas/chat/giro en vivo) |
| Casino — motor puro de ruleta (`worker/casino.js`: resolveBets, validación) | ✅ Implementado + 42 tests (reutilizado por el DO) |
| Casino — auth Discord OAuth (saldo + avatar server-side) | ✅ En producción |
| Casino — **video de celebración de PLENO** (`assets/celebration.mp4`) | ✅ En producción (solo number:X; lo ven todos) |
| Casino — apuestas de otros visibles + avatares en asientos + popup de apuestas | ✅ En producción |
| 🎰 **`sala-pandacoins-standalone.html`** — cliente del casino (WebSocket) | 🟢 **VERSIÓN ÚNICA Y OFICIAL.** En producción, editable directamente |
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
