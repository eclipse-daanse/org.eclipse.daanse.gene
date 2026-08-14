/**
 * Verdrahtungs-Tests fuer den Enum-Pfad der Property-Felder.
 *
 * Die Logik selbst deckt enumLiterals.spec.ts ab. Hier geht es um die Kette,
 * die man sonst nur in der laufenden App sieht: PropertyField -> AttributeField
 * -> EnumField -> Dropdown, und der Rueckweg, bei dem aus der Auswahl wieder
 * ein EEnumLiteral fuer das Modell werden muss (nur so schreibt Save das
 * korrekte Literal).
 *
 * PrimeVue kommt ueber `tsm:primevue`, das im Test nicht bootstrappt. Statt des
 * echten Widgets steht deshalb ein Stub bereit — geprueft wird, was die
 * Komponenten einander uebergeben, nicht wie PrimeVue rendert.
 */
import { describe, it, expect, beforeAll, beforeEach } from 'vitest'
import { mount } from '@vue/test-utils'
import { toRaw } from 'vue'
import { BasicEAttribute, BasicEClass, BasicEEnum, BasicEEnumLiteral, BasicEDataType } from '@emfts/core'

/** Stub-Komponenten fuer tsm:primevue — ein Proxy liefert jeden angefragten Namen */
function createPrimeVueStub(vue: typeof import('vue')) {
  const cache = new Map<string, unknown>()
  return new Proxy({} as Record<string, unknown>, {
    get(_target, prop: string) {
      if (!cache.has(prop)) {
        cache.set(
          prop,
          vue.defineComponent({
            name: prop,
            inheritAttrs: false,
            props: {
              modelValue: { type: null, default: undefined },
              options: { type: Array, default: () => [] },
              optionLabel: { type: String, default: undefined },
              optionValue: { type: String, default: undefined },
              disabled: { type: Boolean, default: false },
              invalid: { type: Boolean, default: false },
              placeholder: { type: String, default: undefined }
            },
            emits: ['update:modelValue'],
            setup: () => () => vue.h('div', { class: `stub-${prop}` })
          })
        )
      }
      return cache.get(prop)
    }
  })
}

let AttributeField: any
let EnumField: any
let PropertyField: any

/** NullableType aus CWM — der Enum, an dem der Fehler aufgefallen ist */
function makeNullableType(): BasicEEnum {
  const eEnum = new BasicEEnum()
  eEnum.setName('NullableType')
  for (const [name, ordinal] of [
    ['columnNoNulls', 0],
    ['columnNullable', 1],
    ['columnNullableUnknown', 2]
  ] as Array<[string, number]>) {
    const literal = new BasicEEnumLiteral()
    literal.setName(name)
    literal.setValue(ordinal)
    eEnum.addLiteral(literal)
  }
  return eEnum
}

function makeAttribute(name: string, eType: unknown): BasicEAttribute {
  const attr = new BasicEAttribute()
  attr.setName(name)
  attr.setEType(eType as never)
  return attr
}

beforeAll(async () => {
  const vue = await import('vue')
  const primevue = createPrimeVueStub(vue)

  // Muss vor dem Import der SFCs stehen: der TSM-Rewrite loest `tsm:*` beim
  // Auswerten des Moduls auf, nicht erst beim Rendern.
  ;(globalThis as any).__tsm__ = {
    require: (id: string) => (id === 'vue' ? vue : id === 'primevue' ? primevue : {}),
    register: () => {}
  }

  AttributeField = (await import('../components/AttributeField.vue')).default
  EnumField = (await import('../components/EnumField.vue')).default
  PropertyField = (await import('../components/PropertyField.vue')).default
})

