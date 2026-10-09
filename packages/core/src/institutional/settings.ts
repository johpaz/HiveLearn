import type { HiveDB } from '@johpaz/hive-db'
import { z } from 'zod'
import type { InstitutionSettings } from './types'
export type { InstitutionSettings } from './types'
export interface SecretVault { set(options: { service: string; name: string; value: string }): Promise<unknown> }
export const settingsSchema = z.object({
  providerId: z.string().min(1).max(100), modelId: z.string().min(1).max(150),
  imageProviderId: z.string().min(1).max(100), imageModelId: z.string().min(1).max(150),
  audioProviderId: z.string().min(1).max(100), audioModelId: z.string().min(1).max(150),
  voice: z.string().max(150), allowRemoteProviders: z.boolean(), allowRemoteForMinors: z.boolean(),
  oracleEnabled: z.boolean().optional(),
}).strict()
export const DEFAULT_SETTINGS: InstitutionSettings = { providerId: 'ollama', modelId: 'gemma4:e4b', imageProviderId: 'ollama', imageModelId: 'gemma4:e4b', audioProviderId: 'ollama', audioModelId: 'gemma4:e4b', voice: '', allowRemoteProviders: false, allowRemoteForMinors: false }
export async function readSettings(db: HiveDB, institutionId: string) { return (await db.collection<InstitutionSettings>('hl_portal_settings').get(institutionId))?.doc ?? { ...DEFAULT_SETTINGS } }
export async function settingsView(db: HiveDB, institutionId: string) {
  const settings = await readSettings(db, institutionId)
  const providers = (await db.collection<Record<string, unknown>>('providers').scan()).map(e => ({ id: e.id, name: String(e.doc.name ?? e.id), hasApiKey: !!(e.doc.portal_secret_name || e.doc.api_key_encrypted), baseUrl: String(e.doc.base_url ?? '') }))
  return { settings, providers }
}
export async function saveSettings(db: HiveDB, institutionId: string, input: unknown) {
  const settings = settingsSchema.parse(input) as InstitutionSettings
  for (const id of [settings.providerId, settings.imageProviderId, settings.audioProviderId]) {
    if (!(await db.collection('providers').get(id))) throw new Error(`Proveedor no registrado: ${id}`)
  }
  const agents = await db.collection<Record<string, unknown>>('hl_agents').scan()
  const current = await db.collection('hl_portal_settings').get(institutionId)
  await db.batch([
    { op: 'put', collection: 'hl_portal_settings', id: institutionId, doc: settings, expectedVersion: current?.version ?? 0 },
    ...agents.filter(e => e.doc.active !== 0).map(e => ({ op: 'put' as const, collection: 'hl_agents', id: e.id, expectedVersion: e.version, doc: { ...e.doc,
      provider_id: e.id.includes('image') ? settings.imageProviderId : e.id.includes('audio') ? settings.audioProviderId : settings.providerId,
      model_id: e.id.includes('image') ? settings.imageModelId : e.id.includes('audio') ? settings.audioModelId : settings.modelId,
    } })),
  ])
  return settings
}
export async function setCredential(db: HiveDB, institutionId: string, providerId: string, input: unknown, vault: SecretVault = Bun.secrets) {
  const { apiKey } = z.object({ apiKey: z.string().min(1).max(4096) }).strict().parse(input)
  const col = db.collection<Record<string, unknown>>('providers'), entry = await col.get(providerId)
  if (!entry) throw new Error('Proveedor no encontrado')
  const name = `${institutionId}:${providerId}`
  await vault.set({ service: 'hivelearn-institution', name, value: apiKey! })
  await col.put(providerId, { ...entry.doc, portal_secret_name: name }, { expectedVersion: entry.version })
  return { hasApiKey: true }
}
