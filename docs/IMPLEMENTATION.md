# Implementación: API Keys Encriptadas con Bun.secrets

## ✅ Implementación Completada

Todas las API keys de los providers ahora se guardan **encriptadas nativamente** usando `Bun.secrets`, que utiliza el almacenamiento seguro del sistema operativo.

---

## 📁 Archivos Creados

### 1. `packages/core/src/secrets/provider-secrets.ts`
Módulo principal para gestionar API keys con Bun.secrets.

**Funciones exportadas:**
- `storeProviderApiKey(providerId, apiKey)` - Guarda una API key
- `getProviderApiKey(providerId)` - Recupera una API key
- `hasProviderApiKey(providerId)` - Verifica si existe una API key
- `deleteProviderApiKey(providerId)` - Elimina una API key
- `listProvidersWithKeys()` - Lista providers con keys

### 2. `scripts/migrate-api-keys.ts`
Script para migrar API keys desde la BD hacia Bun.secrets.

**Uso:**
```bash
bun run migrate:api-keys
```

### 3. `scripts/migrate-schema.ts`
Script para eliminar columnas de encriptación de la BD.

**Uso:**
```bash
bun run migrate:schema
```

### 4. `scripts/MIGRATION.md`
Documentación completa del proceso de migración.

---

## 🔄 Archivos Modificados

### 1. `packages/core/src/gateway/server.ts`
**Cambios:**
- Eliminados imports de `encryptApiKey` y `decryptApiKey`
- Agregados imports de funciones `Bun.secrets`
- Endpoint `GET /api/providers/:id/api-key` ahora usa `hasProviderApiKey()`
- Endpoint `POST /api/providers/:id/api-key` ahora usa `storeProviderApiKey()`
- Endpoint `DELETE /api/providers/:id/api-key` ahora usa `deleteProviderApiKey()`

### 2. `packages/core/src/agent/llm-client.ts`
**Cambios:**
- Agregado import de `getProviderApiKey`
- Función `resolveProviderConfig()` ahora obtiene API keys desde Bun.secrets

### 3. `packages/core/src/storage/schema.ts`
**Cambios:**
- Eliminadas columnas: `api_key_encrypted`, `api_key_iv`, `headers_encrypted`, `headers_iv`
- Actualizados comentarios para reflejar uso de Bun.secrets

### 4. `packages/core/src/storage/init.ts`
**Cambios:**
- Eliminadas columnas de encriptación del schema de inicialización
- Actualizados comentarios

### 5. `packages/core/src/index.ts`
**Cambios:**
- Exportadas funciones del módulo `secrets/provider-secrets`

### 6. `package.json`
**Cambios:**
- Agregados scripts:
  - `"migrate:api-keys": "bun run scripts/migrate-api-keys.ts"`
  - `"migrate:schema": "bun run scripts/migrate-schema.ts"`

---

## 🔐 Seguridad

### Encriptación por Sistema Operativo

| SO | Tecnología |
|----|------------|
| **macOS** | Keychain Services |
| **Windows** | Windows Credential Manager (DPAPI) |
| **Linux** | libsecret (GNOME Keyring / KWallet) |

### Características de Seguridad

✅ **Encriptación en reposo**: Las credenciales están encriptadas por el SO
✅ **Seguridad en memoria**: Bun limpia la memoria después de usar las credenciales
✅ **Aislamiento**: Las keys están aisladas por usuario
✅ **Sin configuración**: No requiere `HIVE_MASTER_KEY`
✅ **Auditoría**: Los sistemas operativos registran acceso a credenciales

---

## 📋 Proceso de Migración

### Para Instalaciones Existentes

Si ya tienes API keys guardadas en la base de datos:

```bash
# Paso 1: Migrar API keys a Bun.secrets
bun run migrate:api-keys

# Paso 2: Eliminar columnas de encriptación de la BD
bun run migrate:schema
```

### Para Nuevas Instalaciones

Las nuevas instalaciones usan Bun.secrets por defecto. No se requiere migración.

---

## 🧪 Pruebas

### Verificar Build

```bash
bun run build:core
```

### Verificar Typecheck

```bash
bun run typecheck
```

---

## 📚 Referencias Técnicas

- [Bun.secrets Documentation](https://bun.com/docs/runtime/secrets)
- [Bun 1.3.13 Release Notes](https://bun.com/blog/bun-v1.3.13)
- [API de Secrets - Experimental](https://bun.sh/docs/api/secrets)

---

## ⚠️ Consideraciones

### Linux
Requiere un daemon de secret service corriendo:
```bash
# Instalar en Ubuntu/Debian
sudo apt install gnome-keyring

# Verificar estado
systemctl --user status secret-service
```

### macOS / Windows
No requiere configuración adicional.

### Producción
- `Bun.secrets` está diseñado para desarrollo local y CLI
- Para producción, considera usar variables de entorno o servicios de secrets management (AWS Secrets Manager, HashiCorp Vault)

---

## 🎯 Estado Final

| Componente | Estado |
|------------|--------|
| Módulo secrets | ✅ Implementado |
| server.ts actualizado | ✅ Completado |
| llm-client.ts actualizado | ✅ Completado |
| Scripts de migración | ✅ Creados |
| Schema actualizado | ✅ Completado |
| Documentación | ✅ Completa |
| Build | ✅ Exitoso |

---

**Implementado el**: 30 de abril de 2026
**Versión de Bun**: 1.3.13
