/**
 * ModelAtlasClient - REST client for the Model Atlas API
 *
 * Wraps all Model Atlas REST endpoints with typed TypeScript methods.
 * Uses fetch API for browser compatibility.
 * All requests use application/xml (XMI) as Accept/Content-Type.
 *
 * Returns raw XMI strings from all methods - parsing into EMFTs
 * EObjects is done by the adapter layer using AtlasResourceSet.
 */

import type { AtlasMediaType } from './types'
import { ATLAS_MEDIA_TYPES } from './types'

/** Diagnostic result from server-side validation */
export interface ValidationDiagnostic {
  type: 'OK' | 'INFO' | 'WARNING' | 'ERROR' | 'CANCEL'
  message?: string
  source?: string
  exceptionMsg?: string
  children: ValidationDiagnostic[]
  data?: string[]
}

export interface ModelAtlasClientOptions {
  /** Base URL of the Model Atlas REST API */
  baseUrl: string
  /** Authentication token */
  token?: string
}

export class ModelAtlasClient {
  private baseUrl: string
  private token?: string

  constructor(options: ModelAtlasClientOptions) {
    this.baseUrl = options.baseUrl.replace(/\/+$/, '')
    this.token = options.token
  }

  // ============================================
  // Scopes
  // ============================================

  async listScopes(): Promise<string> {
    const resp = await this.get('/scopes')
    if (resp.status === 200) return await resp.text()
    return ''
  }

  async getScope(scopeName: string): Promise<string | null> {
    const resp = await this.get(`/scopes/${enc(scopeName)}`)
    if (resp.status === 200) return await resp.text()
    return null
  }

  // ============================================
  // Schema Packages
  // ============================================

  async listReleasedSchemas(scopeName: string): Promise<string> {
    const resp = await this.get(`/${enc(scopeName)}/schema`)
    if (resp.status === 200) return await resp.text()
    return ''
  }

  /**
   * List all schemas across all stages
   */
  async listAllSchemas(scopeName: string): Promise<string> {
    const resp = await this.get(`/${enc(scopeName)}/schema/all`)
    if (resp.status === 200) return await resp.text()
    return ''
  }

  /**
   * Search schemas using Lucene-based full-text search
   */
  async searchSchemas(scopeName: string, params: {
    nsUri?: string; nsUriExact?: string; name?: string; prefix?: string;
    classifier?: string; featureName?: string; featureType?: string;
    featureNameTypePair?: string; stage?: string; limit?: number; offset?: number;
  }): Promise<string> {
    const qs = new URLSearchParams()
    for (const [key, value] of Object.entries(params)) {
      if (value !== undefined && value !== null) qs.set(key, String(value))
    }
    const resp = await this.get(`/${enc(scopeName)}/schema/search?${qs.toString()}`)
    if (resp.status === 200) return await resp.text()
    return ''
  }

  async listSchemas(scopeName: string, stage: string): Promise<string> {
    const resp = await this.get(`/${enc(scopeName)}/schema/stages/${enc(stage)}`)
    if (resp.status === 200) return await resp.text()
    return ''
  }

  async getSchema(scopeName: string, stage: string, nsUri: string): Promise<string | null> {
    const resp = await this.get(
      `/${enc(scopeName)}/schema/stages/${enc(stage)}?nsUri=${enc(nsUri)}`
    )
    if (resp.status === 200) return await resp.text()
    return null
  }

  async getSchemaContent(scopeName: string, stage: string, nsUri: string): Promise<string | null> {
    const resp = await this.get(
      `/${enc(scopeName)}/schema/stages/${enc(stage)}/content?nsUri=${enc(nsUri)}`
    )
    if (resp.status === 200) return await resp.text()
    return null
  }

  async uploadSchema(
    scopeName: string,
    stage: string,
    content: string,
    options?: { nsUri?: string; name?: string; version?: string; overwrite?: boolean }
  ): Promise<string> {
    const params = new URLSearchParams()
    if (options?.nsUri) params.set('nsUri', options.nsUri)
    if (options?.name) params.set('name', options.name)
    if (options?.version) params.set('version', options.version)
    if (options?.overwrite) params.set('overwrite', 'true')

    const qs = params.toString()
    const path = `/${enc(scopeName)}/schema/stages/${enc(stage)}${qs ? '?' + qs : ''}`

    const resp = await this.post(path, content)
    if (resp.status === 201 || resp.status === 200) return await resp.text()
    const errorText = await resp.text()
    throw new Error(`Upload schema failed (${resp.status}): ${errorText}`)
  }

