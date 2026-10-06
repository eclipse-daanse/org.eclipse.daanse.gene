/**
 * Resolving metamodels by nsURI - for whoever asks.
 *
 * The instance loader finds a missing metamodel in three places: the package
 * registry, the `.ecore` files of the workspace, the Atlas providers the
 * workspace names. A plugin that opens a model of its own (the SensiNact
 * wizard) used to keep a shorter chain and came up empty where the instance
 * editor had long found the model - the sensor model appeared only after the
 * mapping had been opened there once. This is the one chain, published as
 * `gene.metamodel.resolver`.
 *
 * What it finds goes through the model browser's `loadEcoreFile`, so the model
 * stands in the registry *and* in the model list - one instance, as #155 asks.
 */
import { EPackageRegistry } from '@emfts/core'
import { collectAtlasProviders } from './atlasResolution'

export interface MetamodelResolution {
  /** nsURIs that are in the registry now */
  resolved: string[]
  /** nsURIs nobody could supply */
  missing: string[]
  /** Where it looked - for messages */
  searched: string[]
}

export interface MetamodelResolver {
  resolve(nsURIs: string[], entry?: unknown): Promise<MetamodelResolution>
}

export interface MetamodelResolverDeps {
  fileSystem: () => any
  /** The source the open workspace lives in; without one every source is searched */
  workspaceSourceId: () => string | undefined
  modelBrowser: () => any
  editorConfig: () => any
}

/** A package the registry can actually use - it may hold descriptors too */
function registered(nsURI: string): boolean {
  const candidate = EPackageRegistry.INSTANCE.get(nsURI) as any
  return !!candidate && typeof candidate.getEClassifiers === 'function'
}

/** nsURI of the root package in an .ecore text */
function nsUriOf(ecoreXml: string): string | undefined {
  return ecoreXml.match(/<ecore:EPackage[^>]*?\bnsURI="([^"]+)"/)?.[1]
}

function walk(entries: any[] | undefined, out: any[]): any[] {
  for (const e of entries ?? []) {
    if (e.isDirectory || e.children) walk(e.children, out)
    else out.push(e)
  }
  return out
}

/** The namespaces an XMI declares - its metamodels, Ecore's own and XMI/XSI left out */
export function nsUrisDeclaredIn(xml: string): string[] {
  const skip = new Set(['http://www.omg.org/XMI', 'http://www.w3.org/2001/XMLSchema-instance', 'http://www.eclipse.org/emf/2002/Ecore'])
  const head = xml.slice(0, 20000)
  const found = new Set<string>()
  for (const m of head.matchAll(/xmlns:[\w.-]+="([^"]+)"/g)) if (!skip.has(m[1]!)) found.add(m[1]!)
  return [...found]
}

export function createMetamodelResolver(deps: MetamodelResolverDeps): MetamodelResolver {
  async function fromWorkspace(wanted: Set<string>, searched: string[], resolved: string[]): Promise<void> {
    const fs = deps.fileSystem()
    const mb = deps.modelBrowser()
    if (!fs?.filesBySource || !mb?.loadEcoreFile || wanted.size === 0) return
    const sourceId = deps.workspaceSourceId()
    const sources: any[] = (fs.sources?.value ?? []).filter((s: any) => !sourceId || s.id === sourceId)
    for (const source of sources) {
      const ecores = walk(fs.filesBySource.get(source.id), []).filter((e: any) =>
        String(e.name ?? e.path ?? '').toLowerCase().endsWith('.ecore'))
      if (ecores.length === 0) continue
      searched.push(`Workspace ${source.name ?? source.id}`)
      for (const entry of ecores) {
        if (wanted.size === 0) return
        let content: string
        try {
          content = await fs.readTextFile(entry)
        } catch {
          continue
        }
        const nsURI = nsUriOf(content)
        if (!nsURI || !wanted.has(nsURI)) continue
        await mb.loadEcoreFile(content, entry.path)
        if (registered(nsURI)) {
          resolved.push(nsURI)
          wanted.delete(nsURI)
        }
      }
    }
  }

  async function fromAtlas(wanted: Set<string>, searched: string[], resolved: string[], entry: unknown): Promise<void> {
    const mb = deps.modelBrowser()
    if (!mb?.loadEcoreFile || wanted.size === 0) return
    const { providers, searched: where } = await collectAtlasProviders(entry, deps.editorConfig())
    if (providers.length === 0) return
    searched.push(...where)
    const { fetchSchemas } = await import('storage-model-atlas')
    const found: Map<string, string> = await fetchSchemas([...wanted], providers as never)
    for (const [nsURI, content] of found) {
      await mb.loadEcoreFile(content, `atlas:${nsURI}`)
      if (registered(nsURI)) {
        resolved.push(nsURI)
        wanted.delete(nsURI)
      }
    }
  }

  return {
    async resolve(nsURIs, entry) {
      const searched: string[] = []
      const resolved: string[] = []
      const wanted = new Set(nsURIs.filter(ns => !registered(ns)))
      for (const ns of nsURIs) if (!wanted.has(ns)) resolved.push(ns)
      try {
        await fromWorkspace(wanted, searched, resolved)
        await fromAtlas(wanted, searched, resolved, entry)
      } catch (e) {
        console.warn('[MetamodelResolver] Aufloesung abgebrochen:', e)
      }
      return { resolved, missing: [...wanted], searched }
    }
  }
}
