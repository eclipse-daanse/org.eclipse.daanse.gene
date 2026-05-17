/**
 * AsyncPoller — setTimeout-based polling for async job status (XMI)
 */

import type { Job, JobState, JobStatusResponse, JobLogEntry, ProposedAction } from './types'
import { useJobStore } from './composables/useJobStore'
import { parseJobStatusXmi } from './ActionApiResourceSet'

/** Read a feature value from an EObject by name */
function feat(obj: any, name: string): any {
  if (obj[name] !== undefined) return obj[name]
  if (obj.eClass && obj.eGet) {
    const features = obj.eClass().getEAllStructuralFeatures?.() || obj.eClass().getEStructuralFeatures?.() || []
    for (const f of features) {
      if (f.getName() === name) return obj.eGet(f)
    }
  }
  return undefined
}

function toArray(val: any): any[] {
  if (!val) return []
  if (Array.isArray(val)) return val
  if (typeof val.toArray === 'function') return val.toArray()
  if (typeof val[Symbol.iterator] === 'function') return Array.from(val)
  return []
}

export interface AsyncPollerConfig {
  statusUrl: string
  cancelUrl: string
  resultUrl: string
  pollIntervalMs: number
  maxJobDurationMs: number
  jobId: string
  localJobId: string
  actionId?: string
  eventBus?: any
}

export class AsyncPoller {
  private abortController: AbortController
  private timerId: ReturnType<typeof setTimeout> | null = null
  private startTime: number
  private config: AsyncPollerConfig

  constructor(config: AsyncPollerConfig) {
    this.config = config
    this.abortController = new AbortController()
    this.startTime = Date.now()
  }

  start(): void {
    this.poll()
  }

  stop(): void {
    this.abortController.abort()
    if (this.timerId !== null) {
      clearTimeout(this.timerId)
      this.timerId = null
    }
  }

  async cancel(): Promise<void> {
    this.stop()
    const store = useJobStore()
    try {
      await fetch(this.config.cancelUrl, {
        method: 'DELETE',
        signal: AbortSignal.timeout(5000)
      })
    } catch {
      // Best effort
    }
    store.cancelJob(this.config.localJobId)
  }

  private async poll(): Promise<void> {
    if (this.abortController.signal.aborted) return
    const store = useJobStore()

    // Check timeout
    if (Date.now() - this.startTime > this.config.maxJobDurationMs) {
      store.updateJob(this.config.localJobId, {
        status: 'FAILED',
        progressMessage: 'Job timed out',
        completedAt: new Date()
      })
      await this.cancelRemote()
      return
    }

    try {
      const response = await fetch(this.config.statusUrl, {
        headers: { 'Accept': 'application/xmi, application/xml, application/json' },
        signal: this.abortController.signal
      })
      if (!response.ok) {
        this.scheduleNext()
        return
      }

      const status = await this.parseStatusResponse(response)
      if (!status) {
        this.scheduleNext()
        return
      }

      store.updateJob(this.config.localJobId, {
        status: status.status,
        progress: status.progress,
        progressMessage: status.progressMessage,
        logs: status.logs || []
      })

      if (status.status === 'COMPLETED') {
        await this.fetchResult()
        return
      }

      if (status.status === 'FAILED' || status.status === 'CANCELED') {
        store.updateJob(this.config.localJobId, { completedAt: new Date() })
        return
      }

      this.scheduleNext()
    } catch (err: any) {
      if (err.name === 'AbortError') return
      this.scheduleNext()
    }
  }

  /**
   * Parse status response — XMI or JSON depending on content-type
   */
  private async parseStatusResponse(response: Response): Promise<JobStatusResponse | null> {
    const contentType = response.headers.get('content-type') || ''

    if (contentType.includes('xml') || contentType.includes('xmi')) {
      const xmi = await response.text()
      const eObj = parseJobStatusXmi(xmi)
      if (!eObj) return null
      return this.jobStatusEObjectToResponse(eObj)
    }

    // Fallback: JSON
    return await response.json()
  }