  async updateSchemaContent(
    scopeName: string,
    stage: string,
    nsUri: string,
    content: string,
    options?: { version?: string }
  ): Promise<string> {
    const params = new URLSearchParams()
    params.set('nsUri', nsUri)
    if (options?.version) params.set('version', options.version)

    const path = `/${enc(scopeName)}/schema/stages/${enc(stage)}/content?${params.toString()}`
    const resp = await this.put(path, content)
    if (resp.status === 200) return await resp.text()
    const errorText = await resp.text()
    throw new Error(`Update schema failed (${resp.status}): ${errorText}`)
  }

  async deleteSchema(scopeName: string, stage: string, nsUri: string): Promise<boolean> {
    const resp = await this.del(
      `/${enc(scopeName)}/schema/stages/${enc(stage)}?nsUri=${enc(nsUri)}`
    )
    return resp.status === 200
  }

  /**
   * Transition schema to another stage.
   */
  async transitionSchema(
    scopeName: string,
    fromStage: string,
    objectId: string,
    targetStage: string
  ): Promise<string | null> {
    const body = JSON.stringify({ objectId, targetStage })
    const resp = await this.request(
      'POST',
      `/${enc(scopeName)}/schema/stages/${enc(fromStage)}/actions/transition`,
      body,
      { contentType: 'application/json' }
    )
    if (resp.ok) {
      if (resp.status === 204) return ''
      return await resp.text()
    }
    return null
  }

  // ============================================
  // Object Registries
  // ============================================

  /**
   * List all objects across all stages
   */
  async listAllObjects(scopeName: string, registryName: string): Promise<string> {
    const resp = await this.get(
      `/${enc(scopeName)}/registries/${enc(registryName)}/all`
    )
    if (resp.status === 200) return await resp.text()
    return ''
  }

  async listReleasedObjects(scopeName: string, registryName: string): Promise<string> {
    const resp = await this.get(
      `/${enc(scopeName)}/registries/${enc(registryName)}`
    )
    if (resp.status === 200) return await resp.text()
    return ''
  }

  async listObjects(scopeName: string, registryName: string, stage: string): Promise<string> {
    const resp = await this.get(
      `/${enc(scopeName)}/registries/${enc(registryName)}/stages/${enc(stage)}`
    )
    if (resp.status === 200) return await resp.text()
    return ''
  }

  async getObjectContent(
    scopeName: string,
    registryName: string,
    stage: string,
    objectId: string
  ): Promise<string | null> {
    const resp = await this.get(
      `/${enc(scopeName)}/registries/${enc(registryName)}/stages/${enc(stage)}/content?objectId=${enc(objectId)}`
    )
    if (resp.status === 200) return await resp.text()
    return null
  }

  async uploadObject(
    scopeName: string,
    registryName: string,
    stage: string,
    objectId: string,
    content: string,
    options?: { name?: string; version?: string; override?: boolean }
  ): Promise<string> {
    const params = new URLSearchParams()
    if (options?.name) params.set('name', options.name)
    if (options?.version) params.set('version', options.version)
    if (options?.override) params.set('override', 'true')

    const qs = params.toString()
    const path = `/${enc(scopeName)}/registries/${enc(registryName)}/stages/${enc(stage)}/${enc(objectId)}${qs ? '?' + qs : ''}`

    const resp = await this.post(path, content)
    if (resp.status === 201 || resp.status === 200) return await resp.text()
    const errorText = await resp.text()
    throw new Error(`Upload object failed (${resp.status}): ${errorText}`)
  }

  async updateObjectContent(
    scopeName: string,
    registryName: string,
    stage: string,
    objectId: string,
    content: string,
    options?: { version?: string }
  ): Promise<string> {
    const params = new URLSearchParams()
    params.set('objectId', objectId)
    if (options?.version) params.set('version', options.version || '1.0.0')

    const path = `/${enc(scopeName)}/registries/${enc(registryName)}/stages/${enc(stage)}/content?${params.toString()}`
    const resp = await this.put(path, content)
    if (resp.status === 200) return await resp.text()
    const errorText = await resp.text()
    throw new Error(`Update object failed (${resp.status}): ${errorText}`)
  }

  async deleteObject(
    scopeName: string,
    registryName: string,
    stage: string,
    objectId: string
  ): Promise<boolean> {
    const resp = await this.del(
      `/${enc(scopeName)}/registries/${enc(registryName)}/stages/${enc(stage)}?objectId=${enc(objectId)}`
    )
    return resp.status === 200
  }

