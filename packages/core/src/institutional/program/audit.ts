/**
 * Bitácora inmutable del programa en el log de eventos de HiveDB.
 *
 * Cada hecho relevante (intención declarada, respuesta, checkpoint, propuesta de adaptación del agente, validación
 * docente, cierre) se anexa al flujo `streamId = programId` con `agentId = student:<cuenta>`. El log es de solo
 * anexar y encadena causas: de ahí sale el HILO CAUSAL que explica por qué el plan cambió ("el nivel 2 se reforzó
 * porque…") sin depender del documento mutable del programa. Es de mejor esfuerzo: un fallo del log nunca rompe el flujo.
 */
import type { HiveDB } from '@johpaz/hive-db'
import { logger } from '../../utils/logger'

const log = logger.child('program-audit')

export type AuditKind = 'intent' | 'answer' | 'checkpoint' | 'adaptation' | 'state' | 'validation'
type EventKind = 'Fact' | 'StateTransition' | 'IntentLogged' | 'LearningProposal'

const KIND_MAP: Record<AuditKind, EventKind> = {
  intent: 'Fact', answer: 'Fact', checkpoint: 'Fact',
  adaptation: 'LearningProposal', state: 'StateTransition', validation: 'Fact',
}

export const auditAgent = (accountId: string) => `student:${accountId}`
export const PROGRAM_TRACE_COLLECTION = 'hl_program_trace'
const MAX_TRACE_EVENTS = 500

export interface TraceEntry { seq: number; at: string; type: string; kind: string; data: Record<string, unknown> }

export class ProgramAudit {
  /** Último evento por programa: encadena la causalidad dentro del proceso. */
  private last = new Map<string, number>()

  constructor(private readonly db: HiveDB) {}

  async record(programId: string, accountId: string, kind: AuditKind, payload: Record<string, unknown>): Promise<number | null> {
    try {
      const seq = await this.db.append({
        agentId: auditAgent(accountId),
        streamId: programId,
        kind: KIND_MAP[kind],
        payload: JSON.stringify({ type: kind, at: new Date().toISOString(), ...payload }),
        causation: this.last.get(programId),
        correlation: undefined,
      })
      this.last.set(programId, seq)
      await this.remember(programId, seq)
      return seq
    } catch (error) {
      log.warn(`[audit] no se pudo anexar ${kind}: ${(error as Error).message}`)
      return null
    }
  }

  /** Índice de eventos por programa: el log es global, esto evita recorrerlo entero para reconstruir un programa. */
  private async remember(programId: string, seq: number): Promise<void> {
    const col = this.db.collection<{ seqs: number[] }>(PROGRAM_TRACE_COLLECTION)
    for (let attempt = 0; attempt < 4; attempt++) {
      const entry = await col.get(programId)
      const seqs = [...(entry?.doc.seqs ?? []), seq].slice(-MAX_TRACE_EVENTS)
      try { await col.put(programId, { seqs }, { expectedVersion: entry?.version ?? 0 }); return } catch { /* reintento */ }
    }
  }

  /**
   * Línea de tiempo del programa leída del log inmutable (con sus causas) y, además, lo que HiveDB deriva del hilo
   * causal (decisiones y anomalías). Acotada al alumno dueño: nunca mezcla alumnos de la misma base.
   */
  async thread(programId: string, accountId: string): Promise<{ timeline: TraceEntry[]; causal: unknown }> {
    const timeline: TraceEntry[] = []
    try {
      const seqs = (await this.db.collection<{ seqs: number[] }>(PROGRAM_TRACE_COLLECTION).get(programId))?.doc.seqs ?? []
      for (const seq of seqs) {
        const event = await this.db.read(seq).catch(() => null)
        if (!event || event.streamId !== programId || event.agentId !== auditAgent(accountId)) continue
        let data: Record<string, unknown> = {}
        try { data = JSON.parse(event.payload) as Record<string, unknown> } catch { /* payload no JSON */ }
        const { type, at, ...rest } = data
        timeline.push({ seq: event.seq, at: String(at ?? new Date(event.timestamp).toISOString()), type: String(type ?? event.kindTag), kind: event.kindTag, data: rest })
      }
    } catch (error) {
      log.warn(`[audit] no se pudo leer la línea de tiempo: ${(error as Error).message}`)
    }
    let causal: unknown = null
    try { causal = await this.db.causalThread(programId, [auditAgent(accountId)]) } catch { /* sin hilo causal */ }
    return { timeline, causal }
  }
}
