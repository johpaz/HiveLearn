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
  2. **Onboarding bee**: conversacion guiada,  saluda por   y pregunta por tema/objetivo/estilo se guarda en la bd,  si existe se saluda con el nombre y se pregunta tema/objetivo / estilo y crea la sesion en bd por ws.) Debe tener boton de salir y el boton de config sonidos,etc. Al terminar se envia la inforamcion al agente coordinador para iniciar el recorrido de creacion del programa del alumno.
  3. **Creacion del programa (Swarm Tour)**: Después del onboarding, la abeja coordinadora guía al alumno a través del mundo para conocer a cada agente del swarm. El coordinador va narrando qué hace cada agente entegando la tarea a cada agente para ir construyendo el programa.(Perfil, Intención, Estructura, Ejercicios, etc.) mientras el alumno camina hacia ellos. Cada agente muestra una burbuja explicando su rol. Este tour termina cuando se han visitado todos los agentes relevantes y entrega el programa terminado y guardado en bd.Usa las skills para entender como se incluyen las burbujas de los personajes,  movimientos, control de sonidos , efectos y demas soluciones para que el juego sea funcional y el agente se comunique con A2UI. para que cree el contenido del programa y lo envie al juego.
  4. **Exploracion libre**: programa enviado por el coordinador a los otros mundos para que el alumno termine el programa para movimiento usar WASD para caminar, Shift para correr,debe tener indicador de conexion a ws con la velocidad y garantizar el movimiento acciones dentro de cada mundo y etapa del programa o pregunta quiz, etc.
  4. **Interaccion con portales**: pararse sobre tile `portal_zona` → "Presiona E" → zoom in → overlay A2UI con contenido de la zona,debe tener indicador de conexion a ws con la velocidad. Usa las skills de pixi para garantizar el movimiento entre mundos zoom , sonidos, efecto , etc.
  5. **Respuestas**: el overlay A2UI envia respuestas via `RioA2UIBridge` → WS → servidor,debe tener indicador de conexion a ws con la velocidad.Usa las skills de pixi para garantizar el movimiento entre mundos zoom , sonidos, efecto , etc.
  6. **Progreso del swarm**: los tributarios se activan (agua fluye) conforme los agentes completan modulos via WS,debe tener indicador de conexion a ws con la velocidad.Usa las skills de pixi para garantizar el movimiento entre mundos zoom , sonidos, efecto , etc.

#
### Store unificado
- `rioMundoStore.ts` (Zustand + persist) maneja TODO el estado: login, onboarding, mapa, jugador, camara, XP, vidas, tributarios, portales, WS, A2UI, pero debe guardarse en la bd debe mostrar opcion de salir de la sesion del juego queda almacenado el avance en la bd.
- `lessonStore.ts` y `mundoStore.ts` existen pero son legado. No agregar funcionalidad nueva ahi, depregado eliminar.

### Swarm Tour (Creación del Programa)
Después del onboarding, el coordinador guía al alumno a través del mundo para presentar a cada agente del swarm antes de iniciar la generación del programa:

1. **Inicio del tour**: La abeja coordinadora (`hl-coordinator-agent`) se posiciona cerca del jugador y entra en estado `guiding`.
2. **Navegación guiada**: El coordinador vuela adelante del jugador hacia la ubicación del siguiente agente. El jugador puede seguirla caminando o ser teletransportado automáticamente.
3. **Presentación de cada agente**: Al llegar a un agente (ej. `hl-profile-agent`, `hl-intent-agent`, `hl-structure-agent`):
   - El agente muestra una burbuja de diálogo flotante explicando su rol.
   - El coordinador narra en voz (TTS) qué hace ese agente.
   - Ejemplo: "Este es el Agente de Perfil. Se encarga de analizar tus datos y adaptar el contenido a tu estilo de aprendizaje."
4. **Progreso visual**: Cada agente visitado cambia de estado a `completed` (check verde). Los agentes pendientes parpadean en amarillo.
5. **Finalización del tour**: Después de visitar todos los agentes principales (`profile`, `intent`, `structure`, `explanation`, `exercise`, `quiz`, `challenge`, `feedback`):
   - El coordinador celebra con una animación.
   - Se inicia automáticamente la generación del programa (`iniciar_generacion` vía WS).
   - El alumno ve la barra de progreso del swarm mientras los agentes trabajan.
6. **Transición a exploración**: Una vez completado el swarm, los tributarios se activan y el alumno puede explorar libremente.

**Implementación clave**:
- Las abejas del swarm (`RioSwarmBees`) ya están posicionadas en el mundo cerca de cada portal/tributario.
- El coordinador usa `beeState = 'guiding'` para volar adelante del jugador.
- Las burbujas de diálogo (`RioDialog`) se posicionan sobre cada agente durante la presentación.
- El tour debe ser skipeable (botón "Saltar" para ir directo a la generación).
- Los eventos del swarm (`swarm_started`, `agent_started`, `agent_completed`) ya fluyen por `/hivelearn-events`.


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
