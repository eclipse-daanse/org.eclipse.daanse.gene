/**
 * Containment-Pruefung (#63).
 *
 * Gilt gleichermassen fuer Verschieben und Einfuegen, in beiden Baeumen.
 * Geprueft wird gegen das Ecore-Metamodell selbst: Ein EAttribute gehoert in
 * eine EClass, nicht in ein EPackage — genau die Unterscheidung, die der
 * Metamodeler-Baum braucht.
 */
import { describe, it, expect, beforeEach } from 'vitest'
import {
  BasicResourceSet, XMIResourceFactory, URI,
  registerEcorePackage, EPackageRegistry, getEcorePackage,
  type EPackage, type EClass, type EObject
} from '@emfts/core'
import {
  aufnehmendeReferenzen, pruefeAufnahme, istNachfahre,
  containmentReferences, fuegeEin
} from '../containment'

const ECORE = `<?xml version="1.0" encoding="UTF-8"?>
<ecore:EPackage xmlns:xmi="http://www.omg.org/XMI" xmi:version="2.0"
    xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"
    xmlns:ecore="http://www.eclipse.org/emf/2002/Ecore"
    name="p" nsURI="containment-spec" nsPrefix="p">
  <eClassifiers xsi:type="ecore:EClass" name="A">
    <eStructuralFeatures xsi:type="ecore:EAttribute" name="a1"
        eType="ecore:EDataType http://www.eclipse.org/emf/2002/Ecore#//EString"/>
  </eClassifiers>
  <eClassifiers xsi:type="ecore:EClass" name="B"/>
  <eSubpackages name="unter" nsURI="containment-spec/unter" nsPrefix="u"/>
</ecore:EPackage>`

describe('Containment-Pruefung', () => {
  let pkg: EPackage
  let klasseA: EClass
  let klasseB: EClass
  let attribut: EObject
  let unterpaket: EObject

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
    klasseA = pkg.getEClassifier('A') as EClass
    klasseB = pkg.getEClassifier('B') as EClass
    attribut = klasseA.getEStructuralFeatures().get(0) as unknown as EObject
    unterpaket = pkg.getESubpackages().get(0) as unknown as EObject
  })

  it('ein Attribut passt in eine andere Klasse', () => {
    const refs = aufnehmendeReferenzen(attribut, klasseB as unknown as EObject)
    expect(refs.length).toBeGreaterThan(0)
    expect(refs.map(r => r.getName())).toContain('eStructuralFeatures')
  })

  it('ein Attribut passt nicht in ein Package', () => {
    const ergebnis = pruefeAufnahme(attribut, pkg as unknown as EObject)
    expect(ergebnis.ok).toBe(false)
    expect(ergebnis.grund).toMatch(/kein passender Container/i)
  })

  it('eine Klasse passt in ein Package', () => {
    const refs = aufnehmendeReferenzen(klasseA as unknown as EObject, pkg as unknown as EObject)
    expect(refs.map(r => r.getName())).toContain('eClassifiers')
  })

  it('ein Package passt in ein Package (Unterpakete)', () => {
    const refs = aufnehmendeReferenzen(unterpaket, pkg as unknown as EObject)
    expect(refs.map(r => r.getName())).toContain('eSubpackages')
  })

  it('nichts passt in sich selbst', () => {
    expect(aufnehmendeReferenzen(klasseA as unknown as EObject, klasseA as unknown as EObject)).toHaveLength(0)
  })

  it('ein Element kann nicht in seinen eigenen Teilbaum wandern', () => {
    // Das Package in seine eigene Klasse zu schieben wuerde den Baum
    // in sich selbst haengen
    expect(istNachfahre(pkg as unknown as EObject, klasseA as unknown as EObject)).toBe(true)
    expect(aufnehmendeReferenzen(pkg as unknown as EObject, klasseA as unknown as EObject)).toHaveLength(0)
  })

  it('beim Einfuegen einer Kopie entfaellt die Zyklus-Pruefung', () => {
    // Eine Kopie ist ein neues Objekt und in keinem Teilbaum enthalten —
    // die Pruefung wuerde hier nur falsch verneinen.
    const refs = aufnehmendeReferenzen(
      pkg as unknown as EObject, klasseA as unknown as EObject, { zyklusPruefen: false }
    )
    // Ein Package passt trotzdem nicht in eine Klasse — aber aus dem
    // richtigen Grund (Typ), nicht wegen des Zyklus
    expect(refs).toHaveLength(0)
  })

  it('containmentReferences liefert die Ecore-Container einer EClass', () => {
    const namen = containmentReferences(klasseA.eClass()).map(r => r.getName())
    expect(namen).toContain('eStructuralFeatures')
    expect(namen).toContain('eOperations')
  })

  it('fuegeEin haengt das Element wirklich ein', () => {
    const vorher = klasseB.getEStructuralFeatures().size()
    const ref = aufnehmendeReferenzen(attribut, klasseB as unknown as EObject)[0]
    expect(fuegeEin(attribut, klasseB as unknown as EObject, ref)).toBe(true)
    expect(klasseB.getEStructuralFeatures().size()).toBe(vorher + 1)
  })
})
