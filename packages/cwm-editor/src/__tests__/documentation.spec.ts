/**
 * The documentation sections, built from a small fake CWM model.
 *
 * The functions read the model through the generic EMF API only - eClass(),
 * eGet(), eContainer() - so plain objects that answer those calls are enough.
 */
import { describe, it, expect } from 'vitest'
import { sectionFor, tableView } from '../composables/documentation'

interface Fake { cls: string; ns: string; values: Record<string, any>; parent?: Fake }

function obj(cls: string, ns: string, values: Record<string, any> = {}): any {
  const self: any = {
    _cls: cls,
    eClass: () => ({
      getName: () => cls,
      getEPackage: () => ({ getNsURI: () => ns }),
      getEStructuralFeature: (name: string) => (name in values ? { name } : null)
    }),
    eGet: (f: { name: string }) => values[f.name],
    eSet: (f: { name: string }, v: any) => { values[f.name] = v },
    eContainer: () => self._parent ?? null,
    _values: values
  }
  return self
}

const CORE = 'http://www.omg.org/spec/CWM/1.1/objectmodel/core'
const BI = 'http://www.omg.org/spec/CWM/1.1/foundation/businessinformation'
const REL = 'http://www.omg.org/spec/CWM/1.1/resource/relational'

function own(parent: any, ...children: any[]): any {
  parent._values.ownedElement = [...(parent._values.ownedElement ?? []), ...children]
  for (const c of children) c._parent = parent
  return parent
}

const description = (name: string, body: string, modelElement: any[] = []) =>
  obj('Description', BI, { name, body, modelElement })

describe('Dokumentation aus CWM-Beschreibungen', () => {
  it('eine Beschreibung mit Kindern und Kindeskindern, jede Ebene tiefer', () => {
    const handbuch = description('Handbuch', 'Wiki')
    const kapitel = description('Liegenschaftskataster', 'Das Kataster ist ...')
    const abschnitt = description('Zuständigkeit', 'Die Vermessungsämter ...')
    own(handbuch, own(kapitel, abschnitt))

    const s = sectionFor(handbuch)!
    expect(s.title).toBe('Handbuch')
    expect(s.body).toBe('Wiki')
    expect(s.depth).toBe(0)
    expect(s.isDescription).toBe(true)
    expect(s.children.map(c => [c.title, c.depth])).toEqual([['Liegenschaftskataster', 1]])
    expect(s.children[0]!.children.map(c => [c.title, c.depth])).toEqual([['Zuständigkeit', 2]])
  })

  it('eine Tabelle: Spalten mit Typ, Null, Schlüsseln und ihrer Beschreibung', () => {
    const text = obj('SQLSimpleType', REL, { name: 'varchar' })
    const gkz = obj('Column', REL, { name: 'gkz', type: text, isNullable: 'columnNoNulls' })
    const lkr = obj('Column', REL, { name: 'lkrcode', type: text, isNullable: 'columnNullable' })
    const tabelle = obj('Table', REL, { name: 'gemschluessel', feature: [gkz, lkr] })

    const landkreis = obj('Table', REL, { name: 'landkreis', feature: [] })
    const lkrKey = obj('PrimaryKey', REL, { name: 'landkreis_pkey', feature: [obj('Column', REL, { name: 'code' })] })
    own(landkreis, lkrKey)

    const pk = obj('PrimaryKey', REL, { name: 'gemschluessel_pkey', feature: [gkz] })
    const fk = obj('ForeignKey', REL, { name: 'lkrcode_fk1', feature: [lkr], uniqueKey: lkrKey })
    const tabellenText = description('Table gemschluessel', 'Amtliche Gemeindeschlüssel', [tabelle])
    const spaltenText = description('Column gkz', 'Amtlicher Gemeindeschlüssel', [gkz])
    own(tabelle, pk, fk, tabellenText, spaltenText)

    const view = tableView(tabelle)
    expect(view.name).toBe('gemschluessel')
    expect(view.columns).toEqual([
      { name: 'gkz', type: 'varchar', nullable: 'columnNoNulls', primaryKey: true, foreignKey: null, description: 'Amtlicher Gemeindeschlüssel' },
      { name: 'lkrcode', type: 'varchar', nullable: 'columnNullable', primaryKey: false, foreignKey: 'landkreis (code)', description: '' }
    ])

    // Die Tabelle gewaehlt: ihr eigener Text, die Tabelle, keine Spaltentexte als Absaetze
    const s = sectionFor(tabelle)!
    expect(s.body).toBe('Amtliche Gemeindeschlüssel')
    expect(s.table?.columns.length).toBe(2)
    expect(s.children).toEqual([])

    // Die Tabellenbeschreibung gewaehlt: sie bringt die Tabelle mit
    const t = sectionFor(tabellenText)!
    expect(t.table?.name).toBe('gemschluessel')
  })

  it('ein Paket zeigt, was darunter dokumentiert ist, und laesst Leeres weg', () => {
    const paket = obj('Package', CORE, { name: 'base' })
    const leer = obj('Package', CORE, { name: 'leer' })
    const schema = obj('Schema', REL, { name: 'tlvermgeo' })
    const tabelle = obj('Table', REL, { name: 't', feature: [] })
    own(paket, leer, own(schema, tabelle))

    const s = sectionFor(paket)!
    expect(s.children.map(c => c.title)).toEqual(['tlvermgeo'])
    expect(s.children[0]!.children.map(c => [c.title, c.depth, !!c.table])).toEqual([['t', 2, true]])
  })

  it('bricht bei zyklischen Modellen ab', () => {
    const a = description('a', 'A')
    const b = description('b', 'B')
    own(a, b); own(b, a)
    expect(() => sectionFor(a)).not.toThrow()
  })
})
