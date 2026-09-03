/**
 * Klassenbeschriftung mit Package-Pfad (#104).
 *
 * Bei mehreren Modellen im Workspace kommen gleiche Klassennamen vor. Der
 * Name allein ist dann nicht unterscheidbar — Listen und Menues brauchen den
 * Pfad der uebergeordneten Pakete dazu.
 */
import { describe, it, expect, beforeEach } from 'vitest'
import {
  BasicResourceSet, XMIResourceFactory, URI,
  registerEcorePackage, EPackageRegistry, type EPackage
} from '@emfts/core'
import { packagePathOf, classLabelWithPackage } from '../classPickerSource'

const ECORE = `<?xml version="1.0" encoding="UTF-8"?>
<ecore:EPackage xmlns:xmi="http://www.omg.org/XMI" xmi:version="2.0"
    xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"
    xmlns:ecore="http://www.eclipse.org/emf/2002/Ecore"
    name="waterpark" nsURI="pfad-spec" nsPrefix="wp">
  <eClassifiers xsi:type="ecore:EClass" name="Anlage"/>
  <eSubpackages name="domain" nsURI="pfad-spec/domain" nsPrefix="dom">
    <eClassifiers xsi:type="ecore:EClass" name="Sensor"/>
    <eSubpackages name="sim" nsURI="pfad-spec/domain/sim" nsPrefix="sim">
      <eClassifiers xsi:type="ecore:EClass" name="Sensor"/>
    </eSubpackages>
  </eSubpackages>
</ecore:EPackage>`

describe('Package-Pfad einer Klasse (#104)', () => {
  let pkg: EPackage

  beforeEach(() => {
    registerEcorePackage()
    const rs = new BasicResourceSet()
    const f = new XMIResourceFactory()
    const map = rs.getResourceFactoryRegistry().getExtensionToFactoryMap()
    map.set('xmi', f); map.set('ecore', f)
    const res = rs.createResource(URI.createURI('pfad.ecore')) as any
    res.loadFromString(ECORE)
    pkg = res.getContents().get(0) as unknown as EPackage
    EPackageRegistry.INSTANCE.set(pkg.getNsURI()!, pkg)
  })

  const sub = (p: EPackage, name: string) =>
    [...p.getESubpackages()].find((s: any) => s.getName() === name) as unknown as EPackage

  it('eine Klasse im Wurzelpaket', () => {
    const anlage = pkg.getEClassifier('Anlage')
    expect(packagePathOf(anlage)).toBe('waterpark')
    expect(classLabelWithPackage(anlage)).toBe('Anlage — waterpark')
  })

  it('eine Klasse in einem Unterpaket', () => {
    const sensor = sub(pkg, 'domain').getEClassifier('Sensor')
    expect(packagePathOf(sensor)).toBe('waterpark.domain')
  })

  it('zwei Ebenen tief', () => {
    const sensor = sub(sub(pkg, 'domain'), 'sim').getEClassifier('Sensor')
    expect(packagePathOf(sensor)).toBe('waterpark.domain.sim')
  })

  it('unterscheidet gleichnamige Klassen — genau der Fall aus #104', () => {
    const a = sub(pkg, 'domain').getEClassifier('Sensor')
    const b = sub(sub(pkg, 'domain'), 'sim').getEClassifier('Sensor')
    expect(a.getName()).toBe(b.getName())            // beide heissen "Sensor"
    expect(classLabelWithPackage(a)).not.toBe(classLabelWithPackage(b))
    expect(classLabelWithPackage(b)).toBe('Sensor — waterpark.domain.sim')
  })

  it('ohne Package bleibt es beim Namen', () => {
    expect(classLabelWithPackage({ getName: () => 'Frei' })).toBe('Frei')
    expect(packagePathOf(null)).toBe('')
  })
})
