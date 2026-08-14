/**
 * Unit-Tests fuer den Enum-Literal-Zugriff der Formularfelder.
 *
 * Der Modellwert eines Enum-Attributs ist ein EEnumLiteral (die XMI-Schicht
 * loest es beim Laden auf). Das Dropdown arbeitet auf dem Literal-String, also
 * muss der Weg in beide Richtungen stimmen — inklusive der Altlasten, die noch
 * Ordinalzahlen tragen.
 */
import { describe, it, expect, beforeEach } from 'vitest'
import { BasicEEnum, BasicEEnumLiteral } from '@emfts/core'
import {
  enumLiteralInfos,
  readLiteralFeature,
  resolveEnumLiteral,
  type EnumLiteralInfo
} from '../composables/enumLiterals'

/** Literal wie im Ecore: ohne `literal`-Attribut faellt es auf den Namen zurueck */
function makeLiteral(name: string, ordinal: number, literal?: string): BasicEEnumLiteral {
  const l = new BasicEEnumLiteral()
  l.setName(name)
  l.setValue(ordinal)
  if (literal !== undefined) l.setLiteral(literal)
  return l
}

function makeEnum(name: string, literals: BasicEEnumLiteral[]): BasicEEnum {
  const e = new BasicEEnum()
  e.setName(name)
  for (const l of literals) e.addLiteral(l)
  return e
}

/**
 * Literal in DynamicEObject-Form: kein Getter, nur eClass()/eGet(). Deckt den
 * Fallback-Pfad ab, den dynamisch geladene Metamodelle brauchen.
 */
function makeDynamicLiteral(values: Record<string, unknown>): any {
  const features = new Map(Object.keys(values).map(key => [key, { name: key }]))
  return {
    eClass: () => ({
      getEStructuralFeature: (name: string) => features.get(name) ?? null
    }),
    eGet: (feature: { name: string }) => values[feature.name]
  }
}

/** EEnum in DynamicEObject-Form: eLiterals nur ueber eGet erreichbar */
function makeDynamicEnum(literals: unknown[]): any {
  const feature = { name: 'eLiterals' }
  return {
    eClass: () => ({
      getEStructuralFeature: (name: string) => (name === 'eLiterals' ? feature : null)
    }),
    eGet: (f: unknown) => (f === feature ? literals : undefined)
  }
}

describe('readLiteralFeature', () => {
  it('prefers the getter', () => {
    const literal = makeLiteral('RED', 0)
    expect(readLiteralFeature(literal, 'getName', 'name')).toBe('RED')
    expect(readLiteralFeature(literal, 'getValue', 'value')).toBe(0)
  })

  it('falls back to eGet when no getter exists', () => {
    const literal = makeDynamicLiteral({ name: 'GREEN', value: 1 })
    expect(readLiteralFeature(literal, 'getName', 'name')).toBe('GREEN')
    expect(readLiteralFeature(literal, 'getValue', 'value')).toBe(1)
  })

  it('returns undefined for a feature the literal does not have', () => {
    const literal = makeDynamicLiteral({ name: 'GREEN' })
    expect(readLiteralFeature(literal, 'getLiteral', 'literal')).toBeUndefined()
  })
})

describe('enumLiteralInfos', () => {
  it('reads name, literal and ordinal from a typed enum', () => {
    const eEnum = makeEnum('Color', [makeLiteral('RED', 0), makeLiteral('GREEN', 1, 'green_literal')])
    const infos = enumLiteralInfos(eEnum)

    expect(infos).toHaveLength(2)
    expect(infos[0]).toMatchObject({ name: 'RED', literalString: 'RED', ordinal: 0 })
    expect(infos[1]).toMatchObject({ name: 'GREEN', literalString: 'green_literal', ordinal: 1 })
  })

  it('falls back to the name when no literal is set', () => {
    const eEnum = makeEnum('Color', [makeLiteral('RED', 0)])
    expect(enumLiteralInfos(eEnum).map(i => i.literalString)).toEqual(['RED'])
  })

  it('reads literals from a dynamic enum via eGet', () => {
    const eEnum = makeDynamicEnum([
      makeDynamicLiteral({ name: 'RED', value: 0 }),
      makeDynamicLiteral({ name: 'GREEN', value: 1, literal: 'green_literal' })
    ])
    const infos = enumLiteralInfos(eEnum)

    expect(infos.map(i => i.literalString)).toEqual(['RED', 'green_literal'])
    expect(infos.map(i => i.ordinal)).toEqual([0, 1])
  })

  it('accepts an EList-shaped literal collection', () => {
    const eEnum = makeDynamicEnum([]) as any
    const literals = { data: [makeDynamicLiteral({ name: 'RED', value: 0 })] }
    eEnum.eGet = () => literals

    expect(enumLiteralInfos(eEnum).map(i => i.name)).toEqual(['RED'])
  })

  it('skips literals without a name and tolerates a missing type', () => {
    const eEnum = makeDynamicEnum([
      makeDynamicLiteral({ value: 0 }),
      makeDynamicLiteral({ name: 'GREEN', value: 1 })
    ])

    expect(enumLiteralInfos(eEnum).map(i => i.name)).toEqual(['GREEN'])
    expect(enumLiteralInfos(null)).toEqual([])
    expect(enumLiteralInfos(undefined)).toEqual([])
  })
})

