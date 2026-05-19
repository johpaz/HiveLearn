# Local LLM — Setup Real del Proyecto

Esta guía separa dos cosas que antes estaban mezcladas:

1. `HiveLearn Local LLM` administrado por la app.
2. `Local LLM (llama-server)` como proveedor OpenAI-compatible externo.

## Resumen

| Modo | Runtime real | Quién lo arranca | Uso |
|------|--------------|------------------|-----|
| HiveLearn Local LLM administrado | Binario oficial de `llama.cpp` descargado por HiveLearn | HiveLearn | Descarga modelos locales y ejecución integrada |
| Provider `local-llama` | `llama-server` externo | Usuario / systemd / script externo | Conectar un endpoint OpenAI-compatible en `http://localhost:8080/v1` |

---

## 1. HiveLearn Local LLM administrado

Este flujo ya no usa `hive-cli`. Ahora descarga el binario oficial de `llama.cpp` desde:

- `https://github.com/ggml-org/llama.cpp/releases`

HiveLearn detecta plataforma/backend y baja el paquete precompilado oficial correspondiente. En el estado actual del proyecto, el runtime administrado usa `llama.cpp` oficial como motor local.

### Qué descarga HiveLearn

- Binario oficial de `llama.cpp` para CPU / Vulkan / Metal / Windows según la máquina.
- Modelos GGUF locales soportados por HiveLearn.
- `mmproj-BF16.gguf` cuando el modelo requiere multimodalidad.

### Modelos locales actuales

| ID | Modelo | Tipo | Tamaño aprox |
|----|--------|------|--------------|
| `e2b_Q4_K_XL` | Gemma 4 E2B Q4_K_XL | multimodal | ~5 GB + 1 GB mmproj |
| `e4b_Q4_K_XL` | Gemma 4 E4B Q4_K_XL | multimodal | ~8 GB + 1 GB mmproj |
| `26b_a4b_Q4_K_M` | Gemma 4 26B-A4B Q4_K_M | multimodal | ~15-16 GB + 1 GB mmproj |
| `31b_Q4_K_XL` | Gemma 4 31B Q4_K_XL | multimodal | ~19-20 GB + 1 GB mmproj |

### Qué significa “modelos MTP” aquí

En este repo, `supportsMTP: true` indica que el modelo está catalogado como compatible con flujos MTP/speculative decoding en `llama.cpp`.

Eso no significa automáticamente que HiveLearn ya esté corriendo ese modelo con flags MTP activos en todas las rutas. Significa:

- el modelo está marcado como apto para MTP;
- el runtime base esperado es `llama.cpp`;
- la compatibilidad efectiva depende de la versión descargada del binario oficial y de que la ruta de ejecución use los flags MTP necesarios.

Si el proyecto expone flags como `--spec-type mtp`, `--spec-draft-n-max` o `--spec-draft-ngl`, entonces el binario oficial debe ser suficientemente reciente para soportarlos.

### Primer arranque y arranques posteriores

Comportamiento esperado para el flujo administrado:

1. La primera vez, el usuario entra a HiveLearn Config y dispara manualmente la instalación del runtime oficial.
2. HiveLearn descarga el binario oficial de `llama.cpp`.
3. Luego se descargan los modelos locales que el usuario elija.
4. Después de esa primera preparación manual, cuando se arranque el servidor de Hive/HiveLearn, el Local LLM administrado debería poder arrancar solo usando el runtime ya instalado.

En otras palabras:

- primera vez: instalación/manual;
- siguientes veces: reutilización automática del runtime al iniciar el server.

### Flujo recomendado

1. Abrir `HiveLearn -> Configuración`.
2. Instalar runtime oficial de `llama.cpp`.
3. Descargar uno o más modelos locales.
4. Aplicar el modelo al enjambre.
5. En siguientes arranques del server principal, reutilizar el runtime ya instalado.

---

## 2. Provider externo `Local LLM (llama-server)`

Este modo es distinto del administrado. Aquí Hive no descarga ni controla el runtime: tú levantas `llama-server` por fuera y Hive se conecta a `http://localhost:8080/v1`.

### Datos del provider

| Propiedad | Valor |
|-----------|-------|
| Provider ID | `local-llama` |
| Nombre | `Local LLM (llama-server)` |
| Base URL | `http://localhost:8080/v1` |
| API Key | No requerida |
| Tipo | OpenAI-compatible |

### Arranque manual de `llama-server`

```bash
./llama-server \
  --model /ruta/al/modelo.gguf \
  --port 8080 \
  --jinja \
  --ctx-size 32768
```

Verificación:

```bash
curl http://localhost:8080/health
curl http://localhost:8080/v1/models
```

### Configurar en Hive

1. Ir a `Providers`.
2. Activar `Local LLM (llama-server)`.
3. Ejecutar `Sync Models`.
4. Seleccionar el modelo detectado.
5. Guardar la configuración.

Este modo sigue siendo útil cuando:

- ya tienes tu propio `llama-server`;
- quieres gestionar tú mismo puertos, flags y procesos;
- necesitas exponer una API OpenAI-compatible local a varias herramientas.

---

## 3. Diferencia práctica entre ambos modos

### Modo administrado por HiveLearn

- usa binario oficial de `llama.cpp` descargado por la app;
- vive dentro del flujo local de HiveLearn;
- la primera instalación es manual;
- después el runtime instalado debe poder reutilizarse automáticamente.

### Modo provider `llama-server`

- usa un proceso externo a HiveLearn;
- Hive solo consume su API;
- el arranque del proceso no lo hace Hive, lo hace el usuario o su supervisor de procesos.

---

## 4. Notas operativas

- Si el runtime oficial de `llama.cpp` no está instalado, el flujo administrado no podrá generar.
- Si `llama-server` no está corriendo en `localhost:8080`, el provider `local-llama` no podrá sincronizar modelos.
- No mezclar conceptualmente ambos flujos en soporte o documentación: uno es “runtime administrado por HiveLearn” y el otro es “endpoint OpenAI-compatible externo”.
