# 🛡️ EXÍLIUM — PLAN FINAL DEFINITIVO v3.1
### Todo corregido y confirmado · Abril 2026
### Para usar con Windsurf + Gemini 2.5 Pro

---

# ÍNDICE

1. Resumen del proyecto
2. Infraestructura Cloudflare (lo que ya existe)
3. Arquitectura simplificada (2 piezas)
4. Sistema de XP y Battle Pass (tablas definitivas)
5. Sistema de bodas
6. Títulos especiales (Leyenda / Gladiator)
7. Emblemas de rango
8. Worker — código del backend
9. Frontend público — index.html
10. Frontend admin — admin.html
11. Sistema de errores y logs
12. Consumo Cloudflare (plan free)
13. Orden de construcción (fases)
14. Instrucciones para Windsurf + Gemini 2.5 Pro

---

# 1. RESUMEN DEL PROYECTO

Exílium es una hermandad (guild) de World of Warcraft con ~747 miembros en la región US.
La página web es un **Battle Pass PvP** que trackea el rating de los jugadores inscritos
(~10-50 jugadores activos en PvP) y les asigna XP, niveles y rangos según su rendimiento
en arenas y BGs ranked.

Las recompensas (gold, gemas, juguetes) se entregan manualmente dentro del juego.
La página web calcula y muestra el progreso automáticamente.

Además, existe un **Exilium Installer** — app de escritorio en C#/.NET para Windows que los
jugadores usan para instalar el addon "Exilium PvP Rank" en WoW. Este instalador sincroniza
ratings consultando la API del worker y genera un archivo Lua dentro del addon.
El worker DEBE mantener un endpoint compatible con el instalador.

---

# 2. INFRAESTRUCTURA CLOUDFLARE (YA EXISTE — NO BORRAR NADA)

## Worker: `exilium-blizzard`
- URL: exilium-blizzard.mitzumitzukyhs.workers.dev
- Estado: funcionando, 2.1k requests
- Cron: cada 30 minutos (*/30 * * * *)
- KV binding: EXILIUM_KV → namespace `exilium-data`

### Variables configuradas (no tocar):
```
Secret:    ADMIN_KEY               → (encriptada, ya configurada)
Plaintext: BLIZZARD_CLIENT_ID      → 81823c496a314ef290923ec0fbfeafe7
Secret:    BLIZZARD_CLIENT_SECRET  → (encriptada, ya configurada)
Plaintext: GUILD_NAME              → Exilium
Plaintext: GUILD_REALM             → quel-thalas
Plaintext: GUILD_REGION            → us
Plaintext: JWT_SECRET              → exilium-secret-xyz-2025
```

### Variables NUEVAS que hay que agregar:
```
Plaintext: CORS_ORIGIN             → https://exilium-battlepass.pages.dev
Plaintext: API_RATINGS_TOKEN       → Exilium_PvP_2025_xK9m
```
La variable API_RATINGS_TOKEN es el token que usa el Exilium Installer
(app de escritorio) para autenticar con el endpoint /api/ratings.
CORS_ORIGIN limita qué dominio puede llamar a la API.

⚠️ IMPORTANTE: El JWT_SECRET está expuesto (visible en screenshots).
Cuando se suba el código nuevo, cambiar por un valor random de 32+ caracteres.

## Pages: `exilium-battlepass`
- URL: exilium-battlepass.pages.dev
- Estado: desplegando correctamente

## KV: `exilium-data` (1 solo namespace — NO crear más)
### Claves actuales en el KV:
```
player:aladincquelthalas        → datos del jugador Aladinc
player:aragonquelthalas         → datos del jugador Àragon
player:dracomcflyquelthalas     → datos del jugador Dracomcfly
player:hydraxquelthalas         → datos del jugador Hydräx
player:jhonwikiragnaros         → datos del jugador Jhonwiki (Ragnaros)
player:jolyfakequelthalas       → datos del jugador Jolyfake
player:kindavionragnaros        → datos del jugador Kindavion (Ragnaros)
player:mitzukyhsquelthalas      → datos del jugador Mitzukyhs
player:shideyanggquelthalas     → datos del jugador Shideyangg
player:vendettitaquelthalas     → datos del jugador Vendettita

analytics:armory:*              → contadores de visitas a armoría
analytics:ips:*                 → IPs por día
analytics:top_armory            → ranking de visitas
analytics:visits:*              → visitas por día

announcement:current            → anuncio activo
cron:last_run                   → última ejecución del cron
deliveries:all                  → entregas de recompensas
deliveries:married              → registro de matrimonios (vacío)
```

### Otros workers (NO tocar):
- comedor-lcrv (otro proyecto)
- comedor-notif (otro proyecto)

---

# 3. ARQUITECTURA SIMPLIFICADA

## Solo 2 piezas:

### Pieza 1: Worker `exilium-blizzard` (backend completo)
Se REEMPLAZA el código, pero se mantiene todo lo demás (variables, KV, cron).
Maneja: API pública + rutas admin + sync con Blizzard + cálculo XP.

