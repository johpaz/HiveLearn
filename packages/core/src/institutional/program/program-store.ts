/**
 * Persistencia y ciclo de vida del programa personal.
 *
 * Regla central: UN solo programa activo por cuenta. Se garantiza con un documento-cerrojo `active:<accountId>` que se
 * crea con `expectedVersion: 0` (create-if-absent del store): dos creaciones simultáneas no pueden ganar las dos.
 * El programa vive hasta que se cierra (voluntario, completado, abandonado) o expira por inactividad.
 */
import type { HiveDB } from '@johpaz/hive-db'
import {
  PROGRAMS_COLLECTION, PROGRAM_LOCKS_COLLECTION, PROGRAM_LEVELS_COLLECTION, PROGRAM_NODES_COLLECTION,
  type CloseReason, type PersonalProgram,
} from './program-def'
import { projectionOps } from './projections'

export const PROGRAM_EXPIRY_DAYS = 14

export class ProgramActiveError extends Error {
  constructor(readonly programId: string) {
    super('Ya tienes un programa activo: ciérralo antes de crear otro')
    this.name = 'ProgramActiveError'
  }
}

export class ProgramNotFoundError extends Error {
  constructor() { super('Programa no encontrado'); this.name = 'ProgramNotFoundError' }
}

interface Lock { programId: string; at: string }
const lockId = (accountId: string) => `active:${accountId}`

export class ProgramStore {
  constructor(private readonly db: HiveDB, private readonly clock: () => Date = () => new Date()) {}

  private indexes: Promise<void> | null = null

  /** Índices secundarios de HiveDB: consultas por cuenta, institución y estado sin recorrer la colección. */
  private ensureIndexes(): Promise<void> {
    this.indexes ??= (async () => {
      const plan: Array<[string, string[]]> = [
        [PROGRAMS_COLLECTION, ['accountId', 'institutionId', 'status']],
        [PROGRAM_LEVELS_COLLECTION, ['programId', 'accountId', 'institutionId', 'status']],
        [PROGRAM_NODES_COLLECTION, ['programId', 'accountId', 'institutionId', 'topic']],
      ]
      for (const [collection, fields] of plan) {
        for (const field of fields) await this.db.collection(collection).createIndex(field).catch(() => undefined)
      }
    })()
    return this.indexes
  }

  private programs() { return this.db.collection<PersonalProgram>(PROGRAMS_COLLECTION) }
  private locks() { return this.db.collection<Lock>(PROGRAM_LOCKS_COLLECTION) }

  /** Un cerrojo sin programa solo se considera huérfano pasado este plazo. */
  private isFresh(lock: Lock): boolean {
    return this.clock().getTime() - Date.parse(lock.at) < 30_000
  }

  async get(id: string): Promise<PersonalProgram | null> {
    return (await this.programs().get(id))?.doc ?? null
  }

  /** El programa activo de la cuenta, aplicando la expiración por inactividad. */
  async getActive(accountId: string): Promise<PersonalProgram | null> {
    const lock = await this.locks().get(lockId(accountId))
    if (!lock) return null
    const program = await this.get(lock.doc.programId)
    if (!program) {
      // Cerrojo recién tomado: el programa todavía se está escribiendo. Solo si es viejo se considera huérfano.
      if (this.isFresh(lock.doc)) return null
      await this.locks().delete(lockId(accountId)).catch(() => {})
      return null
    }
    if (program.status === 'closed') {
      await this.locks().delete(lockId(accountId)).catch(() => {})
      return null
    }
    const idleMs = this.clock().getTime() - Date.parse(program.lastActivityAt)
    if (idleMs > PROGRAM_EXPIRY_DAYS * 86_400_000) {
      await this.close(program.id, 'expired')
      return null
    }
    return program
  }

