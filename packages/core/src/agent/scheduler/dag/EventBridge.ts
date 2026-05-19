/**
 * HiveLearn EventBridge — maps DAG lifecycle events to hlSwarmEmitter.
 * Decoupled from core's agentBus and canvas emitter.
 */

import { hlSwarmEmitter } from '../../../events/swarm-events'
import { TaskNode } from './TaskNode'
import type { DAGResult } from './TaskResult'

export class EventBridge {
  private swarmId: string
  private sessionId: string
  private coordinatorId: string

  constructor(swarmId: string, sessionId: string, coordinatorId: string) {
    this.swarmId = swarmId
    this.sessionId = sessionId
    this.coordinatorId = coordinatorId
  }

  onSwarmStarted(totalTasks: number): void {
    hlSwarmEmitter.emit('swarm:started', {
      sessionId: this.sessionId,
      swarmId: this.swarmId,
      coordinatorId: this.coordinatorId,
      totalTasks,
      timestamp: Date.now(),
    })

    hlSwarmEmitter.emit('coordinator:phase_changed', {
      sessionId: this.sessionId,
      swarmId: this.swarmId,
      coordinatorId: this.coordinatorId,
      status: 'delegating',
      phase: 'dispatch',
      label: `Coordinador delegando ${totalTasks} tareas del enjambre`,
      progress: 0,
      timestamp: Date.now(),
    })
  }

  onTaskStarted(node: TaskNode): void {
    hlSwarmEmitter.emit('worker:task_dispatched', {
      sessionId: this.sessionId,
      workerId: node.agentId,
      workerName: node.name,
      taskId: node.id,
      swarmId: this.swarmId,
      label: `Coordinador envió ${node.name}`,
      timestamp: Date.now(),
    })

    hlSwarmEmitter.emit('worker:task_started', {
      sessionId: this.sessionId,
      workerId: node.agentId,
      workerName: node.name,
      taskId: node.id,
      swarmId: this.swarmId,
      label: `${node.name} trabajando`,
      timestamp: Date.now(),
    })
  }

  onTaskCompleted(node: TaskNode, progress: number): void {
    hlSwarmEmitter.emit('worker:task_completed', {
      sessionId: this.sessionId,
      workerId: node.agentId,
      workerName: node.name,
      taskId: node.id,
      result: node.result ?? '',
      progress,
      swarmId: this.swarmId,
      label: `${node.name} completó su tarea`,
      timestamp: Date.now(),
    })

    hlSwarmEmitter.emit('worker:result_received', {
      sessionId: this.sessionId,
      workerId: node.agentId,
      workerName: node.name,
      taskId: node.id,
      progress,
      swarmId: this.swarmId,
      label: `Coordinador recibió resultado de ${node.name}`,
      summary: node.result?.slice(0, 180) ?? '',
      timestamp: Date.now(),
    })
  }

  onTaskFailed(node: TaskNode, progress: number): void {
    hlSwarmEmitter.emit('worker:task_failed', {
      sessionId: this.sessionId,
      workerId: node.agentId,
      workerName: node.name,
      taskId: node.id,
      error: node.error ?? 'unknown error',
      progress,
      swarmId: this.swarmId,
      label: `${node.name} falló`,
      timestamp: Date.now(),
    })
  }

  onSwarmCompleted(result: DAGResult): void {
    hlSwarmEmitter.emit('swarm:completed', {
      sessionId: this.sessionId,
      swarmId: this.swarmId,
      coordinatorId: this.coordinatorId,
      success: result.success,
      completedCount: result.completed.length,
      failedCount: result.failed.length,
      totalDurationMs: result.totalDurationMs,
      timestamp: Date.now(),
    })

    hlSwarmEmitter.emit('coordinator:phase_changed', {
      sessionId: this.sessionId,
      swarmId: this.swarmId,
      coordinatorId: this.coordinatorId,
      status: result.success ? 'assembling' : 'error',
      phase: 'swarm_complete',
      label: result.success
        ? `Coordinador integrando ${result.completed.length} resultados`
        : `Swarm finalizó con ${result.failed.length} fallo(s)`,
      progress: 100,
      timestamp: Date.now(),
    })
  }
}
