---
name: web-design-guidelines
description: Revisa código UI para cumplimiento con Web Interface Guidelines. Usar cuando se pida "revisar mi UI", "revisar accesibilidad", "auditar diseño", "revisar UX", o "revisar mi sitio contra buenas prácticas".
argument-hint: <archivo-o-patrón>
---

# Web Interface Guidelines — Auditoría de UI

Revisa archivos en busca de cumplimiento con los Web Interface Guidelines de Vercel.

## Cómo funciona

1. Obtén las últimas guidelines de la fuente oficial:
   ```
   https://raw.githubusercontent.com/vercel-labs/web-interface-guidelines/main/command.md
   ```
   Usa `fetch` o `WebFetch` para obtener las reglas actualizadas antes de cada revisión.

2. Lee los archivos especificados (o pregunta al usuario qué archivos revisar).

3. Aplica TODAS las reglas de las guidelines obtenidas.

4. Entrega los hallazgos en formato `archivo:línea` conciso.

## Áreas que cubre (100+ reglas)

### Accesibilidad
- Atributos ARIA correctos
- Estados de focus visibles
- Inputs con labels
- Tamaños de touch targets (mínimo 44x44px)
- Soporte de reduced-motion
- HTML semántico
- Navegación por teclado
- Jerarquía de encabezados

### Calidad UI / UX
- Contraste de colores (WCAG AA mínimo)
- Texto legible (tamaño, line-height, line-length)
- Estados de carga, error y vacío
- Feedback táctil en botones e interactivos
- Comportamiento responsive

### Performance
- Imágenes optimizadas
- Fuentes con `font-display: swap`
- Animaciones en `transform` y `opacity` únicamente

## Formato de output

Reporta hallazgos así:

```
casino-preview.html:142  WCAG AA contrast fail — .btn-secondary text #999 on #fff (ratio 2.8:1, need 4.5:1)
casino-preview.html:89   Missing aria-label on icon button ".btn-close"
casino-preview.html:201  Touch target too small — .chip height 28px (min 44px required)
casino-preview.html:315  No :focus-visible state on .tab-btn
casino-preview.html:88   Input ".search-input" missing associated <label>
```

## Instrucciones de uso en OpenCode

Cuando el usuario pida una revisión:

```
usa el skill web-design-guidelines para auditar deploy/casino-preview.html
```

El agente debe:
1. Obtener las guidelines actualizadas de la URL arriba
2. Leer el archivo especificado
3. Revisar contra TODAS las reglas
4. Reportar en formato `archivo:línea`
5. Priorizar por severidad: errores de accesibilidad primero, luego UX, luego polish

## Notas importantes

- Las guidelines se obtienen en tiempo real — siempre están actualizadas
- Si no se especifican archivos, pregunta al usuario cuáles revisar
- Reporta solo problemas reales, no sugerencias subjetivas
- Para cada problema, incluye la regla violada y cómo corregirla
