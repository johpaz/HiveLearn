import { createDecipheriv, createHash } from 'node:crypto'

function key(): Buffer {
  const value = process.env.HIVELEARN_SECRET_KEY
  if (!value || value.length < 32) throw new Error('Configura HIVELEARN_SECRET_KEY con al menos 32 caracteres aleatorios')
  return createHash('sha256').update(value).digest()
}

export function decryptApiKey(value: string, iv: string): string {
  const encrypted = Buffer.from(value, 'base64')
  const decipher = createDecipheriv('aes-256-gcm', key(), Buffer.from(iv, 'base64'))
  decipher.setAuthTag(encrypted.subarray(-16))
  return Buffer.concat([decipher.update(encrypted.subarray(0, -16)), decipher.final()]).toString('utf8')
}
