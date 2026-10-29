/**
 * Field defaults (FR-1.1, FR-1.2, CON-1.2): suggested values, UI defaults,
 * backend defaults and hidden attributes, kept in an own model next to the
 * edited one - `model/fielddefaults.ecore`, instances as *.fielddefaults.xmi
 * in the workspace.
 *
 * Every file stays loaded as an EMF resource: the rule editor changes its
 * FieldRule objects and saves the resource through EMF's own serializer.
 * The rules the view applies are read from those objects again after each
 * change.
 *
 * Rules name their EClass and EAttribute by reference. Matching goes by
 * nsURI and name, not by object identity: the CWM packages may be loaded
 * more than once, and a reference that could not be resolved still names
 * its target in its proxy URI.
 */
import { BasicResourceSet, EPackageRegistry, EResourceSetImpl, URI, XMIResource } from '@emfts/core'
import type { EPackage } from '@emfts/core'
import { ref, shallowReactive, toRaw } from 'tsm:vue'
import fieldDefaultsEcore from '../../model/fielddefaults.ecore?raw'
import { many } from './documentation'

export const FIELD_DEFAULTS_NS_URI = 'http://gene/cwm/fielddefaults/1.0'
/** Name of the file the editor creates when the workspace has none */
export const DEFAULT_FIELD_DEFAULTS_FILE = 'cwm.fielddefaults.xmi'

export interface FieldRuleView {
  suggestions: string[]
  uiDefault: string | null
  backendDefault: string | null
  hidden: boolean
  /** The attribute is the object's head (title) instead of "name" */
  head: boolean
}

interface Rule extends FieldRuleView {
  classNsUri: string
  className: string
  attributeName: string
  /** Also for classes inheriting from the target class */
  includeSubclasses: boolean
}

interface FileEntryLike {
  name: string
  path: string
  isDirectory?: boolean
  children?: FileEntryLike[]
}

interface FileSystemLike {
  sources: { value: { id: string }[] }
  filesBySource: Map<string, FileEntryLike[]>
  readTextFile: (entry: FileEntryLike) => Promise<string>
  writeTextFile?: (entry: FileEntryLike, content: string) => Promise<void>
  createFile?: (sourceId: string, parentPath: string, fileName: string) => Promise<void>
  refreshSource?: (sourceId: string) => Promise<void>
}

/** One *.fielddefaults.xmi, loaded */
export interface FieldDefaultsFile {
  path: string
  resource: any
  /** The FieldDefaults root */
  root: any
  /** Changed since loading or saving */
  dirty: boolean
}

/** Loaded files by path, in loading order */
export const fieldDefaultsFiles = shallowReactive(new Map<string, FieldDefaultsFile>())
let rules: Rule[] = []
/** Bumped whenever rules change; read it to re-evaluate */
export const fieldDefaultsVersion = ref(0)

let fileSystem: FileSystemLike | null = null

export function setFieldDefaultsFileSystem(fs: FileSystemLike | null): void {
  fileSystem = fs
}

/* ── package ─────────────────────────────────────────────────────── */

let registration: Promise<EPackage | null> | null = null

/** Loads fielddefaults.ecore and registers it (idempotent) */
export function registerFieldDefaultsPackage(): Promise<EPackage | null> {
  if (registration) return registration
  registration = (async () => {
    const existing = EPackageRegistry.INSTANCE.getEPackage(FIELD_DEFAULTS_NS_URI)
    if (existing) return existing as EPackage
    const resourceSet = new EResourceSetImpl()
    const resource = resourceSet.createResource(URI.createURI('gene://cwm-editor/fielddefaults.ecore'))
    await (resource as unknown as { loadFromString: (s: string) => Promise<void> }).loadFromString(fieldDefaultsEcore)
    const pkg = resource.getContents().get(0) as EPackage
    if (pkg?.getNsURI?.() !== FIELD_DEFAULTS_NS_URI) {
      console.error('[FieldDefaults] fielddefaults.ecore could not be loaded')
      return null
    }
    EPackageRegistry.INSTANCE.set(FIELD_DEFAULTS_NS_URI, pkg)
    return pkg
  })()
  return registration
}

function fieldDefaultsPackage(): any {
  return EPackageRegistry.INSTANCE.getEPackage(FIELD_DEFAULTS_NS_URI)
}

/* ── reading rules ───────────────────────────────────────────────── */

