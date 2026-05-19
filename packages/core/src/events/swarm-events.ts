/**
 * HiveLearn — Local event emitter for swarm progress.
 * Decoupled from core's agentBus so hivelearn is self-contained.
 * server.ts subscribes here for SSE streaming.
 */

import { EventEmitter } from 'events'

class HLSwarmEmitter extends EventEmitter {
  override emit(event: string | symbol, ...args: any[]): boolean {
    const emitted = super.emit(event, ...args)
    if (event !== '*') super.emit('*', event, ...args)
    return emitted
  }

  subscribe(event: string, cb: (...args: any[]) => void): void {
    this.on(event, cb)
  }
  unsubscribe(event: string, cb: (...args: any[]) => void): void {
    this.off(event, cb)
  }
}

export const hlSwarmEmitter = new HLSwarmEmitter()
