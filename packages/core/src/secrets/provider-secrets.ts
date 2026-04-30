/**
 * HiveLearn — Provider API Key Management using Bun.secrets
 *
 * Gestiona las API keys de los providers usando el almacenamiento seguro del SO.
 * Las credenciales se encriptan nativamente usando:
 * - macOS: Keychain Services
 * - Windows: Windows Credential Manager (DPAPI)
 * - Linux: libsecret (GNOME Keyring / KWallet)
 *
 * @see https://bun.com/docs/runtime/secrets
 */

import { getDb } from '../storage/sqlite'
import { logger } from '../utils/logger'

const log = logger.child('provider-secrets')

interface SecretId {
  service: string  // Nombre de la aplicación
  name: string     // Identificador único de la credencial
}

/**
 * Crea el identificador único para un secret de provider
 */
function makeSecretId(providerId: string): SecretId {
  return {
    service: 'hivelearn',
    name: `provider:${providerId}:apikey`
  }
}

/**
 * Almacena una API key de forma segura usando Bun.secrets
 * También actualiza la BD para marcar el provider como activo
 */
export async function storeProviderApiKey(
  providerId: string,
  apiKey: string
): Promise<void> {
  try {
    const secretId = makeSecretId(providerId)
    // Usar argumentos posicionales: service, name, value
    await Bun.secrets.set(secretId.service, secretId.name, apiKey)
    log.info('[store] API key stored securely', { providerId, service: secretId.service })

    // Marcar en BD que tiene key (sin guardar el valor)
    const db = getDb()
    db.run('UPDATE providers SET active = 1 WHERE id = ?', [providerId])
  } catch (error) {
    log.error('[store] Failed to store API key', {
      providerId,
      error: (error as Error).message
    })
    throw new Error(`Failed to store API key for provider ${providerId}: ${(error as Error).message}`)
  }
}

/**
 * Recupera una API key desde Bun.secrets
 * Returns null si no existe
 */
export async function getProviderApiKey(
  providerId: string
): Promise<string | null> {
  try {
    const secretId = makeSecretId(providerId)
    // Usar argumentos posicionales: service, name
    const apiKey = await Bun.secrets.get(secretId.service, secretId.name)
    return apiKey
  } catch (error) {
    log.error('[get] Failed to retrieve API key', {
      providerId,
      error: (error as Error).message
    })
    return null
  }
}

/**
 * Verifica si un provider tiene una API key almacenada
 */
export async function hasProviderApiKey(
  providerId: string
): Promise<boolean> {
  try {
    const apiKey = await getProviderApiKey(providerId)
    return apiKey !== null && apiKey.length > 0
  } catch {
    return false
  }
}

/**
 * Elimina una API key de Bun.secrets y limpia la BD
 */
export async function deleteProviderApiKey(
  providerId: string
): Promise<void> {
  try {
    const secretId = makeSecretId(providerId)
    // Usar argumentos posicionales: service, name
    const deleted = await Bun.secrets.delete(secretId.service, secretId.name)
    log.info('[delete] API key deleted', { providerId, deleted })

    // Limpiar en BD
    const db = getDb()
    db.run(
      'UPDATE providers SET active = 0 WHERE id = ?',
      [providerId]
    )
  } catch (error) {
    log.error('[delete] Failed to delete API key', {
      providerId,
      error: (error as Error).message
    })
    throw new Error(`Failed to delete API key for provider ${providerId}: ${(error as Error).message}`)
  }
}

/**
 * Lista todos los providers que tienen API keys almacenadas
 */
export async function listProvidersWithKeys(): Promise<string[]> {
  try {
    const db = getDb()
    const rows = db.query('SELECT id FROM providers WHERE active = 1').all() as Array<{ id: string }>
    const providersWithKeys: string[] = []

    for (const row of rows) {
      const hasKey = await hasProviderApiKey(row.id)
      if (hasKey) {
        providersWithKeys.push(row.id)
      }
    }

    return providersWithKeys
  } catch (error) {
    log.error('[list] Failed to list providers with keys', {
      error: (error as Error).message
    })
    return []
  }
}
