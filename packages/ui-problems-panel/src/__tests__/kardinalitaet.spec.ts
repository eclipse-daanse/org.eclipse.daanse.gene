/**
 * Kardinalitaetspruefung (#139).
 *
 * upperBound und lowerBound wurden nirgends durchgesetzt: `isMany` liest
 * upperBound nur als Ja/Nein, `isRequired` fragt lowerBound > 0. Ob genug
 * oder zu viele Werte vorhanden sind, prueft niemand — und Instanzen
 * entstehen auch ueber Wege ohne Editor (Import, Datengenerator, Atlas).
 *
 * Geprueft wird gegen echte Modelle, nicht gegen Attrappen: Die Zahl der
 * Werte kommt aus eGet, das je nach Feature eine EList oder einen
 * Einzelwert liefert.
 */
import { describe, it, expect, beforeEach } from 'vitest'
import {
  BasicResourceSet, XMIResourceFactory, URI,
  registerEcorePackage, EPackageRegistry,
  type EPackage, type EClass, type EObject
} from '@emfts/core'
import { useProblemsService } from '../composables/useProblemsService'

const ECORE = `<?xml version="1.0" encoding="UTF-8"?>
<ecore:EPackage xmlns:xmi="http://www.omg.org/XMI" xmi:version="2.0"
    xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"
    xmlns:ecore="http://www.eclipse.org/emf/2002/Ecore"
    name="k" nsURI="kardinalitaet-test" nsPrefix="k">
  <eClassifiers xsi:type="ecore:EClass" name="C">
    <!-- hoechstens zwei -->
    <eStructuralFeatures xsi:type="ecore:EAttribute" name="begrenzt" upperBound="2"
        eType="ecore:EDataType http://www.eclipse.org/emf/2002/Ecore#//EString"/>
    <!-- mindestens zwei, beliebig viele -->
    <eStructuralFeatures xsi:type="ecore:EAttribute" name="mindestens" lowerBound="2" upperBound="-1"
        eType="ecore:EDataType http://www.eclipse.org/emf/2002/Ecore#//EString"/>
    <!-- Pflichtfeld, einwertig -->
    <eStructuralFeatures xsi:type="ecore:EAttribute" name="pflicht" lowerBound="1"
        eType="ecore:EDataType http://www.eclipse.org/emf/2002/Ecore#//EString"/>
    <!-- ohne Einschraenkung -->
    <eStructuralFeatures xsi:type="ecore:EAttribute" name="frei" upperBound="-1"
        eType="ecore:EDataType http://www.eclipse.org/emf/2002/Ecore#//EString"/>
  </eClassifiers>
</ecore:EPackage>`

describe('Kardinalitaetspruefung (#139)', () => {
  let pkg: EPackage
  let cls: EClass
  let dienst: ReturnType<typeof useProblemsService>

  beforeEach(() => {
    registerEcorePackage()
    const rs = new BasicResourceSet()
    const f = new XMIResourceFactory()
    const map = rs.getResourceFactoryRegistry().getExtensionToFactoryMap()
    map.set('xmi', f); map.set('ecore', f)
    const res = rs.createResource(URI.createURI('k.ecore')) as any
    res.loadFromString(ECORE)
    pkg = res.getContents().get(0) as unknown as EPackage
    EPackageRegistry.INSTANCE.set(pkg.getNsURI()!, pkg)
    cls = pkg.getEClassifier('C') as EClass
    dienst = useProblemsService()
  })

  function neuesObjekt(): EObject {
    return pkg.getEFactoryInstance()!.create(cls) as unknown as EObject
  }

  function setze(obj: EObject, feature: string, werte: string[]): void {
    const f = obj.eClass().getEStructuralFeature(feature)!
    const liste = obj.eGet(f) as any
    for (const w of werte) liste.add(w)
  }

  it('meldet zu viele Werte gegen upperBound', async () => {
    const obj = neuesObjekt()
    setze(obj, 'begrenzt', ['a', 'b', 'c'])          // erlaubt sind 2
    setze(obj, 'mindestens', ['x', 'y'])
    obj.eSet(obj.eClass().getEStructuralFeature('pflicht')!, 'da')

    const issues = await dienst.validateObject(obj)
    const meldung = issues.find(i => i.message.includes('begrenzt'))
    expect(meldung, 'keine Meldung zu upperBound').toBeDefined()
    expect(meldung!.message).toContain('3 Werte')
    expect(meldung!.message).toContain('hoechstens 2')
    expect(meldung!.severity).toBe('error')
    expect(meldung!.source).toBe('ecore-validation')
  })

  it('meldet zu wenige Werte gegen lowerBound', async () => {
    const obj = neuesObjekt()
    setze(obj, 'mindestens', ['nur einer'])          // verlangt sind 2
    obj.eSet(obj.eClass().getEStructuralFeature('pflicht')!, 'da')

    const issues = await dienst.validateObject(obj)
    const meldung = issues.find(i => i.message.includes('mindestens'))
    expect(meldung).toBeDefined()
    expect(meldung!.message).toContain('1 Werte')
    expect(meldung!.message).toContain('mindestens 2')
  })

  it('meldet ein leeres Pflichtfeld', async () => {
    const obj = neuesObjekt()
    setze(obj, 'mindestens', ['x', 'y'])
    // 'pflicht' bleibt leer

    const issues = await dienst.validateObject(obj)
    expect(issues.some(i => i.message.includes("'pflicht'"))).toBe(true)
  })

  it('schweigt, wenn alle Grenzen eingehalten sind', async () => {
    const obj = neuesObjekt()
    setze(obj, 'begrenzt', ['a', 'b'])               // genau die Obergrenze
    setze(obj, 'mindestens', ['x', 'y'])             // genau die Untergrenze
    setze(obj, 'frei', ['1', '2', '3', '4', '5'])    // unbegrenzt
    obj.eSet(obj.eClass().getEStructuralFeature('pflicht')!, 'da')

    const issues = await dienst.validateObject(obj)
    expect(issues).toHaveLength(0)
  })

  it('laeuft ohne geladene OCL-Constraints', async () => {
    // Der fruehere Ausstieg `if (!ocl || keine Constraints) return []` haette
    // die Pruefung hier verschluckt — in diesem Test ist kein Constraint
    // registriert.
    const obj = neuesObjekt()
    setze(obj, 'begrenzt', ['a', 'b', 'c'])
    setze(obj, 'mindestens', ['x', 'y'])
    obj.eSet(obj.eClass().getEStructuralFeature('pflicht')!, 'da')

    const issues = await dienst.validateObject(obj)
    expect(issues.length).toBeGreaterThan(0)
  })
})
