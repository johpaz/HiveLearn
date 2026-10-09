import { createCipheriv, createHash, randomBytes } from 'node:crypto'

function key(): Buffer {
  const value = process.env.HIVELEARN_SECRET_KEY
  if (!value || value.length < 32) throw new Error('Configura HIVELEARN_SECRET_KEY con al menos 32 caracteres aleatorios')
  return createHash('sha256').update(value).digest()
}

export function encryptApiKey(value: string): { encrypted: string; iv: string } {
  const iv = randomBytes(12)
  const cipher = createCipheriv('aes-256-gcm', key(), iv)
  const encrypted = Buffer.concat([cipher.update(value, 'utf8'), cipher.final(), cipher.getAuthTag()])
  return { encrypted: encrypted.toString('base64'), iv: iv.toString('base64') }
}
