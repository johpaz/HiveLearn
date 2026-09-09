# HiveLearn Desktop: activación institucional automática

## Objetivo

Entregar HiveLearn como una aplicación de escritorio instalable que incluya la interfaz, el gateway y HiveDB. El usuario del colegio no instalará Bun, Node.js, Rust ni configurará variables de entorno. En el primer arranque solo registrará la institución y la cuenta administradora; nunca verá un token técnico.

## Arquitectura aprobada

HiveLearn adoptará el patrón de Hive Desktop: una aplicación Tauri inicia un gateway compilado como sidecar, espera su endpoint de salud y abre la interfaz en una WebView. El gateway escucha únicamente en `127.0.0.1` sobre un puerto local disponible. Al cerrar la ventana se detiene el sidecar. Los datos viven en el directorio estable y separado de HiveLearn, por defecto `~/.hivelearn`.

El paquete incluirá:

- La interfaz React compilada.
- El gateway de HiveLearn compilado con Bun.
- El binding nativo de HiveDB para la plataforma.
- Iconos y metadatos nativos.
- El canal de activación local descrito abajo.

La primera entrega se construirá como RPM para Fedora. La estructura debe permitir añadir después DEB, Flatpak, MSI/EXE y DMG siguiendo la matriz de Hive Desktop.

## Activación local automática

En cada arranque, Tauri genera un secreto criptográficamente aleatorio en memoria. Lo entrega al gateway mediante el entorno privado del sidecar y a la WebView mediante el script de inicialización de Tauri. El valor no aparece en la URL, los logs ni HiveDB.

Cuando la instalación todavía no está configurada, la UI de escritorio presenta solamente:

- Nombre de la institución.
- Nombre del administrador.
- Usuario del administrador.
- Contraseña y confirmación.

La UI envía el secreto invisible en una cabecera específica. El gateway acepta esa vía solo para el endpoint de configuración inicial, si la base no contiene una institución y el secreto coincide. La operación existente que crea institución, cuenta y nombre de usuario continúa siendo atómica. Una vez creada la institución, cualquier configuración adicional es rechazada aunque el proceso aún conserve el secreto. El secreto desaparece al cerrar la aplicación.

El despliegue web conserva `HIVELEARN_SETUP_TOKEN` y su campo explícito; la confianza automática se habilita únicamente cuando el shell de escritorio proporciona el secreto interno.

## Estados y errores

Tauri mostrará un estado de arranque mientras espera el gateway. Si el sidecar termina, la base no puede abrirse o el endpoint de salud no responde dentro del plazo, la aplicación mostrará un mensaje nativo comprensible en lugar de una ventana vacía. El cierre de la app debe finalizar el gateway incluso durante el onboarding.

Las migraciones compatibles de HiveDB se ejecutan antes de abrir la base. Un fallo de migración o formato desconocido debe detener el arranque sin sustituir datos. Las copias de respaldo existentes se conservan.

## Seguridad

- Gateway limitado a loopback.
- Secreto efímero con suficiente entropía y comparación segura.
- Sin secreto en URLs, archivos o registros.
- Configuración inicial de un solo uso por estado persistido.
- Navegadores externos sin la cabecera interna no pueden reclamar una instalación de escritorio.
- Contraseña administrativa de 12 a 128 caracteres y hash Argon2id, como en el portal actual.

## Verificación

Las pruebas deben cubrir:

1. Primer arranque de escritorio sin campo de token.
2. Alta de institución y administrador mediante credencial interna.
3. Segundo arranque mostrando el acceso normal.
4. Rechazo desde un cliente sin el secreto interno.
5. Conservación del alta web con `HIVELEARN_SETUP_TOKEN`.
6. Cierre del sidecar al salir de Tauri.
7. Smoke test de la interfaz y el endpoint de salud.
8. Inspección del RPM para confirmar la inclusión del sidecar y del binding HiveDB.
9. Instalación y arranque en un perfil de usuario limpio de Fedora.

## Fuera del primer alcance

La primera implementación no incluye servicio central de licencias, activación por Internet, SSO, firma comercial de instaladores ni actualizaciones automáticas. Tampoco elimina el modo web/servidor existente.
