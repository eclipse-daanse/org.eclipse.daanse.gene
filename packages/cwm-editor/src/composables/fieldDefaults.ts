/**
 * Field defaults (FR-1.1, FR-1.2, CON-1.2): suggested values, UI defaults,
 * backend defaults and hidden attributes, kept in an own model next to the
 * edited one - `model/fielddefaults.ecore`, instances as *.fielddefaults.xmi
 * in the workspace.
 *
 * Rules name their EClass and EAttribute by reference. Matching goes by
 * nsURI and name, not by object identity: the CWM packages may be loaded
 * more than once, and a reference that could not be resolved still names
 * its target in its proxy URI.
 */
import { BasicResourceSet, EPackageRegistry, EResourceSetImpl, URI, XMIResource } from '@emfts/core'
import type { EPackage } from '@emfts/core'
import { ref, toRaw } from 'tsm:vue'
import fieldDefaultsEcore from '../../model/fielddefaults.ecore?raw'
import { many } from './documentation'

export const FIELD_DEFAULTS_NS_URI = 'http://gene/cwm/fielddefaults/1.0'

export interface FieldRuleView {
  suggestions: string[]
  uiDefault: string | null
  backendDefault: string | null
  hidden: boolean
}

interface Rule extends FieldRuleView {
  classNsUri: string
  className: string
  attributeName: string
  path: string
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
}

const rules: Rule[] = []
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

/* ── reading rules ───────────────────────────────────────────────── */

function get(o: any, name: string): any {
  const f = o?.eClass?.()?.getEStructuralFeature?.(name)
  return f ? toRaw(o.eGet(f)) : undefined
}

/** nsURI and fragment of a referenced Ecore element, resolved or not */
function target(o: any): { nsUri: string; path: string[] } | null {
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

function toRule(fr: any, path: string): Rule | null {
  const cls = target(get(fr, 'targetClass'))
  const attr = target(get(fr, 'attribute'))
  const className = cls?.path[cls.path.length - 1]
  const attributeName = attr?.path[attr.path.length - 1]
  if (!cls || !className || !attributeName) return null
  const text = (v: unknown) => (v == null || v === '' ? null : String(v))
  return {
    classNsUri: cls.nsUri,
    className,
    attributeName,
    suggestions: many(get(fr, 'suggestions')).map(String),
    uiDefault: text(get(fr, 'uiDefault')),
    backendDefault: text(get(fr, 'backendDefault')),
    hidden: !!get(fr, 'hidden'),
    path
  }
}

/** Takes the rules of one *.fielddefaults.xmi; replaces earlier ones from the same path */
export async function addFieldDefaultsFromXmi(content: string, path: string): Promise<number> {
  await registerFieldDefaultsPackage()
  const resourceSet = new BasicResourceSet()
  const res = new XMIResource(URI.createURI(path))
  resourceSet.getResources().push(res)
  res.setResourceSet(resourceSet)
  await res.loadFromString(content)
  for (let i = rules.length - 1; i >= 0; i--) if (rules[i]!.path === path) rules.splice(i, 1)
  let count = 0
  for (const root of many(res.getContents())) {
    if (root?.eClass?.()?.getName?.() !== 'FieldDefaults') continue
    for (const fr of many(get(root, 'rules'))) {
      const rule = toRule(fr, path)
      if (rule) { rules.push(rule); count++ }
    }
  }
  fieldDefaultsVersion.value++
  return count
}

/** Collects all *.fielddefaults.xmi of the workspace */
export async function reloadWorkspaceFieldDefaults(): Promise<number> {
  if (!fileSystem) return 0
  rules.splice(0)
  const found: FileEntryLike[] = []
  const collect = (entries: FileEntryLike[]) => {
    for (const e of entries) {
      if (e.isDirectory && e.children) collect(e.children)
      else if (e.name?.endsWith('.fielddefaults.xmi')) found.push(e)
    }
  }
  for (const source of fileSystem.sources.value) collect(fileSystem.filesBySource.get(source.id) ?? [])
  let count = 0
  for (const entry of found) {
    try {
      count += await addFieldDefaultsFromXmi(await fileSystem.readTextFile(entry), entry.path)
    } catch (e) {
      console.warn('[FieldDefaults] Could not load', entry.path, e)
    }
  }
  fieldDefaultsVersion.value++
  return count
}

/* ── applying rules ──────────────────────────────────────────────── */

/** 0 for the class itself, 1 for its direct supertypes …; -1 when the rule does not apply */
function distance(eClass: any, rule: Rule): number {
  const matches = (c: any) => c?.getName?.() === rule.className && c?.getEPackage?.()?.getNsURI?.() === rule.classNsUri
  if (matches(eClass)) return 0
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

export function fieldDefaultsLoaded(): number {
  return rules.length
}
