# Ruleta Exilium Guild

**Version vigente:** `deploy/sala-pandacoins-standalone.html` — ruleta 3D (Three.js + GSAP),
recuperada del deploy de Cloudflare Pages `1a072343` (10-ago-2026). Usa `api.guild-exilium.com`
(HTTP y WebSocket `/api/casino/ws`) y estos assets: `assets/ruleta/*`, `assets/casino/*`,
`assets/audio/giro-ruleta.mp3`, `assets/vendor/{three,gsap}.min.js`, `assets/Nuevo-fondo.png`,
`assets/celebration-nuevo.mp4` y `assets/decorations/*`.

**Version antigua (NO usar):** `casino-build/legacy/ruleta-antigua-svg.html` — rueda SVG plana con
dragones. Se conserva solo como respaldo; no esta en `deploy/`, asi que no se publica.
`casino-build/*.template.html` es la fuente editable de esa version antigua.

Regla: la ruleta vigente debe vivir en git. Nunca desplegar `deploy/` desde un disco que tenga
archivos sin commit (ver README > Despliegue).
