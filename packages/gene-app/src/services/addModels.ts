/**
 * Adding several models (.ecore) to the workspace in one go.
 *
 * One at a time each model saved the workspace and retried the failed
 * instance files. Here all are loaded first - references between them resolve
 * whatever the order, the registry re-resolves them after each load - then
 * they are declared together and the workspace is saved once.
 *
 * Pure: the caller hands in what loading, declaring and saving mean.
 */

export interface ModelToAdd {
  entry: { name: string; path: string; sourceId?: string }
  content: string
}

export interface LoadedModel {
  name: string
  ePackage?: unknown
}

export interface AddModelsDeps {
  /** Whether the workspace declares this location already */
  isDeclared(path: string): boolean
  /** Loads the model; null or a throw means it failed */
  load(content: string, path: string): Promise<LoadedModel | null>
  /** Hands a loaded package to the OCL service */
  register(ePackage: unknown): Promise<void>
  /** Declares the model in the workspace */
  declare(path: string, name: string): void
  /** Saves the workspace - called once, and only when something was declared */
  save(): Promise<void>
  /** Retries instance files that failed for a missing model */
  reloadInstances(sourceIds: string[]): Promise<void>
  /** Before each model is loaded: 1-based position, total, file name */
  onProgress?(position: number, total: number, name: string): void
}

export interface AddModelsResult {
  added: string[]
  skipped: string[]
  failed: { path: string; error: string }[]
}

function message(e: unknown): string {
  return e instanceof Error ? e.message : String(e)
}

export async function addModels(items: ModelToAdd[], deps: AddModelsDeps): Promise<AddModelsResult> {
  const result: AddModelsResult = { added: [], skipped: [], failed: [] }

  const seen = new Set<string>()
  const pending: ModelToAdd[] = []
  for (const item of items) {
    const path = item.entry.path
    if (seen.has(path) || deps.isDeclared(path)) result.skipped.push(path)
    else pending.push(item)
    seen.add(path)
  }

  const loaded: { item: ModelToAdd; model: LoadedModel }[] = []
  for (const [index, item] of pending.entries()) {
    deps.onProgress?.(index + 1, pending.length, item.entry.name)
    try {
      const model = await deps.load(item.content, item.entry.path)
      if (model) loaded.push({ item, model })
      else result.failed.push({ path: item.entry.path, error: 'Modell konnte nicht geladen werden' })
    } catch (e) {
      result.failed.push({ path: item.entry.path, error: message(e) })
    }
  }

  for (const { item, model } of loaded) {
    if (model.ePackage) {
      try {
        await deps.register(model.ePackage)
      } catch (e) {
        console.warn('[addModels] OCL registration failed:', item.entry.path, e)
      }
    }
    deps.declare(item.entry.path, model.name)
    result.added.push(item.entry.path)
  }

  if (result.added.length > 0) {
    await deps.save()
    const sourceIds = [...new Set(loaded.map(({ item }) => item.entry.sourceId).filter((id): id is string => !!id))]
    await deps.reloadInstances(sourceIds)
  }
  return result
}