describe('EnumField wiring', () => {
  let nullableType: BasicEEnum
  let feature: BasicEAttribute
  let literals: BasicEEnumLiteral[]

  beforeEach(() => {
    nullableType = makeNullableType()
    literals = [...nullableType.getELiterals()] as BasicEEnumLiteral[]
    feature = makeAttribute('isNullable', nullableType)
  })

  function mountEnumField(value: unknown) {
    return mount(EnumField, { props: { feature, value } })
  }

  function dropdownOf(wrapper: ReturnType<typeof mount>) {
    return wrapper.findComponent({ name: 'Dropdown' })
  }

  it('offers every literal of the enum', () => {
    const dropdown = dropdownOf(mountEnumField(null))
    expect(dropdown.props('options')).toEqual([
      { label: 'columnNoNulls', value: 'columnNoNulls' },
      { label: 'columnNullable', value: 'columnNullable' },
      { label: 'columnNullableUnknown', value: 'columnNullableUnknown' }
    ])
  })

  it('preselects the literal the model carries', () => {
    expect(dropdownOf(mountEnumField(literals[1])).props('modelValue')).toBe('columnNullable')
  })

  it('preselects an ordinal from a file written before the fix', () => {
    expect(dropdownOf(mountEnumField('1')).props('modelValue')).toBe('columnNullable')
    expect(dropdownOf(mountEnumField(0)).props('modelValue')).toBe('columnNoNulls')
  })

  it('shows nothing selected for an unknown value', () => {
    expect(dropdownOf(mountEnumField('PURPLE')).props('modelValue')).toBeNull()
  })

  it('emits the EEnumLiteral itself, not the string or the ordinal', async () => {
    const wrapper = mountEnumField(literals[0])
    await dropdownOf(wrapper).vm.$emit('update:modelValue', 'columnNullableUnknown')

    const emitted = wrapper.emitted('update:value')
    expect(emitted).toHaveLength(1)
    // Identitaet, nicht nur Gleichheit: Save serialisiert ueber dieses Objekt.
    // toRaw, weil Vue Props als reaktive Proxies durchreicht — genau deshalb
    // faellt resolveEnumLiteral bei Objekten auf den Namen zurueck.
    expect(toRaw(emitted![0]![0])).toBe(literals[2])
  })

  it('passes readonly through to the widget', () => {
    const wrapper = mount(EnumField, { props: { feature, value: null, readonly: true } })
    expect(dropdownOf(wrapper).props('disabled')).toBe(true)
  })
})

describe('AttributeField -> EnumField', () => {
  let nullableType: BasicEEnum
  let literals: BasicEEnumLiteral[]

  beforeEach(() => {
    nullableType = makeNullableType()
    literals = [...nullableType.getELiterals()] as BasicEEnumLiteral[]
  })

  it('renders the enum dropdown for an EEnum attribute', () => {
    const wrapper = mount(AttributeField, {
      props: { feature: makeAttribute('isNullable', nullableType), value: literals[1] }
    })

    const dropdown = wrapper.findComponent({ name: 'Dropdown' })
    expect(dropdown.exists()).toBe(true)
    expect(dropdown.props('modelValue')).toBe('columnNullable')
  })

  it('renders a text input, not a dropdown, for an EString attribute', () => {
    const eString = new BasicEDataType()
    eString.setName('EString')
    const wrapper = mount(AttributeField, {
      props: { feature: makeAttribute('name', eString), value: 'gkz' }
    })

    expect(wrapper.findComponent({ name: 'Dropdown' }).exists()).toBe(false)
    expect(wrapper.findComponent({ name: 'InputText' }).exists()).toBe(true)
  })

  it('forwards the selected literal upwards', async () => {
    const wrapper = mount(AttributeField, {
      props: { feature: makeAttribute('isNullable', nullableType), value: literals[0] }
    })

    await wrapper.findComponent({ name: 'Dropdown' }).vm.$emit('update:modelValue', 'columnNullable')

    const emitted = wrapper.emitted('update:value')
    expect(emitted).toHaveLength(1)
    expect(toRaw(emitted![0]![0])).toBe(literals[1])
  })
})

describe('PropertyField -> AttributeField -> EnumField', () => {
  it('routes an EEnum attribute to the dropdown and reports the literal back', async () => {
    const nullableType = makeNullableType()
    const literals = [...nullableType.getELiterals()] as BasicEEnumLiteral[]
    const feature = makeAttribute('isNullable', nullableType)

    const eClass = new BasicEClass()
    eClass.setName('Column')
    const eObject = { eClass: () => eClass } as any

    const wrapper = mount(PropertyField, {
      props: { feature, eObject, value: literals[2] }
    })

    const dropdown = wrapper.findComponent({ name: 'Dropdown' })
    expect(dropdown.exists()).toBe(true)
    expect(dropdown.props('modelValue')).toBe('columnNullableUnknown')

    await dropdown.vm.$emit('update:modelValue', 'columnNoNulls')
    expect(toRaw(wrapper.emitted('update:value')![0]![0])).toBe(literals[0])
  })
})
