/**
 * Which objects get an xmi:id, and how references are written as a result.
 *
 * A class with an ID attribute is addressed by that attribute; a UUID handed
 * out before the key was typed would take precedence for good (the upload to
 * the atlas showed `other="uuid-…"` instead of the key).
 */
import { describe, it, expect } from 'vitest'
import {
  BasicResourceSet, XMIResourceFactory, URI, EPackageRegistry,
  BasicEPackage, BasicEClass, BasicEAttribute, BasicEReference, BasicEFactory, getEcorePackage
} from '@emfts/core'
import { assignXmiId, getXmiId, hasIdAttribute } from '../composables/useInstanceTree'

function modell(mitId: boolean) {
  const ecore: any = getEcorePackage()
  const pkg = new BasicEPackage(); pkg.setName('t'); pkg.setNsURI(`http://t/${mitId ? 'id' : 'plain'}`); pkg.setNsPrefix('t')
  const Thing = new BasicEClass(); Thing.setName('Thing')
  const key = new BasicEAttribute(); key.setName('key'); key.setEType(ecore.getEString?.() ?? ecore.getEClassifier('EString')); key.setID(mitId)
  const other = new BasicEReference(); other.setName('other'); other.setEType(Thing)
  const kids = new BasicEReference(); kids.setName('kids'); kids.setEType(Thing); kids.setContainment(true); kids.setUpperBound(-1)
  for (const f of [key, other, kids]) (Thing.getEStructuralFeatures() as any).add(f)
  ;(pkg.getEClassifiers() as any).add(Thing)
  let fac: any = pkg.getEFactoryInstance?.()
  if (!fac) { fac = new BasicEFactory(); fac.setEPackage?.(pkg); pkg.setEFactoryInstance?.(fac) }
  EPackageRegistry.INSTANCE.set(pkg.getNsURI()!, pkg)
  const rs = new BasicResourceSet()
  rs.getResourceFactoryRegistry().getExtensionToFactoryMap().set('xmi', new XMIResourceFactory())
  const res: any = rs.createResource(URI.createURI(`${mitId ? 'id' : 'plain'}.xmi`))
  const a: any = fac.create(Thing), b: any = fac.create(Thing)
  res.getContents().add(a); a.eGet(kids).add(b)
  return { res, a, b, key, other, Thing }
}

describe('xmi:id und ID-Attribut', () => {
  it('eine Klasse mit ID-Attribut bekommt keine xmi:id - die Referenz nennt den Schluessel', () => {
    const { res, a, b, key, other, Thing } = modell(true)
    expect(hasIdAttribute(Thing)).toBe(true)
    // Wie im Editor: erst angelegt (und mit xmi:id versorgt), dann der Schluessel getippt
    expect(assignXmiId(a)).toBeNull()
    expect(assignXmiId(b)).toBeNull()
    a.eSet(key, 'A'); b.eSet(key, 'B'); a.eSet(other, b)
    expect(getXmiId(b)).toBeNull()
    const xml: string = res.saveToString()
    expect(xml).toContain('other="B"')
    expect(xml).not.toContain('xmi:id')
  })

  it('ohne ID-Attribut gibt es eine UUID, und die Referenz nutzt sie', () => {
    const { res, a, b, other, Thing } = modell(false)
    expect(hasIdAttribute(Thing)).toBe(false)
    const idB = assignXmiId(b)
    assignXmiId(a)
    expect(idB).toMatch(/^[0-9a-f-]{36}$/)
    a.eSet(other, b)
    expect(res.saveToString()).toContain(`other="${idB}"`)
  })

  it('eine vorhandene xmi:id bleibt, auch bei einer Klasse mit ID-Attribut', () => {
    const { res, a } = modell(true)
    res.setID(a, 'aus-der-datei')
    expect(assignXmiId(a)).toBe('aus-der-datei')
  })
})
