---
name: design-taste-frontend
description: Anti-slop frontend skill para landing pages, portfolios y rediseños. Lee el brief, infiere la dirección de diseño correcta, y produce interfaces que no se ven como plantillas. Audita primero en rediseños, chequeo pre-vuelo estricto.
---

# tasteskill: Anti-Slop Frontend Skill

> Landing pages, portfolios y rediseños. No dashboards, no tablas de datos, no UI de producto multi-paso.
> Cada regla abajo es **contextual**. Ninguna se activa automáticamente. Primero lee el brief, luego aplica lo que encaje.

---

## 0. INFERENCIA DE BRIEF (Lee el contexto antes de todo)

Antes de tocar código, **infiere qué quiere el usuario**. La mayoría del mal output de diseño IA ocurre porque el modelo salta a una estética por defecto en vez de leer el contexto.

### 0.A Lee estas señales primero

1. **Tipo de página**: landing (SaaS / consumer / agencia / evento), portfolio (dev / diseñador / estudio), rediseño (preservar vs renovar), editorial / blog.
2. **Palabras de vibe** que usó el usuario: "minimalista", "calm", "estilo Linear", "Awwwards", "brutalista", "premium consumer", "Apple-y", "juguetón", "B2B serio", "editorial", "glassy", "dark tech".
3. **Señales de referencia**: URLs que enlazaron, screenshots que pegaron, productos que nombraron, marcas con las que compiten.
4. **Audiencia**: panel de compras B2B vs. consumidor consciente del diseño vs. reclutador escaneando un portfolio.
5. **Assets de marca existentes**: logo, color, tipografía, fotografía. Para rediseños, estos son material de partida.
6. **Restricciones silenciosas**: audiencias accessibility-first, sector público, industrias reguladas, comercio de confianza, productos para niños. Estas restricciones ANULAN la preferencia estética.

### 0.B Declara un "Design Read" de una línea antes de generar

Antes de cualquier código, declara: **"Leyendo esto como: <tipo de página> para <audiencia>, con un lenguaje <vibe>, inclinándome hacia <sistema de diseño o familia estética>."**

### 0.C Si el brief es ambiguo, haz UNA pregunta, no adivines

Haz exactamente **una** pregunta de clarificación. Si puedes inferir del contexto con confianza, **no preguntes**. Solo declara el design read y procede.

### 0.D Anti-Default Discipline

No por defecto: gradientes AI-purple, hero centrado sobre mesh oscuro, tres feature cards iguales, glassmorfismo genérico en todo, micro-animaciones en loop infinito en todas partes, Inter + slate-900. Estos son los defaults del LLM. Supéralos deliberadamente.

---

## 1. LOS TRES DIALES (Configuración base)

Después del design read, establece tres diales. Cada decisión de layout, motion y densidad está controlada por estos.

- **`DESIGN_VARIANCE: 8`** — 1 = Simetría perfecta, 10 = Caos artístico
- **`MOTION_INTENSITY: 6`** — 1 = Estático, 10 = Cinemático / Física
- **`VISUAL_DENSITY: 4`** — 1 = Art Gallery / Aireado, 10 = Cockpit / Datos densos

**Baseline:** `8 / 6 / 4`. Usa estos a menos que el design read los anule.

### Inferencia de diales por señal

| Señal | VARIANCE | MOTION | DENSITY |
|---|---|---|---|
| "minimalista / limpio / calm / editorial / estilo Linear" | 5-6 | 3-4 | 2-3 |
| "premium consumer / Apple-y / luxury / marca" | 7-8 | 5-7 | 3-4 |
| "juguetón / Dribbble / Awwwards / experimental / agencia" | 9-10 | 8-10 | 3-4 |
| "landing page / portfolio / sitio de marketing (default)" | 7-9 | 6-8 | 3-5 |
| "trust-first / sector público / regulado / accessibility-critical" | 3-4 | 2-3 | 4-5 |

---

## 2. DIRECTIVAS DE DISEÑO (Corrección de sesgos)

Los LLMs por defecto van a clichés. Anula estos defaults proactivamente.

### 2.1 Tipografía