### Pieza 2: Pages `exilium-battlepass` (frontend completo)
Se SUBEN archivos nuevos.
Contiene: index.html (página pública) + admin.html (panel admin).

## Archivos del frontend (subir a Pages):
```
exilium-battlepass/
├── index.html              ← Página pública principal
├── admin.html              ← Panel de administración
├── css/
│   ├── main.css            ← Estilos página pública
│   └── admin.css           ← Estilos panel admin
├── js/
│   ├── app.js              ← Estado, routing, renderizado público
│   ├── xp-engine.js        ← Cálculo XP (lógica crítica, separada)
│   └── admin.js            ← Todo el panel admin
└── assets/
    ├── dragon-red.webp         ← Fondo animado hero
    ├── Sport_Break_Free_Version.otf  ← Fuente custom
    ├── alianza-fondo.jpg       ← Fondo admin
    ├── logo.png                ← Logo Exilium
    ├── fondo.png               ← Fondo alternativo
    ├── emblema_1.png           ← Exiliado
    ├── emblema_2.png           ← Penitente
    ├── emblema_3.png           ← Sombra
    ├── emblema_4.png           ← Apóstata
    ├── emblema_5.png           ← Rompejuramentos
    ├── emblema_6.png           ← Hereje
    ├── emblema_7.png           ← Profeta
    └── emblema_8.png           ← Exarca
```

## Archivos del worker (subir con "Edit code" o Wrangler):
```
worker/
├── index.js            ← Router principal + CORS + cron handler
├── blizzard.js         ← OAuth2 + llamadas API WoW + validación temporada
├── players.js          ← CRUD + sync + cálculo XP + bodas
└── auth.js             ← Autenticación admin simple
```

---

# 4. SISTEMA DE XP Y BATTLE PASS

## 4.1 — Principio fundamental
```
El XP se basa en el MÁXIMO HISTÓRICO de cada bracket.
Si un jugador baja de 2100 a 1800, su XP NO disminuye.
El KV es la fuente de verdad y NUNCA se sobreescribe con un valor menor.
```

## 4.2 — Tablas de conversión rating → XP

### Brackets estándar: Solo Shuffle · 2v2 · RBG · Blitz (máx 4,550 XP c/u)
| Rating | +Puntos | Acumulado |
|--------|---------|-----------|
| ≥ 1000 | +50     | 50        |
| ≥ 1200 | +100    | 150       |
| ≥ 1400 | +150    | 300       |
| ≥ 1600 | +250    | 550       |
| ≥ 1800 | +500    | 1,050     |
| ≥ 2100 | +1,500  | 2,550     |
| ≥ 2400 | +2,000  | 4,550     |

### Bracket 3v3 (tabla especial — máx 5,800 XP)
| Rating | +Puntos | Acumulado |
|--------|---------|-----------|
| ≥ 1000 | +50     | 50        |
| ≥ 1200 | +100    | 150       |
| ≥ 1400 | +150    | 300       |
| ≥ 1600 | +250    | 550       |
| ≥ 1800 | +750    | 1,300     |
| ≥ 2100 | +2,000  | 3,300     |
| ≥ 2400 | +2,500  | 5,800     |

### XP máximo posible de brackets:
```
4,550 (SS) + 4,550 (2v2) + 5,800 (3v3) + 4,550 (RBG) + 4,550 (Blitz) = 24,000 XP
```

## 4.3 — Tabla completa de 40 niveles (VALORES DEFINITIVOS)

