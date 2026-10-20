import { afterEach, beforeEach, describe, expect, test } from 'bun:test'
import { HiveDB } from '@johpaz/hive-db'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { PersonalProgram } from './program-def'
import { PROGRAM_EXPIRY_DAYS, ProgramActiveError, ProgramStore } from './program-store'

let db: HiveDB, directory: string
beforeEach(async () => { directory = await mkdtemp(join(tmpdir(), 'hl-program-store-')); db = await HiveDB.open(directory) })
afterEach(async () => { await db.close(); await rm(directory, { recursive: true, force: true }) })

const NOW = new Date('2026-10-13T12:00:00.000Z')
const make = (id: string, accountId = 'a1', over: Partial<PersonalProgram> = {}): PersonalProgram => ({
  id, accountId, institutionId: 'i1', status: 'active', language: 'es',
  intent: { topic: 'SQL', goal: 'x', minutes: 30, energy: 'media', priorKnowledge: 'ninguno', style: 'balanceado', declaredAt: NOW.toISOString() },
  profile: { name: 'Ana', age: 30, ageBand: 'adulto' }, objective: 'o',
  sizing: { levels: 2, nodesPerLevel: [2, 2], minutesPerNode: 10 }, levels: [], currentLevel: 0, progress: {}, revisions: [],
  validation: 'formative', createdAt: NOW.toISOString(), updatedAt: NOW.toISOString(), lastActivityAt: NOW.toISOString(), ...over,
})

describe('ProgramStore', () => {
  test('una sola sesión activa por cuenta', async () => {
    const store = new ProgramStore(db, () => NOW)
    await store.create(make('p1'))
    const error = await store.create(make('p2')).catch(e => e)
    expect(error).toBeInstanceOf(ProgramActiveError)
    expect((error as ProgramActiveError).programId).toBe('p1')
    // Otra cuenta no se ve afectada.
    await store.create(make('p3', 'a2'))
  })

  test('creaciones concurrentes: solo una gana', async () => {
    const store = new ProgramStore(db, () => NOW)
    const results = await Promise.allSettled([store.create(make('c1')), store.create(make('c2')), store.create(make('c3'))])
    expect(results.filter(r => r.status === 'fulfilled')).toHaveLength(1)
    expect(results.filter(r => r.status === 'rejected')).toHaveLength(2)
    expect((await store.getActive('a1'))?.id).toMatch(/^c[123]$/)
  })

  test('cerrar libera el cerrojo y permite uno nuevo', async () => {
    const store = new ProgramStore(db, () => NOW)
    await store.create(make('p1'))
    const closed = await store.close('p1', 'voluntary')
    expect(closed).toMatchObject({ status: 'closed', closeReason: 'voluntary' })
    expect(await store.getActive('a1')).toBeNull()
    await store.create(make('p2'))
    expect((await store.getActive('a1'))?.id).toBe('p2')
  })

  test('expira tras 14 días sin actividad y libera la cuenta', async () => {
    const old = new Date(NOW.getTime() - (PROGRAM_EXPIRY_DAYS + 1) * 86_400_000).toISOString()
    const writer = new ProgramStore(db, () => NOW)
    await writer.create(make('p1', 'a1', { lastActivityAt: old, createdAt: old }))
    expect(await writer.getActive('a1')).toBeNull()
    expect(await writer.get('p1')).toMatchObject({ status: 'closed', closeReason: 'expired' })
    await writer.create(make('p2'))
  })

  test('la actividad renueva el plazo; cerrar no lo toca', async () => {
    let clock = NOW
    const store = new ProgramStore(db, () => clock)
    await store.create(make('p1'))
    clock = new Date(NOW.getTime() + 10 * 86_400_000)
    await store.update('p1', p => p)
    clock = new Date(NOW.getTime() + 20 * 86_400_000)
    expect((await store.getActive('a1'))?.id).toBe('p1')
  })

  test('un cerrojo huérfano (programa inexistente) no bloquea', async () => {
    const store = new ProgramStore(db, () => NOW)
    await db.collection('hl_program_locks').put('active:a1', { programId: 'fantasma', at: new Date(NOW.getTime() - 120_000).toISOString() })
    await store.create(make('p1'))
    expect((await store.getActive('a1'))?.id).toBe('p1')
  })
})
