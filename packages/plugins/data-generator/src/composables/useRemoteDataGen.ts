/**
 * Remote Data Generation via Model Atlas
 *
 * Uses the shared Atlas Browser to discover active connections
 * and delegates data generation to the Atlas server's DataGen endpoint.
 */

import { computed } from 'tsm:vue'
import type { DataGenConfig, GenerationResult } from '../types'

/** Minimal interface for Atlas connection info */
interface AtlasConnectionInfo {
  id: string
  label: string
  baseUrl: string
  scopeName: string
  status: string
}

/** Shared Atlas Browser singleton (lazy-resolved to avoid hard dependency) */
let _sharedBrowser: any = null

function getSharedBrowser(): any {
  if (!_sharedBrowser) {
    try {
      // Dynamic import from the atlas-browser plugin's shared singleton
      const mod = (globalThis as any).__tsm_modules?.get?.('atlas-browser')
      if (mod?.useSharedAtlasBrowser) {
        _sharedBrowser = mod.useSharedAtlasBrowser()
      }
    } catch {
      // Atlas browser not available
    }
  }
  return _sharedBrowser
}

/**
 * Set the shared browser instance (called from plugin activation)
 */
export function setSharedAtlasBrowser(browser: any) {
  _sharedBrowser = browser
}

/** Map of package name to nsURI for resolving fully qualified class URIs */
export type PackageNsURIMap = Map<string, string>

/**
 * Serialize a DataGenConfig to XMI for the Atlas DataGen endpoint.
 * @param config - The DataGen configuration
 * @param pkgMap - Map of package name → nsURI to build fully qualified contextClass URIs
 */
function serializeConfigToXmi(config: DataGenConfig, pkgMap?: PackageNsURIMap): string {
  const lines: string[] = []
  lines.push('<?xml version="1.0" encoding="UTF-8"?>')
  lines.push('<datagen:DataGenConfig xmi:version="2.0"')
  lines.push('    xmlns:xmi="http://www.omg.org/XMI"')
  lines.push('    xmlns:datagen="http://www.gme.org/datagen/1.0"')
  lines.push(`    name="${escapeXml(config.name)}"`)
  if (config.version) lines.push(`    version="${escapeXml(config.version)}"`)
  if (config.description) lines.push(`    description="${escapeXml(config.description)}"`)
  if (config.seed) lines.push(`    seed="${config.seed}"`)
  if (config.locale) lines.push(`    locale="${escapeXml(config.locale)}"`)
  lines.push('>')

  // Target model nsURIs
  for (const nsUri of config.targetModelNsURIs) {
    lines.push(`  <targetModelNsURIs>${escapeXml(nsUri)}</targetModelNsURIs>`)
  }

  // Class configs
  for (const cc of config.classConfigs) {
    if (!cc.enabled) continue
    // Build fully qualified EMF URI: nsURI#//ClassName
    const resolvedClass = resolveContextClass(cc.contextClass, pkgMap)
    const attrs = [`contextClass="${escapeXml(resolvedClass)}"`, `instanceCount="${cc.instanceCount}"`]
    lines.push(`  <classConfigs ${attrs.join(' ')}>`)

    // Attribute generators
    for (const ag of cc.attributeGens) {
      const agAttrs: string[] = [`featureName="${escapeXml(ag.featureName)}"`]
      if (ag.generatorKey) agAttrs.push(`generatorKey="${escapeXml(ag.generatorKey)}"`)
      if (ag.generatorArgs) agAttrs.push(`generatorArgs="${escapeXml(ag.generatorArgs)}"`)
      if (ag.unique) agAttrs.push('unique="true"')
      if (ag.staticValue) agAttrs.push(`staticValue="${escapeXml(ag.staticValue)}"`)
      if (ag.template) agAttrs.push(`template="${escapeXml(ag.template)}"`)
      lines.push(`    <attributeGens ${agAttrs.join(' ')}/>`)
    }

    // Reference generators
    for (const rg of cc.referenceGens) {
      const rgAttrs: string[] = [`featureName="${escapeXml(rg.featureName)}"`]
      if (rg.strategy && rg.strategy !== 'RANDOM') rgAttrs.push(`strategy="${rg.strategy}"`)
      if (rg.targetClassFilter) rgAttrs.push(`targetClassFilter="${escapeXml(rg.targetClassFilter)}"`)
      if (rg.minCount) rgAttrs.push(`minCount="${rg.minCount}"`)
      if (rg.maxCount) rgAttrs.push(`maxCount="${rg.maxCount}"`)
      lines.push(`    <referenceGens ${rgAttrs.join(' ')}/>`)
    }

    lines.push('  </classConfigs>')
  }

  // Custom generators
  for (const cg of config.customGenerators) {
    lines.push(`  <customGenerators key="${escapeXml(cg.key)}" label="${escapeXml(cg.label)}" expression="${escapeXml(cg.expression)}" category="${escapeXml(cg.category)}"/>`)
  }

  lines.push('</datagen:DataGenConfig>')
  return lines.join('\n')
}

/**
 * Resolve a qualified contextClass (e.g. "dge.Person") to a fully qualified
 * EMF URI (e.g. "http://example.org/dge#//Person") using the package-nsURI map.
 */
