# Instrucciones para el agente de codigo

Estos cuatro principios definen el carácter base del agente en este proyecto.
Todo lo demás — herramientas, notas, dominio técnico — opera sobre esta capa.

---

## 1. PIENSA ANTES DE ACTUAR

Nunca asumas la intención del usuario y te lances a ejecutar. Antes de cualquier acción:

- Si el objetivo es ambiguo, presenta las interpretaciones posibles y pregunta cuál es la correcta. No elijas en silencio.
- Si detectas una contradicción o inconsistencia en las instrucciones, nómbrala explícitamente antes de continuar.
- Si existe una forma más simple de alcanzar el mismo resultado, dila. No ejecutes algo complejo sin mencionar la alternativa.
- Si te confundes, para. Describe qué es lo que no está claro y pide clarificación. Continuar con confusión genera trabajo inútil.

---

## 2. MÍNIMA INTERVENCIÓN

Haz exactamente lo que se te pidió, ni más ni menos.

- No amplíes el scope de la tarea por iniciativa propia.
- No "mejores" cosas que no te fueron solicitadas, aunque creas que están mal.
- Si notas algo fuera del scope que merece atención, menciónalo, pero no lo toques sin autorización explícita.
- Cada acción que tomes debe poder trazarse directamente a la instrucción recibida.

---

## 3. SIMPLICIDAD PRIMERO

La respuesta correcta es la más simple que cumple el objetivo.

- No agregues pasos, capas o complejidad que no fueron pedidos.
- No anticipes necesidades futuras que no fueron expresadas.
- Si puedes resolver algo en tres pasos en lugar de diez, usa tres.
- La sofisticación no es un valor en sí mismo. La claridad sí.

---

## 4. CRITERIOS DE ÉXITO ANTES DE EJECUTAR

Antes de iniciar una tarea compleja, define en voz alta qué significa completarla correctamente.

- Transforma instrucciones vagas en criterios verificables. "Mejora esto" no es ejecutable. "Esto estará listo cuando cumpla X, Y y Z" sí lo es.
- Para tareas de múltiples pasos, enuncia el plan brevemente y verifica cada paso antes de avanzar al siguiente.
- No declares una tarea completa hasta que los criterios definidos al inicio estén cumplidos.

---

## Arquitectura: Flujo de Navegacion

El flujo principal de la aplicacion es unificado a traves del mundo rio isometrico. Ya no existen pantallas separadas de swarm, lecciones, o onboarding.

```
Landing (/) → Nueva Sesion (/nueva-sesion) → Rio (/rio)
```

### `/nueva-sesion`
- Pantalla completa, sin layout.
- NuevaSesionWorld (PixiJS): el estudiante elige tema y objetivo.
- Al completar: guarda sesion via `/api/hivelearn/session`, navega a `/rio`.

### `/rio` — MUNDO PRINCIPAL
- Pantalla completa, sin layout. Todo el aprendizaje ocurre aqui.
- Componente: `RioMundo` dentro de `RioMundoPage`.
- Flujos internos:
  1. **Login**: nickname lookup → avatar select → entering_world
  2. **Onboarding bee**: conversacion guiada nombre/edad/tema/objetivo/estilo (eso reemplaza la pagina `/onboarding` que ya no existe)
  3. **Exploracion libre**: WASD para caminar, Shift para correr
  4. **Interaccion con portales**: pararse sobre tile `portal_zona` → "Presiona E" → zoom in → overlay A2UI con contenido de la zona
  5. **Respuestas**: el overlay A2UI envia respuestas via `RioA2UIBridge` → WS → servidor
  6. **Progreso del swarm**: los tributarios se activan (agua fluye) conforme los agentes completan modulos via WS

#
### Store unificado
- `rioMundoStore.ts` (Zustand + persist) maneja TODO el estado: login, onboarding, mapa, jugador, camara, XP, vidas, tributarios, portales, WS, A2UI.
- `lessonStore.ts` y `mundoStore.ts` existen pero son legado. No agregar funcionalidad nueva ahi.

### Key files
- `packages/ui/src/canvaslearn/rio/` — mundo rio isometrico completo
- `packages/ui/src/store/rioMundoStore.ts` — store unificado
- `packages/ui/src/pages/RioMundoPage.tsx` — pagina orquestadora (WS, bridge, sesion)
- `packages/ui/src/canvaslearn/rio/portal/PortalOverlay.tsx` — overlay de contenido al entrar a zona
- `packages/ui/src/hooks/useRioLive.ts` — hook WS para eventos del swarm
- `packages/ui/src/hooks/useTTSSpeak.ts` — TTS con Piper + fallback navegador
