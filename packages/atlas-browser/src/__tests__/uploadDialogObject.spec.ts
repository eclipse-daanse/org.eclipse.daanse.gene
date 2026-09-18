/**
 * Objekt-Modus des Upload-Dialogs.
 *
 * Ein Schema findet der Server ueber seinen nsURI wieder, ein Objekt nicht —
 * es braucht Registry und objectId. Der Dialog kannte bisher nur den
 * Schema-Fall; der Model-Editor laedt aber Instanzen hoch. Geprueft wird die
 * Verdrahtung: welche Registries angeboten werden, wann der Knopf freigibt,
 * und welcher Dienst mit welchen Argumenten gerufen wird.
 *
 * PrimeVue kommt ueber `tsm:primevue`, das im Test nicht bootstrappt — statt
 * der echten Widgets stehen Stubs bereit.
 */
import { describe, it, expect, beforeAll, beforeEach, vi } from 'vitest'
import { mount } from '@vue/test-utils'

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
              visible: { type: Boolean, default: false },
              options: { type: Array, default: () => [] },
              disabled: { type: Boolean, default: false },
            },
            emits: ['update:modelValue', 'update:visible'],
            setup: (_props, { slots }) => () =>
              vue.h('div', { class: `stub-${prop}` }, [
                slots.default?.(),
                slots.footer?.(),
              ]),
          }),
        )
      }
      return cache.get(prop)
    },
  })
}

let AtlasUploadDialog: any

/** Der Dienst, wie ihn das Atlas-Plugin registriert. */
function uploadDienst() {
  return {
    getConnections: () => [{ id: 'c1', label: 'jena', status: 'connected' }],
    getSchemaRegistries: () => [
      { name: 'atlas-schema-registry', stages: [{ name: 'draft', final: false }] },
    ],
    getObjectRegistries: () => [
      {
        name: 'configurations',
        stages: [
          { name: 'draft', final: false },
          { name: 'release', final: true },
        ],
      },
    ],
    // Kurzweg-Stufen: nur relevant, wenn keine Registry gewaehlt ist
    getSchemaStages: () => [{ name: 'draft', final: false }],
    uploadSchema: vi.fn(async () => ({ success: true })),
    uploadObject: vi.fn(async () => ({ success: true })),
  }
}

beforeAll(async () => {
  const vue = await import('vue')
  const primevue = createPrimeVueStub(vue)
  ;(globalThis as any).__tsm__ = {
    require: (id: string) => (id === 'vue' ? vue : id === 'primevue' ? primevue : {}),
    register: () => {},
  }
  AtlasUploadDialog = (await import('../components/AtlasUploadDialog.vue')).default
})

describe('Upload-Dialog: Objekt-Modus', () => {
  let dienst: ReturnType<typeof uploadDienst>

  beforeEach(() => {
    dienst = uploadDienst()
  })

  function mounte(props: Record<string, unknown>) {
    return mount(AtlasUploadDialog, {
      props: { visible: true, content: '<xmi/>', filename: 'dataatlas.xmi', ...props },
      global: { provide: { 'gene.atlas.upload': dienst, tsm: null } },
    })
  }

  it('bietet im Objekt-Modus die Objekt-Registries an, nicht die Schema-Registry', () => {
    const wrapper = mounte({ kind: 'object' })
    expect((wrapper.vm as any).registryOptions.map((o: any) => o.value)).toEqual(['configurations'])
  })

  it('und im Schema-Modus weiterhin die Schema-Registries', () => {
    const wrapper = mounte({ kind: 'schema', filename: 'person.ecore' })
    expect((wrapper.vm as any).registryOptions.map((o: any) => o.value)).toEqual([
      'atlas-schema-registry',
    ])
  })

  it('finale Stages stehen nicht zur Wahl', () => {
    const wrapper = mounte({ kind: 'object' })
    expect((wrapper.vm as any).stageOptions.map((o: any) => o.value)).toEqual(['draft'])
  })

  it('die objectId wird aus dem Dateinamen vorgeschlagen', () => {
    const wrapper = mounte({ kind: 'object' })
    expect((wrapper.vm as any).schemaName).toBe('dataatlas')
  })

  it('ohne objectId gibt der Knopf nicht frei', async () => {
    const wrapper = mounte({ kind: 'object' })
    expect((wrapper.vm as any).canUpload).toBe(true)
    ;(wrapper.vm as any).schemaName = '   '
    await wrapper.vm.$nextTick()
    expect((wrapper.vm as any).canUpload).toBe(false)
  })

  it('hochgeladen wird über uploadObject, mit Registry und id', async () => {
    const wrapper = mounte({ kind: 'object' })
    await (wrapper.vm as any).handleUpload()

    expect(dienst.uploadSchema).not.toHaveBeenCalled()
    expect(dienst.uploadObject).toHaveBeenCalledWith(
      'c1',
      'configurations',
      'draft',
      'dataatlas',
      '<xmi/>',
      { name: 'dataatlas', overwrite: false },
    )
  })

  it('im Schema-Modus bleibt es bei uploadSchema', async () => {
    const wrapper = mounte({ kind: 'schema', filename: 'person.ecore' })
    await (wrapper.vm as any).handleUpload()

    expect(dienst.uploadObject).not.toHaveBeenCalled()
    expect(dienst.uploadSchema).toHaveBeenCalledWith(
      'c1',
      'draft',
      '<xmi/>',
      expect.objectContaining({ name: 'person', registryName: 'atlas-schema-registry' }),
    )
  })
})
