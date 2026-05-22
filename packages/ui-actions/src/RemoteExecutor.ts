/**
 * RemoteExecutor - Executes actions via HTTP requests to remote endpoints
 */

import { injectable, singleton } from '@eclipse-daanse/tsm'
import type { ActionResult, CollectedInput, LogEntry, AsyncConfig, ProposedAction } from './types'
import { parseJobStatusXmi, parseActionApiXmi } from './ActionApiResourceSet'
import { extractOAuth2Config, ensureAccessToken, startAuthFlow } from './OAuth2Service'

@injectable()
@singleton()
export class RemoteExecutorImpl {

  async execute(action: any, input: CollectedInput, params: Record<string, unknown>): Promise<ActionResult> {
    const url = this.buildUrl(action, input, params)
    const method = action.httpMethod || 'POST'
    const headers = await this.buildHeaders(action)
    const body = this.buildBody(action, input, params)

    const timeoutMs = action.readTimeoutMs || 30000
    const controller = new AbortController()
    const timeoutId = setTimeout(() => controller.abort(), timeoutMs)

    try {
      // Apply retry logic
      const maxRetries = action.retryConfig?.maxRetries ?? 0
      let lastError: Error | null = null

      for (let attempt = 0; attempt <= maxRetries; attempt++) {
        try {
          const response = await fetch(url, {
            method,
            headers,
            body: method !== 'GET' ? body : undefined,
            signal: controller.signal
          })

          clearTimeout(timeoutId)

          if (!response.ok) {
            const retryOn = action.retryConfig?.retryOnStatus || []
            if (retryOn.includes(response.status) && attempt < maxRetries) {
              const delay = (action.retryConfig?.retryDelayMs || 1000) *
                Math.pow(action.retryConfig?.backoffMultiplier || 2, attempt)
              await new Promise(r => setTimeout(r, delay))
              continue
            }

            const errorText = await response.text().catch(() => '')
            return {
              status: 'ERROR',
              logs: [{
                message: `HTTP ${response.status}: ${response.statusText}`,
                detail: errorText,
                level: 'ERROR',
                timestamp: new Date()
              }],
              artifacts: []
            }
          }

          return await this.parseResponse(response, action)
        } catch (e: any) {
          lastError = e
          if (e.name === 'AbortError') break
          if (attempt < maxRetries) {
            const delay = (action.retryConfig?.retryDelayMs || 1000) *
              Math.pow(action.retryConfig?.backoffMultiplier || 2, attempt)
            await new Promise(r => setTimeout(r, delay))
          }
        }
      }

      clearTimeout(timeoutId)
      return {
        status: 'ERROR',
        logs: [{
          message: lastError?.name === 'AbortError' ? 'Request timeout' : `Network error: ${lastError?.message}`,
          level: 'ERROR',
          timestamp: new Date()
        }],
        artifacts: []
      }
    } finally {
      clearTimeout(timeoutId)
    }
  }

  private buildUrl(action: any, input: CollectedInput, params: Record<string, unknown>): string {
    let url = action.endpointUrl || ''

    // Template variable substitution
    if (input.primaryObject) {
      const eClass = input.primaryObject.eClass()
      url = url.replace('{className}', eClass.getName() || '')
      url = url.replace('{nsUri}', eClass.getEPackage()?.getNsURI() || '')
    }
    url = url.replace('{perspectiveId}', input.context.perspectiveId || '')

    // Query params serialization
    if (action.serialization === 'QUERY_PARAMS') {
      const searchParams = new URLSearchParams()
      for (const [key, value] of Object.entries(params)) {
        if (value !== undefined && value !== null) {
          searchParams.set(key, String(value))
        }
      }
      const qs = searchParams.toString()
      if (qs) url += (url.includes('?') ? '&' : '?') + qs
    }

    return url
  }