- **Display / Headlines:** Default `text-4xl md:text-6xl tracking-tighter leading-none`.
- **Body / Párrafos:** Default `text-base text-gray-600 leading-relaxed max-w-[65ch]`.
- **Fuente sans:** Desaconsejado como default: `Inter`. Elige `Geist`, `Outfit`, `Cabinet Grotesk`, `Satoshi` primero.
- **SERIF DISCIPLINE (MUY DESACONSEJADO como default):** Serif solo cuando UNA de estas es explícitamente verdad:
  - El brief nombra literalmente una fuente serif, O
  - La familia estética es genuinamente editorial / luxury / publicación / herencia / vintage
- **ESPECÍFICAMENTE PROHIBIDAS como defaults:** `Fraunces` e `Instrument_Serif` (los dos display serifs favoritos del LLM).
- Usa `text-wrap: balance` en h1-h3; `text-wrap: pretty` en prosa larga.
- **Display letter-spacing floor: ≥ -0.04em.** Más ajustado y las letras se tocan.

### 2.2 Color

- Máximo 1 color de acento. Saturación < 80% por default.
- **REGLA LILA:** El gradiente AI-purple está desaconsejado. No button glows automáticos, no gradientes neon aleatorios.
- **UN palette por proyecto.** No mezcles grises cálidos y fríos en el mismo proyecto.
- **COLOR CONSISTENCY LOCK:** Una vez elegido un color de acento, se usa en TODA la página.
- **PALETTE PREMIUM-CONSUMER PROHIBIDA:** Para briefs premium-consumer, está prohibido el default AI de beige/crema + latón/arcilla/oxblood + texto espresso. Alternativas: Cold Luxury (silver-grey + chrome), Forest (verde profundo + bone + amber), Black and Tan, Cobalt + Cream.

### 2.3 Layout

- **ANTI-CENTER BIAS:** Heros centrados se evitan cuando `DESIGN_VARIANCE > 4`. Fuerza "Split Screen", "Left-aligned content / right-aligned asset", o "Asimétrico".
- **ZIGZAG ALTERNATION CAP:** Máximo 2 secciones seguidas con patrón imagen+texto dividido. La 3ra es un Pre-Flight Fail.
- **Section-Layout-Repetition Ban:** Una familia de layout puede aparecer como máximo UNA VEZ en la página.

### 2.4 Cards y Sombras

- Usa cards SOLO cuando la elevación comunica jerarquía real.
- Cuando se usa sombra, tínela al tono del fondo. No sombras puras negras sobre fondos claros.
- **SHAPE CONSISTENCY LOCK:** Elige UN sistema de border-radius para la página y mantenlo.

### 2.5 Estados interactivos

- **Loading:** Skeletal loaders. No spinners circulares genéricos.
- **Empty States:** Composición bella; indica cómo rellenarlos.
- **Tactile Feedback:** En `:active`, usa `-translate-y-[1px]` o `scale-[0.98]`.
- **BUTTON CONTRAST CHECK:** Verifica que el texto del botón sea legible contra su fondo. WCAG AA mínimo (4.5:1).
- **CTA BUTTON WRAP BAN:** El texto del botón DEBE caber en una línea en desktop.
- **NO DUPLICATE CTA INTENT:** Dos CTAs con el mismo intento en una página es un Pre-Flight Fail.

---

## 3. AI TELLS (Patrones Prohibidos)

Evita estas firmas a menos que el brief las pida explícitamente.

### 3.A Visual y CSS

- **NO neon / outer glows** por default.
- **NO negro puro (`#000000`).** Off-black, zinc-950, o charcoal.
- **NO texto con gradiente** en headers grandes.

### 3.B Tipografía

- **EVITAR Inter como default.**
- **NO H1s sobredimensionados** que solo "gritan". Controla la jerarquía con peso + color.

### 3.C Layout

- **NO 3 feature cards iguales horizontales.** Usa zigzag 2 columnas, grid asimétrico, scroll-pinned, u horizontal-scroll.

### 3.D Contenido ("Efecto Jane Doe")

- **NO nombres genéricos.** "John Doe", "Sarah Chan" → usa nombres creativos, realistas.
- **NO avatares genéricos.** No SVG "egg" o íconos de usuario Lucide.
- **NO números perfectos falsos.** Evita `99.99%`, `50%`, `1234567`. Usa datos orgánicos (`47.2%`).
- **NO nombres de marca startup-slop.** "Acme", "Nexus", "SmartFlow" → inventa nombres contextuales y premium.
- **NO verbos de relleno.** "Elevar", "Seamless", "Desbloquear", "Next-Gen" → solo verbos concretos.

