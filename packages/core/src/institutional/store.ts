import { getDb, nowIso } from '../storage/hivedb'
import { installationKey } from './accounts'
import { ageBandFor } from './age'
import type { AIDiagnostic, GuardianConsent, Institution, LearningPath, ProviderPolicy, StudentIdentity } from './types'

async function documentKey(): Promise<CryptoKey> {
  return crypto.subtle.importKey('raw', new Uint8Array(await installationKey(getDb())), { name: 'AES-GCM' }, false, ['encrypt', 'decrypt'])
}

async function encryptDocument(documentNumber: string): Promise<{ documentCiphertext: string; documentIv: string }> {
  const iv = crypto.getRandomValues(new Uint8Array(12))
  const encrypted = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, await documentKey(), new TextEncoder().encode(documentNumber.trim()))
  return { documentCiphertext: Buffer.from(encrypted).toString('base64'), documentIv: Buffer.from(iv).toString('base64') }
}

export async function fingerprintDocument(documentType: string, documentNumber: string): Promise<string> {
  const key = await crypto.subtle.importKey('raw', new Uint8Array(await installationKey(getDb())), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'])
  const signature = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(`${documentType}:${documentNumber.trim()}`))
  return Buffer.from(signature).toString('hex')
}

export function ageBandForAge(age: number): StudentIdentity['ageBand'] {
  return ageBandFor(age)
}

export async function saveInstitution(institution: Institution): Promise<void> {
  await getDb().collection<Institution>('hl_institutions').put(institution.id, institution)
}

export type StudentIdentityInput = Omit<StudentIdentity, 'documentFingerprint' | 'documentCiphertext' | 'documentIv'> & { documentNumber: string }

export async function saveStudentIdentity(input: StudentIdentityInput): Promise<StudentIdentity> {
  const identity: StudentIdentity = { ...input, documentFingerprint: await fingerprintDocument(input.documentType, input.documentNumber), ...(await encryptDocument(input.documentNumber)) }
  const { documentNumber: _documentNumber, ...safe } = { ...identity, documentNumber: input.documentNumber }
  await getDb().collection<StudentIdentity>('hl_student_identities').put(identity.studentId, safe)
  return safe
}

export async function saveConsent(consent: GuardianConsent): Promise<void> {
  await getDb().collection<GuardianConsent>('hl_guardian_consents').put(consent.id, consent)
}

export async function saveDiagnostic(diagnostic: AIDiagnostic): Promise<void> {
  await getDb().collection<AIDiagnostic>('hl_ai_diagnostics').put(diagnostic.id, diagnostic)
}

export async function saveLearningPath(path: LearningPath): Promise<void> {
  await getDb().collection<LearningPath>('hl_learning_paths').put(path.id, path)
}

export async function getProviderPolicy(institutionId: string): Promise<ProviderPolicy | null> {
  return (await getDb().collection<ProviderPolicy>('hl_provider_policies').get(institutionId))?.doc ?? null
}

export async function saveProviderPolicy(policy: ProviderPolicy): Promise<void> {
  await getDb().collection<ProviderPolicy>('hl_provider_policies').put(policy.institutionId, { ...policy, updatedAt: nowIso() })
}
