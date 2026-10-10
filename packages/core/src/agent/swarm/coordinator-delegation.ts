/**
 * El coordinador reparte el trabajo con ayuda de Kev: por nodo, agente visual y skills; después cada
 * especialista afina su propia corrida (esfuerzo, longitud, skills) en `HiveLearnExecutor`.
 * Sin oráculo, el reparto es el del blueprint más las skills por defecto de la banda de edad.
 */
import { HiveLearnExecutor } from '../executor'
import { kevForRun } from '../kev/client'
import { planDelegation, type DelegationPlan } from '../kev/delegation'
import type { RunContext } from '../policy/age-policy'
import type { NodoLesson } from '../../types'
import { logger } from '../../utils/logger'

const log = logger.child('coordinator-delegation')

export async function prepareDelegation(input: {
  runContext: RunContext
  objective: string
  nodos: Array<Omit<NodoLesson, 'posX' | 'posY'>>
  priorOutputs?: Map<string, string>
  dossierText?: string
}): Promise<{ executor: HiveLearnExecutor; plan: DelegationPlan }> {
  const kev = await kevForRun(input.runContext)
  const plan = await planDelegation(kev, {
    objective: input.objective,
    band: input.runContext.ageBand,
    hasDossier: !!input.dossierText,
    nodes: input.nodos.map(n => ({ id: n.id, titulo: n.titulo, concepto: n.concepto, tipoPedagogico: n.tipoPedagogico, tipoVisual: n.tipoVisual })),
  })
  for (const nodo of input.nodos) {
    const planned = plan.nodes.get(nodo.id)
    if (planned && planned.tipoVisual !== nodo.tipoVisual) {
      log.info(`[kev] nodo ${nodo.id}: visual ${nodo.tipoVisual} → ${planned.tipoVisual}`)
      nodo.tipoVisual = planned.tipoVisual as typeof nodo.tipoVisual
    }
  }
  log.info(`[kev] reparto ${plan.oracle ? 'del oráculo' : 'determinista'}: ${[...plan.nodes.values()].map(p => `${p.nodeId}[${p.skills.join('+') || '-'}${p.length ? `|${p.length}` : ''}]`).join(' ')}`)
  const executor = new HiveLearnExecutor(input.runContext, input.priorOutputs, { dossierText: input.dossierText, plan, kev })
  return { executor, plan }
}