  private async buildHeaders(action: any): Promise<Record<string, string>> {
    const headers: Record<string, string> = {}

    if (action.contentType) {
      headers['Content-Type'] = action.contentType
    } else if (action.serialization === 'JSON_BODY') {
      headers['Content-Type'] = 'application/json'
    } else if (action.serialization === 'XMI_BODY') {
      headers['Content-Type'] = 'application/xml'
    }

    headers['Accept'] = 'application/json, application/xml, text/plain, */*'

    // Auth
    if (action.authConfig) {
      await this.applyAuth(headers, action.authConfig)
    } else {
      console.log('[RemoteExecutor] No authConfig on action:', action.actionId || action.label)
    }

    return headers
  }

  private async applyAuth(headers: Record<string, string>, auth: any): Promise<void> {
    const authType = auth.authType || auth
    console.log('[RemoteExecutor] applyAuth:', authType, auth)
    switch (authType) {
      case 'BEARER':
        if (auth.credentialRef) {
          headers['Authorization'] = `Bearer ${auth.credentialRef}`
        }
        break
      case 'API_KEY':
        if (auth.credentialRef) {
          headers[auth.apiKeyHeader || 'X-API-Key'] = auth.credentialRef
        }
        break
      case 'BASIC':
        if (auth.credentialRef) {
          headers['Authorization'] = `Basic ${btoa(auth.credentialRef)}`
        }
        break
      case 'OAUTH2': {
        const config = extractOAuth2Config(auth)
        if (!config) break
        // Try existing token or refresh
        let token = await ensureAccessToken(config)
        if (!token) {
          // No valid token — start interactive login
          token = await startAuthFlow(config)
        }
        if (token) {
          headers['Authorization'] = `Bearer ${token}`
        }
        break
      }
    }
  }

  private buildBody(action: any, input: CollectedInput, params: Record<string, unknown>): string | undefined {
    switch (action.serialization) {
      case 'JSON_BODY': {
        const body: any = { ...params }
        if (input.primaryObject) {
          body.selection = {
            className: input.primaryObject.eClass().getName(),
            nsUri: input.primaryObject.eClass().getEPackage()?.getNsURI()
          }
        }
        body.context = {
          perspectiveId: input.context.perspectiveId,
          timestamp: input.context.timestamp.toISOString()
        }
        return JSON.stringify(body)
      }
      case 'XMI_BODY':
        return this.buildXmiBody(input)
      case 'QUERY_PARAMS':
        return undefined
      default:
        return params ? JSON.stringify(params) : undefined
    }
  }

  private async parseResponse(response: Response, action: any): Promise<ActionResult> {
    const contentType = response.headers.get('content-type') || ''
    const logs: LogEntry[] = []
    const artifacts: any[] = []

    if (contentType.includes('application/json')) {
      const json = await response.json()

      // Apply response mapping if configured
      const mapping = action.responseMapping
      if (mapping) {
        // Extract status
        if (mapping.statusPath) {
          const status = this.extractPath(json, mapping.statusPath)
          if (status) logs.push({ message: `Status: ${status}`, level: 'INFO', timestamp: new Date() })
        }
        // Extract artifacts
        if (mapping.artifactMappings) {
          for (const am of mapping.artifactMappings) {
            const data = am.sourcePath ? this.extractPath(json, am.sourcePath) : json
            artifacts.push({
              type: am.returnType || 'JSON',
              name: 'result',
              data
            })
          }
        }
      }

      if (artifacts.length === 0) {
        // Default: wrap entire response as JSON artifact
        artifacts.push({ type: 'JSON', name: 'response', data: json })
      }
    } else if (contentType.includes('text/markdown')) {
      const text = await response.text()
      artifacts.push({ type: 'MARKDOWN', name: 'result', content: text, data: text })
    } else if (contentType.includes('text/html')) {
      const text = await response.text()
      artifacts.push({ type: 'HTML', name: 'result', data: text })
    } else if (contentType.includes('application/xml') || contentType.includes('application/xmi')) {
      const text = await response.text()
      // Try to parse as ActionApi JobStatus/ActionResult
      const parsed = this.tryParseActionApiXmi(text)
      if (parsed) {
        return parsed
      }
      artifacts.push({ type: 'XMI', name: 'result', xmiContent: text, data: text, importMode: 'NEW_RESOURCE' })
    } else {
      const blob = await response.blob()
      artifacts.push({
        type: 'FILE',
        name: 'download',
        fileName: this.getFilenameFromResponse(response),
        mimeType: contentType,
        content: blob,
        data: blob,
        handling: 'DOWNLOAD'
      })
    }

    return { status: 'SUCCESS', logs, artifacts }
  }

