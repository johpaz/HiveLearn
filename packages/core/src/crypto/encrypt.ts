/**
 * HiveLearn — local AES-256-GCM encryption.
 *
 * Encripta API keys para almacenar en la BD.
 * Usa la misma clave que decrypt.ts:
 *  1. HIVE_MASTER_KEY env var (primeros 32 chars, padded con '0')
 *  2. Archivo ${HIVE_HOME}/.master.key  (default: ~/.hive/.master.key)
 */
import { createCipheriv, randomBytes } from 'node:crypto'
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { homedir } from 'node:os'

let _key: Buffer | null = null

function getKey(): Buffer {
  if (_key) return _key

  const masterKey = process.env.HIVE_MASTER_KEY
  if (masterKey) {
    _key = Buffer.from(masterKey.slice(0, 32).padEnd(32, '0'), 'utf8')
    return _key
  }

  const hiveDir = process.env.HIVE_HOME || join(homedir(), '.hive')
  const keyPath = join(hiveDir, '.master.key')
  if (existsSync(keyPath)) {
    _key = Buffer.from(readFileSync(keyPath, 'utf-8').trim(), 'hex')
    return _key
  }

  throw new Error('HiveLearn: no encryption key found. Set HIVE_MASTER_KEY or ensure ~/.hive/.master.key exists.')
}

/** Encripta una API key con AES-256-GCM. Retorna { encrypted, iv } */
export function encryptApiKey(apiKey: string): { encrypted: string; iv: string } {
  const key = getKey()
  const iv = randomBytes(16)
  const cipher = createCipheriv('aes-256-gcm', key, iv)
  
  let encrypted = cipher.update(apiKey, 'utf8', 'hex')
  encrypted += cipher.final('hex')
  const authTag = cipher.getAuthTag().toString('hex')
  
  // Formato: encrypted:authTag
  return {
    encrypted: `${encrypted}:${authTag}`,
    iv: iv.toString('hex')
  }
}
