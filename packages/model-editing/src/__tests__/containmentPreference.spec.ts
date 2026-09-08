/**
 * Welche Containment-Referenz nimmt die Kopie auf? (#148)
 *
 * Der CWM-Fall: Ein Attribute steckt in `feature` einer Klasse, `ownedElement`
 * derselben Klasse nimmt jedes ModelElement auf und steht in der
 * Feature-Reihenfolge weiter vorn, weil es geerbt ist. Wer einfach die erste
 * passende Referenz nimmt, verschiebt das Attribut damit in einen anderen
 * Behaelter als den, aus dem es kam.
 */
import { describe, it, expect, beforeEach } from 'vitest'
import {
  BasicResourceSet, XMIResourceFactory, URI,
  registerEcorePackage, EPackageRegistry,
  type EPackage, type EClass, type EObject, type EReference
} from '@emfts/core'
import { acceptingReferences, checkContainment, containingReferenceOf } from '../containment'

/*
 * Nachbau der CWM-Vererbung: Namespace bringt `ownedElement` mit,
 * Classifier ergaenzt `feature`. Ein Attribute passt in beide.
 */
const ECORE = `<?xml version="1.0" encoding="UTF-8"?>
<ecore:EPackage xmlns:xmi="http://www.omg.org/XMI" xmi:version="2.0"
    xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"
    xmlns:ecore="http://www.eclipse.org/emf/2002/Ecore"
    name="cwmlike" nsURI="containment-preference-spec" nsPrefix="c">
  <eClassifiers xsi:type="ecore:EClass" name="ModelElement">
    <eStructuralFeatures xsi:type="ecore:EAttribute" name="name"
        eType="ecore:EDataType http://www.eclipse.org/emf/2002/Ecore#//EString"/>
  </eClassifiers>
  <eClassifiers xsi:type="ecore:EClass" name="Namespace" eSuperTypes="#//ModelElement">
    <eStructuralFeatures xsi:type="ecore:EReference" name="ownedElement"
        upperBound="-1" eType="#//ModelElement" containment="true"/>
  </eClassifiers>
  <eClassifiers xsi:type="ecore:EClass" name="Classifier" eSuperTypes="#//Namespace">
    <eStructuralFeatures xsi:type="ecore:EReference" name="feature"
        upperBound="-1" eType="#//Attribute" containment="true"/>
  </eClassifiers>
  <eClassifiers xsi:type="ecore:EClass" name="Attribute" eSuperTypes="#//ModelElement"/>
</ecore:EPackage>`

describe('Bevorzugte Containment-Referenz', () => {
  let pkg: EPackage
  let classifier: EClass
  let attributKlasse: EClass
  let quelle: EObject
  let ziel: EObject
  let attribut: EObject

  function referenz(eClass: EClass, name: string): EReference {
    return eClass.getEStructuralFeature(name) as unknown as EReference
  }

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
    classifier = pkg.getEClassifier('Classifier') as EClass
    attributKlasse = pkg.getEClassifier('Attribute') as EClass

    const factory: any = pkg.getEFactoryInstance()
    quelle = factory.create(classifier)
    ziel = factory.create(classifier)
    attribut = factory.create(attributKlasse)
    // Das Attribut steckt in `feature` — nicht in `ownedElement`
    ;(quelle.eGet(referenz(classifier, 'feature')) as any).add(attribut)
  })

  it('ownedElement steht in der Feature-Reihenfolge vorn', () => {
    // Ohne diese Ausgangslage wuerde der Test nichts beweisen
    const namen = [...classifier.getEAllStructuralFeatures()].map((f: any) => f.getName())
    expect(namen.indexOf('ownedElement')).toBeLessThan(namen.indexOf('feature'))
  })

  it('kennt die Referenz, in der das Element steckt', () => {
    expect(containingReferenceOf(attribut)?.getName()).toBe('feature')
  })

  it('bietet zuerst dieselbe Referenz an, aus der das Element kommt', () => {
    const refs = acceptingReferences(attribut, ziel)
    expect(refs.map(r => r.getName())).toEqual(['feature', 'ownedElement'])
  })

  it('beide Referenzen bleiben waehlbar', () => {
    const refs = acceptingReferences(attribut, ziel)
    expect(refs.length).toBe(2)
  })

  it('ohne Herkunft bleibt die Modellreihenfolge', () => {
    const factory: any = pkg.getEFactoryInstance()
    const frisch = factory.create(attributKlasse)
    const refs = acceptingReferences(frisch, ziel)
    expect(refs.map(r => r.getName())).toEqual(['ownedElement', 'feature'])
  })

  it('checkContainment nennt die Herkunftsreferenz', () => {
    const pruefung = checkContainment(attribut, ziel)
    expect(pruefung.ok).toBe(true)
    expect(pruefung.origin?.getName()).toBe('feature')
  })

  it('ohne Herkunft bleibt origin leer — die Oberflaeche muss fragen', () => {
    const frisch = (pkg.getEFactoryInstance() as any).create(attributKlasse)
    const pruefung = checkContainment(frisch, ziel)
    expect(pruefung.refs.length).toBeGreaterThan(1)
    expect(pruefung.origin).toBeFalsy()
  })

  it('eine Referenz, die es im Ziel nicht gibt, aendert nichts', () => {
    const namespace = pkg.getEClassifier('Namespace') as EClass
    const factory: any = pkg.getEFactoryInstance()
    const namespaceZiel = factory.create(namespace)
    // Namespace kennt kein `feature`, also bleibt nur ownedElement
    const refs = acceptingReferences(attribut, namespaceZiel)
    expect(refs.map(r => r.getName())).toEqual(['ownedElement'])
  })
})
