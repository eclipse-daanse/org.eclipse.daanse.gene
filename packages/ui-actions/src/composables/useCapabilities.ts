/**
 * Discovery Client — Fetches server capabilities via XMI and auto-registers actions
 */

import { ref } from 'tsm:vue'
import type { ServiceCapabilities, Endpoint, ServiceAuthConfig } from '../types'
import { parseCapabilitiesXmi } from '../ActionApiResourceSet'
import type { ServiceCapabilitiesImpl } from '../generated/actionapi/ServiceCapabilitiesImpl'
import type { EndpointImpl } from '../generated/actionapi/EndpointImpl'
import type { EObject } from '@emfts/core'

/** Read a feature value from an EObject by name (works with any EObject impl) */
function feat(obj: any, name: string): any {
  // Try typed getter first
  if (obj[name] !== undefined) return obj[name]
  // Fallback: reflective API
  if (obj.eClass && obj.eGet) {
    const features = obj.eClass().getEAllStructuralFeatures?.() || obj.eClass().getEStructuralFeatures?.() || []
    for (const f of features) {
      if (f.getName() === name) return obj.eGet(f)
    }
  }
  return undefined
}

/** Convert an EList/array/iterable to a plain array */
function toArray(val: any): any[] {
  if (!val) return []
  if (Array.isArray(val)) return val
  if (typeof val.toArray === 'function') return val.toArray()
  if (typeof val[Symbol.iterator] === 'function') return Array.from(val)
  return []
}

const _states = new Map<string, ReturnType<typeof createState>>()

function createState() {
  return {
    capabilities: ref<ServiceCapabilities | null>(null),
    loading: ref(false),
    error: ref<string | null>(null)
  }
}

function getState(baseUrl: string) {
  if (!_states.has(baseUrl)) {
    _states.set(baseUrl, createState())
  }
  return _states.get(baseUrl)!
}

/**
 * Convert parsed EObject (ServiceCapabilitiesImpl) to plain TS type
 */
function toServiceCapabilities(eObj: any): ServiceCapabilities {
  const rawEndpoints = toArray(feat(eObj, 'endpoints'))
  const endpoints: Endpoint[] = rawEndpoints.map((ep: any) => ({
    id: feat(ep, 'id'),
    name: feat(ep, 'name'),
    description: feat(ep, 'description'),
    path: feat(ep, 'path'),
    httpMethod: feat(ep, 'httpMethod'),
    inputType: feat(ep, 'inputType'),
    outputType: feat(ep, 'outputType'),
    asyncSupported: feat(ep, 'asyncSupported') === true || feat(ep, 'asyncSupported') === 'true',
    parameters: toArray(feat(ep, 'parameters')).map((p: any) => ({
      name: feat(p, 'name'),
      type: feat(p, 'type'),
      required: feat(p, 'required') === true || feat(p, 'required') === 'true',
      description: feat(p, 'description'),
      defaultValue: feat(p, 'defaultValue')
    })),
    category: feat(ep, 'category')
  }))

  const jm = feat(eObj, 'jobManagement')
  const ac = feat(eObj, 'authConfig')
  const authConfig: ServiceAuthConfig | undefined = ac ? {
    authMethod: feat(ac, 'authMethod') || 'NONE',
    authorizationEndpoint: feat(ac, 'authorizationEndpoint'),
    tokenEndpoint: feat(ac, 'tokenEndpoint'),
    logoutEndpoint: feat(ac, 'logoutEndpoint'),
    clientId: feat(ac, 'clientId'),
    scopes: feat(ac, 'scopes'),
    issuer: feat(ac, 'issuer')
  } : undefined

  return {
    name: feat(eObj, 'name'),
    version: feat(eObj, 'version'),
    endpoints,
    jobManagement: jm ? {
      statusEndpoint: feat(jm, 'statusEndpoint'),
      cancelEndpoint: feat(jm, 'cancelEndpoint'),
      resultEndpoint: feat(jm, 'resultEndpoint'),
      pollIntervalMs: parseInt(feat(jm, 'pollIntervalMs'), 10) || 2000,
      maxJobDurationMs: parseInt(feat(jm, 'maxJobDurationMs'), 10) || 300000
    } : undefined,
    authConfig
  }
}

