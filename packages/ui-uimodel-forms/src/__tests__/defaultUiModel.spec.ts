/**
 * Unit-Tests fuer den Default-UIModel-Generator (Plan Phase 1/2).
 */
import { describe, it, expect, beforeAll } from 'vitest'
import {
  registerEcorePackage,
  getEcorePackage,
  BasicEClass,
  BasicEAttribute,
  BasicEReference
} from '@emfts/core'
import { buildDefaultUiModel, featureDisplayName } from '../defaultUiModel'

function makeAttr(name: string, type: () => unknown, lower = 0) {
  const a = new BasicEAttribute()
  a.setName(name)
  a.setEType(type() as never)
  a.setLowerBound(lower)
  return a
}

describe('buildDefaultUiModel', () => {
  let eClass: BasicEClass

  beforeAll(() => {
    registerEcorePackage()
    eClass = new BasicEClass()
    eClass.setName('Sample')
  })

  it('erzeugt FormViews fuer Attributes und References mit Widget je Feature', () => {
    const ecore = getEcorePackage()
    const name = makeAttr('name', () => ecore.getEString(), 1)
    const count = makeAttr('count', () => ecore.getEInt())
    const active = makeAttr('active', () => ecore.getEBoolean())
    const ref = new BasicEReference()
    ref.setName('items')

    const um = buildDefaultUiModel({
      eClass: eClass as never,
      attributes: [name, count, active] as never[],
      references: [ref] as never[]
    })

    expect(um.name).toBe('default:Sample')
    expect(um.components).toHaveLength(2)

    const [attrs, refs] = um.components as never[] as Array<{ group?: string; fields: Array<Record<string, unknown>> }>
    expect(attrs.group).toBe('Attributes')
    expect(attrs.fields.map(f => f.name)).toEqual(['name', 'count', 'active'])
    // Widget-Typen nach Datentyp
    expect((attrs.fields[1] as { eClass(): { getName(): string } }).eClass().getName()).toBe('NumberWidget')
    expect((attrs.fields[2] as { eClass(): { getName(): string } }).eClass().getName()).toBe('CheckboxWidget')
    expect(refs.group).toBe('References')
    expect((refs.fields[0] as { eClass(): { getName(): string } }).eClass().getName()).toBe('ReferenceLinkWidget')
  })

  it('generiert fuer Pflichtfelder eine OCL-ValidationExpression (Strings inkl. Leer-Check)', () => {
    const ecore = getEcorePackage()
    const name = makeAttr('name', () => ecore.getEString(), 1)
    const num = makeAttr('num', () => ecore.getEInt(), 1)
    const optional = makeAttr('opt', () => ecore.getEString(), 0)

    const um = buildDefaultUiModel({
      eClass: eClass as never,
      attributes: [name, num, optional] as never[],
      references: []
    })
    const fields = (um.components[0] as never as { fields: Array<{ required?: boolean; validations: Array<{ language: string; body: string; severity?: string }> }> }).fields

    expect(fields[0].required).toBe(true)
    expect(fields[0].validations).toHaveLength(1)
    expect(fields[0].validations[0].language).toBe('OCL')
    expect(fields[0].validations[0].body).toBe('self.name <> null and self.name.size() > 0')
    expect(fields[0].validations[0].severity).toBe('ERROR')

    expect(fields[1].validations[0].body).toBe('self.num <> null')
    expect(fields[2].validations ?? []).toHaveLength(0)
  })

  it('erzeugt eine read-only Derived-Values-Gruppe ohne Validations', () => {
    const ecore = getEcorePackage()
    const derived = makeAttr('memberCount', () => ecore.getEInt(), 1)

    const um = buildDefaultUiModel({
      eClass: eClass as never,
      attributes: [],
      references: [],
      derived: [derived] as never[]
    })

    expect(um.components).toHaveLength(1)
    const form = um.components[0] as never as { group?: string; fields: Array<{ readOnly?: boolean; required?: boolean; validations: unknown[] }> }
    expect(form.group).toBe('Derived Values')
    expect(form.fields[0].readOnly).toBe(true)
    // Derived sind nie Pflichtfelder und werden nicht validiert
    expect(form.fields[0].required).toBe(false)
    expect(form.fields[0].validations).toHaveLength(0)
  })

  it('featureDisplayName wandelt camelCase in Title Case', () => {
    const f = makeAttr('maxMembers', () => getEcorePackage().getEString())
    expect(featureDisplayName(f as never)).toBe('Max Members')
  })
})
