/**
 * ActionManager - Orchestrates action execution (sync + async)
 */

import { injectable, singleton, inject } from '@eclipse-daanse/tsm'
import type { ActionContext, ActionResult, CollectedInput, LogEntry, Job } from './types'
import type { ActionRegistryImpl } from './ActionRegistry'
import { useJobStore } from './composables/useJobStore'
import { AsyncPoller } from './AsyncPoller'

let jobCounter = 0

@injectable()
@singleton()
export class ActionManagerImpl {
  private registry: ActionRegistryImpl
  private internalExecutor: InternalExecutorImpl | null = null
  private remoteExecutor: RemoteExecutorImpl | null = null
  private eventBus: any = null
  private activePollers = new Map<string, AsyncPoller>()

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
    return true
  }

  async execute(actionId: string, context: ActionContext, params?: Record<string, unknown>): Promise<ActionResult> {
    const registered = this.registry.getAction(actionId)
    if (!registered) {
      return this.errorResult(`Action not found: ${actionId}`)
    }

    const def = registered.definition
    const store = useJobStore()

    // Create a job for tracking
    const jobId = `job-${++jobCounter}-${Date.now()}`
    const job: Job = {
      id: jobId,
      actionId,
      actionLabel: def.label || actionId,
      status: 'QUEUED',
      progress: 0,
      progressMessage: '',
      startedAt: new Date(),
      completedAt: null,
      logs: [],
      result: null,
      remoteJobId: null,
      asyncConfig: def.asyncConfig || null,
      cancelFn: null
    }
    store.addJob(job)

    // Emit start event
    this.eventBus?.emit('action:started', { actionId, jobId, context })

    try {
      const input = this.collectInput(def, context)
      const isRemote = def.eClass?.().getName?.() === 'RemoteAction' || def.endpointUrl
      const isAsync = def.executionMode === 'ASYNC' && def.asyncConfig && isRemote

      store.updateJob(jobId, { status: 'RUNNING' })

      if (isAsync && this.remoteExecutor) {
        return await this.executeAsync(jobId, def, input, params || {})
      } else if (isRemote && this.remoteExecutor) {
        return await this.executeSync(jobId, actionId, def, input, params || {}, 'remote')
      } else if (!isRemote && this.internalExecutor) {
        return await this.executeSync(jobId, actionId, def, input, params || {}, 'internal')
      } else {
        const result = this.errorResult(`No executor available for action: ${actionId}`)
        store.updateJob(jobId, { status: 'FAILED', result, completedAt: new Date() })
        return result
      }
    } catch (error: any) {
      const result = this.errorResult(error.message || String(error))
      store.updateJob(jobId, { status: 'FAILED', result, completedAt: new Date() })
      this.eventBus?.emit('action:failed', { actionId, jobId, error })
      return result
    }
  }

  private async executeSync(
    jobId: string, actionId: string, def: any, input: CollectedInput,
    params: Record<string, unknown>, mode: 'remote' | 'internal'
  ): Promise<ActionResult> {
    const store = useJobStore()
    let result: ActionResult

    if (mode === 'remote') {
      result = await this.remoteExecutor!.execute(def, input, params)
    } else {
      const handlerId = def.handlerId || def.actionId
      result = await this.internalExecutor!.execute(handlerId, {
        input,
        parameters: params,
        actionId
      })
    }

    const finalStatus = result.status === 'SUCCESS' || result.status === 'WARNING' ? 'COMPLETED' : 'FAILED'
    store.updateJob(jobId, {
      status: finalStatus,
      progress: 100,
      result,
      completedAt: new Date(),
      logs: result.logs.map(l => ({ message: l.message, level: l.level, timestamp: l.timestamp.toISOString() }))
    })

    this.eventBus?.emit('action:completed', { actionId, jobId, result })

    // Emit proposedActions event for UI notification
    if (result.proposedActions && result.proposedActions.length > 0) {
      this.eventBus?.emit('action:proposedActions', {
        actionId,
        jobId,
        resultStatus: result.status,
        resultMessage: result.logs[0]?.message || `Action ${actionId} completed`,
        proposedActions: result.proposedActions,
        artifacts: result.artifacts
      })
    }

    return result
  }

  private async executeAsync(
    jobId: string, def: any, input: CollectedInput, params: Record<string, unknown>
  ): Promise<ActionResult> {
    const store = useJobStore()
    const asyncConfig = def.asyncConfig

    // Send initial request
    const response = await this.remoteExecutor!.executeAsync(def, input, params)

    // If server responded synchronously (no jobId), treat as sync result
    if ('status' in response) {
      const result = response as ActionResult
      const finalStatus = result.status === 'SUCCESS' || result.status === 'WARNING' ? 'COMPLETED' : 'FAILED'
      store.updateJob(jobId, { status: finalStatus, progress: 100, result, completedAt: new Date() })
      return result
    }

    // Async: start polling
    const remoteJobId = response.jobId
    const statusUrl = asyncConfig.statusEndpoint.replace('{jobId}', remoteJobId)
    const cancelUrl = asyncConfig.cancelEndpoint.replace('{jobId}', remoteJobId)
    const resultUrl = asyncConfig.resultEndpoint.replace('{jobId}', remoteJobId)

    const poller = new AsyncPoller({
      statusUrl,
      cancelUrl,
      resultUrl,
      pollIntervalMs: asyncConfig.pollIntervalMs || 2000,
      maxJobDurationMs: asyncConfig.maxJobDurationMs || 300000,
      jobId: remoteJobId,
      localJobId: jobId,
      actionId: def.actionId,
      eventBus: this.eventBus,
      authConfig: def.authConfig
    })

    this.activePollers.set(jobId, poller)

    store.updateJob(jobId, {
      remoteJobId,
      cancelFn: () => {
        poller.cancel()
        this.activePollers.delete(jobId)
      }
    })

    poller.start()

    // Return immediately — the job is tracked in the store
    return {
      status: 'SUCCESS',
      logs: [{ message: `Async job started: ${remoteJobId}`, level: 'INFO', timestamp: new Date() }],
      artifacts: []
    }
  }

  private collectInput(def: any, context: ActionContext): CollectedInput {
    return {
      primaryObject: context.selectedObject,
      additionalObjects: context.selectedObjects || [],
      context
    }
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
  executeAsync(action: any, input: CollectedInput, params: Record<string, unknown>): Promise<{ jobId: string } | ActionResult>
}
