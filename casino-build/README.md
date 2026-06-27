# casino-build — fuente editable del bundle del casino

`deploy/sala-pandacoins-standalone.html` es la **versión única y oficial del casino**: un
**bundle** (~520 KB) del diseño "Ruleta Exilium Guild" mejorado (asientos arriba, tamaños,
hover de iluminación), generado por una herramienta de diseño (`x-dc`/`DCLogic` + React, JSX
transpilado en el navegador). Toda la app vive en un `<script type="text/x-dc">` empaquetado
como JSON dentro de `<script type="__bundler/template">`.

Editar el bundle a mano es inviable (líneas gigantes + assets base64). Por eso aquí está la
**plantilla legible** y el **re-empaquetador**.

## Archivos

- `sala-pandacoins.template.html` — plantilla legible. La clase `Component`
  (`<script type="text/x-dc">`) está **cableada al backend** (polling, seat/bet/ready/chat,
  rueda server-side). La barra superior (`exi-extras-js`) tiene login Discord + "Mi Perfil".
- `component.js` — copia de referencia de la clase `Component` cableada.
- `repack.js` — re-inserta la plantilla editada en el bundle, escapando `</script>` → `<\/script>`
  igual que el bundler original. Verifica roundtrip semántico antes de escribir.
- `sala-pandacoins.maqueta.html` — **backup de la maqueta** (diseño sin cablear) para rollback.

## Flujo de edición

1. Edita `sala-pandacoins.template.html` (normalmente la clase `Component`).
2. Re-empaqueta sobre el bundle de producción:

   ```bash
   node casino-build/repack.js \
     deploy/sala-pandacoins-standalone.html \
     casino-build/sala-pandacoins.template.html \
     deploy/sala-pandacoins-standalone.html
   ```

3. Verifica en navegador y despliega (Pages).

## Rollback a la maqueta (diseño sin cablear)

```bash
cp casino-build/sala-pandacoins.maqueta.html deploy/sala-pandacoins-standalone.html
```

## Contrato de API que consume el frontend

Backend `https://exilium-blizzard.mitzumitzukyhs.workers.dev`, auth `Authorization: Bearer <exi_tk>`.

- `GET /api/casino/state` — polling (estado, asientos, chat, historial, `me`, `my_seat`, `config`).
- `POST /api/casino/seat` `{action:'sit'|'stand'}`, `/bet` `{bets:[{bet_key,amount}]}`, `/ready`,
  `/clear-bets`, `/chat` `{message}`.
- `GET /api/casino/me`, `/api/casino/my-transactions`, `/api/casino/leaderboard` (usados por el perfil).

Mapeo de claves de apuesta UI↔backend (`keyToServer`/`keyFromServer`):
`red→color:red`, `even→parity:even`, `low→half:low`; `dozen:N`/`col:N`/`number:N` sin cambio.