function resolveContextClass(contextClass: string, pkgMap?: PackageNsURIMap): string {
  if (!pkgMap || pkgMap.size === 0) {
    // Fallback: return simple class name
    const lastDot = contextClass.lastIndexOf('.')
    return lastDot >= 0 ? contextClass.substring(lastDot + 1) : contextClass
  }

  const lastDot = contextClass.lastIndexOf('.')
  if (lastDot < 0) {
    // No package prefix — try to find in any package
    for (const [, nsUri] of pkgMap) {
      return `${nsUri}#//${contextClass}`
    }
    return contextClass
  }

  const pkgPrefix = contextClass.substring(0, lastDot)
  const className = contextClass.substring(lastDot + 1)

  // Try exact match on package name
  const nsUri = pkgMap.get(pkgPrefix)
  if (nsUri) {
    return `${nsUri}#//${className}`
  }

  // Try matching the last segment of the prefix (for nested packages like "root.sub")
  const lastPkgDot = pkgPrefix.lastIndexOf('.')
  const shortPkg = lastPkgDot >= 0 ? pkgPrefix.substring(lastPkgDot + 1) : pkgPrefix
  const nsUriFallback = pkgMap.get(shortPkg)
  if (nsUriFallback) {
    return `${nsUriFallback}#//${className}`
  }

  // No match found — return simple class name
  return className
}

function escapeXml(str: string): string {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;')
}

/**
 * Remote Data Generation composable
 */
export function useRemoteDataGen() {
  /**
   * Available Atlas connections (reactive)
   */
  const availableConnections = computed((): AtlasConnectionInfo[] => {
    const browser = getSharedBrowser()
    if (!browser?.connections?.value) return []
    return browser.connections.value
      .filter((c: any) => c.status === 'connected')
      .map((c: any) => ({
        id: c.id,
        label: c.label,
        baseUrl: c.baseUrl,
        scopeName: c.scopeName,
        status: c.status
      }))
  })

  /**
   * Whether remote generation is available (at least one Atlas connection)
   */
  const isAvailable = computed(() => availableConnections.value.length > 0)

  /**
   * Generate instances remotely via the Atlas DataGen endpoint
   */
  async function generateRemote(
    config: DataGenConfig,
    connectionId?: string,
    onProgress?: (msg: string, pct: number) => void,
    pkgMap?: PackageNsURIMap
  ): Promise<GenerationResult> {
    const log: string[] = []
    const errors: string[] = []

    const browser = getSharedBrowser()
    if (!browser) {
      return { success: false, instanceCount: 0, xmiContent: '', errors: ['Atlas Browser not available'], log }
    }

    // Pick connection
    const connId = connectionId || availableConnections.value[0]?.id
    if (!connId) {
      return { success: false, instanceCount: 0, xmiContent: '', errors: ['No Atlas connection available'], log }
    }

    const client = browser.getClient(connId)
    if (!client) {
      return { success: false, instanceCount: 0, xmiContent: '', errors: [`Client not found for connection ${connId}`], log }
    }

    const conn = availableConnections.value.find((c: AtlasConnectionInfo) => c.id === connId)
    log.push(`Using Atlas connection: ${conn?.label || connId}`)

    // Serialize config to XMI
    onProgress?.('Serializing config...', 10)
    const configXmi = serializeConfigToXmi(config, pkgMap)
    log.push(`Config serialized (${configXmi.length} chars)`)

    // Call remote endpoint
    onProgress?.('Sending to Atlas server...', 30)
    try {
      const resultXmi = await client.generateData(configXmi)
      log.push(`Received response (${resultXmi.length} chars)`)
      onProgress?.('Done', 100)

      // Count instances (rough estimate from XMI)
      const instanceCount = (resultXmi.match(/<[^/][^>]*xmi:id=/g) || []).length

      return {
        success: true,
        instanceCount,
        xmiContent: resultXmi,
        errors: [],
        log
      }
    } catch (e: any) {
      errors.push(`Remote generation failed: ${e.message}`)
      log.push(`Error: ${e.message}`)
      return { success: false, instanceCount: 0, xmiContent: '', errors, log }
    }
  }

  /**
   * Save generated XMI content to the workspace directory via the storage adapter.
   * Uses the workspace's storage service to write the file.
   */
  async function saveToWorkspace(
    xmiContent: string,
    filename: string,
    workspaceService?: any
  ): Promise<{ success: boolean; path?: string; error?: string }> {
    if (!workspaceService) {
      // Fallback: trigger a browser download
      const blob = new Blob([xmiContent], { type: 'application/xml' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = filename.endsWith('.xmi') ? filename : `${filename}.xmi`
      a.click()
      URL.revokeObjectURL(url)
      return { success: true, path: a.download }
    }

    try {
      const path = filename.endsWith('.xmi') ? filename : `${filename}.xmi`
      await workspaceService.writeFile(path, xmiContent)
      return { success: true, path }
    } catch (e: any) {
      return { success: false, error: e.message }
    }
  }

  return {
    availableConnections,
    isAvailable,
    generateRemote,
    saveToWorkspace,
    serializeConfigToXmi
  }
}
