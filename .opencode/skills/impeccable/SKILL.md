---
name: impeccable
description: Usar cuando el usuario quiera diseñar, rediseñar, dar forma, criticar, auditar, pulir, clarificar, destilar, endurecer, optimizar, adaptar, animar, colorizar, extraer, o mejorar de cualquier manera una interfaz frontend. Cubre sitios, landing pages, dashboards, product UI, shells de apps, componentes, formularios, configuraciones, onboarding y estados vacíos. No para tareas solo de backend o sin UI.
---

# Impeccable — Design Language para Frontend de Producción

Diseña e itera interfaces frontend de grado producción. Código real funcional, decisiones de diseño comprometidas, craft excepcional.

## Setup (obligatorio antes de proceder)

1. **Lee el contexto del proyecto** — revisa al menos un archivo existente (CSS / tokens / tema / componente representativo). No reinventes la rueda; usa lo que ya existe cuando funcione.
2. **Identifica el registro**: ¿Es marketing / landing / portfolio (diseño ES el producto) → brand register? ¿O app UI / dashboard / tool (diseño SIRVE al producto) → product register?
3. **Si el proyecto es nuevo sin tokens de marca existentes**: genera un color semilla de marca como ancla para el color primario. Usa OKLCH para todo el palette.

---

## Reglas generales de diseño

### Color

- **Verifica contraste.** Texto body debe alcanzar ≥4.5:1 contra su fondo. Texto grande (≥18px o bold ≥14px) necesita ≥3:1. Placeholder text necesita el mismo 4.5:1.
- El fallo más común: texto gris muted sobre un near-white ligeramente tintado. Si el contraste es borderline, sube el color del body hacia el extremo oscuro.
- Texto gris sobre fondo de color queda lavado. Usa un tono más oscuro del mismo matiz del fondo, o una transparencia del color del texto.

### Tipografía

- **Cap longitud de línea body a 65-75ch.**
- **Jerarquía por escala + contraste de peso** (ratio ≥1.25 entre pasos). Evita escalas planas.
- **Máximo 3 font-families** (display + body + mono opcional). Más de 3 se lee como indecisión.
- **No pares fuentes similares pero no idénticas.** Para en un eje de contraste (serif + sans, geométrico + humanista).
- **No body copy en all-caps.** Reserva uppercase para labels cortos (≤4 palabras) y eyebrows usados con moderación.
- **Hero / display heading ceiling: clamp() max ≤ 6rem (~96px).** Por encima de eso la página grita, no diseña.
- **Display heading letter-spacing floor: ≥ -0.04em.** Más ajustado y las letras se tocan — cramped, no "diseñado". -0.02 a -0.03em es suficiente para grotesque display ajustado.
- Usa `text-wrap: balance` en h1-h3 para líneas uniformes; `text-wrap: pretty` en prosa larga para reducir huérfanas.

### Layout

- **Varía el espaciado para crear ritmo.**
- **Las cards son la respuesta lazy.** Úsalas solo cuando son verdaderamente el mejor affordance. Cards anidadas siempre están mal.
- **Flexbox para 1D, Grid para 2D.** No uses Grid por defecto cuando `flex-wrap` sería más simple.
- **Para grids responsive sin breakpoints:** `repeat(auto-fit, minmax(280px, 1fr))`.
- **Construye una escala semántica de z-index** (dropdown → sticky → modal-backdrop → modal → toast → tooltip). Nunca valores arbitrarios como 999 o 9999.

### Motion

- **Motion debe ser intencional, no un afterthought.** Considéralo parte del build desde el inicio.
- No animes propiedades CSS de layout a menos que sea verdaderamente necesario.
- **Ease out con curvas exponenciales** (ease-out-quart / quint / expo). No bounce, no elastic.
- **Reduced motion no es opcional.** Cada animación necesita alternativa `@media (prefers-reduced-motion: reduce)`.
- **Reveal animations deben mejorar un default ya visible.** No pongas visibilidad de contenido dependiente de una transición con clase; las transiciones se pausan en pestañas ocultas y la sección se puede quedar en blanco.
- Motion premium no es solo transform/opacity. Blur, backdrop-filter, clip-path, mask, y shadow/glow son parte de la paleta cuando mejoran materialmente el efecto.

### Interacción

- **Dropdowns con `position: absolute` dentro de `overflow: hidden`** serán recortados. Usa `<dialog>` nativo / popover API, `position: fixed`, o un portal para escapar el stacking context.
- **NUNCA animes elementos `<img>` en hover.** Esto incluye cualquier `transform` en `:hover` de una imagen, Y patrones `.group:hover .group-hover:scale` de Tailwind que animen una imagen hija vía hover del padre. Si una card necesita feedback de hover, anima el background, border o shadow de la card. Nunca la imagen.

### Copy

- **Cada palabra gana su lugar.** No repitas headings, no uses intros que repiten el título.
- **No em dashes.** Usa comas, dos puntos, punto y coma, puntos, o paréntesis. Tampoco `--`.
- **No copy con cadencia aforística.** No caigas en el ritmo de "declaración seria, luego negación corta contundente" como la voz recurrente de la página.
- **No marketing buzzwords:** streamline / empower / supercharge / leverage / unleash / transform / seamless / world-class / enterprise-grade / next-generation / cutting-edge / game-changer. Elige un sustantivo específico y un verbo que describa literalmente qué hace el producto.
- **Labels de botones: verbo + objeto.** "Save changes" supera a "OK"; "Delete project" supera a "Yes".
- **El texto de los links necesita significado standalone.** "View pricing plans" supera a "Click here".