| Nivel | XP     | Rango           | Color     | Recompensa |
|-------|--------|-----------------|-----------|------------|
| 0     | 0      | EXILIADO        | #9a8878   | Paquete Inicial: 30 frascos de honor, 1 gema stat, 10 consumibles |
| 1     | 50     | INICIADO        | #9a8878   | 1k gold + x2 boda r3 |
| 2     | 120    | INICIADO        | #9a8878   | 1k gold + x2 boda r3 |
| 3     | 210    | INICIADO        | #9a8878   | 1k gold + x2 boda r3 |
| 4     | 320    | INICIADO        | #9a8878   | 1k gold + x2 boda r3 |
| 5     | 450    | INICIADO        | #9a8878   | 1 Heliotropo infundido |
| 6     | 600    | PENITENTE       | #7a9abb   | 1 gema stat |
| 7     | 770    | PENITENTE       | #7a9abb   | 1 gema stat |
| 8     | 850    | PENITENTE       | #7a9abb   | 2k gold + x2 boda r3 |
| 9     | 960    | PENITENTE       | #7a9abb   | 2k gold + x2 boda r3 |
| 10    | 1,170  | PENITENTE       | #7a9abb   | 1 sangrita c. + Rango Penitente |
| 11    | 1,400  | PENITENTE       | #7a9abb   | 2k gold |
| 12    | 1,920  | SOMBRA          | #8888cc   | 2k gold |
| 13    | 2,210  | SOMBRA          | #8888cc   | 2k gold + x2 boda r3 |
| 14    | 2,520  | SOMBRA          | #8888cc   | gema stat |
| 15    | 2,850  | SOMBRA          | #8888cc   | Rango SOMBRA |
| 16    | 3,200  | SOMBRA          | #8888cc   | 2k gold |
| 17    | 3,570  | SOMBRA          | #8888cc   | 2k gold |
| 18    | 3,960  | APÓSTATA        | #cc6644   | 3k gold + x2 boda r3 |
| 19    | 4,370  | APÓSTATA        | #cc6644   | Gema stat |
| 20    | 4,800  | APÓSTATA        | #cc6644   | 1 Juguete + Rango Apóstata |
| 21    | 5,250  | APÓSTATA        | #cc6644   | 3k gold |
| 22    | 5,720  | APÓSTATA        | #cc6644   | 2 gemas stat |
| 23    | 6,210  | APÓSTATA        | #cc6644   | 1 Juguete |
| 24    | 6,720  | ROMPEJURAMENTOS | #dd4444   | 4k gold + x2 boda r3 |
| 25    | 7,250  | ROMPEJURAMENTOS | #dd4444   | 1 juguete + Banco hermandad + Rango Rompejuramentos |
| 26    | 7,800  | ROMPEJURAMENTOS | #dd4444   | 2 Heliotropos infundidos |
| 27    | 8,370  | ROMPEJURAMENTOS | #dd4444   | 2 Heliotropos infundidos |
| 28    | 8,960  | ROMPEJURAMENTOS | #dd4444   | 4k gold + x2 boda r3 |
| 29    | 9,570  | ROMPEJURAMENTOS | #dd4444   | 2 Gemas stat |
| 30    | 10,200 | HEREJE          | #ee2222   | 2 juguetes + Rango Hereje |
| 31    | 10,850 | HEREJE          | #ee2222   | 4k gold |
| 32    | 11,520 | HEREJE          | #ee2222   | 3 Heliotropos infundidos |
| 33    | 12,210 | HEREJE          | #ee2222   | 5k gold + x2 boda r3 |
| 34    | 12,920 | HEREJE          | #ee2222   | 3 Heliotropos infundidos |
| 35    | 13,650 | PROFETA         | #ff8800   | 5k gold + Rango Profeta |
| 36    | 14,400 | PROFETA         | #ff8800   | 3 Heliotropos infundidos |
| 37    | 15,170 | PROFETA         | #ff8800   | 5k gold |
| 38    | 15,320 | PROFETA         | #ff8800   | 5k gold |
| 39    | 15,420 | PROFETA         | #ff8800   | 3 Heliotropos infundidos |
| 40    | 15,500 | EXARCA          | #d4a017   | 10 sangritas, plater name Discord, reconocimiento en la guild, sugerir temática próxima season, canal de voz, Rango Exarca |

## 4.4 — 9 rangos del Battle Pass

| # | Rango           | Niveles | Color     | Emblema        |
|---|-----------------|---------|-----------|----------------|
| 1 | EXILIADO        | 0       | #9a8878   | emblema_1.png  |
| 2 | INICIADO        | 1-5     | #9a8878   | SIN EMBLEMA    |
| 3 | PENITENTE       | 6-11    | #7a9abb   | emblema_2.png  |
| 4 | SOMBRA          | 12-17   | #8888cc   | emblema_3.png  |
| 5 | APÓSTATA        | 18-23   | #cc6644   | emblema_4.png  |
| 6 | ROMPEJURAMENTOS | 24-29   | #dd4444   | emblema_5.png  |
| 7 | HEREJE          | 30-34   | #ee2222   | emblema_6.png  |
| 8 | PROFETA         | 35-39   | #ff8800   | emblema_7.png  |
| 9 | EXARCA          | 40      | #d4a017   | emblema_8.png  |

## 4.5 — Reglas de negocio (críticas, no modificar)

```
REGLA 1: XP CAP — el máximo de XP por bracket es fijo
         Brackets estándar: tope en 2400 → 4,550 XP máx
         Bracket 3v3:       tope en 2400 → 5,800 XP máx

REGLA 2: MÁXIMO HISTÓRICO — KV es la fuente de verdad
         Si rating_nuevo > max_guardado → actualizar
         Si rating_nuevo <= max_guardado → NO tocar

REGLA 3: INDEPENDENCIA DE SPEC — historial es por PERSONAJE
         Solo Shuffle tiene ratings por spec en WoW.
         max_rs = el mayor de TODAS las specs del personaje.
         Si cambia de spec y la API devuelve 0 → el max NO baja.

REGLA 4: total_xp = xp_de_brackets + manual_bonus
         El XP manual se SUMA, no reemplaza.

REGLA 5: Jugadores baneados NO aparecen en público
         Pero siguen sincronizándose en background.

REGLA 6: Al cerrar temporada:
         → season_max se guarda en historial
         → season_max se resetea a 0
         → manual_bonus se resetea a 0
         → pvp.current NO se borra
```

