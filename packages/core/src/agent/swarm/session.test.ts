import { afterAll, beforeAll, describe, expect, test } from 'bun:test'
import { mkdtempSync, rmSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'

const root = mkdtempSync(join(tmpdir(), 'hl-session-'))
process.env.HIVELEARN_DB_PATH = join(root, 'hivedb')
process.env.HIVELEARN_SECRET_KEY = 'session-test-secret-key-0123456789abcdef'

import { initializeDatabase, closeDatabase, getDb } from '../../storage/hivedb'
import { aiCurriculumDef } from '../../institutional/curriculum-ai'
import { ensureCanonicalCurricula } from '../../institutional/curriculum-store'
import { dossierKey, saveDossier, DEFAULT_TTL_MS, type Dossier } from '../../research/dossier'
import { CurriculumNotFoundError, resolveCurriculumContext } from './session'

beforeAll(async () => { await initializeDatabase() })
afterAll(() => { closeDatabase(); rmSync(root, { recursive: true, force: true }) })

const dossier = (band: Dossier['ageBand'], expiresInMs: number): Dossier => {
  const def = aiCurriculumDef()
  const now = Date.now()
  return {
    key: dossierKey(def.topic, def.language, band), topic: def.topic, language: def.language, ageBand: band,
    queries: [], sources: [], claims: [], createdAt: new Date(now).toISOString(), expiresAt: new Date(now + expiresInMs).toISOString(),
  } as Dossier
}

describe('resolveCurriculumContext', () => {
  test('un currículo inexistente se rechaza con un error propio', async () => {
    await expect(resolveCurriculumContext(getDb(), 'no-existe', 30)).rejects.toBeInstanceOf(CurriculumNotFoundError)
  })

  test('devuelve la definición y el dossier vigente, y omite el vencido', async () => {
    const db = getDb()
    await ensureCanonicalCurricula(db)
    const def = aiCurriculumDef()

    expect((await resolveCurriculumContext(db, def.id, 30)).dossier).toBeUndefined()

    await saveDossier(db, dossier('adulto', -1000))
    expect((await resolveCurriculumContext(db, def.id, 30)).dossier).toBeUndefined()

    await saveDossier(db, dossier('adulto', DEFAULT_TTL_MS))
    const found = await resolveCurriculumContext(db, def.id, 30)
    expect(found.curriculum.id).toBe(def.id)
    expect(found.dossier?.ageBand).toBe('adulto')
  })

  test('prefiere el dossier de la banda del alumno', async () => {
    const db = getDb()
    const def = aiCurriculumDef()
    await saveDossier(db, dossier('adolescencia', DEFAULT_TTL_MS))
    expect((await resolveCurriculumContext(db, def.id, 15)).dossier?.ageBand).toBe('adolescencia')
    expect((await resolveCurriculumContext(db, def.id, 30)).dossier?.ageBand).toBe('adulto')
  })
})
