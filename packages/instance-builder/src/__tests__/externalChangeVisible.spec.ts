/**
 * Von aussen eingefuegte Kinder in der Properties-Ansicht (#148).
 *
 * Der Editor liest seine Werte beim Anlegen einmal in einen Cache. Ein Kind,
 * das nicht ueber die Properties-Ansicht entsteht — eingefuegt im Baum aus der
 * Zwischenablage — steht dort nicht drin. Geprueft wird, dass getValue fuer
 * Referenzen am Modell liest und die Aenderung damit sichtbar wird, ohne den
 * Editor neu zu bauen (das wuerde beim Tippen den Fokus kosten).
 */
import { describe, it, expect, beforeEach } from 'vitest'
import { useInstanceEditor } from '../composables/useInstanceEditor'
import {
  BasicResourceSet, XMIResourceFactory, URI,
  registerEcorePackage, EPackageRegistry,
  type EPackage, type EClass, type EObject, type EStructuralFeature
} from '@emfts/core'

const ECORE = `<?xml version="1.0" encoding="UTF-8"?>
<ecore:EPackage xmlns:xmi="http://www.omg.org/XMI" xmi:version="2.0"
    xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"
    xmlns:ecore="http://www.eclipse.org/emf/2002/Ecore"
    name="p" nsURI="external-change-spec" nsPrefix="p">
  <eClassifiers xsi:type="ecore:EClass" name="Owner">
    <eStructuralFeatures xsi:type="ecore:EReference" name="children"
        upperBound="-1" eType="#//Child" containment="true"/>
    <eStructuralFeatures xsi:type="ecore:EReference" name="main"
        eType="#//Child" containment="true"/>
  </eClassifiers>
  <eClassifiers xsi:type="ecore:EClass" name="Child">
    <eStructuralFeatures xsi:type="ecore:EAttribute" name="name"
        eType="ecore:EDataType http://www.eclipse.org/emf/2002/Ecore#//EString"/>
  </eClassifiers>
</ecore:EPackage>`

describe('Aenderungen von aussen', () => {
  let pkg: EPackage
  let owner: EObject
  let ownerClass: EClass
  let childClass: EClass

  function feature(name: string): EStructuralFeature {
    return ownerClass.getEStructuralFeature(name) as EStructuralFeature
  }

  function neuesKind(name: string): EObject {
    const kind: any = (pkg.getEFactoryInstance() as any).create(childClass)
    kind.eSet(childClass.getEStructuralFeature('name'), name)
    return kind
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
    ownerClass = pkg.getEClassifier('Owner') as EClass
    childClass = pkg.getEClassifier('Child') as EClass
    owner = (pkg.getEFactoryInstance() as any).create(ownerClass)
  })

  it('ein nachtraeglich eingefuegtes Kind erscheint in der mehrwertigen Referenz', () => {
    const editor = useInstanceEditor({ eObject: owner })
    expect(editor.getValue(feature('children'))).toHaveLength(0)

    // Einfuegen am Modell, wie es der Baum tut — nicht ueber den Editor
    ;(owner.eGet(feature('children')) as any).add(neuesKind('eingefuegt'))

    const werte = editor.getValue(feature('children'))
    expect(werte).toHaveLength(1)
    expect(werte[0].eGet(childClass.getEStructuralFeature('name'))).toBe('eingefuegt')
  })

  it('auch eine einwertige Referenz wird am Modell gelesen', () => {
    const editor = useInstanceEditor({ eObject: owner })
    expect(editor.getValue(feature('main'))).toBeFalsy()

    owner.eSet(feature('main'), neuesKind('haupt'))

    const wert = editor.getValue(feature('main'))
    expect(wert).toBeTruthy()
    expect(wert.eGet(childClass.getEStructuralFeature('name'))).toBe('haupt')
  })
})