export async function fetchCapabilities(baseUrl: string): Promise<ServiceCapabilities | null> {
  const state = getState(baseUrl)
  state.loading.value = true
  state.error.value = null

  try {
    const url = baseUrl.replace(/\/$/, '') + '/capabilities'
    const response = await fetch(url, {
      headers: { 'Accept': 'application/xmi, application/xml, application/json' }
    })
    if (!response.ok) {
      state.error.value = `HTTP ${response.status}: ${response.statusText}`
      return null
    }

    const contentType = response.headers.get('content-type') || ''
    let data: ServiceCapabilities

    if (contentType.includes('xml') || contentType.includes('xmi')) {
      // XMI response — parse via emfts
      const xmiString = await response.text()
      let eObj: ServiceCapabilitiesImpl | null = null
      try {
        eObj = parseCapabilitiesXmi(xmiString)
      } catch (parseErr) {
        console.error('[useCapabilities] XMI parse error:', parseErr)
        state.error.value = `XMI parse error: ${parseErr}`
        return null
      }
      if (!eObj) {
        state.error.value = 'Failed to parse XMI capabilities response'
        return null
      }
      data = toServiceCapabilities(eObj)
    } else {
      // Fallback: JSON
      data = await response.json()
    }

    state.capabilities.value = data
    return data
  } catch (err: any) {
    state.error.value = err.message || String(err)
    return null
  } finally {
    state.loading.value = false
  }
}

export function autoRegisterActions(
  baseUrl: string,
  capabilities: ServiceCapabilities,
  registry: any
): void {
  const base = baseUrl.replace(/\/$/, '')

  // Map ServiceAuthConfig to AuthConfiguration shape for RemoteExecutor
  const ac = capabilities.authConfig
  const authConfig = ac && ac.authMethod !== 'NONE' ? {
    authType: ac.authMethod === 'OAUTH2_PKCE' ? 'OAUTH2' : ac.authMethod,
    authorizationEndpoint: ac.authorizationEndpoint,
    tokenEndpoint: ac.tokenEndpoint,
    logoutEndpoint: ac.logoutEndpoint,
    clientId: ac.clientId,
    scopes: ac.scopes
  } : undefined

  for (const ep of capabilities.endpoints) {
    const actionId = `remote.${capabilities.name || 'server'}.${ep.id}`
    const httpMethod = ep.httpMethod || 'POST'

    const serializationMap: Record<string, string> = {
      APPLICATION_JSON: 'JSON_BODY',
      APPLICATION_XMI: 'XMI_BODY',
      TEXT_PLAIN: 'QUERY_PARAMS'
    }

    registry.register({
      definition: {
        actionId,
        label: ep.name || ep.id,
        description: ep.description || '',
        actionScope: 'OBJECT',
        actionType: 'CUSTOM',
        endpointUrl: base + ep.path,
        httpMethod,
        serialization: serializationMap[ep.inputType] || 'JSON_BODY',
        contentType: ep.inputType === 'APPLICATION_XMI' ? 'application/xml' : 'application/json',
        enabled: true,
        perspectiveIds: [],
        parameters: (ep.parameters || []).map(p => ({
          name: p.name,
          type: p.type || 'STRING',
          required: p.required || false,
          defaultValue: p.defaultValue
        })),
        returnTypes: [],
        executionMode: ep.asyncSupported ? 'ASYNC' : 'SYNC',
        asyncConfig: ep.asyncSupported && capabilities.jobManagement ? {
          pollIntervalMs: capabilities.jobManagement.pollIntervalMs || 2000,
          maxJobDurationMs: capabilities.jobManagement.maxJobDurationMs || 300000,
          statusEndpoint: base + (capabilities.jobManagement.statusEndpoint || ''),
          cancelEndpoint: base + (capabilities.jobManagement.cancelEndpoint || ''),
          resultEndpoint: base + (capabilities.jobManagement.resultEndpoint || '')
        } : undefined,
        authConfig,
        category: ep.category
      },
      source: 'plugin' as const,
      moduleId: `discovery:${capabilities.name || baseUrl}`
    })
  }
}

export function useCapabilities(baseUrl: string) {
  const state = getState(baseUrl)
  return {
    capabilities: state.capabilities,
    loading: state.loading,
    error: state.error,
    fetch: () => fetchCapabilities(baseUrl)
  }
}
