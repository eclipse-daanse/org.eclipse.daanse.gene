/**
 * UiModel-Registry (Plan Phase 3, E7)
 *
 * Verwaltet autorierte UIModels aus zwei Quellen:
 * 1. App-Defaults  — mit der App ausgeliefert (public/uimodels/ + index.json)
 * 2. Workspace     — *.uimodel.xmi im geoeffneten Workspace (hoehere Stufe)
 *
 * Auswahl je Objekt: Workspace vor App-Default; innerhalb einer Stufe
 * gewinnt targetClasses-Spezifitaet (expliziter Klassen-Treffer schlaegt
 * Catch-all), dann priority, dann filterExpression auf der Instanz.
 * Kein Treffer → der Aufrufer faellt auf den Default-Generator zurueck.
 */

import { ref } from 'tsm:vue'
import { XMIResource, URI, BasicResourceSet } from '@emfts/core'
import type { EClass, EObject } from '@emfts/core'
import { evaluateBoolean } from '@emfts/uimodel-composer'
import type { UIModel } from '@emfts/uimodel-composer'

type Tier = 'workspace' | 'app'

interface RegisteredModel {
  uiModel: UIModel
  path: string
  tier: Tier
}

// Reaktive Version: jede Registry-Aenderung bumpt sie; findUiModel liest sie,
// damit aufrufende computeds (UimodelPropertiesView) neu auswerten.
const version = ref(0)

const models: RegisteredModel[] = []

// FileSystem-Service (gene.filesystem) — bei activate gesetzt
type FileSystemService = {
  sources: { value: Array<{ id: string; name: string }> }
  filesBySource: Map<string, FileEntryLike[]>
  readTextFile: (entry: FileEntryLike) => Promise<string>
}
interface FileEntryLike {
  name: string
  path: string
  isDirectory?: boolean
  children?: FileEntryLike[]
}
let fileSystem: FileSystemService | null = null

export function setFileSystem(fs: FileSystemService | null): void {
  fileSystem = fs
}

/** XMI-Inhalt laden und alle UIModel-Wurzeln zurueckgeben. */
export async function loadUiModelXmi(content: string, path: string): Promise<UIModel[]> {
  const resourceSet = new BasicResourceSet()
  const res = new XMIResource(URI.createURI(path))
  resourceSet.getResources().push(res)
  res.setResourceSet(resourceSet)
  await res.loadFromString(content)

  const result: UIModel[] = []
  const contents = res.getContents()
  for (let i = 0; i < contents.length; i++) {
    const root = contents.get(i) as EObject
    if (root?.eClass?.()?.getName?.() === 'UIModel') {
      result.push(root as unknown as UIModel)
    }
  }
  return result
}

/** UIModel(s) aus einem XMI-String in eine Stufe der Registry uebernehmen. */
export async function addUiModelsFromXmi(content: string, path: string, tier: Tier): Promise<number> {
  const loaded = await loadUiModelXmi(content, path)
  removePath(path)
  for (const uiModel of loaded) {
    models.push({ uiModel, path, tier })
  }
  version.value++
  return loaded.length
}

export function removePath(path: string): void {
  let removed = false
  for (let i = models.length - 1; i >= 0; i--) {
    if (models[i].path === path) {
      models.splice(i, 1)
      removed = true
    }
  }
  if (removed) version.value++
}

function clearTier(tier: Tier): void {
  for (let i = models.length - 1; i >= 0; i--) {
    if (models[i].tier === tier) models.splice(i, 1)
  }
}

/** App-Defaults laden: public/uimodels/index.json listet die Dateien. */
export async function loadAppDefaults(baseUrl = '/uimodels'): Promise<number> {
  try {
    const resp = await fetch(`${baseUrl}/index.json`)
    if (!resp.ok) return 0
    const index = await resp.json() as { files?: string[] }
    clearTier('app')
    let count = 0
    for (const file of index.files ?? []) {
      try {
        const fileResp = await fetch(`${baseUrl}/${file}`)
        if (!fileResp.ok) continue
        count += await addUiModelsFromXmi(await fileResp.text(), `${baseUrl}/${file}`, 'app')
      } catch { /* einzelne Datei ueberspringen */ }
    }
    version.value++
    return count
  } catch {
    return 0
  }
}

