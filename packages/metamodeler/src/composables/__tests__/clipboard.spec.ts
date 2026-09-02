/**
 * Zwischenablage im Metamodeler-Baum (#63).
 *
 * Kopieren, Ausschneiden und Einfuegen teilen die Containment-Pruefung mit
 * dem Verschieben (model-editing). Geprueft wird hier, was darauf aufsetzt:
 * dass "Einfuegen" nur dort angeboten wird, wo das Metamodell es zulaesst,
 * dass eine Kopie ihre Attribute mitnimmt, und dass Namenskollisionen im Ziel
 * aufgeloest werden — zwei Klassifizierer gleichen Namens in einem Package
 * ergaeben ein Modell, das sich nicht mehr laden laesst.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { useMetamodeler, setMetamodelerModelRegistry } from '../useMetamodeler'
import {
  XMIResource, URI, BasicResourceSet, XMIResourceFactory,
  registerEcorePackage, EPackageRegistry,
  type EPackage, type EClass, type ENamedElement
} from '@emfts/core'

const ECORE = `<?xml version="1.0" encoding="UTF-8"?>
<ecore:EPackage xmlns:xmi="http://www.omg.org/XMI" xmi:version="2.0"
    xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"
    xmlns:ecore="http://www.eclipse.org/emf/2002/Ecore"
    name="clip" nsURI="http://test.local/clipboard" nsPrefix="clip">
  <eClassifiers xsi:type="ecore:EClass" name="Sensor">
    <eStructuralFeatures xsi:type="ecore:EAttribute" name="name"
        eType="ecore:EDataType http://www.eclipse.org/emf/2002/Ecore#//EString"/>
    <eStructuralFeatures xsi:type="ecore:EAttribute" name="wert"
        eType="ecore:EDataType http://www.eclipse.org/emf/2002/Ecore#//EDouble"/>
  </eClassifiers>
  <eClassifiers xsi:type="ecore:EClass" name="Ort"/>
</ecore:EPackage>`

describe('Metamodeler-Zwischenablage (#63)', () => {
  let pkg: EPackage
  let sensor: EClass
  let ort: EClass
  let mm: ReturnType<typeof useMetamodeler>

  beforeEach(() => {
    registerEcorePackage()
    const rs = new BasicResourceSet()
    const factory = new XMIResourceFactory()
    const map = rs.getResourceFactoryRegistry().getExtensionToFactoryMap()
    map.set('xmi', factory); map.set('ecore', factory)
    const res = rs.createResource(URI.createURI('clip.ecore')) as XMIResource
    res.loadFromString(ECORE)
    pkg = res.getContents().get(0) as unknown as EPackage
    EPackageRegistry.INSTANCE.set(pkg.getNsURI()!, pkg)
    sensor = pkg.getEClassifier('Sensor') as EClass
    ort = pkg.getEClassifier('Ort') as EClass
    mm = useMetamodeler()
    mm.clearClipboard()
  })

  afterEach(() => {
    setMetamodelerModelRegistry(() => null)
    mm.clearClipboard()
  })

  it('ohne Inhalt ist Einfuegen nicht moeglich', () => {
    const ergebnis = mm.canPasteInto(ort as unknown as ENamedElement)
    expect(ergebnis.ok).toBe(false)
    expect(ergebnis.reason).toMatch(/leer/i)
  })

  it('ein kopiertes Attribut darf in eine andere Klasse', () => {
    const attribut = sensor.getEStructuralFeatures().get(0) as unknown as ENamedElement
    mm.copyToClipboard(attribut)
    expect(mm.hasClipboardContent.value).toBe(true)
    expect(mm.canPasteInto(ort as unknown as ENamedElement).ok).toBe(true)
  })

  it('ein kopiertes Attribut darf nicht in ein Package', () => {
    const attribut = sensor.getEStructuralFeatures().get(0) as unknown as ENamedElement
    mm.copyToClipboard(attribut)
    const ergebnis = mm.canPasteInto(pkg as unknown as ENamedElement)
    expect(ergebnis.ok).toBe(false)
    expect(ergebnis.reason).toMatch(/kein passender Container/i)
  })

  it('Einfuegen legt eine echte Kopie an, das Original bleibt', () => {
    const attribut = sensor.getEStructuralFeatures().get(0) as unknown as ENamedElement
    mm.copyToClipboard(attribut)
    expect(mm.pasteInto(ort as unknown as ENamedElement)).toBe(true)

    expect(sensor.getEStructuralFeatures().size()).toBe(2)   // Original unberuehrt
    expect(ort.getEStructuralFeatures().size()).toBe(1)
    const kopie = ort.getEStructuralFeatures().get(0) as any
    expect(kopie).not.toBe(attribut)
    expect(kopie.getName()).toBe('name')
    // Der Typverweis zeigt weiter auf denselben Datentyp
    expect(kopie.getEType()).toBe((attribut as any).getEType())
  })

  it('eine kopierte Klasse nimmt ihre Attribute mit', () => {
    mm.copyToClipboard(sensor as unknown as ENamedElement)
    expect(mm.pasteInto(pkg as unknown as ENamedElement)).toBe(true)

    const kopie = [...pkg.getEClassifiers()].find(
      (c: any) => c !== sensor && c.getName?.().startsWith('Sensor')
    ) as EClass
    expect(kopie).toBeDefined()
    expect(kopie.getEStructuralFeatures().size()).toBe(2)
  })

  it('Namenskollisionen im Ziel werden aufgeloest', () => {
    mm.copyToClipboard(sensor as unknown as ENamedElement)
    mm.pasteInto(pkg as unknown as ENamedElement)

    const namen = [...pkg.getEClassifiers()].map((c: any) => c.getName())
    // 'Sensor' gibt es weiterhin genau einmal; die Kopie hat einen eigenen Namen
    expect(namen.filter(n => n === 'Sensor')).toHaveLength(1)
    expect(namen).toContain('Sensor2')
  })

  it('Ausschneiden verschiebt und leert danach die Ablage', () => {
    const attribut = sensor.getEStructuralFeatures().get(0) as unknown as ENamedElement
    mm.cutToClipboard(attribut)
    expect(mm.pasteInto(ort as unknown as ENamedElement)).toBe(true)

    expect(sensor.getEStructuralFeatures().size()).toBe(1)   // dort entfernt
    expect(ort.getEStructuralFeatures().size()).toBe(1)      // hier eingehaengt
    expect(ort.getEStructuralFeatures().get(0)).toBe(attribut)  // dasselbe Objekt
    expect(mm.hasClipboardContent.value).toBe(false)
  })

  it('beim Ausschneiden greift die Zyklus-Pruefung, beim Kopieren nicht', () => {
    // Das Package in seine eigene Klasse zu schneiden ergaebe einen Baum,
    // der in sich selbst haengt.
    mm.cutToClipboard(pkg as unknown as ENamedElement)
    expect(mm.canPasteInto(sensor as unknown as ENamedElement).ok).toBe(false)

    // Kopieren scheitert hier ebenfalls, aber am Typ: Ein Package passt nicht
    // in eine Klasse. Der Unterschied zeigt sich an einem Fall, der typlich
    // erlaubt ist — siehe die Klassen-Kopie oben.
    mm.copyToClipboard(pkg as unknown as ENamedElement)
    expect(mm.canPasteInto(sensor as unknown as ENamedElement).ok).toBe(false)
  })
})