  private jobStatusEObjectToResponse(eObj: any): JobStatusResponse {
    return {
      jobId: feat(eObj, 'jobId'),
      status: feat(eObj, 'status') as JobState,
      progress: parseInt(feat(eObj, 'progress'), 10) || 0,
      progressMessage: feat(eObj, 'progressMessage'),
      startedAt: feat(eObj, 'startedAt'),
      logs: toArray(feat(eObj, 'logs')).map((l: any) => ({
        message: feat(l, 'message'),
        level: feat(l, 'level') as 'INFO' | 'WARN' | 'ERROR',
        timestamp: feat(l, 'timestamp')
      }))
    }
  }

  private async fetchResult(): Promise<void> {
    const store = useJobStore()
    try {
      const response = await fetch(this.config.resultUrl, {
        headers: { 'Accept': 'application/xmi, application/xml, application/json' },
        signal: AbortSignal.timeout(30000)
      })
      if (!response.ok) {
        store.updateJob(this.config.localJobId, { completedAt: new Date() })
        return
      }

      const contentType = response.headers.get('content-type') || ''
      let actionResult: any = null

      if (contentType.includes('xml') || contentType.includes('xmi')) {
        const xmi = await response.text()
        const eObj = parseJobStatusXmi(xmi)
        if (eObj) {
          const resultObj = feat(eObj, 'result')
          if (resultObj) {
            actionResult = this.extractActionResult(resultObj)
          }
        }
      } else {
        actionResult = await response.json()
      }

      if (actionResult) {
        store.updateJob(this.config.localJobId, {
          result: actionResult,
          completedAt: new Date()
        })

        // Emit proposedActions event
        const proposedActions = actionResult.proposedActions
        if (proposedActions?.length > 0 && this.config.eventBus) {
          this.config.eventBus.emit('action:proposedActions', {
            actionId: this.config.actionId,
            jobId: this.config.localJobId,
            resultStatus: actionResult.status || 'SUCCESS',
            resultMessage: actionResult.logs?.[0]?.message || 'Action completed',
            proposedActions,
            artifacts: actionResult.artifacts || []
          })
        }
      } else {
        store.updateJob(this.config.localJobId, { completedAt: new Date() })
      }
    } catch {
      store.updateJob(this.config.localJobId, { completedAt: new Date() })
    }
  }

  private extractActionResult(resultObj: any): any {
    const status = feat(resultObj, 'resultStatus') || 'SUCCESS'
    const message = feat(resultObj, 'message') || ''

    const artifacts = toArray(feat(resultObj, 'artifacts')).map((a: any) => {
      const artifactType = feat(a, 'artifactType') || 'XMI'
      const art: any = {
        type: artifactType,
        name: feat(a, 'name') || 'result',
        data: feat(a, 'content')
      }
      if (artifactType === 'XMI') {
        art.xmiContent = feat(a, 'content')
      }
      if (artifactType === 'VALIDATION_MESSAGES') {
        art.messages = toArray(feat(a, 'validationMessages')).map((vm: any) => ({
          severity: feat(vm, 'severity') || 'INFO',
          message: feat(vm, 'message') || '',
          objectUri: feat(vm, 'objectUri'),
          className: feat(vm, 'className'),
          featureName: feat(vm, 'featureName')
        }))
      }
      return art
    })

    const proposedActions: ProposedAction[] = toArray(feat(resultObj, 'proposedActions')).map((pa: any) => ({
      commandId: feat(pa, 'commandId') || '',
      label: feat(pa, 'label') || '',
      description: feat(pa, 'description'),
      args: feat(pa, 'args'),
      autoExecute: feat(pa, 'autoExecute') === 'true' || feat(pa, 'autoExecute') === true
    }))

    const statusMap: Record<string, string> = { 'SUCCESS': 'SUCCESS', 'WARNING': 'WARNING', 'ERROR': 'ERROR' }

    return {
      status: statusMap[status] || 'SUCCESS',
      logs: message ? [{ message, level: 'INFO', timestamp: new Date() }] : [],
      artifacts,
      ...(proposedActions.length > 0 ? { proposedActions } : {})
    }
  }

  private async cancelRemote(): Promise<void> {
    try {
      await fetch(this.config.cancelUrl, {
        method: 'DELETE',
        signal: AbortSignal.timeout(5000)
      })
    } catch {
      // Best effort
    }
  }

  private scheduleNext(): void {
    if (this.abortController.signal.aborted) return
    this.timerId = setTimeout(() => this.poll(), this.config.pollIntervalMs)
  }
}