  private extractPath(obj: any, path: string): any {
    const parts = path.replace(/^\$\./, '').split('.')
    let current = obj
    for (const part of parts) {
      if (current == null) return undefined
      current = current[part]
    }
    return current
  }

  /**
   * Execute an async request — sends initial POST, returns remote job ID
   */
  async executeAsync(action: any, input: CollectedInput, params: Record<string, unknown>): Promise<{ jobId: string } | ActionResult> {
    const url = this.buildUrl(action, input, params)
    const method = action.httpMethod || 'POST'
    const headers = await this.buildHeaders(action)
    headers['X-Async'] = 'true'
    const body = this.buildBody(action, input, params)

    const timeoutMs = action.readTimeoutMs || 30000
    const controller = new AbortController()
    const timeoutId = setTimeout(() => controller.abort(), timeoutMs)

    try {
      const response = await fetch(url, {
        method,
        headers,
        body: method !== 'GET' ? body : undefined,
        signal: controller.signal
      })
      clearTimeout(timeoutId)

      if (!response.ok) {
        const errorText = await response.text().catch(() => '')
        return {
          status: 'ERROR',
          logs: [{
            message: `HTTP ${response.status}: ${response.statusText}`,
            detail: errorText,
            level: 'ERROR',
            timestamp: new Date()
          }],
          artifacts: []
        }
      }

      const contentType = response.headers.get('content-type') || ''

      // XMI response — parse as JobStatus, extract jobId
      if (contentType.includes('xml') || contentType.includes('xmi')) {
        const xmi = await response.text()
        const jobStatus = parseJobStatusXmi(xmi)
        const jobId = jobStatus ? (jobStatus.jobId || this.featVal(jobStatus, 'jobId')) : null
        if (jobId) {
          return { jobId }
        }
        // No jobId = sync result returned as XMI
        return await this.parseResponse(new Response(xmi, {
          headers: { 'content-type': contentType }
        }), action)
      }

      // JSON fallback
      const json = await response.json()
      if (json.jobId) {
        return { jobId: json.jobId }
      }
      return await this.parseResponse(new Response(JSON.stringify(json), {
        headers: { 'content-type': 'application/json' }
      }), action)
    } catch (err: any) {
      clearTimeout(timeoutId)
      return {
        status: 'ERROR',
        logs: [{
          message: err.name === 'AbortError' ? 'Request timeout' : `Network error: ${err.message}`,
          level: 'ERROR',
          timestamp: new Date()
        }],
        artifacts: []
      }
    }
  }

  private buildXmiBody(input: CollectedInput): string | undefined {
    if (!input.primaryObject) return undefined
    try {
      // Dynamic import pattern (same as builtinHandlers)
      // In sync context we try to access an already-loaded XMIResource
      const core = (globalThis as any).__emfts_core
      if (core?.XMIResource) {
        const resource = new core.XMIResource()
        resource.getContents().push(input.primaryObject)
        return resource.saveToString()
      }
    } catch { /* fall through */ }
    return undefined
  }

  private featVal(obj: any, name: string): any {
    if (obj[name] !== undefined) return obj[name]
    if (obj.eClass && obj.eGet) {
      const features = obj.eClass().getEAllStructuralFeatures?.() || obj.eClass().getEStructuralFeatures?.() || []
      for (const f of features) {
        if (f.getName() === name) return obj.eGet(f)
      }
    }
    return undefined
  }

