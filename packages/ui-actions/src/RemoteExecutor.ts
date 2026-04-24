/**
 * RemoteExecutor - Executes actions via HTTP requests to remote endpoints
 */

import { injectable, singleton } from '@eclipse-daanse/tsm'
import type { ActionResult, CollectedInput, LogEntry } from './types'

@injectable()
@singleton()
export class RemoteExecutorImpl {

  async execute(action: any, input: CollectedInput, params: Record<string, unknown>): Promise<ActionResult> {
    const url = this.buildUrl(action, input, params)
    const method = action.httpMethod || 'POST'
    const headers = this.buildHeaders(action)
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

  private buildHeaders(action: any): Record<string, string> {
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
      this.applyAuth(headers, action.authConfig)
    }

    return headers
  }

  private applyAuth(headers: Record<string, string>, auth: any): void {
    switch (auth.authType) {
      case 'BEARER':
        if (auth.credentialRef) {
          // TODO: resolve from credential store
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
        // TODO: serialize primaryObject as XMI
        return undefined
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

  private getFilenameFromResponse(response: Response): string {
    const disposition = response.headers.get('content-disposition')
    if (disposition) {
      const match = disposition.match(/filename="?([^";\s]+)"?/)
      if (match) return match[1]
    }
    return 'download'
  }
}