  /**
   * Transition object to another stage.
   */
  async transitionObject(
    scopeName: string,
    registryName: string,
    fromStage: string,
    objectId: string,
    targetStage: string
  ): Promise<string | null> {
    const body = JSON.stringify({ objectId, targetStage })
    const resp = await this.request(
      'POST',
      `/${enc(scopeName)}/registries/${enc(registryName)}/stages/${enc(fromStage)}/actions/transition`,
      body,
      { contentType: 'application/json' }
    )
    if (resp.ok) {
      if (resp.status === 204) return ''
      return await resp.text()
    }
    return null
  }

  // ============================================
  // Data Generation (Faker)
  // ============================================

  /**
   * Generate test data using the server-side DataGen service.
   * Sends a DataGenConfig as XMI and returns generated EObjects.
   *
   * @param configXmi - DataGenConfig serialized as XMI
   * @param accept - Response format: 'application/xmi' (default) or 'application/json'
   * @returns Generated instances as XMI or JSON string
   */
  /**
   * Generate test data from a named config stored on the server.
   *
   * @param configName - Name of the DataGenConfig stored in the Atlas registry
   * @param version - Optional version filter
   * @returns Generated instances as XMI string
   */
  async generateDataByName(configName: string, version?: string): Promise<string> {
    const versionParam = version ? `?version=${enc(version)}` : ''
    const resp = await this.request('GET', `/datagen/${enc(configName)}${versionParam}`, undefined, {
      accept: ATLAS_MEDIA_TYPES.XMI
    })
    if (resp.status === 200) return await resp.text()
    if (resp.status === 204) throw new Error(`Config not found: ${configName}`)
    const errorText = await resp.text()
    throw new Error(`DataGen by name failed (${resp.status}): ${errorText}`)
  }

  async generateData(configXmi: string, accept?: string): Promise<string> {
    const resp = await this.request('POST', '/datagen', configXmi, {
      contentType: ATLAS_MEDIA_TYPES.XMI,
      accept: accept || ATLAS_MEDIA_TYPES.XMI
    })
    if (resp.status === 200 || resp.status === 201) return await resp.text()
    const errorText = await resp.text()
    throw new Error(`DataGen failed (${resp.status}): ${errorText}`)
  }

  // ============================================
  // Conversion
  // ============================================

  async convert(
    content: string,
    fromType: AtlasMediaType,
    toType: AtlasMediaType
  ): Promise<string | null> {
    const resp = await this.request('POST', '/convert', content, {
      contentType: fromType,
      accept: toType
    })
    if (resp.status === 200) return await resp.text()
    return null
  }

  // ============================================
  // Health
  // ============================================

  async isHealthy(): Promise<boolean> {
    try {
      const resp = await this.get('/system/health?tags=readiness')
      return resp.status === 200
    } catch {
      return false
    }
  }

  // ============================================
  // Validation
  // ============================================

  /**
   * Validate an EObject against its schema using the server-side validator.
   * Server uses EMF Diagnostician + OCL constraints.
   *
   * @param xmiContent - Serialized EObject as XMI
   * @param mediaType - Content type (default: application/xmi)
   * @returns Diagnostic result with type, message, and children
   */
  async validate(xmiContent: string, mediaType?: string): Promise<ValidationDiagnostic> {
    const resp = await this.request('POST', '/validate', xmiContent, {
      contentType: mediaType || 'application/xmi',
      accept: 'application/xmi'
    })

    if (resp.status === 200) {
      const responseText = await resp.text()
      const contentType = resp.headers.get('content-type') || ''

      // Response may be JSON or XMI depending on server/accept header
      if (contentType.includes('json')) {
        return JSON.parse(responseText)
      }

      // Parse XMI diagnostic response
      return this.parseDiagnosticXmi(responseText)
    }

    if (resp.status === 415) {
      return {
        type: 'ERROR',
        message: 'Unsupported media type for validation',
        children: []
      }
    }

    const errorText = await resp.text().catch(() => '')
    return {
      type: 'ERROR',
      message: `Validation request failed: ${resp.status} ${resp.statusText}`,
      source: errorText,
      children: []
    }
  }

  /**
   * Parse EMF Diagnostic XMI response into ValidationDiagnostic.
   * The server returns an XMI-serialized org.eclipse.emf.common.util.Diagnostic.
   */
  private parseDiagnosticXmi(xmi: string): ValidationDiagnostic {
    try {
      const parser = new DOMParser()
      const doc = parser.parseFromString(xmi, 'text/xml')

      const parseError = doc.querySelector('parsererror')
      if (parseError) {
        return { type: 'ERROR', message: `Failed to parse diagnostic XMI: ${parseError.textContent}`, children: [] }
      }

      // Find the root diagnostic element (may be wrapped in <xmi:XMI>)
      const root = doc.documentElement
      if (root.localName === 'XMI') {
        // Multiple children under XMI wrapper
        const children: ValidationDiagnostic[] = []
        for (const child of Array.from(root.children)) {
          children.push(this.parseDiagnosticElement(child))
        }
        // Aggregate: if any child is ERROR, result is ERROR
        const worstType = children.some(c => c.type === 'ERROR') ? 'ERROR'
          : children.some(c => c.type === 'WARNING') ? 'WARNING' : 'OK'
        return { type: worstType, message: `Validation completed with ${children.length} result(s)`, children }
      }

      return this.parseDiagnosticElement(root)
    } catch (e: any) {
      return { type: 'ERROR', message: `Failed to parse diagnostic response: ${e.message}`, children: [] }
    }
  }