function get(o: any, name: string): any {
  const f = o?.eClass?.()?.getEStructuralFeature?.(name)
  return f ? toRaw(o.eGet(f)) : undefined
}

function set(o: any, name: string, value: unknown): void {
  const f = o?.eClass?.()?.getEStructuralFeature?.(name)
  if (f) o.eSet(f, value)
}

/** nsURI and path (class, attribute) of a referenced Ecore element, resolved or not */
export function ecoreTarget(o: any): { nsUri: string; path: string[] } | null {
  if (!o) return null
  if (o.eIsProxy?.()) {
    const uri = String(o.eProxyURI?.() ?? '')
    const [nsUri, fragment = ''] = uri.split('#')
    return { nsUri: nsUri ?? '', path: fragment.replace(/^\/\//, '').split('/').filter(Boolean) }
  }
  const owner = o.getEContainingClass?.() ?? null
  const pkg = (owner ?? o).getEPackage?.()
  const path = owner ? [owner.getName(), o.getName()] : [o.getName()]
  return { nsUri: pkg?.getNsURI?.() ?? '', path }
}

/** The rule's class and attribute as names, for the editor */
export function ruleTargetNames(fr: any): { className: string; attributeName: string; nsUri: string } {
  const cls = ecoreTarget(get(fr, 'targetClass'))
  const attr = ecoreTarget(get(fr, 'attribute'))
  return {
    className: cls?.path[cls.path.length - 1] ?? '',
    attributeName: attr?.path[attr.path.length - 1] ?? '',
    nsUri: cls?.nsUri ?? ''
  }
}

function toRule(fr: any): Rule | null {
  const { className, attributeName, nsUri } = ruleTargetNames(fr)
  if (!className || !attributeName) return null
  const text = (v: unknown) => (v == null || v === '' ? null : String(v))
  return {
    classNsUri: nsUri,
    className,
    attributeName,
    includeSubclasses: !!get(fr, 'includeSubclasses'),
    suggestions: many(get(fr, 'suggestions')).map(String),
    uiDefault: text(get(fr, 'uiDefault')),
    backendDefault: text(get(fr, 'backendDefault')),
    hidden: !!get(fr, 'hidden'),
    head: !!get(fr, 'head')
  }
}

/** Re-reads the rules from the loaded files; call after every change */
export function refreshFieldRules(): void {
  const next: Rule[] = []
  for (const file of fieldDefaultsFiles.values()) {
    for (const fr of ruleObjects(file)) {
      const rule = toRule(fr)
      if (rule) next.push(rule)
    }
  }
  rules = next
  fieldDefaultsVersion.value++
}

/** The FieldRule objects of a file */
export function ruleObjects(file: FieldDefaultsFile): any[] {
  return many(get(file.root, 'rules'))
}

/** Takes the rules of one *.fielddefaults.xmi; replaces what was loaded from the same path */
export async function addFieldDefaultsFromXmi(content: string, path: string): Promise<number> {
  await registerFieldDefaultsPackage()
  const resourceSet = new BasicResourceSet()
  const resource = new XMIResource(URI.createURI(path))
  resourceSet.getResources().push(resource)
  resource.setResourceSet(resourceSet)
  await resource.loadFromString(content)
  const root = many(resource.getContents()).find(r => r?.eClass?.()?.getName?.() === 'FieldDefaults')
  if (!root) return 0
  fieldDefaultsFiles.set(path, { path, resource, root, dirty: false })
  refreshFieldRules()
  return ruleObjects(fieldDefaultsFiles.get(path)!).length
}

function workspaceEntries(): { entry: FileEntryLike; sourceId: string }[] {
  if (!fileSystem) return []
  const out: { entry: FileEntryLike; sourceId: string }[] = []
  for (const source of fileSystem.sources.value) {
    const walk = (entries: FileEntryLike[]) => {
      for (const e of entries) {
        if (e.isDirectory && e.children) walk(e.children)
        else if (e.name?.endsWith('.fielddefaults.xmi')) out.push({ entry: e, sourceId: source.id })
      }
    }
    walk(fileSystem.filesBySource.get(source.id) ?? [])
  }
  return out
}

/** Collects all *.fielddefaults.xmi of the workspace */
export async function reloadWorkspaceFieldDefaults(): Promise<number> {
  if (!fileSystem) return 0
  fieldDefaultsFiles.clear()
  let count = 0
  for (const { entry } of workspaceEntries()) {
    try {
      count += await addFieldDefaultsFromXmi(await fileSystem.readTextFile(entry), entry.path)
    } catch (e) {
      console.warn('[FieldDefaults] Could not load', entry.path, e)
    }
  }
  refreshFieldRules()
  return count
}

/* ── editing ─────────────────────────────────────────────────────── */

/**
 * The file the editor writes to: the first loaded one, or a new, empty one
 * named DEFAULT_FIELD_DEFAULTS_FILE that is created on first save.
 */
export async function editableFieldDefaultsFile(): Promise<FieldDefaultsFile | null> {
  const first = fieldDefaultsFiles.values().next().value as FieldDefaultsFile | undefined
  if (first) return first
  await registerFieldDefaultsPackage()
  const pkg = fieldDefaultsPackage()
  const rootClass = pkg?.getEClassifier?.('FieldDefaults')
  const root = rootClass ? pkg.getEFactoryInstance().create(rootClass) : null
  if (!root) return null
  set(root, 'name', 'CWM')
  const resourceSet = new BasicResourceSet()
  const resource = new XMIResource(URI.createURI(DEFAULT_FIELD_DEFAULTS_FILE))
  resourceSet.getResources().push(resource)
  resource.setResourceSet(resourceSet)
  resource.getContents().add(root)
  const file: FieldDefaultsFile = { path: DEFAULT_FIELD_DEFAULTS_FILE, resource, root, dirty: true }
  fieldDefaultsFiles.set(file.path, file)
  return file
}

/** A new rule for eClass.attribute in the file */
export function addRule(file: FieldDefaultsFile, eClass: any, attribute: any, includeSubclasses = false): any | null {
  const pkg = fieldDefaultsPackage()
  const ruleClass = pkg?.getEClassifier?.('FieldRule')
  const rule = ruleClass ? pkg.getEFactoryInstance().create(ruleClass) : null
  if (!rule) return null
  set(rule, 'targetClass', toRaw(eClass))
  set(rule, 'attribute', toRaw(attribute))
  if (includeSubclasses) set(rule, 'includeSubclasses', true)
  get(file.root, 'rules').add(rule)
  file.dirty = true
  refreshFieldRules()
  return rule
}

export function removeRule(file: FieldDefaultsFile, rule: any): void {
  get(file.root, 'rules').remove(toRaw(rule))
  file.dirty = true
  refreshFieldRules()
}

type RuleField = 'suggestions' | 'uiDefault' | 'backendDefault' | 'hidden' | 'includeSubclasses' | 'head'

/**
 * Changes one value of a rule; suggestions as a list of strings. A class has
 * one head: marking a rule as head clears the mark on the file's other rules
 * for the same class.
 */
export function setRuleValue(file: FieldDefaultsFile, rule: any, field: RuleField, value: string | boolean | string[]): void {
  const r = toRaw(rule)
  if (field === 'suggestions') {
    const list = get(r, 'suggestions')
    list.clear()
    for (const s of value as string[]) list.add(s)
  } else if (field === 'hidden' || field === 'includeSubclasses' || field === 'head') {
    if (field === 'head' && value) {
      const own = ruleTargetNames(r)
      for (const other of ruleObjects(file)) {
        const t = ruleTargetNames(other)
        if (toRaw(other) !== r && t.className === own.className && t.nsUri === own.nsUri) set(other, 'head', false)
      }
    }
    set(r, field, !!value)
  } else {
    const text = String(value)
    const f = r.eClass().getEStructuralFeature(field)
    if (text === '') r.eUnset?.(f)
    else r.eSet(f, text)
  }
  file.dirty = true
  refreshFieldRules()
}

/** The file's content as XMI, written by EMF's serializer */
export function fieldDefaultsXmi(file: FieldDefaultsFile): string {
  return file.resource.saveToString()
}

/** Writes the file into the workspace; creates it at the root of the first source if new */
export async function saveFieldDefaultsFile(file: FieldDefaultsFile): Promise<void> {
  if (!fileSystem?.writeTextFile) throw new Error('Kein beschreibbares Dateisystem')
  const xmi = fieldDefaultsXmi(file)
  let found = workspaceEntries().find(e => e.entry.path === file.path)
  if (!found) {
    const source = fileSystem.sources.value[0]
    if (!source || !fileSystem.createFile) throw new Error('Kein Workspace geöffnet')
    await fileSystem.createFile(source.id, '', file.path)
    await fileSystem.refreshSource?.(source.id)
    found = workspaceEntries().find(e => e.entry.name === file.path || e.entry.path === file.path)
    if (!found) throw new Error(`${file.path} konnte nicht angelegt werden`)
    // The workspace may give the file a different path (e.g. with a source prefix)
    if (found.entry.path !== file.path) {
      fieldDefaultsFiles.delete(file.path)
      file.path = found.entry.path
      fieldDefaultsFiles.set(file.path, file)
    }
  }
  await fileSystem.writeTextFile(found.entry, xmi)
  file.dirty = false
  fieldDefaultsVersion.value++
}

/* ── applying rules ──────────────────────────────────────────────── */

/** 0 for the class itself, 1 for its direct supertypes …; -1 when the rule does not apply */
function distance(eClass: any, rule: Rule): number {
  const matches = (c: any) => c?.getName?.() === rule.className && c?.getEPackage?.()?.getNsURI?.() === rule.classNsUri
  if (matches(eClass)) return 0
  if (!rule.includeSubclasses) return -1
  let level = [eClass]
  for (let d = 1; d < 30 && level.length; d++) {
    level = level.flatMap(c => many(c.getESuperTypes?.()))
    if (level.some(matches)) return d
  }
  return -1
}

/** The rule for an object's attribute - from the most specific class - or null */
export function fieldRule(object: any, attributeName: string): FieldRuleView | null {
  void fieldDefaultsVersion.value
  const eClass = toRaw(object)?.eClass?.()
  if (!eClass) return null
  let best: Rule | null = null
  let bestDistance = Infinity
  for (const rule of rules) {
    if (rule.attributeName !== attributeName) continue
    const d = distance(eClass, rule)
    if (d >= 0 && d < bestDistance) { best = rule; bestDistance = d }
  }
  return best
}

/**
 * The attribute an object shows as its head (title): from the most specific
 * class with a head rule, else "name". Only single-valued attributes the
 * class has count.
 */
export function headAttributeName(object: any): string {
  void fieldDefaultsVersion.value
  const eClass = toRaw(object)?.eClass?.()
  if (!eClass) return 'name'
  let best = 'name'
  let bestDistance = Infinity
  for (const rule of rules) {
    if (!rule.head) continue
    const d = distance(eClass, rule)
    if (d < 0 || d >= bestDistance) continue
    const feature = eClass.getEStructuralFeature?.(rule.attributeName)
    if (!feature || feature.isMany?.() || typeof feature.isContainment === 'function') continue
    best = rule.attributeName
    bestDistance = d
  }
  return best
}

/** Rules with a backend default for this object's class, by attribute */
export function backendDefaults(object: any): Map<string, string> {
  const out = new Map<string, string>()
  const o = toRaw(object)
  for (const feature of many(o?.eClass?.()?.getEAllAttributes?.())) {
    const value = fieldRule(o, feature.getName())?.backendDefault
    if (value != null) out.set(feature.getName(), value)
  }
  return out
}

/**
 * The shortcut beside a field: hides it (or shows it again) for the object's
 * class and the classes inheriting from it - through the class's own rule,
 * made when missing - and saves the rule file.
 */
export async function setFieldHidden(object: any, featureName: string, hidden: boolean): Promise<void> {
  const t0 = performance.now()
  const eClass = toRaw(object)?.eClass?.()
  const feature = eClass?.getEStructuralFeature?.(featureName)
  if (!eClass || !feature) return
  const file = await editableFieldDefaultsFile()
  if (!file) return
  const nsUri = eClass.getEPackage?.()?.getNsURI?.() ?? ''
  let rule = ruleObjects(file).find(fr => {
    const t = ruleTargetNames(fr)
    return t.className === eClass.getName() && t.nsUri === nsUri && t.attributeName === featureName
  })
  if (!rule) rule = addRule(file, eClass, feature, true)
  if (!rule) return
  setRuleValue(file, rule, 'includeSubclasses', true)
  setRuleValue(file, rule, 'hidden', hidden)
  const t1 = performance.now()
  await saveFieldDefaultsFile(file)
  // Temporary timing, to find what makes the shortcut slow
  requestAnimationFrame(() => console.info(`[cwm-perf] Feld ausblenden: Regel ${(t1 - t0).toFixed(0)} ms, Speichern ${(performance.now() - t1).toFixed(0)} ms (inkl. Zeichnen)`))
}
