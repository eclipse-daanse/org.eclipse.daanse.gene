/**
 * Integrationstest fuer den Datenweg Datei -> UI-Auswahl -> Datei.
 *
 * Deckt die Haelfte ab, die weder die Logik- noch die Verdrahtungstests sehen:
 * dass ein aus XMI geladener Enum-Wert im Dropdown ankommt und die Auswahl als
 * Literal-String zurueck in die Datei geschrieben wird. Nachgestellt ist der
 * CWM-Fall (relational:Column.isNullable), inklusive der Altdateien, die den
 * Wert noch als Ordinalzahl tragen.
 */
import { describe, it, expect, beforeEach } from 'vitest'
import {
  XMIResource,
  URI,
  BasicResourceSet,
  getEcorePackage,
  ECORE_NS_URI,
  type EObject,
  type EPackage
} from '@emfts/core'
import { enumLiteralInfos, resolveEnumLiteral } from '../composables/enumLiterals'

const NS = 'http://example.com/relational'

const ECORE_XML = `<?xml version="1.0" encoding="UTF-8"?>
<ecore:EPackage xmlns:xmi="http://www.omg.org/XMI" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"
    xmlns:ecore="http://www.eclipse.org/emf/2002/Ecore" xmi:version="2.0"
    name="relational" nsURI="${NS}" nsPrefix="rel">
  <eClassifiers xsi:type="ecore:EEnum" name="NullableType">
    <eLiterals name="columnNoNulls"/>
    <eLiterals name="columnNullable" value="1"/>
    <eLiterals name="columnNullableUnknown" value="2"/>
  </eClassifiers>
  <eClassifiers xsi:type="ecore:EClass" name="Column">
    <eStructuralFeatures xsi:type="ecore:EAttribute" name="name"
        eType="ecore:EDataType http://www.eclipse.org/emf/2002/Ecore#//EString"/>
    <eStructuralFeatures xsi:type="ecore:EAttribute" name="isNullable" eType="#//NullableType"/>
  </eClassifiers>
</ecore:EPackage>`

describe('enum values from file to dropdown and back', () => {
  let resourceSet: BasicResourceSet
  let modelPackage: EPackage

  beforeEach(async () => {
    getEcorePackage()
    resourceSet = new BasicResourceSet()
    resourceSet.getPackageRegistry().set(ECORE_NS_URI, getEcorePackage())

    const ecoreResource = new XMIResource(URI.createURI('test://relational.ecore'))
    ecoreResource.setResourceSet(resourceSet)
    await ecoreResource.loadFromString(ECORE_XML)

    modelPackage = ecoreResource.getContents()[0] as EPackage
    resourceSet.getPackageRegistry().set(NS, modelPackage)
  })

  /** Instanz mit dem gegebenen isNullable-Attributwert laden */
  async function loadColumn(isNullable: string): Promise<{ resource: XMIResource; column: EObject }> {
    const resource = new XMIResource(URI.createURI('test://instances.xmi'))
    resource.setResourceSet(resourceSet)
    await resource.loadFromString(
      `<?xml version="1.0" encoding="UTF-8"?>\n` +
        `<rel:Column xmlns:xmi="http://www.omg.org/XMI" xmlns:rel="${NS}" ` +
        `xmi:version="2.0" name="gkz" isNullable="${isNullable}"/>`
    )
    return { resource, column: resource.getContents()[0]! }
  }

  function isNullableFeature(column: EObject) {
    return column.eClass().getEStructuralFeature('isNullable')!
  }

  /** Was das Dropdown fuer diesen Wert anzeigen wuerde */
  function shownInDropdown(column: EObject): string | null {
    const feature = isNullableFeature(column)
    const infos = enumLiteralInfos(feature.getEType())
    return resolveEnumLiteral(infos, column.eGet(feature))?.literalString ?? null
  }

  /** Auswahl im Dropdown nachstellen: Literal-String rein, Literal ins Modell */
  function selectInDropdown(column: EObject, literalString: string): void {
    const feature = isNullableFeature(column)
    const infos = enumLiteralInfos(feature.getEType())
    const info = resolveEnumLiteral(infos, literalString)
    column.eSet(feature, info ? info.literal : null)
  }

  it('shows a literal from the file in the dropdown', async () => {
    const { column } = await loadColumn('columnNullable')
    expect(shownInDropdown(column)).toBe('columnNullable')
  })

  it('shows an ordinal from an older file in the dropdown', async () => {
    const { column } = await loadColumn('1')
    expect(shownInDropdown(column)).toBe('columnNullable')
  })

  it('writes the selected literal into the file', async () => {
    const { resource, column } = await loadColumn('columnNullable')

    selectInDropdown(column, 'columnNullableUnknown')
    const xml = await resource.saveToString()

    expect(xml).toContain('isNullable="columnNullableUnknown"')
    expect(xml).not.toContain('isNullable="2"')
  })

  it('normalizes an ordinal to the literal once the file is saved', async () => {
    const { resource, column } = await loadColumn('1')

    // ohne Nutzereingriff: der geladene Wert allein genuegt
    const xml = await resource.saveToString()

    expect(xml).toContain('isNullable="columnNullable"')
    expect(xml).not.toContain('isNullable="1"')
    expect(shownInDropdown(column)).toBe('columnNullable')
  })

  it('keeps the value stable across a full load/select/save/reload cycle', async () => {
    const { resource, column } = await loadColumn('0')
    expect(shownInDropdown(column)).toBe('columnNoNulls')

    selectInDropdown(column, 'columnNullable')
    const xml = await resource.saveToString()
    expect(xml).toContain('isNullable="columnNullable"')

    const reloaded = new XMIResource(URI.createURI('test://reloaded.xmi'))
    reloaded.setResourceSet(resourceSet)
    await reloaded.loadFromString(xml)

    expect(shownInDropdown(reloaded.getContents()[0]!)).toBe('columnNullable')
    expect(reloaded.getErrors()).toHaveLength(0)
  })

  it('reports an unusable value instead of dropping the whole file', async () => {
    const { resource, column } = await loadColumn('PURPLE')

    // Die Datei ist geladen, nur das Attribut fehlt — und das Dropdown zeigt leer
    expect(column.eGet(column.eClass().getEStructuralFeature('name')!)).toBe('gkz')
    expect(shownInDropdown(column)).toBeNull()
    expect(resource.getErrors()).toHaveLength(1)
  })
})