  private parseDiagnosticElement(el: Element): ValidationDiagnostic {
    // EMF Diagnostic attributes: severity (int), message, source, exception
    const severityAttr = el.getAttribute('severity') || el.getAttribute('type') || ''
    const message = el.getAttribute('message') || el.textContent?.trim() || ''
    const source = el.getAttribute('source') || undefined

    const type = this.mapSeverity(severityAttr)

    // Parse child diagnostics
    const children: ValidationDiagnostic[] = []
    for (const child of Array.from(el.children)) {
      children.push(this.parseDiagnosticElement(child))
    }

    // Collect data entries
    const data: string[] = []
    for (const dataEl of Array.from(el.querySelectorAll(':scope > data'))) {
      if (dataEl.textContent) data.push(dataEl.textContent)
    }

    return { type, message, source, children, data: data.length > 0 ? data : undefined }
  }

  private mapSeverity(severity: string): ValidationDiagnostic['type'] {
    // EMF Diagnostic severity: 0=OK, 1=INFO, 2=WARNING, 4=ERROR, 8=CANCEL
    switch (severity) {
      case '0': case 'OK': return 'OK'
      case '1': case 'INFO': return 'INFO'
      case '2': case 'WARNING': return 'WARNING'
      case '4': case 'ERROR': return 'ERROR'
      case '8': case 'CANCEL': return 'CANCEL'
      default: return severity.includes('ERROR') ? 'ERROR' : severity.includes('WARN') ? 'WARNING' : 'OK'
    }
  }

  /**
   * Validate an EObject with JSON content type
   */
  async validateJson(jsonContent: string): Promise<ValidationDiagnostic> {
    return this.validate(jsonContent, 'application/json')
  }

  /**
   * Validate with a specific C-OCL ConstraintSet.
   * Uses GET /validate/{oclId} with the EObject in the request body.
   *
   * @param xmiContent - Serialized EObject as XMI
   * @param oclId - ID of the OclConstraintSet in the cocl registry
   */
  async validateWithConstraints(xmiContent: string, oclId: string): Promise<ValidationDiagnostic> {
    const resp = await this.request('GET', `/validate/${enc(oclId)}`, xmiContent, {
      contentType: 'application/xmi',
      accept: 'application/xmi'
    })
    if (resp.status === 200) {
      const responseText = await resp.text()
      return this.parseDiagnosticXmi(responseText)
    }
    if (resp.status === 404 || resp.status === 400) {
      const errorText = await resp.text()
      return { type: 'ERROR', message: errorText, children: [] }
    }
    return { type: 'ERROR', message: `Validation failed: ${resp.status}`, children: [] }
  }

  // ============================================
  // HTTP Methods
  // ============================================

  private async get(path: string): Promise<Response> {
    return this.request('GET', path)
  }

  private async post(path: string, body: string): Promise<Response> {
    return this.request('POST', path, body)
  }

  private async put(path: string, body: string): Promise<Response> {
    return this.request('PUT', path, body)
  }

  private async del(path: string): Promise<Response> {
    return this.request('DELETE', path)
  }

  private async request(
    method: string,
    path: string,
    body?: string,
    options?: { contentType?: string; accept?: string }
  ): Promise<Response> {
    const url = `${this.baseUrl}${path}`

    const headers: Record<string, string> = {
      'Accept': options?.accept || ATLAS_MEDIA_TYPES.ECORE_XMI,
    }
    if (body !== undefined) {
      headers['Content-Type'] = options?.contentType || ATLAS_MEDIA_TYPES.ECORE_XMI
    }
    if (this.token) headers['Authorization'] = `Bearer ${this.token}`

    const init: RequestInit = { method, headers }
    if (body !== undefined) init.body = body

    return fetch(url, init)
  }
}

/** URL-encode a path segment */
function enc(s: string): string {
  return encodeURIComponent(s)
}

/** Base64 URL encode (for nsUri parameters) */
function b64url(s: string): string {
  return btoa(s)
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '')
}