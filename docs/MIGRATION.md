# Migración de API Keys a Bun.secrets

## Resumen

Las API keys de los providers ahora se guardan de forma segura usando **`Bun.secrets`**, que utiliza el almacenamiento nativo del sistema operativo:

- **macOS**: Keychain Services
- **Windows**: Windows Credential Manager (DPAPI)
- **Linux**: libsecret (GNOME Keyring / KWallet)

## Cambios Realizados

### Nuevos Archivos
- `packages/core/src/secrets/provider-secrets.ts` - Módulo para gestionar API keys con Bun.secrets
- `scripts/migrate-api-keys.ts` - Script para migrar keys desde la BD
- `scripts/migrate-schema.ts` - Script para eliminar columnas de encriptación

### Archivos Modificados
- `packages/core/src/gateway/server.ts` - Usa `Bun.secrets` en lugar de encrypt/decrypt
- `packages/core/src/agent/llm-client.ts` - Obtiene API keys desde `Bun.secrets`
- `packages/core/src/storage/schema.ts` - Elimina columnas de encriptación del schema
- `packages/core/src/storage/init.ts` - Elimina columnas de encriptación de init
- `package.json` - Agrega scripts de migración

## Proceso de Migración

Si ya tienes API keys guardadas en la base de datos, sigue estos pasos:

### Paso 1: Migrar API Keys a Bun.secrets

```bash
bun run migrate:api-keys
```

Este script:
1. Lee las API keys encriptadas desde la BD
2. Las desencripta usando `decryptApiKey`
3. Las guarda en `Bun.secrets` (keychain del SO)

### Paso 2: Migrar Schema (eliminar columnas)

```bash
bun run migrate:schema
```

⚠️ **IMPORTANTE**: Ejecuta este script **DESPUÉS** de `migrate:api-keys`

Este script:
1. Elimina las columnas `api_key_encrypted`, `api_key_iv`, `headers_encrypted`, `headers_iv`
2. Recrea la tabla `providers` sin esas columnas
3. Copia todos los datos excepto las columnas de encriptación

## Uso en Producción

### Guardar una API Key

```typescript
import { storeProviderApiKey } from './secrets/provider-secrets'

await storeProviderApiKey('openai', 'sk-...')
```

### Obtener una API Key

```typescript
import { getProviderApiKey } from './secrets/provider-secrets'

const apiKey = await getProviderApiKey('openai')
if (!apiKey) {
  throw new Error('API key not configured')
}
```

### Verificar si existe una API Key

```typescript
import { hasProviderApiKey } from './secrets/provider-secrets'

const hasKey = await hasProviderApiKey('openai')
console.log(hasKey) // true o false
```

### Eliminar una API Key

```typescript
import { deleteProviderApiKey } from './secrets/provider-secrets'

await deleteProviderApiKey('openai')
```

## Requisitos del Sistema

### Linux
Asegúrate de tener un daemon de secret service corriendo:

```bash
# GNOME
sudo apt install gnome-keyring

# KDE
sudo apt install kwallet

# Verificar que está corriendo
systemctl --user status secret-service
```

### macOS
No requiere configuración adicional (usa Keychain nativo).

### Windows
No requiere configuración adicional (usa Windows Credential Manager).

## Ventajas

✅ **Seguridad nativa**: Encriptación gestionada por el SO
✅ **Sin configuración**: No necesitas `HIVE_MASTER_KEY`
✅ **Aislamiento**: Las keys están aisladas por usuario
✅ **Memoria segura**: Bun limpia la memoria después de usar las credenciales
✅ **Auditoría**: Los sistemas operativos registran acceso a credenciales

## Referencias

- [Bun.secrets Documentation](https://bun.com/docs/runtime/secrets)
- [Bun.password Documentation](https://bun.com/docs/guides/util/hash-a-password)
- [Bun.CryptoHasher Documentation](https://bun.com/docs/runtime/hashing)
