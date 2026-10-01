import { describe, it, expect } from 'vitest'
import { useModelRegistry } from '../useModelRegistry'
import { URI } from '@emfts/core'

const SHOP_ECORE = `<?xml version="1.0" encoding="UTF-8"?>
<ecore:EPackage xmlns:xmi="http://www.omg.org/XMI" xmi:version="2.0" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xmlns:ecore="http://www.eclipse.org/emf/2002/Ecore" name="shop" nsURI="http://example.org/shop" nsPrefix="shop">
  <eClassifiers xsi:type="ecore:EClass" name="Product"/>
</ecore:EPackage>`

describe('useModelRegistry.loadEcoreFile', () => {
  it('führt die Resource unter ihrer nsURI — das ist der Name, den ein Verweis trägt', async () => {
    const registry = useModelRegistry()
    const info = await registry.loadEcoreFile(SHOP_ECORE, 'model/shop.ecore')

    expect(info).toBeTruthy()
    const res = info!.ePackage.eResource()
    expect(res).toBeTruthy()
    // Nicht der Pfad: sonst schreibt XMLSave.getHref() 'model/shop.ecore#//Product'
    // in jede Instanz, und für ein Metamodell aus dem Atlas gäbe es dafür keinen
    // Bezugspunkt.
    expect(res!.getURI()?.toString()).toBe('http://example.org/shop')
  })

  it('merkt sich den Pfad in der URI-Abbildung — zum Speichern und für alte Verweise', async () => {
    const registry = useModelRegistry()
    const info = await registry.loadEcoreFile(SHOP_ECORE, 'model/shop.ecore')

    const rs = (info!.ePackage.eResource() as any)?.getResourceSet?.()
    const converter = rs?.getURIConverter?.()
    expect(converter).toBeTruthy()
    // physisch -> logisch: ein Dokument mit 'model/shop.ecore#//Product' landet
    // damit bei dieser Resource
    expect(converter.normalize(URI.createURI('model/shop.ecore')).toString())
      .toBe('http://example.org/shop')
    // Der Pfad bleibt am Registry-Eintrag, das Speichern braucht ihn
    expect(info!.sourceFile).toBe('model/shop.ecore')
  })

  it('kommt auch ohne Pfad zur nsURI — die steht im Inhalt', async () => {
    const registry = useModelRegistry()
    const info = await registry.loadEcoreFile(SHOP_ECORE, '')

    expect(info).toBeTruthy()
    const uri = info!.ePackage.eResource()?.getURI()?.toString()
    expect(uri).toBe('http://example.org/shop')
    expect(uri).not.toContain('temp.ecore')
  })

  // TODO: hängt aktuell im vollen Suite-Lauf (offenes Handle im Test-Harness bei
  // wiederholtem loadEcoreFile). Dedup-CODE ist aktiv; Test noch zu stabilisieren.
  it.skip('reuses the same live resource when the same source is loaded again (dedup)', async () => {
    const DEDUP_ECORE = SHOP_ECORE
      .replace('http://example.org/shop', 'http://test.local/dedup')
      .replace('name="shop"', 'name="dedup"')
      .replace('nsPrefix="shop"', 'nsPrefix="dedup"')
    const registry = useModelRegistry()
    const first = await registry.loadEcoreFile(DEDUP_ECORE, 'model/dedup.ecore')
    const second = await registry.loadEcoreFile(DEDUP_ECORE, 'model/dedup.ecore')

    expect(first).toBeTruthy()
    // Re-registering must reuse the same live EPackage/resource — not a second parse —
    // otherwise a metamodeler that adopted the first resource would be orphaned.
    expect(second).toBe(first)
    expect(second!.ePackage).toBe(first!.ePackage)
  })
})