describe('resolveEnumLiteral', () => {
  // NullableType aus CWM — genau der Enum, an dem der Fehler aufgefallen ist
  let literals: BasicEEnumLiteral[]
  let infos: EnumLiteralInfo[]

  beforeEach(() => {
    literals = [
      makeLiteral('columnNoNulls', 0),
      makeLiteral('columnNullable', 1),
      makeLiteral('columnNullableUnknown', 2)
    ]
    infos = enumLiteralInfos(makeEnum('NullableType', literals))
  })

  it('resolves the EEnumLiteral the model carries', () => {
    expect(resolveEnumLiteral(infos, literals[1])?.name).toBe('columnNullable')
  })

  it('resolves a literal instance from another enum copy by name', () => {
    const reloaded = makeLiteral('columnNullable', 1)
    expect(resolveEnumLiteral(infos, reloaded)?.literal).toBe(literals[1])
  })

  it('resolves a literal string', () => {
    expect(resolveEnumLiteral(infos, 'columnNullable')?.ordinal).toBe(1)
  })

  it('resolves an ordinal number', () => {
    expect(resolveEnumLiteral(infos, 1)?.name).toBe('columnNullable')
    expect(resolveEnumLiteral(infos, 0)?.name).toBe('columnNoNulls')
  })

  it('resolves an ordinal written as a string, as older files carry it', () => {
    expect(resolveEnumLiteral(infos, '1')?.name).toBe('columnNullable')
    expect(resolveEnumLiteral(infos, ' 2 ')?.name).toBe('columnNullableUnknown')
  })

  it('prefers the literal over an ordinal reading', () => {
    // Enum, dessen Literale wie Zahlen aussehen: der Literal-Treffer gewinnt
    const numeric = enumLiteralInfos(makeEnum('Weird', [makeLiteral('1', 0), makeLiteral('0', 1)]))
    expect(resolveEnumLiteral(numeric, '1')?.ordinal).toBe(0)
  })

  it('resolves the name when the enum declares a different literal', () => {
    const withLiteral = enumLiteralInfos(makeEnum('Color', [makeLiteral('GREEN', 1, 'green_literal')]))
    expect(resolveEnumLiteral(withLiteral, 'GREEN')?.literalString).toBe('green_literal')
  })

  it('returns null for unknown and empty values', () => {
    expect(resolveEnumLiteral(infos, 'PURPLE')).toBeNull()
    expect(resolveEnumLiteral(infos, 7)).toBeNull()
    expect(resolveEnumLiteral(infos, '7')).toBeNull()
    expect(resolveEnumLiteral(infos, null)).toBeNull()
    expect(resolveEnumLiteral(infos, undefined)).toBeNull()
    expect(resolveEnumLiteral(infos, '')).toBeNull()
  })

  it('returns null for an object that is not one of the literals', () => {
    expect(resolveEnumLiteral(infos, makeLiteral('somethingElse', 9))).toBeNull()
    expect(resolveEnumLiteral(infos, {})).toBeNull()
  })

  /**
   * Der Weg, den das Dropdown geht: Modellwert -> optionValue -> Auswahl
   * -> Literal-Objekt zurueck ins Modell.
   */
  it('round-trips model value to option value and back', () => {
    const fromModel = resolveEnumLiteral(infos, literals[2])
    expect(fromModel?.literalString).toBe('columnNullableUnknown')

    const backToModel = resolveEnumLiteral(infos, fromModel!.literalString)
    expect(backToModel?.literal).toBe(literals[2])
  })

  it('round-trips an ordinal from an old file into the literal object', () => {
    const fromFile = resolveEnumLiteral(infos, '1')
    expect(fromFile?.literalString).toBe('columnNullable')
    expect(resolveEnumLiteral(infos, fromFile!.literalString)?.literal).toBe(literals[1])
  })
})