## 4.6 — Estructura de datos del jugador en KV

```json
{
  "id": "vendettita-quelthalas",
  "name": "Vendettita",
  "realm": "quelthalas",
  "realm_display": "Quel'Thalas",
  "region": "us",
  "class": "Caballero de la Muerte",
  "spec": "Unholy",
  "race": "Blood Elf",
  "faction": "horde",
  "level": 80,
  "ilvl": 639,
  "banned": false,
  "notes": "",
  "season_id": "s1-midnight",

  "pvp": {
    "current": {
      "rs": 1847, "r2": 1623, "r3": 2241, "rbg": 1450, "bgs": 1890
    },
    "season_max": {
      "max_rs": 1950, "max_r2": 1900, "max_r3": 2241, "max_rbg": 1510, "max_bgs": 1890
    },
    "wins": { "rs": 142, "r2": 88, "r3": 211, "rbg": 67, "bgs": 95 },
    "losses": { "rs": 110, "r2": 70, "r3": 145, "rbg": 55, "bgs": 72 }
  },

  "battlepass": {
    "total_xp": 8750,
    "level": 26,
    "rank_name": "ROMPEJURAMENTOS",
    "xp_breakdown": {
      "from_rs": 1050,
      "from_r2": 550,
      "from_r3": 3300,
      "from_rbg": 300,
      "from_bgs": 1050,
      "manual_bonus": 2500
    }
  },

  "marriage": {
    "married_to": "aragon-quelthalas",
    "partner_name": "Àragon",
    "married_since": "2026-03-15"
  },

  "titles": {
    "legend": false,
    "gladiator": false
  },

  "media": {
    "avatar": "https://render.worldofwarcraft.com/us/character/...",
    "armory_url": "https://worldofwarcraft.blizzard.com/en-us/character/us/quel-thalas/..."
  },

  "sync": {
    "last_update": "2026-04-02T15:30:00Z",
    "last_success": "2026-04-02T15:30:00Z",
    "last_error": null,
    "sync_status": "ok",
    "blizzard_status": 200
  }
}
```

---

# 5. SISTEMA DE BODAS

## Reglas:
- Invento de la guild, NO existe en la API de Blizzard
- Se registra MANUALMENTE por el admin
- El multiplicador x2 aplica SOLO a recompensas (gold, gemas, juguetes)
- El multiplicador x2 NUNCA afecta rating ni XP
- Las recompensas se entregan manualmente dentro del juego por el admin

## En el KV:
Si está casado: `"marriage": { "married_to": "id-jugador", "partner_name": "Nombre", "married_since": "fecha" }`
Si no está casado: `"marriage": null`

## En el admin:
- Botón "Casar" → seleccionar 2 jugadores → actualiza AMBOS
- Botón "Divorciar" → limpia el campo de AMBOS jugadores

## En la página pública:
- Icono de anillos + nombre de pareja en perfil del jugador
- En el Battle Pass: indicador de cuáles niveles dan x2 boda

---

# 6. TÍTULOS ESPECIALES

## Leyenda (Solo Shuffle) → +3,500 XP
## Gladiator (3v3) → +3,500 XP

### Reglas:
- Se aplican MANUALMENTE desde el admin, NUNCA automático
- El admin verifica personalmente que el jugador sacó el título esta temporada
- Botón dedicado en admin: "Otorgar Título" → Leyenda / Gladiator
- Al otorgar: suma 3,500 al manual_bonus con razón registrada
- Se marca en el jugador: `titles.legend = true` o `titles.gladiator = true`
- Al cerrar temporada: los títulos se resetean a false

---

# 7. EMBLEMAS DE RANGO (CONFIRMADO POR EDITOR)

| Archivo        | Rango           | Tiene emblema |
|----------------|-----------------|---------------|
| emblema_1.png  | EXILIADO        | ✅ SÍ         |
| (ninguno)      | INICIADO        | ❌ NO         |
| emblema_2.png  | PENITENTE       | ✅ SÍ         |
| emblema_3.png  | SOMBRA          | ✅ SÍ         |
| emblema_4.png  | APÓSTATA        | ✅ SÍ         |
| emblema_5.png  | ROMPEJURAMENTOS | ✅ SÍ         |
| emblema_6.png  | HEREJE          | ✅ SÍ         |
| emblema_7.png  | PROFETA         | ✅ SÍ         |
| emblema_8.png  | EXARCA          | ✅ SÍ         |

Iniciado no tiene emblema. En la web se puede mostrar sin icono o con un placeholder genérico.

---

# 8. WORKER — BACKEND COMPLETO

## 8.1 — Endpoints públicos (sin auth)

