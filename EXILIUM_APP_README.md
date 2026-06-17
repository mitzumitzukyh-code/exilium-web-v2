# EXILIUM APP — Documentación Técnica Completa

> App móvil oficial de la hermandad PvP **Exilium** — Quel'Thalas US · World of Warcraft Midnight  
> Stack: Flutter 3.x · Cloudflare Workers/KV · WebSockets · AdMob · RevenueCat

---

## ÍNDICE

1. [Visión general](#1-visión-general)
2. [Arquitectura y stack](#2-arquitectura-y-stack)
3. [Pantallas y flujos](#3-pantallas-y-flujos)
4. [Sistema de autenticación y registro](#4-sistema-de-autenticación-y-registro)
5. [Sincronización con la web](#5-sincronización-con-la-web)
6. [Chat en tiempo real](#6-chat-en-tiempo-real)
7. [Sistema de notificaciones push](#7-sistema-de-notificaciones-push)
8. [Streaming · Twitch y YouTube en app](#8-streaming--twitch-y-youtube-en-app)
9. [Sistema de apuestas PvP](#9-sistema-de-apuestas-pvp)
10. [Battle Pass y XP](#10-battle-pass-y-xp)
11. [Armario de beneficios](#11-armario-de-beneficios)
12. [Monetización · Anuncios + Planes](#12-monetización--anuncios--planes)
13. [Reglas de negocio críticas](#13-reglas-de-negocio-críticas)
14. [Archivos y estructura del proyecto](#14-archivos-y-estructura-del-proyecto)
15. [Variables de entorno y secretos](#15-variables-de-entorno-y-secretos)
16. [Hoja de ruta de implementación](#16-hoja-de-ruta-de-implementación)

---

## 1. VISIÓN GENERAL

Exilium App es la extensión móvil del ecosistema web de la hermandad PvP Exilium. Su objetivo es **retener y monetizar** a los jugadores fuera del juego, creando un hub de comunidad que complemente las funciones del addon Lua y el portal web.

### Principios de diseño
- **Enganchar primero, cobrar después**: el tier Gratis debe ser genuinamente útil para que el jugador experimente el valor antes de ver los muros de pago.
- **Gaming-first**: paleta negro + azul eléctrico, tipografía sin serif, densidad de información alta, microinteracciones rápidas.
- **Monetización no agresiva**: los anuncios son visibles pero no intrusivos. El Premium se vende por el valor, no por bloquear funciones básicas.

---

## 2. ARQUITECTURA Y STACK

```
┌─────────────────────────────────────────────┐
│              FLUTTER APP (iOS/Android)       │
│  Riverpod · go_router · Hive (local cache)  │
└──────────────┬──────────────────────────────┘
               │ HTTPS + WebSocket
┌──────────────▼──────────────────────────────┐
│         CLOUDFLARE WORKERS                  │
│  exilium-blizzard · exilium-chat-ws         │
│  exilium-bets · exilium-notifications       │
└──────┬───────────────┬───────────────┬──────┘
       │               │               │
  EXILIUM_KV      D1 (SQLite)    Blizzard API
  (ratings/BP)   (chat/bets)    (OAuth 2.0)
```

### Dependencias Flutter clave

```yaml
dependencies:
  flutter_riverpod: ^2.5.x
  go_router: ^13.x
  hive_flutter: ^1.1.x
  google_mobile_ads: ^5.x          # AdMob
  purchases_flutter: ^6.x          # RevenueCat (suscripciones)
  web_socket_channel: ^2.4.x       # Chat WS
  firebase_messaging: ^14.x        # Push notifications
  cached_network_image: ^3.x
  youtube_player_flutter: ^9.x     # Player YouTube
  webview_flutter: ^4.x            # Embed Twitch
  dio: ^5.x
```

---

## 3. PANTALLAS Y FLUJOS

| # | Pantalla | Acceso | Notas |
|---|----------|--------|-------|
| 01 | Splash / Onboarding | Público | 3 slides, botón CTA |
| 02 | Login | Público | BattleTag/email + contraseña, OAuth Discord |
| 03 | Registro Paso 1 | Público | BattleTag, email, contraseña |
| 04 | Registro Paso 2 | Flujo registro | Personaje, clase, rol |
| 05 | Registro Paso 3 | Flujo registro | Verificación OTP por email |
| 06 | Home Dashboard | Autenticado | Feed actividad, stats, anuncio |
| 07 | Ranking Hermandad | Autenticado | Filtros por bracket |
| 08 | Battle Pass | Autenticado | Track de niveles, recompensas |
| 09 | Perfil + Armario | Autenticado | Ratings PvP, cajón de beneficios |
| 10 | Chat en Vivo | Autenticado | Canales, stream strip, WS |
| 11 | Apuestas PvP | Autenticado | Monedas virtuales, cuotas |
| 12 | Planes Premium | Autenticado | Free · Premium · Premium Plus |

### Navegación bottom bar (5 tabs)

```
Inicio | Ranking | Battle Pass | Chat | Perfil
```

> La pestaña **Apuestas** se activa desde el tab de Ranking (FAB) o desde Home (card de apuesta activa). La pestaña de Perfil incluye acceso al Armario y a Planes Premium.

---

## 4. SISTEMA DE AUTENTICACIÓN Y REGISTRO

### 4.1 Flujo de registro (3 pasos)

**Paso 1 — Credenciales**
- Campo BattleTag (formato: `Nombre#1234`) — validación regex en cliente y servidor
- Email — validación formato estándar
- Contraseña — mínimo 8 caracteres, 1 mayúscula, 1 número
- Al continuar: POST `/api/app/auth/register/step1`

**Paso 2 — Personaje**
- Nombre del personaje principal (main)
- Clase WoW (selector visual con colores de clase)
- Rol principal: Healer / DPS / Tank
- Al continuar: POST `/api/app/auth/register/step2`

**Paso 3 — Verificación OTP**
- Se envía código de 6 dígitos al email registrado
- TTL del código: 15 minutos
- Máximo 3 intentos fallidos → bloqueo 30 minutos
- Al verificar: POST `/api/app/auth/register/verify`
- Respuesta incluye JWT de sesión (expiración 30 días)

**Validación de roster (crítico):**
Al completar el registro, el Worker consulta la Blizzard API para verificar que el personaje indicado existe en el servidor Quel'Thalas US. Si el personaje no existe, el registro se completa pero el usuario queda en estado `PENDIENTE_VALIDACION` — puede ver la app pero no el chat.

### 4.2 Login

```
POST /api/app/auth/login
Body: { identifier: "battletag_o_email", password: "..." }
Response: { token: "JWT...", user: { id, username, tier, character } }
```

Opciones de login:
- BattleTag o email + contraseña
- OAuth Discord (flujo WebView → redirect_uri → token)

### 4.3 Almacenamiento de sesión
- JWT guardado en `FlutterSecureStorage`
- Refresh automático si quedan menos de 7 días de vida
- En cada inicio de app: GET `/api/app/auth/me` para validar sesión activa

### 4.4 Endpoints de autenticación

```
POST /api/app/auth/register/step1    → Guardar credenciales en KV temporal (TTL 30min)
POST /api/app/auth/register/step2    → Agregar datos de personaje
POST /api/app/auth/register/verify   → Validar OTP + crear cuenta definitiva
POST /api/app/auth/login             → Login estándar
POST /api/app/auth/discord           → OAuth Discord callback
GET  /api/app/auth/me                → Validar token activo
POST /api/app/auth/logout            → Invalidar token
POST /api/app/auth/forgot-password   → Enviar link de reset
POST /api/app/auth/reset-password    → Aplicar nueva contraseña
```

### 4.5 Roles y permisos

| Rol | Descripción |
|-----|-------------|
| `GUEST` | Sin registro, solo lectura del ranking público |
| `MEMBER` | Registrado + verificado — acceso completo al tier Gratis |
| `PREMIUM` | Suscripción activa Premium |
| `PREMIUM_PLUS` | Suscripción activa Premium Plus |
| `STREAMER` | Badge especial + funciones de transmisión en app |
| `OFFICER` | Moderación del chat + gestión de apuestas |
| `ADMIN` | Acceso total al panel de administración |

---

## 5. SINCRONIZACIÓN CON LA WEB

### 5.1 Datos que la app consume del Worker existente

| Endpoint web existente | Uso en app | Cache TTL |
|------------------------|-----------|-----------|
| `GET /api/players` | Ranking general | 60s |
| `GET /api/players/:id` | Perfil individual | 120s |
| `GET /api/announcement` | Card de anuncio en Home | 120s |
| `GET /api/battlepass-config` | Track del Battle Pass | 300s |
| `GET /api/officers` | Moderadores en chat | 120s |
| `GET /api/hall-of-fame` | Sección especial en Ranking | 120s |
| `GET /api/rbg-history` | Historial de partidas | 30s |
| `GET /api/rbg-stats` | Stats agregadas | 60s |
| `GET /api/boost/orders` | Portal de boosting | 30s |
| `GET /api/season` | Temporada activa | 600s |

### 5.2 Nuevos endpoints a crear para la app

```
# Autenticación app
/api/app/auth/*                      → Nuevo Worker: exilium-app-auth

# Chat
/api/app/chat/channels               → Lista de canales disponibles por tier
/api/app/chat/history/:channel       → Últimos 50 mensajes (REST fallback)
/api/app/chat/ws                     → WebSocket endpoint (Durable Objects)

# Apuestas
/api/app/bets                        → Lista de apuestas activas
/api/app/bets/:id                    → Detalle de apuesta
/api/app/bets/:id/place              → Colocar apuesta
/api/app/bets/history                → Historial de apuestas del usuario
/api/app/bets/leaderboard            → Top apostadores

# Monedas virtuales
/api/app/coins/balance               → Balance actual del usuario
/api/app/coins/transactions          → Historial de transacciones

# Streaming
/api/app/streams/live                → Jugadores en directo (Twitch + YT)

# Premium
/api/app/premium/verify              → Verificar suscripción con RevenueCat
/api/app/premium/tier                → Tier actual del usuario
```

### 5.3 Estrategia de cache en Flutter

```dart
// Hive boxes por dominio
hive.openBox('ratings')      // TTL 60s
hive.openBox('profile')      // TTL 120s
hive.openBox('battlepass')   // TTL 300s
hive.openBox('chat_history') // TTL 0 (solo offline fallback)
hive.openBox('user_prefs')   // Sin TTL
```

Patrón: **stale-while-revalidate** — se sirve el cache inmediatamente mientras se refresca en background.

### 5.4 Addon Lua → App

El addon `ExiliumSync` escribe resultados de RBG y ratings en los Workers vía POST autenticado con el token `Exilium_PvP_2025_xK9m`. La app lee estos datos del KV en tiempo cuasi-real (polling cada 30 segundos en pantalla de Ranking, WebSocket para chat).

Los marcadores `[EXILIUM_SYNC_START/END]` en SavedVariables NO se replican en la app — son exclusivos del addon.

---

## 6. CHAT EN TIEMPO REAL

### 6.1 Tecnología

- **Protocolo**: WebSocket vía Cloudflare Durable Objects
- **Endpoint**: `wss://exilium-chat.miztmutzuki.workers.dev/ws`
- **Autenticación**: token JWT como query param `?token=...` al conectar
- **Reconexión**: exponential backoff (1s → 2s → 4s → max 30s)

### 6.2 Canales disponibles por tier

| Canal | Free | Premium | Premium Plus |
|-------|------|---------|--------------|
| # general | ✅ | ✅ | ✅ |
| # rbg-callouts | ✅ | ✅ | ✅ |
| # off-topic | ✅ | ✅ | ✅ |
| # reclutamiento | ✅ (solo lectura) | ✅ | ✅ |
| # estrategia | ❌ | ✅ | ✅ |
| # officers | ❌ | ❌ | ✅ + OFFICER |
| # stream-vip | ❌ | ❌ | ✅ |

### 6.3 Estructura de mensaje WebSocket

```json
// Mensaje enviado
{
  "type": "message",
  "channel": "general",
  "text": "¿Alguien para RBG?"
}

// Mensaje recibido
{
  "type": "message",
  "id": "msg_1234",
  "channel": "general",
  "author": {
    "id": "user_xyz",
    "username": "Mutzukimitz",
    "rank": "APÓSTATA",
    "role": "member",
    "tier": "premium",
    "is_streamer": true
  },
  "text": "¿Alguien para RBG?",
  "timestamp": "2026-06-13T21:38:00Z"
}

// Evento de sistema
{
  "type": "system",
  "event": "user_joined",
  "username": "Skallyx",
  "timestamp": "2026-06-13T21:40:00Z"
}
```

### 6.4 Moderación del chat

- **Officers y Admins** pueden silenciar usuarios (1h / 24h / permanente)
- **Rate limiting**: máximo 3 mensajes por segundo por usuario
- **Free tier**: máximo 20 mensajes por minuto (cooldown suave)
- Mensajes eliminados se reemplazan por `[Mensaje eliminado por un moderador]`
- Historial de los últimos 50 mensajes por canal disponible vía REST (fallback offline)

---

## 7. SISTEMA DE NOTIFICACIONES PUSH

### 7.1 Stack

- **Firebase Cloud Messaging (FCM)** para Android e iOS
- Token FCM registrado en el Worker al hacer login
- Worker guarda tokens en KV: `notif:token:{userId}`

### 7.2 Tipos de notificaciones

| Tipo | Trigger | Tier mínimo |
|------|---------|-------------|
| `rbg_start` | RBG programada en 15 minutos | Free |
| `ranking_change` | Tu posición en el ranking cambió | Free |
| `battlepass_levelup` | Subiste de nivel en el Battle Pass | Free |
| `chat_mention` | Alguien te mencionó (@Mutzukimitz) | Free |
| `bet_resolved` | Una apuesta en la que participaste se resolvió | Free |
| `bet_closing_soon` | Una apuesta cierra en 30 minutos | Premium |
| `stream_live` | Un jugador que sigues está en directo | Premium |
| `rating_milestone` | Un jugador del clan alcanzó 2400/2700 | Premium |
| `chat_private` | Mensaje directo (DM) | Premium Plus |
| `bet_win_big` | Ganaste más de 500 monedas en una apuesta | Free |

### 7.3 Preferencias de notificaciones

El usuario puede configurar qué tipos recibe y en qué horarios (modo silencioso nocturno). Guardado en KV: `notif:prefs:{userId}`.

### 7.4 Endpoint de registro de token

```
POST /api/app/notifications/register
Body: { fcm_token: "...", platform: "android|ios" }

DELETE /api/app/notifications/register
Body: { fcm_token: "..." }  // Al hacer logout
```

---

## 8. STREAMING · TWITCH Y YOUTUBE EN APP

### 8.1 Cómo funciona el strip de streams

1. Al abrir la pantalla de Chat, la app hace GET `/api/app/streams/live`
2. El Worker consulta la Twitch API y YouTube Data API buscando streams activos de jugadores del roster
3. Devuelve lista de streams en directo con: `streamer_name`, `platform`, `title`, `viewer_count`, `thumbnail_url`, `stream_url`
4. La app renderiza el strip horizontal de miniaturas
5. Al tocar una miniatura: si el usuario es **Premium Plus** → reproduce el embed en app; si no → abre el navegador externo (canal en Twitch.tv / YouTube)

### 8.2 Cómo un jugador se registra como streamer

1. En su Perfil → "Vincular canal de streaming"
2. Introduce su username de Twitch y/o URL de canal de YouTube
3. El Worker verifica que el canal existe via API
4. Se marca al usuario como `STREAMER` en KV
5. Aparece badge **LIVE** en su avatar en el chat y ranking cuando está transmitiendo
6. Sus streams aparecen en el strip de la pantalla de Chat

### 8.3 Integración técnica Twitch

```
GET https://api.twitch.tv/helix/streams?user_login=mutzukimitz
Headers: Client-ID + Authorization Bearer
```

Ejecutado desde el Worker (no desde Flutter) para proteger credenciales.

### 8.4 Integración técnica YouTube

```
GET https://www.googleapis.com/youtube/v3/search
  ?part=snippet&channelId={channelId}&eventType=live&type=video
  &key={YOUTUBE_API_KEY}
```

### 8.5 Embed en app (Premium Plus)

- **Twitch**: `WebViewWidget` cargando `https://player.twitch.tv/?channel={username}&parent=exilium.app`
- **YouTube**: `YoutubePlayerController` con el video ID del stream activo
- El embed ocupa el 60% superior de la pantalla; el chat de la app queda en el 40% inferior (no el chat de Twitch/YT)

### 8.6 Reglas para streamers

- El badge de streamer es un rol especial `STREAMER` asignado por un Admin u Officer
- Los streamers con rol `PREMIUM_PLUS` aparecen primero en el strip
- Los streamers sin cuenta Premium aparecen en el strip pero sin embed en app (solo botón "Ver en Twitch/YouTube")
- Una vez que el stream termina, el Worker lo detecta en el siguiente ciclo de polling (cada 2 minutos) y remueve la miniatura

---

## 9. SISTEMA DE APUESTAS PVP

### 9.1 Moneda virtual

- Nombre: **Monedas del Clan** (MC)
- No tienen valor monetario real — son puntos internos
- Saldo inicial al registrarse: **500 MC**
- No se pueden comprar con dinero real (para evitar regulación de juego)
- Se ganan participando en la app (ver sección 9.4)

### 9.2 Tipos de apuestas

**Tipo 1 — Resultados de grupo**
- "¿Cuántas RBGs ganará Exilium hoy?" → opciones discretas
- Creadas automáticamente al inicio del día por el Worker (cron job)

**Tipo 2 — Rendimiento individual**
- "¿Mutzuki llega a 2700 esta semana?"
- Basadas en datos de ratings del Worker

**Tipo 3 — Carreras PvP (Premium Plus)**
- "¿Quién llega primero a Gladiador? Axellum vs Varix"
- Múltiples opciones (1 por jugador en carrera)
- La apuesta se resuelve cuando el primero alcanza el rating objetivo

**Tipo 4 — Apuestas entre jugadores (Premium Plus)**
- Jugador A reta a Jugador B: "Me apuesto 200 MC a que hago más kills en el próximo RBG"
- Requiere aceptación de ambas partes
- Un Officer actúa como árbitro o se resuelve automáticamente vía datos del addon

### 9.3 Mecánica de cuotas

- Sistema Pari-mutuel: las cuotas se calculan en función del pool total apostado
- Fórmula: `cuota = pool_total / pool_opción`
- No hay casa (el Worker no se queda con un porcentaje)
- En caso de empate/nulo: las monedas se devuelven

### 9.4 Cómo ganar Monedas del Clan

| Acción | MC ganadas | Límite diario |
|--------|------------|---------------|
| Login diario | +15 | 1 vez/día |
| Participar en RBG (tracking addon) | +50 | 3 veces/día |
| Victoria en RBG | +100 | 3 veces/día |
| Subir de nivel en Battle Pass | +200 | Sin límite |
| Ganar una apuesta | Cuota × apuesta | Sin límite |
| Referir un nuevo miembro | +500 | Sin límite |

### 9.5 Reglas de apuestas

- Apuesta mínima: 50 MC
- Apuesta máxima: 2000 MC por apuesta (Free) / 5000 MC (Premium) / Sin límite (Premium Plus)
- Una vez colocada, la apuesta no se puede retirar
- Las apuestas cierran 30 minutos antes del evento objetivo
- Resultados se verifican contra datos del Worker/addon, no de forma manual
- Officers pueden anular una apuesta con justificación escrita

### 9.6 Endpoints de apuestas

```
GET  /api/app/bets                   → Lista apuestas activas (con paginación)
GET  /api/app/bets/:id               → Detalle de apuesta + cuotas actuales
POST /api/app/bets/:id/place         → Colocar apuesta { option_id, amount_mc }
GET  /api/app/bets/history           → Mis apuestas pasadas
GET  /api/app/bets/leaderboard       → Top apostadores (monedas totales ganadas)
POST /api/app/bets/challenge         → Retar a otro jugador (Premium Plus)
GET  /api/app/coins/balance          → MC actuales
GET  /api/app/coins/transactions     → Historial de transacciones
```

---

## 10. BATTLE PASS Y XP

### 10.1 Tabla de rangos (fuente: xp-engine.js)

| Niveles | Rango |
|---------|-------|
| 0 | EXILIADO |
| 1–6 | INICIADO |
| 7–12 | SOMBRA |
| 13–18 | APÓSTATA |
| 19–24 | ROMPEJURAMENTOS |
| 25–30 | HEREJE |
| 31–40 | PROFETA / EXARCA |

### 10.2 XP por bracket (fuente: xp-engine.js)

| Rating mínimo | XP (estándar) | XP (3v3) |
|---------------|--------------|----------|
| 2400 | 4550 | 5800 |
| 2100 | 2550 | 3300 |
| 1800 | 1050 | 1300 |
| 1600 | 550 | 550 |
| 1400 | 300 | 300 |
| 1200 | 150 | 150 |
| 1000 | 50 | 50 |

### 10.3 Recompensas del Battle Pass en la app

- **Free**: Títulos de rango, XP Boosts, cosmética básica de perfil
- **Premium**: Marco de perfil azul, acceso a recompensas marcadas PRO
- **Premium Plus**: Marco dorado, skins exclusivas, emojis de chat especiales

### 10.4 Sincronización del Battle Pass

El Battle Pass se calcula en el Worker a partir de los ratings de Blizzard API. La app muestra el nivel y XP actuales consultando `GET /api/players/:id` que incluye el campo `battlepass_level` y `total_xp`.

---

## 11. ARMARIO DE BENEFICIOS

### 11.1 Concepto

El Armario (Wardrobe) es un cajón deslizable en la pantalla de Perfil que muestra claramente qué beneficios tiene el usuario actualmente y qué ganaría al suscribirse al siguiente tier. Funciona como herramienta de venta pasiva dentro del flujo natural de uso.

### 11.2 Beneficios por tier

| Beneficio | Free | Premium | Premium Plus |
|-----------|------|---------|--------------|
| Perfil público + ratings PvP | ✅ | ✅ | ✅ |
| Ranking hermandad | ✅ | ✅ | ✅ |
| Chat general | ✅ | ✅ | ✅ |
| Battle Pass (tier gratis) | ✅ | ✅ | ✅ |
| Anuncios | Sí (banner + interstitial) | No | No |
| Canales privados de chat | ❌ | ✅ | ✅ |
| Historial RBG ilimitado | ❌ | ✅ | ✅ |
| Estadísticas avanzadas de ratings | ❌ | ✅ | ✅ |
| Apuestas básicas | ❌ | ✅ | ✅ |
| Recompensas Battle Pass PRO | ❌ | ✅ | ✅ |
| Streams en app (embed) | ❌ | ❌ | ✅ |
| Apuestas avanzadas y carreras | ❌ | ❌ | ✅ |
| Marco de perfil dorado | ❌ | ❌ | ✅ |
| Badge de Streamer | ❌ | ❌ | ✅ |
| DMs entre jugadores | ❌ | ❌ | ✅ |
| Análisis IA de gameplay | ❌ | ❌ | ✅ |

### 11.3 Implementación del cajón

- `DraggableScrollableSheet` de Flutter
- Posición inicial: 30% de la altura visible
- Posición expandida: 80%
- Se puede cerrar con swipe down o tapping fuera
- Al tocar un beneficio bloqueado → navega directamente a la pantalla de Planes Premium

---

## 12. MONETIZACIÓN · ANUNCIOS + PLANES

### 12.1 Anuncios (AdMob)

**Posiciones de anuncios (solo tier Free):**

| Tipo | Posición | Frecuencia |
|------|----------|------------|
| Banner 320×50 | Bottom de Home, Ranking | Siempre visible |
| Interstitial | Al abrir Apuestas | 1 vez cada 3 aperturas |
| Rewarded | "Ver anuncio por +50 MC" | Máximo 3/día |

**Reglas:**
- Usuarios Premium y Premium Plus: **cero anuncios** en toda la app
- El anuncio rewarded se ofrece voluntariamente (nunca forzado)
- Respetar `RequestConfiguration` de Google para usuarios menores de edad

### 12.2 Planes de suscripción (RevenueCat)

| Plan | Precio | Periodo | Product ID (Google Play) |
|------|--------|---------|--------------------------|
| Premium Mensual | $2.99 | 1 mes | `exilium_premium_monthly` |
| Premium Anual | $24.99 | 12 meses | `exilium_premium_annual` |
| Premium Plus Mensual | $4.99 | 1 mes | `exilium_plus_monthly` |
| Premium Plus Anual | $39.99 | 12 meses | `exilium_plus_annual` |

**Lógica de RevenueCat:**
```dart
// Verificar suscripción al iniciar app
final customerInfo = await Purchases.getCustomerInfo();
final isPremium = customerInfo.entitlements.active.containsKey('premium');
final isPlus = customerInfo.entitlements.active.containsKey('premium_plus');
```

RevenueCat notifica al Worker vía webhook cuando hay cambios de suscripción, que actualiza el campo `tier` del usuario en KV.

### 12.3 Flujo de conversión diseñado

```
Free user abre Apuestas
→ Ve "carrera PvP" con overlay de lock
→ Tap en overlay → Modal "Desbloquea con Premium Plus"
→ Tap "Ver planes" → Pantalla de Planes
→ Selecciona Plus Mensual → Google Play billing
→ RevenueCat confirma → Webhook al Worker
→ App refresca tier → Overlay desaparece
→ Notificación: "¡Bienvenido a Premium Plus! 🎉"
```

### 12.4 Reglas de negocio de monetización

1. **Nunca bloquear funciones básicas en el free tier** — el ranking, el perfil y el chat general son siempre accesibles. Un free user debe poder disfrutar la app sin pagar.
2. **Los anuncios se sirven solo si la sesión está activa** — sin token válido, no se cargan ads (evita impresiones de bots).
3. **No mostrar el modal de Premium más de 1 vez cada 24h** por la misma función bloqueada.
4. **El plan anual siempre muestra el ahorro en % comparado al mensual.**
5. **Cancelación**: si el usuario cancela, mantiene beneficios hasta fin del periodo pagado. El downgrade a Free es suave (no se borran datos, solo se ocultan funciones).

---

## 13. REGLAS DE NEGOCIO CRÍTICAS

### 13.1 Verificación de membership

- Solo jugadores en el roster de Exilium (Quel'Thalas US) pueden registrarse
- El roster se sincroniza cada 24h desde la Blizzard Guild API
- Un jugador expulsado de la hermandad → su cuenta queda en `SUSPENDED` (puede leer pero no escribir en el chat ni en apuestas)
- Los Officers y Admins son verificados manualmente; no dependen del roster de la API

### 13.2 Integridad de apuestas

- El Worker es la única fuente de verdad para ratings (Blizzard API)
- Las apuestas se resuelven automáticamente; ningún humano tiene acceso directo a modificar resultados
- Logs inmutables de cada apuesta guardados en KV con TTL de 1 año
- Si el Worker no puede verificar el resultado (API de Blizzard caída), la apuesta se extiende 24h automáticamente

### 13.3 Chat y moderación

- Mensajes con más de 200 caracteres se truncan en el preview del feed
- No hay mensajes directos (DM) en Free ni Premium — solo en Premium Plus
- Los Officers pueden pin mensajes importantes en cada canal
- Anti-spam: si un usuario envía 5 mensajes idénticos en 60s → suspensión automática de 1h

### 13.4 Streaming y verificación de streamers

- Un jugador no puede reclamar el badge de Streamer sin que un Officer lo apruebe
- El canal de Twitch/YouTube debe ser del mismo jugador (verificación manual básica)
- Si el canal de Twitch es privado o no existe, el badge se retira automáticamente

---

## 14. ARCHIVOS Y ESTRUCTURA DEL PROYECTO

```
exilium-app/
├── lib/
│   ├── main.dart
│   ├── app.dart                        # MaterialApp + GoRouter
│   ├── core/
│   │   ├── constants.dart              # URLs, keys, config
│   │   ├── theme.dart                  # Colores negro+azul, tipografía
│   │   ├── router.dart                 # GoRouter con guards de auth
│   │   └── di.dart                     # Dependency injection (Riverpod)
│   ├── features/
│   │   ├── auth/
│   │   │   ├── domain/                 # Models: User, AuthState
│   │   │   ├── data/                   # AuthRepository, AuthApi
│   │   │   └── presentation/           # Screens: login, register 1-3
│   │   ├── home/
│   │   │   └── presentation/           # HomeScreen, widgets
│   │   ├── ranking/
│   │   │   ├── domain/                 # Player, RankingFilter
│   │   │   ├── data/                   # RankingRepository
│   │   │   └── presentation/           # RankingScreen, PlayerTile
│   │   ├── battlepass/
│   │   │   └── presentation/           # BattlePassScreen, XPTrack
│   │   ├── profile/
│   │   │   ├── presentation/           # ProfileScreen
│   │   │   └── widgets/wardrobe_drawer.dart
│   │   ├── chat/
│   │   │   ├── domain/                 # Message, Channel
│   │   │   ├── data/                   # ChatRepository, WsService
│   │   │   └── presentation/           # ChatScreen, StreamStrip
│   │   ├── bets/
│   │   │   ├── domain/                 # Bet, BetOption, Coin
│   │   │   ├── data/                   # BetsRepository
│   │   │   └── presentation/           # BetsScreen, BetCard
│   │   └── premium/
│   │       └── presentation/           # PlansScreen, PlanCard
│   └── shared/
│       ├── widgets/                    # AdBanner, LoadingShimmer, etc.
│       ├── services/
│       │   ├── notification_service.dart   # FCM setup
│       │   ├── analytics_service.dart      # Firebase Analytics
│       │   └── admob_service.dart          # AdMob init
│       └── providers/
│           ├── auth_provider.dart
│           ├── tier_provider.dart          # Free/Premium/Plus
│           └── coins_provider.dart
├── workers/                            # Cloudflare Workers nuevos
│   ├── exilium-app-auth/
│   │   └── index.js                    # Registro, login, OTP
│   ├── exilium-chat-ws/
│   │   └── index.js                    # Durable Objects WebSocket
│   ├── exilium-bets/
│   │   └── index.js                    # CRUD apuestas + resolución
│   └── exilium-streams/
│       └── index.js                    # Polling Twitch + YT API
├── android/
│   └── app/
│       ├── google-services.json        # Firebase config
│       └── build.gradle                # AdMob App ID
├── ios/
│   └── Runner/
│       └── GoogleService-Info.plist    # Firebase config iOS
├── assets/
│   ├── images/
│   └── fonts/
├── pubspec.yaml
└── README.md                           # Este archivo
```

---

## 15. VARIABLES DE ENTORNO Y SECRETOS

### Worker secrets (wrangler secret put)

```bash
# Worker: exilium-app-auth
BLIZZARD_CLIENT_ID
BLIZZARD_CLIENT_SECRET
JWT_SECRET                    # HS256, mínimo 32 chars
DISCORD_CLIENT_ID
DISCORD_CLIENT_SECRET
DISCORD_REDIRECT_URI
SENDGRID_API_KEY              # Para emails OTP
FROM_EMAIL                    # noreply@exilium.gg

# Worker: exilium-streams
TWITCH_CLIENT_ID
TWITCH_CLIENT_SECRET
YOUTUBE_API_KEY

# Worker: exilium-bets
REVENUECAT_WEBHOOK_SECRET    # Para verificar webhooks de RevenueCat
```

### Flutter — dart-define o .env

```bash
ADMOB_APP_ID_ANDROID=ca-app-pub-XXXXXXXX~XXXXXXXXXX
ADMOB_APP_ID_IOS=ca-app-pub-XXXXXXXX~XXXXXXXXXX
REVENUECAT_PUBLIC_KEY_ANDROID=appl_XXXXXXXX
REVENUECAT_PUBLIC_KEY_IOS=appl_XXXXXXXX
API_BASE_URL=https://exilium-api.miztmutzuki.workers.dev
CHAT_WS_URL=wss://exilium-chat.miztmutzuki.workers.dev/ws
```

---

## 16. HOJA DE RUTA DE IMPLEMENTACIÓN

### Fase 1 — MVP (semanas 1-3)
- [ ] Auth completo: registro 3 pasos + login + JWT
- [ ] Home Dashboard: stats + feed de actividad
- [ ] Ranking: lista filtrable por bracket
- [ ] Perfil básico: ratings PvP
- [ ] AdMob: banner en Home y Ranking (Free)
- [ ] RevenueCat: integración básica (compra Premium)
- [ ] Notificaciones: login diario + ranking change

### Fase 2 — Engagement (semanas 4-6)
- [ ] Battle Pass: track visual + recompensas
- [ ] Armario de beneficios (Wardrobe Drawer)
- [ ] Chat en tiempo real (WebSocket + Durable Objects)
- [ ] Stream strip: consulta Twitch/YouTube, miniaturas
- [ ] Premium Plus: embed de stream en app
- [ ] Push notifications completo (FCM)

### Fase 3 — Monetización avanzada (semanas 7-9)
- [ ] Sistema de Monedas del Clan
- [ ] Apuestas PvP: tipos 1 y 2
- [ ] Apuestas tipo 3 (carreras) — Premium Plus
- [ ] Apuestas tipo 4 (entre jugadores) — Premium Plus
- [ ] Interstitial AdMob en apertura de Apuestas
- [ ] Rewarded ads por Monedas

### Fase 4 — Pulido y expansión (semanas 10-12)
- [ ] Análisis IA de gameplay (OpenAI / Workers AI)
- [ ] DMs entre jugadores (Premium Plus)
- [ ] Hall of Fame en app
- [ ] Portal de Boosting en app
- [ ] A/B testing de paywall (Firebase Remote Config)
- [ ] Lanzamiento en Google Play (APK firmado con keystore de TasaVe como referencia)

---

## CONTINUIDAD DEL PROYECTO

> **Nota para próxima sesión de créditos:**  
> El contexto completo de este proyecto está en las memorias de Claude asociadas a tu cuenta.  
> Al inicio de la siguiente sesión pega este bloque para retomar sin pérdida de contexto:

```
EXILIUM APP - Estado al 13/Jun/2026:
- Mockup HTML completo (12 pantallas) en: exilium-app-mockup.html
- README completo en: EXILIUM_APP_README.md
- Paleta: negro (#050810) + azul eléctrico (#1E6FFF)
- Stack: Flutter 3.x + Riverpod + Cloudflare Workers + WebSocket
- Auth: JWT + OTP email (paso 1-3) + Discord OAuth
- Planes: Free · Premium $2.99 · Premium Plus $4.99
- Ads: AdMob banner/interstitial/rewarded (solo Free)
- Pendiente: implementar lógica de negocio en Flutter
- Archivos base del Worker web en: /tmp/exilium/worker/
- Worker existente: exilium-blizzard (auth token: Exilium_PvP_2025_xK9m)
- KV: EXILIUM_KV
- API base: tasave-api.miztmutzuki.workers.dev (para referencia de patrón)
- Siguiente paso: crear Flutter project structure + auth screens
```

---

*Documentación generada: 13 de junio de 2026*  
*Versión: 1.0.0 — Exilium App MVP Blueprint*
