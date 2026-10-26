/**
 * The reference filter in the reference field.
 *
 * University workspace: a student may only take courses of his own
 * university (C-OCL, role REFERENCE_FILTER). The filter speaks of the student
 * as `self` and of the course as `target`. The field rewrote it into a set and
 * matched by name, and it never showed an assigned course the filter rejects -
 * the field stayed plain while the problems panel reported the violation.
 */
import { describe, it, expect, beforeAll, vi } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import {
  BasicResourceSet, XMIResourceFactory, URI, registerEcorePackage, EPackageRegistry,
  type EPackage, type EClass, type EObject
} from '@emfts/core'

const UNIVERSITY_ECORE = `<?xml version="1.0" encoding="UTF-8"?>
<ecore:EPackage xmi:version="2.0" xmlns:xmi="http://www.omg.org/XMI" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"
    xmlns:ecore="http://www.eclipse.org/emf/2002/Ecore" name="university" nsURI="http://example.com/university-field" nsPrefix="uni">
  <eClassifiers xsi:type="ecore:EClass" name="Student">
    <eStructuralFeatures xsi:type="ecore:EAttribute" name="name" eType="ecore:EDataType http://www.eclipse.org/emf/2002/Ecore#//EString"/>
    <eStructuralFeatures xsi:type="ecore:EReference" name="uni" eType="#//Uni" eOpposite="#//Uni/studenten"/>
    <eStructuralFeatures xsi:type="ecore:EReference" name="kurse" upperBound="-1" eType="#//Kurs" eOpposite="#//Kurs/studenten"/>
  </eClassifiers>
  <eClassifiers xsi:type="ecore:EClass" name="Uni">
    <eStructuralFeatures xsi:type="ecore:EAttribute" name="name" eType="ecore:EDataType http://www.eclipse.org/emf/2002/Ecore#//EString"/>
    <eStructuralFeatures xsi:type="ecore:EReference" name="studenten" upperBound="-1" eType="#//Student" eOpposite="#//Student/uni"/>
    <eStructuralFeatures xsi:type="ecore:EReference" name="kurse" upperBound="-1" eType="#//Kurs" containment="true" eOpposite="#//Kurs/uni"/>
  </eClassifiers>
  <eClassifiers xsi:type="ecore:EClass" name="Kurs">
    <eStructuralFeatures xsi:type="ecore:EAttribute" name="name" eType="ecore:EDataType http://www.eclipse.org/emf/2002/Ecore#//EString"/>
    <eStructuralFeatures xsi:type="ecore:EReference" name="uni" eType="#//Uni" eOpposite="#//Uni/kurse"/>
    <eStructuralFeatures xsi:type="ecore:EReference" name="studenten" upperBound="-1" eType="#//Student" eOpposite="#//Student/kurse"/>
  </eClassifiers>
</ecore:EPackage>`

const FILTER = 'self.uni <> null implies self.uni.kurse->exists(uk | uk = target)'

function createPrimeVueStub(vue: typeof import('vue')) {
  const cache = new Map<string, unknown>()
  return new Proxy({} as Record<string, unknown>, {
    get(_t, prop: string) {
      if (!cache.has(prop)) {
        cache.set(prop, vue.defineComponent({
          name: prop,
          inheritAttrs: false,
          props: { modelValue: { type: null, default: undefined }, options: { type: Array, default: () => [] }, disabled: Boolean, invalid: Boolean },
          setup: () => () => vue.h('div', { class: `stub-${prop}` })
        }))
      }
      return cache.get(prop)
    }
  })
}

let ReferenceField: any
let problems: any
let pkg: EPackage

beforeAll(async () => {
  const vue = await import('vue')
  const primevue = createPrimeVueStub(vue)
  ;(globalThis as any).__tsm__ = {
    require: (id: string) => (id === 'vue' ? vue : id === 'primevue' ? primevue : {}),
    register: () => {}
  }
  ReferenceField = (await import('../components/ReferenceField.vue')).default
  const { useProblemsService } = await import('../../../ui-problems-panel/src/composables/useProblemsService')
  problems = useProblemsService()

  registerEcorePackage()
  const rs = new BasicResourceSet()
  const factory = new XMIResourceFactory()
  rs.getResourceFactoryRegistry().getExtensionToFactoryMap().set('ecore', factory)
  const res = rs.createResource(URI.createURI('university.ecore')) as any
  res.loadFromString(UNIVERSITY_ECORE)
  pkg = res.getContents().get(0) as unknown as EPackage
  EPackageRegistry.INSTANCE.set(pkg.getNsURI()!, pkg)
  await problems.registerPackage(pkg)
})

function create(className: string, name: string): EObject {
  const obj = pkg.getEFactoryInstance()!.create(pkg.getEClassifier(className) as EClass) as unknown as EObject
  obj.eSet(obj.eClass().getEStructuralFeature('name')!, name)
  return obj
}
const list = (obj: EObject, feature: string): any => obj.eGet(obj.eClass().getEStructuralFeature(feature)!)

function university() {
  const jena = create('Uni', 'Uni Jena')
  const mathe = create('Kurs', 'Mathe')
  list(jena, 'kurse').add(mathe)
  const mittweida = create('Uni', 'Uni Mittweida')
  const informatik = create('Kurs', 'Informatik')
  list(mittweida, 'kurse').add(informatik)
  const martin = create('Student', 'Martin')
  martin.eSet(martin.eClass().getEStructuralFeature('uni')!, jena)
  return { martin, mathe, informatik }
}

function mountField(martin: EObject, value: EObject[], available: EObject[]) {
  return mount(ReferenceField, {
    props: {
      feature: martin.eClass().getEStructuralFeature('kurse'),
      value,
      availableObjects: available,
      oclFilter: FILTER,
      sourceObject: martin,
      problemsService: problems,
    }
  })
}

describe('reference filter in the field', () => {
  it('marks an assigned course of a foreign university, and names it', async () => {
    const { martin, mathe, informatik } = university()
    list(martin, 'kurse').add(informatik)

    const wrapper = mountField(martin, [informatik], [mathe, informatik])
    await vi.waitFor(async () => {
      await flushPromises()
      expect(wrapper.find('.reference-item--invalid').exists()).toBe(true)
    })

    expect(wrapper.classes()).toContain('reference-field--invalid')
    expect(wrapper.find('.reference-item--invalid').text()).toContain('Informatik')
    expect(wrapper.find('.field-error').text()).toContain('Informatik')
  })

  it('leaves a course of the own university plain', async () => {
    const { martin, mathe, informatik } = university()
    list(martin, 'kurse').add(mathe)

    const wrapper = mountField(martin, [mathe], [mathe, informatik])
    await flushPromises()
    await new Promise((r) => setTimeout(r, 50))
    await flushPromises()

    expect(wrapper.find('.reference-item--invalid').exists()).toBe(false)
    expect(wrapper.find('.field-error').exists()).toBe(false)
  })
})