  /**
   * Try to parse XMI as an ActionApi JobStatus (with embedded ActionResult).
   * Extracts structured artifacts, logs, and proposedActions.
   */
  private tryParseActionApiXmi(xmi: string): ActionResult | null {
    try {
      const jobStatus = parseJobStatusXmi(xmi)
      if (!jobStatus) return null

      const resultStatus = this.featVal(jobStatus, 'resultStatus')
        || this.featVal(this.featVal(jobStatus, 'result'), 'resultStatus')

      const resultObj = this.featVal(jobStatus, 'result')
      if (!resultObj && !resultStatus) return null

      const source = resultObj || jobStatus
      const status = this.featVal(source, 'resultStatus') || 'SUCCESS'
      const message = this.featVal(source, 'message') || ''

      const logs: LogEntry[] = []
      if (message) logs.push({ message, level: 'INFO', timestamp: new Date() })

      // Extract logs from JobStatus
      const rawLogs = this.toArray(this.featVal(jobStatus, 'logs'))
      for (const l of rawLogs) {
        logs.push({
          message: this.featVal(l, 'message') || '',
          level: this.featVal(l, 'level') || 'INFO',
          timestamp: new Date(this.featVal(l, 'timestamp') || Date.now())
        })
      }

      // Extract artifacts
      const artifacts: any[] = []
      const rawArtifacts = this.toArray(this.featVal(source, 'artifacts'))
      for (const a of rawArtifacts) {
        const artifactType = this.featVal(a, 'artifactType') || 'XMI'
        const art: any = {
          type: artifactType,
          name: this.featVal(a, 'name') || 'result',
          data: this.featVal(a, 'content')
        }
        if (artifactType === 'XMI') {
          art.xmiContent = this.featVal(a, 'content')
          art.importMode = 'NEW_RESOURCE'
        }
        if (artifactType === 'VALIDATION_MESSAGES') {
          art.messages = this.toArray(this.featVal(a, 'validationMessages')).map((vm: any) => ({
            severity: this.featVal(vm, 'severity') || 'INFO',
            message: this.featVal(vm, 'message') || '',
            objectUri: this.featVal(vm, 'objectUri'),
            className: this.featVal(vm, 'className'),
            featureName: this.featVal(vm, 'featureName')
          }))
        }
        artifacts.push(art)
      }

      // Extract proposedActions
      const proposedActions: ProposedAction[] = []
      const rawPA = this.toArray(this.featVal(source, 'proposedActions'))
      for (const pa of rawPA) {
        proposedActions.push({
          commandId: this.featVal(pa, 'commandId') || '',
          label: this.featVal(pa, 'label') || '',
          description: this.featVal(pa, 'description'),
          args: this.featVal(pa, 'args'),
          autoExecute: this.featVal(pa, 'autoExecute') === 'true' || this.featVal(pa, 'autoExecute') === true
        })
      }

      const statusMap: Record<string, ActionResult['status']> = {
        'SUCCESS': 'SUCCESS', 'WARNING': 'WARNING', 'ERROR': 'ERROR'
      }

      return {
        status: statusMap[status] || 'SUCCESS',
        logs,
        artifacts,
        ...(proposedActions.length > 0 ? { proposedActions } : {})
      }
    } catch (e) {
      console.warn('[RemoteExecutor] Failed to parse ActionApi XMI:', e)
      return null
    }
  }

  private toArray(val: any): any[] {
    if (!val) return []
    if (Array.isArray(val)) return val
    if (typeof val.toArray === 'function') return val.toArray()
    if (typeof val[Symbol.iterator] === 'function') return Array.from(val)
    return []
  }

  private getFilenameFromResponse(response: Response): string {
    const disposition = response.headers.get('content-disposition')
    if (disposition) {
      const match = disposition.match(/filename="?([^";\s]+)"?/)
      if (match) return match[1]
    }
    return 'download'
  }
}
