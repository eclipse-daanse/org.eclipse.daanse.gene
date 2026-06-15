import { describe, it, expect } from 'vitest'
import { deriveRootEPackages, collectClassesDeep } from '../classPickerSource'

// ── Duck-typed EMF mocks ─────────────────────────────────────────────────────

function eclass(name: string, opts: { abstract?: boolean } = {}) {
  return {
    getName: () => name,
    isAbstract: () => !!opts.abstract,
    // presence of an attribute accessor marks this as an EClass for the collector
    getEAttributes: () => []
  }
}

// An EDataType-like classifier: no attribute accessors → must be ignored.
function edatatype(name: string) {
  return { getName: () => name, getInstanceClassName: () => 'java.lang.String' }
}

function epackage(
  name: string,
  opts: { nsURI?: string; classes?: any[]; subs?: any[] } = {}
): any {
  const pkg: any = {
    getName: () => name,
    getNsURI: () => opts.nsURI ?? '',
    getEClassifiers: () => opts.classes ?? [],
    getESubpackages: () => opts.subs ?? [],
    getESuperPackage: () => pkg.__super ?? null,
    __super: null
  }
  for (const s of opts.subs ?? []) s.__super = pkg
  return pkg
}

const entry = (ePackage: any) => ({ ePackage })

// A waterpark-like model: classes live only in deeply nested subpackages.
function waterparkModel() {
  const base = epackage('base', { nsURI: 'wp/thing/base', classes: [eclass('Thing', { abstract: true })] })
  const geolocation = epackage('geolocation', { nsURI: 'wp/thing/service/geo', classes: [eclass('geometry')] })
  const service = epackage('service', { nsURI: 'wp/thing/service', subs: [geolocation] })
  const thing = epackage('thing', { nsURI: 'wp/thing', subs: [base, service] })
  const event = epackage('event', { nsURI: 'wp/event' })
  const waterpark = epackage('waterpark', { nsURI: 'wp', subs: [event, thing] })
  // The registry flattens every subpackage into its own entry alongside the root.
  const registry = [waterpark, event, thing, base, service, geolocation].map(entry)
  return { waterpark, base, geolocation, registry }
}

describe('deriveRootEPackages', () => {
  it('keeps only root packages from the registry (subpackages are reached via recursion)', () => {
    const { waterpark, registry } = waterparkModel()
    const roots = deriveRootEPackages(registry)
    expect(roots).toEqual([waterpark])
  })

  it('treats a package whose super is not listed as a root (orphan subpackage)', () => {
    const orphanParent = epackage('parent', { nsURI: 'p' })
    const child = epackage('child', { nsURI: 'p/child' })
    child.__super = orphanParent // parent exists but is NOT a registry entry
    const roots = deriveRootEPackages([entry(child)])
    expect(roots).toEqual([child])
  })

  it('uses sourcePackages verbatim and ignores the registry when provided', () => {
    const { registry } = waterparkModel()
    const live = epackage('live', { nsURI: 'live' })
    expect(deriveRootEPackages(registry, [live])).toEqual([live])
  })

  it('falls back to the registry when sourcePackages is empty or undefined', () => {
    const { waterpark, registry } = waterparkModel()
    expect(deriveRootEPackages(registry, [])).toEqual([waterpark])
    expect(deriveRootEPackages(registry, undefined)).toEqual([waterpark])
  })

  it('returns [] for an empty/undefined registry', () => {
    expect(deriveRootEPackages([])).toEqual([])
    expect(deriveRootEPackages(undefined)).toEqual([])
  })
})

describe('collectClassesDeep', () => {
  it('collects classes from nested subpackages, each exactly once (no duplicates)', () => {
    const { waterpark } = waterparkModel()
    const names = collectClassesDeep([waterpark]).map((c) => c.className).sort()
    expect(names).toEqual(['Thing', 'geometry'])
  })

  it('end-to-end with the flattened registry yields each subpackage class once', () => {
    // Regression: before the dedup fix every subpackage was also a top-level entry,
    // so classes appeared once per ancestor level.
    const { registry } = waterparkModel()
    const names = collectClassesDeep(deriveRootEPackages(registry)).map((c) => c.className).sort()
    expect(names).toEqual(['Thing', 'geometry'])
  })

  it('includes classes added to a live source model (sourcePackages path)', () => {
    // Regression: the picker previously read a stale registry copy and missed
    // classes created during the editing session.
    const defect = epackage('defect', { nsURI: 'wp/thing/service/defect', classes: [eclass('abc')] })
    const service = epackage('service', { nsURI: 'wp/thing/service', subs: [defect] })
    const thing = epackage('thing', { nsURI: 'wp/thing', subs: [service] })
    const liveRoot = epackage('waterpark', { nsURI: 'wp', subs: [thing] })
    const names = collectClassesDeep([liveRoot]).map((c) => c.className)
    expect(names).toContain('abc')
  })

  it('excludes abstract classes when includeAbstract is false', () => {
    const { waterpark } = waterparkModel()
    const names = collectClassesDeep([waterpark], false).map((c) => c.className)
    expect(names).toEqual(['geometry']) // Thing is abstract
  })

  it('ignores non-class classifiers such as EDataTypes', () => {
    const pkg = epackage('p', { nsURI: 'p', classes: [eclass('Real'), edatatype('EString')] })
    const names = collectClassesDeep([pkg]).map((c) => c.className)
    expect(names).toEqual(['Real'])
  })

  it('builds an EMF-style qualifiedName from the package nsURI', () => {
    const pkg = epackage('p', { nsURI: 'http://x/p', classes: [eclass('Foo')] })
    expect(collectClassesDeep([pkg])[0].qualifiedName).toBe('http://x/p#//Foo')
  })
})