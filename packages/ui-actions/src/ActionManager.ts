/**
 * ActionManager - Orchestrates action execution
 */

import { injectable, singleton, inject } from '@eclipse-daanse/tsm'
import type { ActionContext, ActionResult, CollectedInput, LogEntry } from './types'
import type { ActionRegistryImpl } from './ActionRegistry'

@injectable()
@singleton()
export class ActionManagerImpl {
  private registry: ActionRegistryImpl
  private internalExecutor: InternalExecutorImpl | null = null
  private remoteExecutor: RemoteExecutorImpl | null = null
  private eventBus: any = null

  constructor(
    @inject('gene.action.registry') registry: ActionRegistryImpl
  ) {
    this.registry = registry
  }

  setInternalExecutor(executor: any): void {
    this.internalExecutor = executor
  }

  setRemoteExecutor(executor: any): void {
    this.remoteExecutor = executor
  }

  setEventBus(eventBus: any): void {
    this.eventBus = eventBus
  }

  canExecute(actionId: string, context: ActionContext): boolean {
    const registered = this.registry.getAction(actionId)
    if (!registered) return false
    const def = registered.definition
    if (def.enabled === false) return false
    // TODO: evaluate enabledWhen OCL expression
    return true
  }

  async execute(actionId: string, context: ActionContext, params?: Record<string, unknown>): Promise<ActionResult> {
    const registered = this.registry.getAction(actionId)
    if (!registered) {
      return this.errorResult(`Action not found: ${actionId}`)
    }

    const def = registered.definition

    // Emit start event
    this.eventBus?.emit('action:started', { actionId, context })

    try {
      // Collect input
      const input = this.collectInput(def, context)

      // Determine executor
      const isRemote = def.eClass?.().getName?.() === 'RemoteAction' || def.endpointUrl
      const isInternal = !isRemote

      let result: ActionResult

      if (isRemote && this.remoteExecutor) {
        result = await this.remoteExecutor.execute(def, input, params || {})
      } else if (isInternal && this.internalExecutor) {
        const handlerId = def.handlerId || def.actionId
        result = await this.internalExecutor.execute(handlerId, {
          input,
          parameters: params || {},
          actionId
        })
      } else {
        result = this.errorResult(`No executor available for action: ${actionId}`)
      }

      // Emit completion event
      this.eventBus?.emit('action:completed', { actionId, result })

      return result
    } catch (error: any) {
      const result = this.errorResult(error.message || String(error))
      this.eventBus?.emit('action:failed', { actionId, error })
      return result
    }
  }

  private collectInput(def: any, context: ActionContext): CollectedInput {
    const input: CollectedInput = {
      primaryObject: context.selectedObject,
      additionalObjects: context.selectedObjects || [],
      context
    }

    // TODO: Evaluate OCL filters from def.inputSpec.oclFilters
    // TODO: Include schema if def.inputSpec.includeSchema

    return input
  }

  private errorResult(message: string): ActionResult {
    return {
      status: 'ERROR',
      logs: [{
        message,
        level: 'ERROR',
        timestamp: new Date()
      }],
      artifacts: []
    }
  }
}

// Forward declarations for type safety
interface InternalExecutorImpl {
  execute(handlerId: string, context: any): Promise<ActionResult>
}
interface RemoteExecutorImpl {
  execute(action: any, input: CollectedInput, params: Record<string, unknown>): Promise<ActionResult>
}