/** Workspace nach *.uimodel.xmi durchsuchen und die Workspace-Stufe neu aufbauen. */
export async function reloadWorkspaceUiModels(): Promise<number> {
  if (!fileSystem) return 0
  clearTier('workspace')
  let count = 0

  const collect = (entries: FileEntryLike[], acc: FileEntryLike[]) => {
    for (const e of entries) {
      if (e.isDirectory && e.children) collect(e.children, acc)
      else if (e.name?.endsWith('.uimodel.xmi') || e.name?.endsWith('.uimodel')) acc.push(e)
    }
  }

  for (const source of fileSystem.sources.value) {
    const files = fileSystem.filesBySource.get(source.id)
    if (!files) continue
    const found: FileEntryLike[] = []
    collect(files, found)
    for (const entry of found) {
      try {
        const content = await fileSystem.readTextFile(entry)
        count += await addUiModelsFromXmi(content, entry.path, 'workspace')
      } catch (e) {
        console.warn('[UiModelRegistry] Konnte UIModel nicht laden:', entry.path, e)
      }
    }
  }
  version.value++
  return count
}

// ── Auswahllogik ────────────────────────────────────────────────────────────

function classesEqual(a: EClass | null | undefined, b: EClass | null | undefined): boolean {
  if (!a || !b) return false
  if (a === b) return true
  // Registry-Kopien/geteilte nsURIs robust vergleichen (bekannte Identitaets-
  // Problematik bei mehrfach geladenen Paketen)
  try {
    const an = (a as { getName?: () => string }).getName?.()
    const bn = (b as { getName?: () => string }).getName?.()
    const ap = (a as { getEPackage?: () => { getNsURI?: () => string } }).getEPackage?.()?.getNsURI?.()
    const bp = (b as { getEPackage?: () => { getNsURI?: () => string } }).getEPackage?.()?.getNsURI?.()
    return !!an && an === bn && !!ap && ap === bp
  } catch { return false }
}

function classMatches(target: EClass, eClass: EClass): boolean {
  if (classesEqual(target, eClass)) return true
  try {
    const supers = (eClass as { getEAllSuperTypes?: () => Iterable<EClass> }).getEAllSuperTypes?.() ?? []
    for (const s of supers) {
      if (classesEqual(target, s)) return true
    }
  } catch { /* ignore */ }
  return false
}

/**
 * Bestes UIModel fuer ein Objekt, oder null (→ Default-Generator).
 * Liest die Registry-Version — in einem computed aufgerufen wird die
 * Auswahl bei Registry-Aenderungen automatisch neu getroffen.
 */
export function findUiModel(eObject: EObject | null | undefined): UIModel | null {
  void version.value
  if (!eObject) return null
  const eClass = eObject.eClass?.()
  if (!eClass) return null

  for (const tier of ['workspace', 'app'] as Tier[]) {
    let best: { model: UIModel; specificity: number; priority: number } | null = null
    for (const entry of models) {
      if (entry.tier !== tier) continue
      const um = entry.uiModel
      const targets = (um.targetClasses ?? []) as EClass[]
      const specificity = targets.length === 0 ? 1 : (targets.some(t => classMatches(t, eClass)) ? 2 : 0)
      if (specificity === 0) continue
      // Instanz-Feinfilter (OCL/JS); fail-open Konvention des Composers
      if (!evaluateBoolean(um.filterExpression, eObject)) continue
      const priority = (um as { priority?: number }).priority ?? 0
      if (!best || specificity > best.specificity ||
          (specificity === best.specificity && priority > best.priority)) {
        best = { model: um, specificity, priority }
      }
    }
    if (best) return best.model
  }
  return null
}

export function getRegistryVersion(): number {
  return version.value
}

/** Nur fuer Tests/Debugging: aktueller Registry-Inhalt. */
export function listRegisteredUiModels(): Array<{ path: string; tier: Tier; name?: string }> {
  return models.map(m => ({ path: m.path, tier: m.tier, name: (m.uiModel as { name?: string }).name }))
}