---

## Solo para proyectos nuevos (cuando no existe trabajo previo)

### Color y Tema

- **Usa OKLCH.**
- **El body bg de crema / arena / beige es el default saturado AI de 2026.** Toda la banda de neutrales cálidos (OKLCH L 0.84-0.97, C < 0.06, hue 40-100) se lee como crema/arena/papel. Si el brief es "cálido, tradicional", NO lo traduzcas a un near-white tintado cálido; eso es el movimiento AI. Elige: (a) un color de marca saturado como body (terracota, oxblood, ochre profundo, near-black), (b) un off-white verdadero a chroma 0, o (c) un tono medio-oscuro tintado del propio matiz de la marca.
- **Neutrales tintados:** añade 0.005-0.015 chroma hacia el matiz de la marca. No tintes por defecto hacia cálido o frío "porque la marca se siente así".
- **Dark vs. light nunca es un default.** No dark "porque las tools se ven cool oscuras." Antes de elegir, escribe una oración del escenario físico: quién usa esto, dónde, bajo qué luz ambiental, en qué estado de ánimo.

---

## Prohibiciones absolutas

Si estás a punto de escribir alguno de estos, reescribe el elemento con estructura diferente.

- **Side-stripe borders.** `border-left` o `border-right` mayor a 1px como acento de color en cards, list items, callouts o alerts. Nunca intencional. Reescribe con bordes completos, tintes de fondo, números/iconos iniciales, o nada.
- **Gradient text.** `background-clip: text` combinado con un gradient background. Decorativo, nunca significativo. Usa un color sólido único.
- **Glassmorfismo como default.** Blurs y glass cards usados decorativamente. Raro y con propósito, o nada.
- **La plantilla hero-metric.** Número grande, label pequeño, estadísticas de soporte, acento gradiente. Cliché SaaS.
- **Card grids idénticas.** Cards del mismo tamaño con icono + heading + texto, repetidas infinitamente.
- **Eyebrow uppercase pequeño sobre cada sección.** El kicker de la era 2023 (texto all-caps pequeño con wide tracking, "ABOUT" "PROCESS" "PRICING" sobre cada heading) es ahora el scaffold saturado AI. Aparece en el 55-95% de las generaciones independientemente del brief. Un kicker nombrado como sistema de marca deliberado es voz; un eyebrow en cada sección es gramática AI.
- **Marcadores numerados de sección como scaffolding por defecto (01 / 02 / 03).** Los números ganan su lugar cuando la sección ES una secuencia y el orden lleva información que el lector necesita.
- **Texto que desborda su contenedor** en cualquier viewport. Siempre usa `overflow-wrap: break-word` o `hyphens: auto` en elementos de texto user-generated.
- **Empty state sin diseño.** Cada estado vacío necesita un encabezado, una oración de por qué está vacío, y una acción para salir de él. Nunca solo un contenedor sin contenido.
- **Imágenes sin dimensiones.** Siempre incluye `width` y `height` en elementos `<img>` o `aspect-ratio` en CSS para reservar espacio y eliminar CLS.
- **Iconos usados como elementos de diseño principales.** Los iconos son soporte. Una fila de 6 iconos de acento con texto debajo = layout perezoso. Usa tipografía, número, o imagen como element principal y el icono como soporte.

---

## Comandos principales

Cuando el usuario invoque con un sub-comando, sigue este flow:

| Comando | Qué hace |
|---|---|
| `/impeccable audit [target]` | Revisión completa contra reglas — formato `archivo:línea` |
| `/impeccable polish [target]` | Pase final antes de ship: espaciado, tipografía, contraste, estados |
| `/impeccable critique [target]` | Revisión de diseño UX: jerarquía visual, IA, carga cognitiva |
| `/impeccable bolder [target]` | Hace el diseño más bold/delightful sin romper la coherencia |
| `/impeccable quieter [target]` | Reduce ruido visual, enfoca la jerarquía |
| `/impeccable animate [target]` | Añade motion intencional y con propósito |
| `/impeccable typeset [target]` | Fija escala tipográfica, jerarquía y rhythm |
| `/impeccable arrange [target]` | Fija layout, espaciado y ritmo visual |

---

## Checklist antes de entregar

- [ ] Contraste de texto ≥ 4.5:1 en body, ≥ 3:1 en texto grande?
- [ ] Longitud de línea body capada a 65-75ch?
- [ ] Máximo 3 font-families?
- [ ] Hero heading ≤ 6rem clamp max?
- [ ] Display letter-spacing ≥ -0.04em?
- [ ] `text-wrap: balance` en h1-h3?
- [ ] Motion reduced media query implementado?
- [ ] Ningún `<img>` animado en hover?
- [ ] No gradient text?
- [ ] No side-stripe borders?
- [ ] No eyebrows en cada sección?
- [ ] No em dashes en ningún lugar?
- [ ] No marketing buzzwords en copy?
- [ ] Todos los estados vacíos diseñados?
- [ ] Todas las imágenes con dimensiones o aspect-ratio?
- [ ] Z-index escala semántica (no valores arbitrarios)?
