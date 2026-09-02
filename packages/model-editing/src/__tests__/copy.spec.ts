/**
 * Tiefkopie (#63).
 *
 * EcoreUtil.copy aus @emfts/core kopiert nur Attributwerte des uebergebenen
 * Objekts — bei einer EClass kommt eine Klasse ohne Attribute heraus
 * (emf.ts#79). Geprueft wird hier, was fuer "Klasse kopieren" noetig ist:
 * Kinder mit, Typverweise auf dieselben Datentypen, und Querverweise
 * innerhalb des kopierten Teilbaums auf die Kopie.
 */
import { describe, it, expect, beforeEach } from 'vitest'
import {
  BasicResourceSet, XMIResourceFactory, URI,
  registerEcorePackage, EPackageRegistry,
  type EPackage, type EClass, type EObject
} from '@emfts/core'
import { kopiereTief, kopiereAlle } from '../copy'

const ECORE = `<?xml version="1.0" encoding="UTF-8"?>
<ecore:EPackage xmlns:xmi="http://www.omg.org/XMI" xmi:version="2.0"
    xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"
    xmlns:ecore="http://www.eclipse.org/emf/2002/Ecore"
    name="p" nsURI="kopie-spec" nsPrefix="p">
  <eClassifiers xsi:type="ecore:EClass" name="Sensor">
    <eStructuralFeatures xsi:type="ecore:EAttribute" name="name"
        eType="ecore:EDataType http://www.eclipse.org/emf/2002/Ecore#//EString"/>
    <eStructuralFeatures xsi:type="ecore:EAttribute" name="wert"
        eType="ecore:EDataType http://www.eclipse.org/emf/2002/Ecore#//EDouble"/>
    <!-- Querverweis auf eine Klasse desselben Packages -->
    <eStructuralFeatures xsi:type="ecore:EReference" name="standort" eType="#//Ort"/>
  </eClassifiers>
  <eClassifiers xsi:type="ecore:EClass" name="Ort">
    <eStructuralFeatures xsi:type="ecore:EAttribute" name="bezeichnung"
        eType="ecore:EDataType http://www.eclipse.org/emf/2002/Ecore#//EString"/>
  </eClassifiers>
</ecore:EPackage>`

describe('Tiefkopie', () => {
  let pkg: EPackage
  let sensor: EClass
  let ort: EClass

  beforeEach(() => {
    registerEcorePackage()
    const rs = new BasicResourceSet()
    const f = new XMIResourceFactory()
    const map = rs.getResourceFactoryRegistry().getExtensionToFactoryMap()
    map.set('xmi', f); map.set('ecore', f)
    const res = rs.createResource(URI.createURI('p.ecore')) as any
    res.loadFromString(ECORE)
    pkg = res.getContents().get(0) as unknown as EPackage
    EPackageRegistry.INSTANCE.set(pkg.getNsURI()!, pkg)
    sensor = pkg.getEClassifier('Sensor') as EClass
    ort = pkg.getEClassifier('Ort') as EClass
  })

  it('nimmt die Containment-Kinder mit', () => {
    expect(sensor.getEStructuralFeatures().size()).toBe(3)
    const kopie = kopiereTief(sensor as unknown as EObject) as unknown as EClass
    expect(kopie.getEStructuralFeatures().size()).toBe(3)
    expect(kopie.getName()).toBe('Sensor')
  })

  it('die Kinder sind eigene Objekte, keine geteilten', () => {
    const kopie = kopiereTief(sensor as unknown as EObject) as unknown as EClass
    const originalAttr = sensor.getEStructuralFeatures().get(0)
    const kopieAttr = kopie.getEStructuralFeatures().get(0)
    expect(kopieAttr).not.toBe(originalAttr)
    expect(kopieAttr.getName()).toBe(originalAttr.getName())

    // Eine Aenderung an der Kopie darf das Original nicht beruehren
    kopieAttr.setName('geaendert')
    expect(originalAttr.getName()).toBe('name')
  })

  it('Typverweise zeigen weiter auf dieselben Datentypen', () => {
    const kopie = kopiereTief(sensor as unknown as EObject) as unknown as EClass
    const originalTyp = (sensor.getEStructuralFeatures().get(0) as any).getEType()
    const kopieTyp = (kopie.getEStructuralFeatures().get(0) as any).getEType()
    // EString wird nicht mitkopiert — sonst haette das Modell plötzlich
    // einen zweiten, eigenen EString
    expect(kopieTyp).toBe(originalTyp)
    expect(kopieTyp.getName()).toBe('EString')
  })

  it('Verweise nach aussen bleiben auf dem Original', () => {
    const kopie = kopiereTief(sensor as unknown as EObject) as unknown as EClass
    const standort = [...kopie.getEStructuralFeatures()].find((f: any) => f.getName() === 'standort') as any
    expect(standort.getEType()).toBe(ort)
  })

  it('kopiereAlle biegt Verweise zwischen den kopierten Objekten um', () => {
    // Sensor.standort zeigt auf Ort; werden beide zusammen kopiert, soll die
    // Sensor-Kopie auf die Ort-Kopie zeigen, nicht auf das Original.
    const [sensorKopie, ortKopie] = kopiereAlle([
      sensor as unknown as EObject,
      ort as unknown as EObject
    ]) as unknown as EClass[]

    const standort = [...sensorKopie.getEStructuralFeatures()].find((f: any) => f.getName() === 'standort') as any
    expect(standort.getEType()).toBe(ortKopie)
    expect(standort.getEType()).not.toBe(ort)
  })

  it('kopiert auch Attributwerte einfacher Objekte', () => {
    const attr = sensor.getEStructuralFeatures().get(0) as any
    const kopie = kopiereTief(attr) as any
    expect(kopie.getName()).toBe('name')
    expect(kopie.getEType()).toBe(attr.getEType())
    expect(kopie).not.toBe(attr)
  })
})