```
GET  /api/players          → Lista de jugadores activos (sin baneados)
GET  /api/players/:id      → Detalle de un jugador
GET  /api/announcement     → Anuncio activo (o null)
GET  /api/health           → Status del sistema
```

## 8.1b — Endpoint para el Exilium Installer (CRÍTICO — addon de escritorio)

```
GET  /api/ratings
Header requerido: X-API-Token: {valor de env.API_RATINGS_TOKEN}
```

⚠️ ESTE ENDPOINT ES VITAL. Sin él, el instalador de escritorio que usan los jugadores
para sincronizar el addon dentro de WoW deja de funcionar. Antes vivía en el worker
`exilium-api-ratings` que se borró. Ahora debe vivir en `exilium-blizzard`.

### Autenticación:
- Validar header `X-API-Token` contra `env.API_RATINGS_TOKEN`
- Si no coincide o falta: 401 Unauthorized
- NO usa el mismo auth que el admin (es un token fijo, no JWT/sesión)

### Respuesta esperada (JSON):
El instalador C# espera este formato exacto:
```json
{
  "players": [
    {
      "name": "Mitzukyhs",
      "realm": "Quel'Thalas",
      "class": "HUNTER",
      "class_id": 3,
      "r2": 1850,
      "r3": 2100,
      "rs": 1950,
      "rbg": 0,
      "bgs": 1700,
      "xp": 4200,
      "level": 15,
      "rank": "SOMBRA"
    }
  ],
  "timestamp": 1743500000,
  "season": "s1-midnight",
  "total_players": 10
}
```

### Reglas de normalización (el instalador depende de esto):
| Campo | Regla | Ejemplo |
|-------|-------|---------|
| name | PascalCase (primera letra mayúscula) | "thrall" → "Thrall" |
| realm | PascalCase sin apóstrofes | "Quel'Thalas" → "QueltThalas" (en el Lua) |
| class | UPPERCASE del class key inglés | "HUNTER", "PALADIN", "DEATHKNIGHT" |
| ratings | Usar pvp.current (no season_max) para este endpoint | r2, r3, rs, rbg, bgs |
| xp | battlepass.total_xp | |

### Mapeo de class_id (el instalador usa esto como fuente primaria):
```
1=WARRIOR, 2=PALADIN, 3=HUNTER, 4=ROGUE, 5=PRIEST,
6=DEATHKNIGHT, 7=SHAMAN, 8=MAGE, 9=WARLOCK, 10=MONK,
11=DRUID, 12=DEMONHUNTER, 13=EVOKER
```

### Qué hace el instalador con estos datos:
1. Llama a GET /api/ratings con el token
2. Recibe el JSON
3. Genera un archivo `ExiliumSyncData.lua` dentro de la carpeta del addon en WoW
4. El formato Lua es:
```lua
ExiliumSyncDB = {
  ["lastSync"] = 1743500000,
  ["ratings"] = {
    ["Mitzukyhs-QueltThalas"] = {
      ["class"] = "HUNTER",
      ["r2"] = 1850,
      ["r3"] = 2100,
      ["rs"] = 1950,
      ["rbg"] = 0,
      ["bgs"] = 1700,
      ["xp"] = 4200,
    },
  }
}
```
5. El jugador escribe /reload en WoW y el addon lee el archivo Lua

### IMPORTANTE para el CORS:
Este endpoint NO necesita CORS (lo llama una app de escritorio, no un browser).
Pero no debe romper si se llama desde el browser tampoco.

## 8.2 — Endpoints admin (requieren token)

```
POST   /admin/auth                    → Login (contraseña → token)
GET    /admin/players                 → Lista completa (incluye baneados)
POST   /admin/players                 → Inscribir jugador (nombre + realm + region)
PATCH  /admin/players/:id             → Editar (notas, ban)
DELETE /admin/players/:id             → Eliminar jugador
POST   /admin/players/:id/refresh     → Sync individual con Blizzard
POST   /admin/players/:id/xp          → Ajustar XP manual (+/- con razón)
POST   /admin/players/:id/title       → Otorgar título (Leyenda/Gladiator → +3,500)
POST   /admin/players/marry           → Casar 2 jugadores
POST   /admin/players/divorce/:id     → Divorciar
POST   /admin/sync                    → Sync masivo todos los jugadores
POST   /admin/announcement            → Crear/editar anuncio
DELETE /admin/announcement            → Eliminar anuncio
GET    /admin/export-addon            → Generar string Lua para addon WoW
POST   /admin/season/close            → Cerrar temporada (irreversible)
GET    /admin/errors                   → Lista de errores recientes
DELETE /admin/errors                   → Limpiar log de errores
```

## 8.3 — Autenticación (simple, plan free)
- Admin envía contraseña → worker compara con ADMIN_KEY
- Si ok: genera token simple (random string) → guarda en KV con TTL 8 horas
- Admin guarda token en sessionStorage
- Cada petición admin envía token en header Authorization
- Worker valida que el token exista en KV
- Bloqueo después de 5 intentos fallidos (15 min)
- Migración futura a JWT cuando haya suscripción de Cloudflare

