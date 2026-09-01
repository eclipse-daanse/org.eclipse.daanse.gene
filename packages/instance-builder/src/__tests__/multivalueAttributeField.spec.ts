/**
 * Darstellung mehrwertiger Attribute im AttributeField (#133).
 *
 * Vorher bekam auch ein Attribut mit upperBound="-1" ein einzelnes
 * Eingabefeld: angezeigt wurde die JS-Stringform des Arrays ("alpha,beta"),
 * und beim Tippen ging ein String hinaus. Geprueft wird hier, was die
 * Komponente rendert und was sie emittiert — dass es immer ein Array ist, ist
 * der Teil, an dem der Datenverlust hing.
 *
 * PrimeVue kommt ueber `tsm:primevue` und bootstrappt im Test nicht; die Stubs
 * rendern echte Elemente, damit Klicks ankommen.
 */
import { describe, it, expect, beforeAll, beforeEach } from 'vitest'
import { mount } from '@vue/test-utils'
import { BasicEAttribute, BasicEDataType } from '@emfts/core'

/** Stubs fuer tsm:primevue — als echte Elemente, damit @click funktioniert. */
function createPrimeVueStub(vue: typeof import('vue')) {
  const cache = new Map<string, unknown>()
  return new Proxy({} as Record<string, unknown>, {
    get(_t, prop: string) {
      if (!cache.has(prop)) {
        cache.set(prop, vue.defineComponent({
          name: prop,
          props: {
            modelValue: { type: null, default: undefined },
            label: { type: String, default: undefined },
            disabled: { type: Boolean, default: false }
          },
          emits: ['update:modelValue'],
          setup: (props, { attrs }) =>
            () => vue.h(prop === 'Button' ? 'button' : 'input', {
              value: props.modelValue,
              ...attrs,
              // eigenes Attribut statt einer Klasse: die Komponenten geben
              // class="w-full" mit, was einen Klassen-Marker ueberschreibt
              'data-stub': prop
            }, prop === 'Button' ? props.label : undefined)
        }))
      }
      return cache.get(prop)
    }
  })
}

let AttributeField: any

function attributMitTyp(name: string, typName: string, mehrwertig: boolean): BasicEAttribute {
  const typ = new BasicEDataType()
  typ.setName(typName)
  const attr = new BasicEAttribute()
  attr.setName(name)
  attr.setEType(typ as never)
  attr.setUpperBound(mehrwertig ? -1 : 1)
  return attr
}

const stringAttribut = (name: string, mehrwertig: boolean) =>
  attributMitTyp(name, 'EString', mehrwertig)

beforeAll(async () => {
  const vue = await import('vue')
  const primevue = createPrimeVueStub(vue)
  ;(globalThis as any).__tsm__ = {
    require: (id: string) => (id === 'vue' ? vue : id === 'primevue' ? primevue : {}),
    register: () => {}
  }
  AttributeField = (await import('../components/AttributeField.vue')).default
})

describe('AttributeField bei mehrwertigen Attributen (#133)', () => {
  let feature: BasicEAttribute

  beforeEach(() => {
    feature = stringAttribut('test', true)
  })

  it('rendert je Wert eine Zeile statt eines einzelnen Feldes', () => {
    const w = mount(AttributeField, { props: { feature, value: ['alpha', 'beta'] } })
    expect(w.findAll('.value-row')).toHaveLength(2)
    // Der frühere Fehler: ein Feld mit der Stringform des Arrays
    expect(w.html()).not.toContain('alpha,beta')
  })

  it('zeigt bei leerer Liste einen Hinweis und kein befuelltes Feld', () => {
    const w = mount(AttributeField, { props: { feature, value: [] } })
    expect(w.findAll('.value-row')).toHaveLength(0)
    expect(w.find('.value-empty').exists()).toBe(true)
  })

  it('nimmt auch eine EList entgegen, nicht nur ein Array', () => {
    const eList = { [Symbol.iterator]: function* () { yield 'alpha'; yield 'beta' } }
    const w = mount(AttributeField, { props: { feature, value: eList } })
    expect(w.findAll('.value-row')).toHaveLength(2)
  })

  it('Hinzufuegen emittiert ein Array, keinen Einzelwert', async () => {
    const w = mount(AttributeField, { props: { feature, value: ['alpha'] } })
    await w.find('.value-add').trigger('click')
    const emittiert = w.emitted('update:value')?.at(-1)?.[0]
    expect(Array.isArray(emittiert)).toBe(true)
    expect(emittiert).toEqual(['alpha', ''])
  })

  it('Entfernen emittiert die verbleibenden Werte als Array', async () => {
    const w = mount(AttributeField, { props: { feature, value: ['alpha', 'beta'] } })
    await w.findAll('.value-row button')[0].trigger('click')
    expect(w.emitted('update:value')?.at(-1)?.[0]).toEqual(['beta'])
  })

  it('eine Aenderung an einem Eintrag laesst die uebrigen unberuehrt', async () => {
    const w = mount(AttributeField, { props: { feature, value: ['alpha', 'beta'] } })
    // findAllComponents liefert nur die Kinder — je Listeneintrag eines
    const eintraege = w.findAllComponents(AttributeField)
    expect(eintraege).toHaveLength(2)
    eintraege[1].vm.$emit('update:value', 'geaendert')
    await w.vm.$nextTick()
    expect(w.emitted('update:value')?.at(-1)?.[0]).toEqual(['alpha', 'geaendert'])
  })

  // Der Listen-Editor darf nicht auf EString beschraenkt sein: die Zeilen
  // rendern dieselbe Komponente, also muss jeder Datentyp seinen gewohnten
  // Editor bekommen und ein passender Startwert entstehen.
  it.each([
    ['EString',  '',    'InputText'],
    ['EInt',     0,     'InputNumber'],
    ['EDouble',  0,     'InputNumber'],
    ['EBoolean', false, 'Checkbox'],
    ['EDate',    null,  'Calendar'],
  ])('%s: Listeneintraege bekommen den passenden Editor und Startwert', async (typ, startwert, widget) => {
    const attr = attributMitTyp('werte', typ as string, true)
    const w = mount(AttributeField, { props: { feature: attr, value: [] } })

    await w.find('.value-add').trigger('click')
    const emittiert = w.emitted('update:value')?.at(-1)?.[0] as unknown[]
    expect(emittiert).toEqual([startwert])

    const gefuellt = mount(AttributeField, { props: { feature: attr, value: [startwert] } })
    expect(gefuellt.findAll('.value-row')).toHaveLength(1)
    expect(gefuellt.find(`.value-row [data-stub="${widget}"]`).exists()).toBe(true)
  })

  it('einwertige Attribute bleiben ein einzelnes Feld', () => {
    const w = mount(AttributeField, { props: { feature: stringAttribut('test', false), value: 'alpha' } })
    expect(w.findAll('.value-row')).toHaveLength(0)
    expect(w.find('.value-add').exists()).toBe(false)
  })
})
