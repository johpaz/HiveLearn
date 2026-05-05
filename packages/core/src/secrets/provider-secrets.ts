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
  const startTime = Date.now()
  const secretId = makeSecretId(providerId)
  
  log.info('[store] Storing API key', { 
    providerId, 
    service: secretId.service,
    name: secretId.name,
  })

  try {
    // Usar objeto de opciones según bun-types v1.3+
    await Bun.secrets.set({ 
      service: secretId.service, 
      name: secretId.name, 
      value: apiKey 
    })
    
    const duration = Date.now() - startTime
    log.info('[store] API key stored securely', { 
      providerId, 
      service: secretId.service,
      duration,
    })

    // Marcar en BD que tiene key (sin guardar el valor)
    const db = getDb()
    db.run('UPDATE providers SET active = 1 WHERE id = ?', [providerId])
    
    log.debug('[store] Database updated', { providerId })
  } catch (error) {
    const duration = Date.now() - startTime
    log.error('[store] Failed to store API key', {
      providerId,
      service: secretId.service,
      error: (error as Error).message,
      stack: (error as Error).stack,
      duration,
      platform: process.platform,
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
  const startTime = Date.now()
  const secretId = makeSecretId(providerId)
  
  log.debug('[get] Retrieving API key', { 
    providerId, 
    service: secretId.service,
    name: secretId.name,
  })

  try {
    // Usar objeto de opciones según bun-types v1.3+
    const apiKey = await Bun.secrets.get({ 
      service: secretId.service, 
      name: secretId.name 
    })
    
    const duration = Date.now() - startTime
    const found = apiKey !== null && apiKey.length > 0
    
    log.debug('[get] API key retrieved', { 
      providerId, 
      found,
      duration,
    })
    
    return apiKey
  } catch (error) {
    const duration = Date.now() - startTime
    log.error('[get] Failed to retrieve API key', {
      providerId,
      service: secretId.service,
      error: (error as Error).message,
      stack: (error as Error).stack,
      duration,
      platform: process.platform,
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
  log.debug('[has] Checking API key existence', { 
    providerId, 
  })

  try {
    const apiKey = await getProviderApiKey(providerId)
    const hasKey = apiKey !== null && apiKey.length > 0
    
    log.debug('[has] API key check result', { 
      providerId, 
      hasKey,
    })
    
    return hasKey
  } catch (error) {
    log.error('[has] Failed to check API key', {
      providerId,
      error: (error as Error).message,
    })
    return false
  }
}

/**
 * Elimina una API key de Bun.secrets y limpia la BD
 */
export async function deleteProviderApiKey(
  providerId: string
): Promise<void> {
  const startTime = Date.now()
  const secretId = makeSecretId(providerId)
  
  log.info('[delete] Deleting API key', { 
    providerId, 
    service: secretId.service,
    name: secretId.name,
  })

  try {
    // Usar objeto de opciones según bun-types v1.3+
    const deleted = await Bun.secrets.delete({ 
      service: secretId.service, 
      name: secretId.name 
    })
    
    const duration = Date.now() - startTime
    log.info('[delete] API key deleted', { 
      providerId, 
      deleted,
      duration,
    })

    // Limpiar en BD
    const db = getDb()
    db.run(
      'UPDATE providers SET active = 0 WHERE id = ?',
      [providerId]
    )
    
    log.debug('[delete] Database updated', { providerId })
  } catch (error) {
    const duration = Date.now() - startTime
    log.error('[delete] Failed to delete API key', {
      providerId,
      service: secretId.service,
      error: (error as Error).message,
      stack: (error as Error).stack,
      duration,
      platform: process.platform,
    })
    throw new Error(`Failed to delete API key for provider ${providerId}: ${(error as Error).message}`)
  }
}

/**
 * Lista todos los providers que tienen API keys almacenadas
 */
export async function listProvidersWithKeys(): Promise<string[]> {
  log.debug('[list] Listing providers with keys')

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

    log.info('[list] Providers with keys', { 
      count: providersWithKeys.length,
      providers: providersWithKeys,
    })

    return providersWithKeys
  } catch (error) {
    log.error('[list] Failed to list providers with keys', {
      error: (error as Error).message,
      stack: (error as Error).stack,
    })
    return []
  }
}