## 8.4 — Flujo Blizzard API

### Paso 0: Obtener ID de temporada activa (cachear 6h en KV)
```
GET https://us.api.blizzard.com/data/wow/pvp-season/index
    ?namespace=dynamic-us&locale=en_US
→ Extraer current_season.id
→ Guardar en KV: "blizzard:current_season_id"
```

### Paso 1: OAuth2 token (cachear en KV con TTL dinámico)
```
POST https://oauth.battle.net/token
Authorization: Basic base64(CLIENT_ID:CLIENT_SECRET)
Body: grant_type=client_credentials
```

### Paso 2: Leer cada bracket y VALIDAR season.id
```
Para cada bracket (2v2, 3v3, rbg, shuffle-*, battlegrounds-blitz):
GET .../pvp-bracket/{bracket}?namespace=profile-us

VALIDACIÓN:
  si respuesta.season.id === current_season_id → rating válido
  si respuesta.season.id !== current_season_id → tratar como 0
  si 404 → nunca jugó este bracket → rating = 0

BUG DE BLIZZARD (Solo Shuffle):
  Si rating = 0 PERO played > 0 → marcar sync_status = "api_bug_ss"
  NO actualizar historial. Admin verá badge ⚠️.
```

### Paso 3: Solo Shuffle (per-spec)
```
Llamar SOLO las specs de la clase del personaje (3-4 llamadas máx)
max_rs = Math.max(...ratings_validos_de_todas_las_specs)
Aplicar REGLA 2: max_rs_KV = Math.max(max_rs_KV, max_rs_candidato)
```

### Paso 4: Manejo de errores HTTP
```
200 → OK, procesar con validación de season.id
401 → Token expirado → renovar y reintentar 1 vez
403 → Perfil privado → sync_status = "private"
404 → No encontrado → sync_status = "not_found", NO borrar datos
429 → Rate limit → esperar 1s, reintentar hasta 3 veces
500+ → sync_status = "blizzard_error"
timeout > 8s → sync_status = "timeout"
```

## 8.5 — Cron (cada 30 minutos)
```
1. Leer lista completa de jugadores
2. Filtrar: solo los que tienen last_update > 30 min
3. Procesar en lotes de 5 con delay 500ms
4. Para cada jugador: sync con Blizzard + recalcular XP
5. Guardar resumen en KV "cron:last_run"
6. Si >50% fallan: guardar alerta en "meta:cron_alert"
```

## 8.6 — Estructura de claves KV (prefijos)
```
player:{realm}-{name}           → Datos completos del jugador
announcement:current            → Anuncio activo
cron:last_run                   → Timestamp + resumen último cron
meta:error_log                  → Array JSON últimos 50 errores
meta:cron_alert                 → Alerta si cron tiene muchos errores
auth:token:{token}              → Token de sesión admin (TTL 8h)
auth:failed_attempts            → Contador intentos fallidos
blizzard:token                  → Access token OAuth (TTL dinámico)
blizzard:current_season_id      → ID temporada activa (TTL 6h)
config:season                   → Info de temporada actual
deliveries:all                  → Registro de entregas
deliveries:married              → Registro de matrimonios
analytics:visits:{fecha}        → Visitas por día
analytics:top_armory            → Ranking de visitas
```

---

# 9. FRONTEND PÚBLICO — index.html

## Secciones:

### 1. Hero
- Stats de la guild (miembros inscritos, max rating, etc.)
- Fondo animado (dragon-red.webp)
- Logo Exilium

### 2. Brackets
- 5 cards: Solo Shuffle, 2v2, 3v3, RBG, Blitz
- Cada card muestra los top jugadores del bracket

### 3. Battle Pass / Leaderboard XP
- Ranking de jugadores por XP total
- Podio top 3
- Barra de progreso con nivel y rango
- Emblema de rango al lado del nombre
- Icono de anillos si está casado

### 4. Ranking PvP
- Tabla con tabs por bracket
- Podio por bracket

### 5. Conquistadores
- Sección especial jugadores 2400+

### 6. ¿Cómo funciona? (SECCIÓN NUEVA — IMPORTANTE)
- Explicación del sistema XP (cómo se convierte rating a XP)
- Las 5 tablas de conversión (SS, 2v2, 3v3, RBG, Blitz)
- Progresión de rangos con colores y emblemas
- Vista del Battle Pass completo (40 niveles con recompensas)
- Explicación del sistema de bodas (x2 en recompensas)
- Mención de títulos especiales (Leyenda/Gladiator +3,500)

### 7. Anuncio
- Banner del anuncio activo (si hay)

### 8. Modal de jugador
- Al hacer clic en un jugador: modal con perfil completo
- Ratings por bracket, XP, nivel, rango, emblema
- Estado de matrimonio
- Link a la armoría de WoW

---

