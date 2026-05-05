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
Landing (/) → Nueva Sesion → Rio (/rio) siempre conectada al ws
```


### `/rio` — MUNDO PRINCIPAL
- Pantalla completa, sin layout. Todo el aprendizaje ocurre aqui.
- Componente: `RioMundo` dentro de `RioMundoPage`. conectada al ws sin sesion.
- Flujos internos:
  1. **Login**: nickname lookup(si existe traer los datos y pasarlos al storage para crear la sesion, se crea en la otra pantalla de juego, si no existe entra al avatar select y crea alumno) → avatar select → entering_world aca se hacen las preguntas de que quiere aprender y para que, guarda la sesion inicia el juego, debe tener indicador de conexion a ws con la velocidad.
  2. **Onboarding bee**: conversacion guiada,  saluda por   y pregunta por tema/objetivo/estilo se guarda en la bd,  si existe se saluda con el nombre y se pregunta tema/objetivo / estilo y crea la sesion en bd por ws.) Debe tener boton de salir y el boton de config sonidos,etc.
  3. **Creacion del programa** Aca entran los agentes a crear el programa con la interaccion del alumno. Termina y guarda en la bd el programa en bd para persistencia. Y a Jugar aprendiendo.
  3. **Exploracion libre**: WASD para caminar, Shift para correr,debe tener indicador de conexion a ws con la velocidad.
  4. **Interaccion con portales**: pararse sobre tile `portal_zona` → "Presiona E" → zoom in → overlay A2UI con contenido de la zona,debe tener indicador de conexion a ws con la velocidad.
  5. **Respuestas**: el overlay A2UI envia respuestas via `RioA2UIBridge` → WS → servidor,debe tener indicador de conexion a ws con la velocidad.
  6. **Progreso del swarm**: los tributarios se activan (agua fluye) conforme los agentes completan modulos via WS,debe tener indicador de conexion a ws con la velocidad.

#
### Store unificado
- `rioMundoStore.ts` (Zustand + persist) maneja TODO el estado: login, onboarding, mapa, jugador, camara, XP, vidas, tributarios, portales, WS, A2UI, pero debe guardarse en la bd debe mostrar opcion de salir de la sesion del juego queda almacenado el avance en la bd.
- `lessonStore.ts` y `mundoStore.ts` existen pero son legado. No agregar funcionalidad nueva ahi, depregado eliminar.


### Key files
- `packages/ui/src/canvaslearn/rio/` — mundo rio isometrico completo conexion por ws siempre sin sesion es solo la conexion al juego.
- `packages/ui/src/store/rioMundoStore.ts` — store unificado
- `packages/ui/src/pages/RioMundoPage.tsx` — pagina orquestadora (WS, bridge, sesion)
- `packages/ui/src/canvaslearn/rio/portal/PortalOverlay.tsx` — overlay de contenido al entrar a zona
- `packages/ui/src/hooks/useRioLive.ts` — hook WS para eventos del swarm
- `packages/ui/src/hooks/useTTSSpeak.ts` — TTS con Piper + fallback navegador

## Infraestructura y Puertos

- **Puerto del servidor (backend/gateway): 8787** — NO MODIFICAR. El CLI (`packages/cli`) siempre usa este puerto.
- **Puerto del Vite dev server: 5173** — Configurado en `packages/ui/vite.config.ts` con proxy a `localhost:8787`.
- Assets estáticos (audio, imágenes) se sirven desde `packages/ui/public/` y se copian a `dist/` en build.
