/**
 * What a loaded workspace consists of, and the state each part is in.
 *
 * The workspace tab used to show "no workspace opened yet" while one was
 * loaded; what it brought along - models, instances, constraint files, Atlas
 * connections, resolvers - was visible nowhere. This builds the overview the
 * workspace editor shows: the declarations of the `.wsp` joined with what is
 * actually loaded right now.
 *
 * Pure: the caller hands in the declarations and the runtime state.
 */

export type EntryStatus =
  | 'loaded'
  | 'not-loaded'
  | 'missing'
  | 'disabled'
  | 'connected'
  | 'connecting'
  | 'disconnected'
  | 'error'

export interface OverviewEntry {
  /** Stable key for lists */
  key: string
  /** What is shown */
  label: string
  /** Where it lives: a path, an atlas:// location or a URL */
  location: string
  status: EntryStatus
  /** A short addition: package name, number of constraints, error message */
  detail?: string
  /** The declaring object of the `.wsp`, for removing it again */
  source?: unknown
}

export interface WorkspaceOverview {
  models: OverviewEntry[]
  instances: OverviewEntry[]
  constraints: OverviewEntry[]
  atlas: OverviewEntry[]
  resolvers: OverviewEntry[]
}

export interface LiveAtlasConnection {
  baseUrl: string
  scopeName: string
  status: 'disconnected' | 'connecting' | 'connected' | 'error'
  error?: string
}

export interface OverviewInput {
  /** Declarations of the `.wsp` (EObjects or plain objects) */
  modelSources: unknown[]
  instanceSources: unknown[]
  atlasConnections: unknown[]
  resolvers: unknown[]
  /** Source file of every loaded metamodel -> its package name */
  loadedModels: Map<string, string>
  /** Instance files open in a tab */
  openInstances: Set<string>
  /** Constraint files beside the workspace, and which of them loaded */
  constraintFiles: string[]
  loadedConstraints: Set<string>
  /** Connections the Atlas browser holds right now */
  liveAtlas: LiveAtlasConnection[]
  /** Whether a declared file can be found in the source */
  fileExists(location: string, kind: 'model' | 'instance'): boolean
}

/** A feature of a declaration - property or reflective, whichever it has. */
export function readFeature(obj: unknown, name: string): unknown {
  const o = obj as any
  if (!o) return undefined
  if (o[name] !== undefined) return o[name]
  const feature = o.eClass?.()?.getEStructuralFeature?.(name)
  return feature && typeof o.eGet === 'function' ? o.eGet(feature) : undefined
}

/** The XMI carries booleans as strings; anything not saying no is yes. */
function isEnabled(obj: unknown): boolean {
  const value = readFeature(obj, 'enabled')
  return !(value === false || value === 'false')
}

function text(obj: unknown, name: string): string {
  const value = readFeature(obj, name)
  return value === undefined || value === null ? '' : String(value)
}

function fileName(location: string): string {
  return location.split('/').pop() || location
}

function modelEntry(source: unknown, index: number, input: OverviewInput): OverviewEntry {
  const location = text(source, 'location')
  const entry: OverviewEntry = {
    key: `model:${index}:${location}`,
    label: text(source, 'name') || fileName(location),
    location,
    status: 'not-loaded',
    source,
  }
  const packageName = input.loadedModels.get(location)
  if (!isEnabled(source)) entry.status = 'disabled'
  else if (packageName !== undefined) {
    entry.status = 'loaded'
    entry.detail = packageName
  } else if (location.startsWith('atlas://')) entry.detail = 'aus dem Atlas'
  else if (!input.fileExists(location, 'model')) entry.status = 'missing'
  return entry
}

function instanceEntry(source: unknown, index: number, input: OverviewInput): OverviewEntry {
  const location = text(source, 'location') || text(source, 'path')
  const entry: OverviewEntry = {
    key: `instance:${index}:${location}`,
    label: fileName(location),
    location,
    status: 'not-loaded',
    source,
  }
  if (!isEnabled(source)) entry.status = 'disabled'
  else if (input.openInstances.has(location)) entry.status = 'loaded'
  else if (!input.fileExists(location, 'instance')) entry.status = 'missing'
  return entry
}

function atlasEntry(source: unknown, index: number, input: OverviewInput): OverviewEntry {
  const baseUrl = text(source, 'baseUrl')
  const scopeName = text(source, 'scopeName')
  const entry: OverviewEntry = {
    key: `atlas:${index}:${baseUrl}:${scopeName}`,
    label: text(source, 'name') || `${scopeName}@${baseUrl}`,
    location: baseUrl,
    status: 'disconnected',
    detail: scopeName,
    source,
  }
  const live = input.liveAtlas.find((c) => c.baseUrl === baseUrl && c.scopeName === scopeName)
  if (!isEnabled(source)) entry.status = 'disabled'
  else if (live) {
    entry.status = live.status
    if (live.status === 'error' && live.error) entry.detail = live.error
  }
  return entry
}

function resolverEntry(source: unknown, index: number): OverviewEntry {
  const kind = text(source, 'kind')
  const scopeName = text(source, 'scopeName')
  return {
    key: `resolver:${index}`,
    label: text(source, 'name') || kind || `Resolver ${index + 1}`,
    location: text(source, 'baseUrl'),
    status: isEnabled(source) ? 'loaded' : 'disabled',
    detail: [kind, scopeName].filter(Boolean).join(' · ') || undefined,
    source,
  }
}

export function buildWorkspaceOverview(input: OverviewInput): WorkspaceOverview {
  return {
    models: input.modelSources.map((s, i) => modelEntry(s, i, input)),
    instances: input.instanceSources.map((s, i) => instanceEntry(s, i, input)),
    constraints: input.constraintFiles.map((path) => ({
      key: `constraints:${path}`,
      label: fileName(path),
      location: path,
      status: input.loadedConstraints.has(path) ? 'loaded' : 'not-loaded',
    })),
    atlas: input.atlasConnections.map((s, i) => atlasEntry(s, i, input)),
    resolvers: input.resolvers.map((s, i) => resolverEntry(s, i)),
  }
}

/** The files of a source that could still be added - not declared yet. */
export function addableFiles<T extends { path: string; name: string }>(
  files: T[],
  extensions: string[],
  declared: OverviewEntry[],
): T[] {
  const taken = new Set(declared.map((e) => e.location))
  return files
    .filter((f) => extensions.some((ext) => f.name.toLowerCase().endsWith(ext)))
    .filter((f) => !taken.has(f.path))
    .sort((a, b) => a.path.localeCompare(b.path))
}