# 10. FRONTEND ADMIN — admin.html

## Login
- Campo contraseña + botón Entrar
- Bloqueo visual después de 5 intentos

## Tab 1: Jugadores
- Tabla: avatar, nombre·realm, clase, iLvl, XP, nivel, rango (emblema), sync, matrimonio, acciones
- Acciones: editar, refresh, ajustar XP, eliminar
- Modal inscribir: nombre + realm (seleccionable, no fijo en quel-thalas) + región
- Filtros: todos / activos / baneados / sin sync
- Contador: "Mostrando X / Y jugadores"

## Tab 2: Sincronización
- Indicador: "Último sync exitoso hace X minutos"
- Botón sync masivo con barra de progreso
- Lista de jugadores con problemas

## Tab 3: Ajuste de XP
- Selector de jugador
- Datos actuales (desglose XP por bracket + bonus + total)
- Campo ajuste (+/- cantidad) con razón obligatoria
- Botón "Otorgar Título": Leyenda / Gladiator → +3,500 automático
- Historial de ajustes manuales

## Tab 4: Bodas
- Lista de matrimonios activos
- Botón "Casar": seleccionar 2 jugadores
- Botón "Divorciar"
- Historial

## Tab 5: Anuncio
- Crear/editar anuncio (mensaje, tipo, URL, expiración)
- Preview en tiempo real
- Botón limpiar

## Tab 6: Exportar Addon
- Genera string Lua para addon WoW
- Solo jugadores activos (no baneados)
- Botón copiar al portapapeles

## Tab 7: Temporada
- Info temporada actual
- Cerrar temporada (zona de peligro, confirmación doble)

## Tab 8: Errores
- Lista últimos 50 errores (1 sola clave KV)
- Cada error: hora, tipo, módulo, mensaje
- Botón limpiar log

---

# 11. SISTEMA DE ERRORES Y LOGS

## Almacenamiento:
- 1 SOLA clave KV: `meta:error_log`
- Valor: array JSON con los últimos 50 errores
- Cuando hay error nuevo: leer array, agregar, recortar a 50, guardar
- Consumo: 1 lectura + 1 escritura por error

## Formato de cada error:
```json
{
  "timestamp": "2026-04-02T19:28:43Z",
  "type": "SYNC",
  "module": "blizzard.js",
  "message": "Timeout al conectar con Blizzard API",
  "player": "vendettita-quelthalas",
  "details": "GET /pvp-bracket/2v2 — timeout 8000ms"
}
```

## Tipos de error:
- RED: fetch fallido, timeout, CORS
- DATOS: respuesta malformada, campo faltante
- SYNC: desajuste rating vs histórico
- UI: elemento DOM no encontrado
- LÓGICA: XP negativo, nivel fuera de rango

---

# 12. CONSUMO CLOUDFLARE (PLAN FREE)

| Recurso | Límite diario | Uso estimado | Estado |
|---------|---------------|--------------|--------|
| Worker requests | 100,000 | ~2,000-3,000 | ✅ OK |
| KV lecturas | 100,000 | ~5,000 | ✅ OK |
| KV escrituras | 1,000 | ~100-200 | ✅ OK |
| KV almacenamiento | 1 GB | ~1 MB | ✅ OK |

---

# 13. ORDEN DE CONSTRUCCIÓN (FASES)

## Fase 1: Worker (backend) — PRIMERO
1. Router + CORS + auth simple
2. CRUD de jugadores (inscribir, editar, eliminar)
3. Sync con Blizzard API (OAuth + brackets + validación temporada)
4. Cálculo de XP (motor XP)
5. Bodas (casar/divorciar)
6. Títulos (otorgar Leyenda/Gladiator)
7. Sistema de errores (try/catch + log en KV)
8. Endpoints restantes (anuncio, export, temporada, health)
9. Cron handler

## Fase 2: Frontend público (index.html) — SEGUNDO
1. Estructura HTML + CSS base
2. Hero + stats
3. Brackets cards
4. Battle Pass leaderboard + podio
5. Ranking PvP con tabs
6. Conquistadores
7. Sección "¿Cómo funciona?"
8. Anuncio banner
9. Modal de jugador

## Fase 3: Frontend admin (admin.html) — TERCERO
1. Login
2. Tab Jugadores (tabla + CRUD + inscribir)
3. Tab Sincronización
4. Tab Ajuste XP + Otorgar Título
5. Tab Bodas
6. Tab Anuncio
7. Tab Export Addon
8. Tab Temporada
9. Tab Errores

---

# 14. INSTRUCCIONES PARA WINDSURF + GEMINI 2.5 PRO

## Qué hacer en Windsurf:
Windsurf con Gemini 2.5 Pro se encarga de generar TODOS los archivos de código:
- Los archivos del worker (index.js, blizzard.js, players.js, auth.js + los que Gemini separe)
- Los 2 archivos HTML (index.html, admin.html)
- Los 2 archivos CSS (main.css, admin.css)
- Los 3 archivos JS del frontend (app.js, xp-engine.js, admin.js)

