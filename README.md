# Exilium Battle Pass — Temporada 1

Sistema de progresión PvP para la hermandad **Exilium** en World of Warcraft.

## Arquitectura

| Componente | Tecnología | URL |
|---|---|---|
| Frontend | HTML/CSS/JS estático | [Cloudflare Pages](https://exilium-battlepass.pages.dev) |
| Backend | Cloudflare Worker | `https://exilium-blizzard.mitzumitzukyhs.workers.dev` |
| Base de datos | Cloudflare KV | Namespace `EXILIUM_KV` |
| Media Storage | Cloudflare R2 | Bucket `exilium-media` |
| Automatización | N8N Cloud | Webhook → Discord |

## Estructura del Proyecto

```
exilium-web-v2/
├── deploy/                  # Frontend (Cloudflare Pages)
│   ├── index.html           # Página pública principal
│   ├── admin.html           # Panel de administración
│   ├── player-profile.html  # Perfil individual de jugador
│   ├── css/
│   │   ├── main.css         # Estilos públicos
│   │   └── admin.css        # Estilos del admin
│   ├── js/
│   │   ├── app.js           # Lógica pública (rendering, modals, likes, comments)
│   │   ├── admin.js         # Lógica del admin (CRUD, sync, uploads)
│   │   └── xp-engine.js     # Motor de XP compartido (frontend)
│   └── assets/              # Imágenes, fuentes, emblemas, videos
│
├── worker/                  # Backend (Cloudflare Worker)
│   ├── index.js             # Router principal + endpoints API
│   ├── players.js           # CRUD jugadores, sync, XP, bodas
│   ├── blizzard.js          # OAuth + API Blizzard (ratings, profiles, media)
│   ├── xp-engine.js         # Motor de XP (backend)
│   ├── officers.js          # Gestión de oficiales de la guild
│   ├── guild-ranking.js     # Ranking Top 20 guild (multi-fase)
│   ├── auth.js              # Autenticación admin (HMAC + KV tokens)
│   ├── addon.js             # Exportación datos para addon WoW
│   ├── announcement.js      # Sistema de anuncios
│   ├── backup.js            # Backup/restore completo de KV
│   ├── errors.js            # Log de errores + notificación Discord
│   └── season.js            # Cierre de temporada (stub)
│
├── tests/                   # Tests unitarios (Vitest)
│   ├── blizzard.test.js
│   ├── players.test.js
│   └── xp-engine.test.js
│
├── wrangler.toml            # Config Cloudflare Worker
├── package.json             # Dependencias (vitest)
└── .gitignore
```

## Variables de Entorno (Worker)

Configurar en Cloudflare Dashboard → Workers → Settings → Variables:

| Variable | Descripción |
|---|---|
| `ADMIN_KEY` | Contraseña del panel admin |
| `BLIZZARD_CLIENT_ID` | OAuth client ID de Blizzard |
| `BLIZZARD_CLIENT_SECRET` | OAuth client secret de Blizzard |
| `DISCORD_WEBHOOK_URL` | Webhook Discord para errores (opcional) |
| `CORS_ORIGIN` | Origen CORS permitido (default: `*`) |
| `API_RATINGS_TOKEN` | Token para endpoint de addon (opcional) |

## Despliegue

```bash
# Worker (backend)
npx wrangler deploy

# Pages (frontend)
npx wrangler pages deploy deploy --project-name exilium-battlepass
```

## Cron (Sync automático)

El worker ejecuta cada 30 minutos (`*/30 * * * *`):
1. Sincroniza 3 jugadores por ejecución (round-robin)
2. Detecta milestones de rating (1800/2100/2400) → notifica vía N8N → Discord
3. Construye/continúa el ranking de guild por fases

## KV Keys importantes

| Key | Descripción |
|---|---|
| `player:{id}` | Datos de cada jugador |
| `config:hall_of_fame` | Salón de la Fama |
| `config:officers` | Oficiales de la guild |
| `config:battlepass_rewards` | Recompensas del pase |
| `config:healer_bonus` | Config multiplicador healer |
| `config:n8n_webhook_url` | URL webhook N8N |
| `config:discord_webhook_url` | URL webhook Discord |
| `public:comments` | Comentarios de visitantes |
| `public:page_likes` | Likes de la página |
| `cache:guild-ranking` | Ranking top 20 cacheado |
| `cron:sync_offset` | Offset round-robin del sync |
| `cron:last_run` | Resultado del último sync |

## Tests

```bash
npm test
```