  /**
   * Alta del programa. Falla con `ProgramActiveError` si la cuenta ya tiene uno activo. El cerrojo se toma ANTES de
   * escribir el programa y se libera si la escritura falla.
   */
  async create(program: PersonalProgram): Promise<PersonalProgram> {
    const active = await this.getActive(program.accountId)
    if (active) throw new ProgramActiveError(active.id)

    const locks = this.locks()
    const key = lockId(program.accountId)
    try {
      await locks.put(key, { programId: program.id, at: this.clock().toISOString() }, { expectedVersion: 0 })
    } catch {
      // Otro proceso ganó la carrera (o quedó un cerrojo huérfano): se vuelve a comprobar con el estado real.
      const winner = await this.getActive(program.accountId)
      if (winner) throw new ProgramActiveError(winner.id)
      const stale = await locks.get(key)
      // Otro proceso tiene el cerrojo y aún está escribiendo su programa: gana ese.
      if (stale && stale.doc.programId !== program.id && this.isFresh(stale.doc)) throw new ProgramActiveError(stale.doc.programId)
      if (stale) await locks.put(key, { programId: program.id, at: this.clock().toISOString() }, { expectedVersion: stale.version })
      else await locks.put(key, { programId: program.id, at: this.clock().toISOString() }, { expectedVersion: 0 })
    }
    try {
      await this.ensureIndexes()
    await this.save(program, 0)
    } catch (error) {
      await locks.delete(key).catch(() => {})
      throw error
    }
    return program
  }

  /** Programa y proyecciones en un solo lote: o quedan todos o ninguno. */
  private async save(program: PersonalProgram, expectedVersion: number): Promise<void> {
    await this.ensureIndexes()
    await this.db.batch([
      { op: 'put', collection: PROGRAMS_COLLECTION, id: program.id, doc: program, expectedVersion },
      ...(await projectionOps(this.db, program)),
    ])
  }

  /**
   * Borra TODO lo que el programa dejó para una cuenta: documento, proyecciones, cerrojo, revisiones docentes e
   * índice de bitácora. El log de eventos es de solo anexar y no se puede reescribir: por eso su carga útil no lleva
   * texto libre del alumno (solo ids, conteos y decisiones).
   */
  async purgeAccount(accountId: string): Promise<{ programs: number; levels: number; nodes: number; reviews: number }> {
    await this.ensureIndexes()
    const programs = (await this.programs().findBy('accountId', accountId).catch(async () => (await this.programs().scan()).filter(e => e.doc.accountId === accountId)))
    const counts = { programs: programs.length, levels: 0, nodes: 0, reviews: 0 }
    for (const entry of programs) {
      const id = entry.id
      for (const [collection, key] of [[PROGRAM_LEVELS_COLLECTION, 'levels'], [PROGRAM_NODES_COLLECTION, 'nodes']] as const) {
        const rows = await this.db.collection(collection).findBy('programId', id).catch(() => [] as Array<{ id: string }>)
        for (const row of rows) { await this.db.collection(collection).delete(row.id); counts[key]++ }
      }
      for (const review of await this.db.collection('hl_program_reviews').scan({ prefix: `${id}:` })) { await this.db.collection('hl_program_reviews').delete(review.id); counts.reviews++ }
      await this.db.collection('hl_program_trace').delete(id).catch(() => undefined)
      await this.programs().delete(id)
    }
    await this.locks().delete(lockId(accountId)).catch(() => undefined)
    return counts
  }

  /** Lee-modifica-escribe con control de versión (reintenta ante conflicto). */
  async update(id: string, mutate: (program: PersonalProgram) => PersonalProgram, options: { touch?: boolean } = {}): Promise<PersonalProgram> {
    for (let attempt = 0; attempt < 5; attempt++) {
      const entry = await this.programs().get(id)
      if (!entry) throw new ProgramNotFoundError()
      const now = this.clock().toISOString()
      const next = mutate(structuredClone(entry.doc))
      next.updatedAt = now
      if (options.touch !== false) next.lastActivityAt = now
      try {
        await this.save(next, entry.version)
        return next
      } catch (error) {
        if (attempt === 4) throw error
      }
    }
    throw new Error('conflicto de versión persistente')
  }

  async close(id: string, reason: CloseReason): Promise<PersonalProgram> {
    const closed = await this.update(id, p => {
      if (p.status === 'closed') return p
      const now = this.clock().toISOString()
      return { ...p, status: 'closed', closeReason: p.closeReason ?? reason, closedAt: now }
    }, { touch: false })
    const lock = await this.locks().get(lockId(closed.accountId))
    if (lock?.doc.programId === id) await this.locks().delete(lockId(closed.accountId)).catch(() => {})
    return closed
  }

  /** Programas de una institución, más recientes primero (para el docente). */
  async listByInstitution(institutionId: string, filter: (p: PersonalProgram) => boolean = () => true): Promise<PersonalProgram[]> {
    await this.ensureIndexes()
    const rows = await this.programs().findBy('institutionId', institutionId).catch(() => this.programs().scan())
    return rows
      .map(e => e.doc)
      .filter(p => p.institutionId === institutionId && filter(p))
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
  }
}
