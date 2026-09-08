/**
 * Zielreferenz beim Einfuegen (#148).
 *
 * Ohne Vorgabe nimmt das Einfuegen die erste passende Referenz — und
 * `acceptingReferences` haelt dafuer die Herkunft vorne. Mit Vorgabe zaehlt
 * die Wahl aus dem Auswahldialog, aber nur wenn sie selbst passt: sonst waere
 * die Containment-Pruefung ueber den Dialog umgehbar.
 */
import { describe, it, expect, beforeEach } from 'vitest'
import { ref } from 'tsm:vue'
import {
  BasicResourceSet, XMIResourceFactory, URI,
  registerEcorePackage, EPackageRegistry,
  type EPackage, type EClass, type EObject, type EReference, type Resource
} from '@emfts/core'
import { useInstanceTree } from '../composables/useInstanceTree'

const ECORE = `<?xml version="1.0" encoding="UTF-8"?>
<ecore:EPackage xmlns:xmi="http://www.omg.org/XMI" xmi:version="2.0"
    xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"
    xmlns:ecore="http://www.eclipse.org/emf/2002/Ecore"
    name="cwmlike" nsURI="paste-target-spec" nsPrefix="c">
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

describe('Einfuegen in die gewaehlte Referenz', () => {
  let pkg: EPackage
  let classifier: EClass
  let tree: ReturnType<typeof useInstanceTree>
  let quelle: EObject
  let ziel: EObject
  let attribut: EObject

  function referenz(eClass: EClass, name: string): EReference {
    return eClass.getEStructuralFeature(name) as unknown as EReference
  }

  function inhalt(obj: EObject, name: string): EObject[] {
    return [...(obj.eGet(referenz(classifier, name)) as any)]
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
    const attributKlasse = pkg.getEClassifier('Attribute') as EClass

    const factory: any = pkg.getEFactoryInstance()
    quelle = factory.create(classifier)
    ziel = factory.create(classifier)
    attribut = factory.create(attributKlasse)
    ;(quelle.eGet(referenz(classifier, 'feature')) as any).add(attribut)

    tree = useInstanceTree(ref([] as Resource[]), ref(null))
    tree.copyToClipboard(attribut)
  })

  it('ohne Vorgabe landet die Kopie in der Herkunftsreferenz', () => {
    expect(tree.pasteInto(ziel)).toBe(true)
    expect(inhalt(ziel, 'feature')).toHaveLength(1)
    expect(inhalt(ziel, 'ownedElement')).toHaveLength(0)
  })

  it('mit Vorgabe landet die Kopie in der gewaehlten Referenz', () => {
    expect(tree.pasteInto(ziel, referenz(classifier, 'ownedElement'))).toBe(true)
    expect(inhalt(ziel, 'ownedElement')).toHaveLength(1)
    expect(inhalt(ziel, 'feature')).toHaveLength(0)
  })

  it('eine unpassende Vorgabe wird abgelehnt', () => {
    // `name` ist ein Attribut, keine Containment-Referenz
    const unpassend = classifier.getEStructuralFeature('name') as unknown as EReference
    expect(tree.pasteInto(ziel, unpassend)).toBe(false)
    expect(inhalt(ziel, 'feature')).toHaveLength(0)
    expect(inhalt(ziel, 'ownedElement')).toHaveLength(0)
  })

  it('canPasteInto nennt die Herkunftsreferenz', () => {
    const check = tree.canPasteInto(ziel)
    expect(check.ok).toBe(true)
    expect(check.refs).toHaveLength(2)
    expect(check.origin?.getName()).toBe('feature')
  })

  it('ohne Herkunft im Ziel bleibt die Wahl offen', () => {
    const frisch: EObject = (pkg.getEFactoryInstance() as any).create(pkg.getEClassifier('Attribute') as EClass)
    tree.copyToClipboard(frisch)
    const check = tree.canPasteInto(ziel)
    expect(check.refs.length).toBeGreaterThan(1)
    expect(check.origin).toBeFalsy()
  })
})