## Cómo usar este documento:
1. Abre Windsurf con tu proyecto `exilium-web-v2`
2. Pega este documento completo como contexto en la conversación con Gemini
3. Pide que genere los archivos uno por uno, empezando por la Fase 1 (worker)
4. Revisa cada archivo antes de pasar al siguiente
5. Cuando el worker esté listo, súbelo a Cloudflare con "Edit code" o Wrangler
6. Prueba que funcione antes de pasar a la Fase 2

## Qué hacer en Claude (aquí):
- Resolver dudas técnicas sobre la API de Blizzard
- Revisar código si algo no funciona
- Depurar errores
- Ajustar el plan si cambian los requisitos

## Flujo de deploy:
```
Windsurf genera archivos → tú revisas → subes a Cloudflare

Worker:
  Cloudflare Dashboard → Workers → exilium-blizzard → Edit code
  O con Wrangler: wrangler deploy

Pages (frontend):
  Cloudflare Dashboard → Pages → exilium-battlepass → Create deployment
  Subir carpeta con index.html, admin.html, css/, js/, assets/
```

## Tips para Gemini en Windsurf:
- Dale contexto completo: pega este plan entero
- Pide un archivo a la vez, no todos juntos
- Empieza siempre por el worker (Fase 1)
- Si Gemini comete un error, pega el error aquí en Claude para debug
- El worker de Cloudflare usa ES modules (export default { fetch, scheduled })
- El frontend usa HTML, CSS, JS vanilla — sin frameworks

## ⚠️ NOTA SOBRE itty-router:
Gemini usó `itty-router` en el index.js. Esto ES compatible con Cloudflare Workers,
pero necesita bundling con Wrangler (wrangler.toml debe tener compatibilidad con
ES modules). Si se sube el código con "Edit code" en el dashboard, itty-router
NO estará disponible porque no hay node_modules. Hay dos opciones:
  OPCIÓN A: Usar Wrangler desde terminal para deploy (soporta imports de npm)
  OPCIÓN B: No usar itty-router y hacer el routing manual con if/else sobre request.url
Si no sabes usar Wrangler, pide a Gemini que rehaga el worker SIN itty-router,
usando routing manual. Es más código pero cero dependencias.

## ⚠️ VERIFICACIONES DEL CÓDIGO DE GEMINI (Fase 1):
Antes de subir el worker, verificar estos puntos:
1. Que el endpoint GET /api/ratings exista y use X-API-Token (para el addon installer)
2. Que CORS_ORIGIN apunte a https://exilium-battlepass.pages.dev
3. Que el Access-Control-Allow-Headers incluya "X-API-Token" además de Authorization
4. Que el cron handler llame a syncAllPlayers correctamente
5. Que el KV binding se llame EXILIUM_KV (así está en Cloudflare)
6. Que las rutas admin validen el token de sesión
7. Que el motor XP use los valores EXACTOS de la tabla de 40 niveles de este plan
8. Que el nivel 8 = 850 XP (no 770)
9. Que el nivel 40 = 15,500 XP (no 16,500)

---

# 15. EXILIUM INSTALLER — APP DE ESCRITORIO (referencia)

El Exilium Installer es una app de escritorio en C# / .NET 10 / WPF que los jugadores
descargan desde Discord. Sirve para instalar el addon "Exilium PvP Rank" en WoW y
sincronizar los ratings de la hermandad.

## Lo que importa para el worker:
- El instalador llama a `GET /api/ratings` con header `X-API-Token`
- Antes este endpoint vivía en `exilium-api-ratings` (worker borrado)
- Ahora DEBE vivir en `exilium-blizzard` (el worker principal)
- El formato de respuesta está documentado en la sección 8.1b
- Si este endpoint no funciona, ~los jugadores no pueden sincronizar el addon en WoW~

## Datos del instalador:
- Repositorio: github.com/mitzumitzukyh-code/ExiliumAddons
- Versión actual del addon: v4.4.5
- El instalador también genera ExiliumSyncData.lua (formato documentado en 8.1b)
- Token actual: Exilium_PvP_2025_xK9m (guardado en env.API_RATINGS_TOKEN)

## Lo que NO hay que tocar del instalador:
- El instalador es un .exe compilado que ya está distribuido a los jugadores
- Si cambias el formato de respuesta de /api/ratings, el instalador se rompe
- Si cambias el token, hay que recompilar y redistribuir el .exe
- La URL del endpoint SÍ cambió (de exilium-api-ratings a exilium-blizzard)
  → Los jugadores necesitarán una versión nueva del instalador que apunte a la nueva URL
  → O configurar un redirect/alias para mantener la URL vieja

---

*Exílium Guild PvP — US Region · Plan Final v3.1 · Abril 2026*
*10 jugadores inscritos actualmente · ~747 miembros en la guild*
