/**
 * Verschieben (#63).
 *
 * Zwei Faelle: in ein Element hinein, oder daneben (Reihenfolge). Der zweite
 * ist der heikle — beim Einfuegen hinter dem Ziel verschiebt sich dessen
 * Position, wenn das Element vorher davor lag.
 */
import { describe, it, expect, beforeEach } from 'vitest'
import {
  BasicResourceSet, XMIResourceFactory, URI,
  registerEcorePackage, EPackageRegistry,
  type EPackage, type EClass, type EObject
} from '@emfts/core'
import { moveInto, moveBeside, canMoveBeside, detach } from '../move'
import { acceptingReferences } from '../containment'

const ECORE = `<?xml version="1.0" encoding="UTF-8"?>
<ecore:EPackage xmlns:xmi="http://www.omg.org/XMI" xmi:version="2.0"
    xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"
    xmlns:ecore="http://www.eclipse.org/emf/2002/Ecore"
    name="m" nsURI="move-spec" nsPrefix="m">
  <eClassifiers xsi:type="ecore:EClass" name="A">
    <eStructuralFeatures xsi:type="ecore:EAttribute" name="a1"
        eType="ecore:EDataType http://www.eclipse.org/emf/2002/Ecore#//EString"/>
    <eStructuralFeatures xsi:type="ecore:EAttribute" name="a2"
        eType="ecore:EDataType http://www.eclipse.org/emf/2002/Ecore#//EString"/>
    <eStructuralFeatures xsi:type="ecore:EAttribute" name="a3"
        eType="ecore:EDataType http://www.eclipse.org/emf/2002/Ecore#//EString"/>
  </eClassifiers>
  <eClassifiers xsi:type="ecore:EClass" name="B"/>
</ecore:EPackage>`

describe('Verschieben', () => {
  let pkg: EPackage
  let klasseA: EClass
  let klasseB: EClass

  const namen = (c: EClass) => [...c.getEStructuralFeatures()].map((f: any) => f.getName())
  const attr = (c: EClass, i: number) => c.getEStructuralFeatures().get(i) as unknown as EObject

  beforeEach(() => {
    registerEcorePackage()
    const rs = new BasicResourceSet()
    const f = new XMIResourceFactory()
    const map = rs.getResourceFactoryRegistry().getExtensionToFactoryMap()
    map.set('xmi', f); map.set('ecore', f)
    const res = rs.createResource(URI.createURI('m.ecore')) as any
    res.loadFromString(ECORE)
    pkg = res.getContents().get(0) as unknown as EPackage
    EPackageRegistry.INSTANCE.set(pkg.getNsURI()!, pkg)
    klasseA = pkg.getEClassifier('A') as EClass
    klasseB = pkg.getEClassifier('B') as EClass
  })

  it('verschiebt ein Attribut in eine andere Klasse', () => {
    const a1 = attr(klasseA, 0)
    const ref = acceptingReferences(a1, klasseB as unknown as EObject)[0]
    expect(moveInto(a1, klasseB as unknown as EObject, ref)).toBe(true)
    expect(namen(klasseA)).toEqual(['a2', 'a3'])
    expect(namen(klasseB)).toEqual(['a1'])
  })

  it('sortiert innerhalb derselben Klasse nach hinten', () => {
    // a1 hinter a3 → a2, a3, a1
    expect(moveBeside(attr(klasseA, 0), attr(klasseA, 2), true)).toBe(true)
    expect(namen(klasseA)).toEqual(['a2', 'a3', 'a1'])
  })

  it('sortiert innerhalb derselben Klasse nach vorn', () => {
    // a3 vor a1 → a3, a1, a2
    expect(moveBeside(attr(klasseA, 2), attr(klasseA, 0), false)).toBe(true)
    expect(namen(klasseA)).toEqual(['a3', 'a1', 'a2'])
  })

  it('daneben-Einfuegen verschiebt nur, wenn noetig', () => {
    // a1 vor a2 — a1 liegt schon davor, die Reihenfolge bleibt
    expect(moveBeside(attr(klasseA, 0), attr(klasseA, 1), false)).toBe(true)
    expect(namen(klasseA)).toEqual(['a1', 'a2', 'a3'])
  })

  it('verschiebt ueber Klassengrenzen an die richtige Stelle', () => {
    const a1 = attr(klasseA, 0)
    const ref = acceptingReferences(a1, klasseB as unknown as EObject)[0]
    moveInto(a1, klasseB as unknown as EObject, ref)      // B: [a1]
    // a2 hinter a1 in B
    expect(moveBeside(attr(klasseA, 0), attr(klasseB, 0), true)).toBe(true)
    expect(namen(klasseB)).toEqual(['a1', 'a2'])
    expect(namen(klasseA)).toEqual(['a3'])
  })

  it('canMoveBeside lehnt ab, was nicht in den Container des Ziels passt', () => {
    // Eine Klasse neben ein Attribut hiesse: Klasse in eine Klasse
    const ergebnis = canMoveBeside(klasseB as unknown as EObject, attr(klasseA, 0))
    expect(ergebnis.ok).toBe(false)
    expect(ergebnis.reason).toMatch(/Container/i)
  })

  it('detach loest ein Element aus seinem Container', () => {
    const a1 = attr(klasseA, 0)
    expect(detach(a1)).toBe(true)
    expect(namen(klasseA)).toEqual(['a2', 'a3'])
  })

  it('moveInto haengt zurueck, wenn das Ziel es nicht annimmt', () => {
    const a1 = attr(klasseA, 0)
    // Eine Referenz, die a1 gar nicht aufnimmt: eSubpackages des Packages
    const fremd = acceptingReferences(pkg as unknown as EObject, pkg as unknown as EObject,
      { checkCycle: false })[0]
    if (fremd) {
      expect(moveInto(a1, pkg as unknown as EObject, fremd)).toBe(false)
      // a1 ist noch da, wo es war
      expect(namen(klasseA)).toContain('a1')
    }
  })
})