### 3.E Patrones específicos prohibidos

- **NO div-based fake product UI en el hero.** No listas de tareas falsas, no terminales falsos, no dashboards construidos con `<div>` rectangles. Es el Tell #1 de diseño IA.
- **NO fake version footers** ("v0.6.2-rc.1", "last sync 4s ago") dentro de fake screenshots.
- **NO "Quietly in use at"** headers de prueba social. Usa: "Trusted by", "Used at", "Customers include".
- **NO scroll cues.** `Scroll`, `↓ scroll`, `Scroll to explore` → el usuario sabe scrollear.
- **NO section-numbering eyebrows.** `00 / INDEX`, `001 · Capabilities` → prohibido.
- **NO decorative colored status dots** en cada item de lista/nav/badge.

### 3.F BAN DEL EM-DASH (el Tell más violado)

**El em-dash (`—`) está COMPLETAMENTE prohibido.** Es el tic estilístico de firma del LLM.

- Prohibido en headlines. Usa punto o coma.
- Prohibido en eyebrows / labels / pills / texto de botones.
- Prohibido en body copy. Reestructura la frase: dos oraciones con punto, coma, paréntesis o dos puntos.
- Prohibido en atribuciones de citas. Usa guion normal (`-`) o salto de línea.

Si tu output contiene un solo `—` visible para el usuario, el output falla el Pre-Flight Check.

---

## 4. ACCESIBILIDAD Y PERFORMANCE

### 4.A Solo anima `transform` y `opacity`

Estas propiedades saltan layout y paint, corriendo en la GPU.

### 4.B Reduced Motion (obligatorio)

- **Cualquier motion por encima de `MOTION_INTENSITY > 3` DEBE respetar `prefers-reduced-motion`.**
- En CSS: `@media (prefers-reduced-motion: reduce)` con alternativa estática.

### 4.C Dark Mode (obligatorio para páginas consumer)

- Diseña para AMBOS modos desde el inicio.
- Usa Tailwind `dark:` variant O CSS variables. Una estrategia por proyecto.
- **No `#000000` puro y no `#ffffff` puro** — usa off-black y off-white.

### 4.D Core Web Vitals

- **LCP** < 2.5s. Hero image debe ser `priority` o preloaded.
- **CLS** < 0.1. Reserva espacio para imágenes, fuentes, embeds.

---

## 5. CHECKLIST PRE-FLIGHT FINAL

Ejecuta esta lista antes de entregar código. **NO ES OPCIONAL.**

- [ ] Design Read declarado (una línea antes del código)?
- [ ] Diales explícitos y razonados desde el brief?
- [ ] **CERO em-dashes (`—`) en ningún lugar de la página?**
- [ ] Page Theme Lock: UN tema (light, dark, o auto) para toda la página?
- [ ] Color Consistency Lock: un color de acento usado en todas las secciones?
- [ ] Shape Consistency Lock: un sistema de border-radius consistente?
- [ ] Button Contrast Check: todo texto de CTA legible contra su fondo (WCAG AA)?
- [ ] CTA Button Wrap: ningún label de CTA hace wrap en desktop?
- [ ] Hero cabe en el viewport: headline ≤ 2 líneas, subtexto ≤ 20 palabras, CTA visible sin scroll?
- [ ] EYEBROW COUNT: instancias de `uppercase tracking` ≤ ceil(sectionCount / 3)?
- [ ] No Duplicate CTA Intent en la página?
- [ ] No div-based fake product UI en el hero?
- [ ] No section-numbering eyebrows?
- [ ] No scroll cues?
- [ ] No decorative status dots?
- [ ] Motion motivado: cada animación justificable en una oración?
- [ ] Reduced motion implementado para MOTION_INTENSITY > 3?
- [ ] Dark mode tokens definidos y testeados en ambos modos?
- [ ] Mobile collapse explícito en layouts multi-columna?
- [ ] No AI Tells de la sección 3 (Inter como default, AI-purple, tres cards iguales, Jane Doe)?
