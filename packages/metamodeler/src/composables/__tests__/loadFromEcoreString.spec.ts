import { describe, it, expect, afterEach } from 'vitest'
import { useMetamodeler, setMetamodelerModelRegistry } from '../useMetamodeler'
import { XMIResource, URI, BasicEPackage, BasicResourceSet } from '@emfts/core'

// Unique nsURI/name to avoid colliding with other specs in the global
// EPackageRegistry when the full suite runs (shared module state).
const MM_ECORE = `<?xml version="1.0" encoding="UTF-8"?>
<ecore:EPackage xmlns:xmi="http://www.omg.org/XMI" xmi:version="2.0" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xmlns:ecore="http://www.eclipse.org/emf/2002/Ecore" name="mmfresh" nsURI="http://test.local/mmfresh" nsPrefix="mmfresh">
  <eClassifiers xsi:type="ecore:EClass" name="Widget"/>
</ecore:EPackage>`

function fakeRegistry(userPackages: any[]) {
  return { userPackages: { value: userPackages } }
}

afterEach(() => {
  // reset the injected registry so tests don't leak into each other
  setMetamodelerModelRegistry(() => null)
})

describe('useMetamodeler.loadFromEcoreString — one-resource invariant', () => {
  it('adopts the already-registered resource instead of parsing a divergent copy', async () => {
    const rs = new BasicResourceSet()
    const res = new XMIResource(URI.createURI('model/reg.ecore'))
    res.setResourceSet(rs)
    const pkg = new BasicEPackage()
    pkg.setName('reg')
    pkg.setNsURI('http://reg')
    pkg.setNsPrefix('reg')
    ;(res.getContents() as any).add(pkg)

    setMetamodelerModelRegistry(() =>
      fakeRegistry([{ sourceFile: 'model/reg.ecore', ePackage: pkg, nsURI: 'http://reg', name: 'reg' }])
    )

    const mm = useMetamodeler()
    const info = await mm.loadFromEcoreString('<ignored/>', 'model/reg.ecore')

    expect(info).toEqual({ name: 'reg', nsURI: 'http://reg' })
    // The metamodeler edits the SAME live objects/resource the registry serves —
    // no second parse, so cross-references stay intra-document.
    expect(mm.rootPackage.value).toBe(pkg)
    expect(mm.resource.value).toBe(res)
  })

  it('parses fresh when a registered model has no editable resource (nothing to adopt)', async () => {
    const orphan = new BasicEPackage()
    orphan.setName('orphan')
    orphan.setNsURI('http://test.local/orphan')
    // orphan was never added to a resource → eResource() is null (e.g. a legacy
    // file the registry could not load). There is nothing to adopt, so the
    // metamodeler must parse fresh rather than fail.

    setMetamodelerModelRegistry(() =>
      fakeRegistry([{ sourceFile: 'model/orphan.ecore', ePackage: orphan, nsURI: 'http://test.local/orphan', name: 'orphan' }])
    )

    const ORPHAN_ECORE = MM_ECORE
      .replace('http://test.local/mmfresh', 'http://test.local/orphanfresh')
      .replace('name="mmfresh"', 'name="orphanfresh"')
      .replace('nsPrefix="mmfresh"', 'nsPrefix="orphanfresh"')

    const mm = useMetamodeler()
    const info = await mm.loadFromEcoreString(ORPHAN_ECORE, 'model/orphan.ecore')

    expect(info?.name).toBe('orphanfresh')
    expect(mm.rootPackage.value?.getName?.()).toBe('orphanfresh')
  })

  it('parses fresh when the model is not registered (it is the only copy)', async () => {
    setMetamodelerModelRegistry(() => fakeRegistry([]))

    const mm = useMetamodeler()
    const info = await mm.loadFromEcoreString(MM_ECORE, 'model/mmfresh.ecore')

    expect(info?.name).toBe('mmfresh')
    expect(mm.rootPackage.value?.getName?.()).toBe('mmfresh')
  })
})
