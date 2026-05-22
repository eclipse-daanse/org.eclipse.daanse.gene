/**
 * AppConfig Loader
 *
 * Loads the application configuration from config.xmi at startup.
 * Falls back to empty defaults if the file is missing or invalid.
 * Plugin-specific configs are resolved via xsi:type when the plugin
 * registers its EPackage.
 */

import { XMIResource, URI, BasicResourceSet, EPackageRegistry } from '@emfts/core'
import { AppConfigPackage } from '../generated/appconfig/AppConfigPackage'

export interface AppConfigData {
  name: string
  version: string
  pluginRepositories: Array<{
    id: string
    name: string
    url: string
    enabled: boolean
    priority: number
  }>
  startupModules: string[]
  pluginConfigs: Array<{
    pluginId: string
    enabled: boolean
    eObject: any
  }>
  /** Get plugin config by pluginId */
  getPluginConfig(pluginId: string): any | null
  /** The raw EObject for plugins that need reflective access */
  raw: any | null
}

function feat(obj: any, name: string): any {
  if (!obj) return undefined
  if (obj[name] !== undefined) return obj[name]
  if (typeof obj.eGet === 'function' && typeof obj.eClass === 'function') {
    const f = obj.eClass().getEStructuralFeature?.(name)
    if (f) return obj.eGet(f)
  }
  return undefined
}

function toArray(val: any): any[] {
  if (!val) return []
  if (Array.isArray(val)) return val
  if (val.data) return val.data
  if (typeof val[Symbol.iterator] === 'function') return Array.from(val)
  return []
}

export async function loadAppConfig(url: string): Promise<AppConfigData> {
  // Register AppConfig EPackage
  const pkg = AppConfigPackage.eINSTANCE
  EPackageRegistry.INSTANCE.set(pkg.getNsURI(), pkg)

  let raw: any = null

  try {
    const response = await fetch(url)
    if (!response.ok) {
      console.warn(`[AppConfig] config.xmi not found (${response.status}), using defaults`)
      return emptyConfig()
    }

    const xmiContent = await response.text()
    if (!xmiContent.trim()) {
      console.warn('[AppConfig] config.xmi is empty, using defaults')
      return emptyConfig()
    }

    const resourceSet = new BasicResourceSet()
    const resource = new XMIResource(URI.createURI(url))
    resourceSet.getResources().push(resource)
    resource.setResourceSet(resourceSet)

    await resource.loadFromString(xmiContent)

    const contents = resource.getContents()
    if (contents.size() === 0) {
      console.warn('[AppConfig] config.xmi has no root element, using defaults')
      return emptyConfig()
    }

    raw = contents.get(0)
    console.log('[AppConfig] Loaded from', url)
  } catch (e: any) {
    console.warn(`[AppConfig] Failed to load config.xmi: ${e.message}, using defaults`)
    return emptyConfig()
  }

  // Extract repositories
  const pluginRepositories = toArray(feat(raw, 'pluginRepositories')).map((r: any) => ({
    id: feat(r, 'id') || '',
    name: feat(r, 'name') || '',
    url: feat(r, 'url') || '',
    enabled: feat(r, 'enabled') !== false,
    priority: parseInt(feat(r, 'priority'), 10) || 10
  }))

  // Extract startup modules
  const startupModules = toArray(feat(raw, 'startupModules')).map(String)

  // Extract plugin configs
  const pluginConfigs = toArray(feat(raw, 'pluginConfigs')).map((pc: any) => ({
    pluginId: feat(pc, 'pluginId') || '',
    enabled: feat(pc, 'enabled') !== false,
    eObject: pc
  }))

  return {
    name: feat(raw, 'name') || '',
    version: feat(raw, 'version') || '',
    pluginRepositories,
    startupModules,
    pluginConfigs,
    getPluginConfig(pluginId: string) {
      return pluginConfigs.find(pc => pc.pluginId === pluginId)?.eObject || null
    },
    raw
  }
}

function emptyConfig(): AppConfigData {
  return {
    name: '',
    version: '',
    pluginRepositories: [],
    startupModules: [],
    pluginConfigs: [],
    getPluginConfig() { return null },
    raw: null
  }
}
