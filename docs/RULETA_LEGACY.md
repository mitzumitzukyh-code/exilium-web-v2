# Ruleta antigua (LEGACY) — no usar como la ruleta nueva

`deploy/sala-pandacoins-standalone.html` (rueda en SVG, dragones, `ruleta-madera.png`,
`pandadragon.png`, `celebration.mp4`; fuente editable en `casino-build/`) es la **ruleta antigua**.

Decision del dueño (2026-11-09): **no es la ruleta 3D nueva**.

- Se conserva sin cambios de comportamiento porque es lo que sirve hoy produccion
  (`api.guild-exilium.com`, WebSocket, asientos, apuestas, chat).
- No tomarla como base de la ruleta nueva ni como "fuente de la verdad" de la ruleta 3D.
- La ruleta 3D nueva **no esta en este repo ni en su historial** (busqueda 2026-11-09:
  sin Three.js/WebGL en ninguna rama). Hay que recuperarla del PC del dueño o de un deploy anterior.
- No renombrar ni borrar este archivo sin decision del dueño: el workflow de Pages y el
  smoke test dependen de esa ruta.
