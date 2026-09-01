/**
 * Mehrwertige Attribute (#133).
 *
 * Ein EString mit upperBound="-1" bekam im Instance View ein einzelnes
 * Eingabefeld. Angezeigt wurde die JS-Stringform des Arrays ("alpha,beta"),
 * und beim Tippen ging ein String an setValue — wo `Array.isArray` nicht
 * griff, die Liste geleert und nichts zurueckgeschrieben wurde. Die Instanz
 * behielt ein leeres `test=""`.
 *
 * Geprueft wird hier die Schreibseite, an der die Werte verloren gingen:
 * dass ein Array ankommt, und dass ein faelschlich einzeln uebergebener Wert
 * nicht mehr als "Liste leeren" endet.
 */
import { describe, it, expect, beforeEach } from 'vitest'
import { useInstanceEditor } from '../composables/useInstanceEditor'
import {
  BasicResourceSet,
  XMIResourceFactory,
  URI,
  registerEcorePackage,
  EPackageRegistry,
  type EPackage,
  type EClass,
  type EStructuralFeature,
  type XMIResource,
} from '@emfts/core'

const ECORE = `<?xml version="1.0" encoding="UTF-8"?>
<ecore:EPackage xmlns:xmi="http://www.omg.org/XMI" xmi:version="2.0"
    xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"
    xmlns:ecore="http://www.eclipse.org/emf/2002/Ecore"
    name="test" nsURI="test-multivalue" nsPrefix="test">
  <eClassifiers xsi:type="ecore:EClass" name="test">
    <eStructuralFeatures xsi:type="ecore:EAttribute" name="test" upperBound="-1"
        eType="ecore:EDataType http://www.eclipse.org/emf/2002/Ecore#//EString"/>
  </eClassifiers>
</ecore:EPackage>`

function neuesResourceSet(): BasicResourceSet {
  const rs = new BasicResourceSet()
  const factory = new XMIResourceFactory()
  const map = rs.getResourceFactoryRegistry().getExtensionToFactoryMap()
  map.set('xmi', factory)
  map.set('ecore', factory)
  return rs
}

/** Schreibt ueber den echten Editor — nicht ueber eine Nachbildung. */
function schreibeMehrwertig(eObject: any, feature: EStructuralFeature, value: unknown): void {
  const editor = useInstanceEditor({ eObject })
  editor.setValue(feature, value)
}

describe('Mehrwertige Attribute (#133)', () => {
  let pkg: EPackage
  let cls: EClass
  let feature: EStructuralFeature

  beforeEach(() => {
    registerEcorePackage()
    const rs = neuesResourceSet()
    const res = rs.createResource(URI.createURI('test.ecore')) as XMIResource
    res.loadFromString(ECORE)
    pkg = res.getContents().get(0) as unknown as EPackage
    EPackageRegistry.INSTANCE.set(pkg.getNsURI()!, pkg)
    cls = pkg.getEClassifier('test') as EClass
    feature = cls.getEStructuralFeature('test')!
  })

  it('das Feature ist mehrwertig und eGet liefert eine EList, kein Array', () => {
    expect(feature.isMany()).toBe(true)
    const obj = pkg.getEFactoryInstance()!.create(cls)
    const liste = obj.eGet(feature) as any
    expect(Array.isArray(liste)).toBe(false)
    expect(typeof liste.add).toBe('function')
  })

  it('ein Array landet vollstaendig in der Liste und wird korrekt serialisiert', () => {
    const obj = pkg.getEFactoryInstance()!.create(cls)
    schreibeMehrwertig(obj, feature, ['alpha', 'beta'])

    expect((obj.eGet(feature) as any).size()).toBe(2)

    const rs = neuesResourceSet()
    const res = rs.createResource(URI.createURI('instanz.xmi')) as XMIResource
    res.getContents().add(obj as any)
    // EMF schreibt mehrwertige EStrings leerzeichengetrennt in ein Attribut
    expect(res.saveToString()).toContain('test="alpha beta"')
  })

  it('ein einzelner String loescht die Liste nicht mehr, sondern wird uebernommen', () => {
    const obj = pkg.getEFactoryInstance()!.create(cls)
    schreibeMehrwertig(obj, feature, ['alpha'])

    // Genau der Fall aus #133: das Eingabefeld schickt einen String
    schreibeMehrwertig(obj, feature, 'gamma')

    const liste = obj.eGet(feature) as any
    expect(liste.size()).toBe(1)
    expect(liste.get(0)).toBe('gamma')

    const rs = neuesResourceSet()
    const res = rs.createResource(URI.createURI('instanz.xmi')) as XMIResource
    res.getContents().add(obj as any)
    expect(res.saveToString()).toContain('test="gamma"')
  })

  it('ein leerer Wert leert die Liste weiterhin', () => {
    const obj = pkg.getEFactoryInstance()!.create(cls)
    schreibeMehrwertig(obj, feature, ['alpha', 'beta'])
    schreibeMehrwertig(obj, feature, '')
    expect((obj.eGet(feature) as any).size()).toBe(0)
  })
})
