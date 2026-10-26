/**
 * Validating the instances of a document - live and on request.
 *
 * The case from the university workspace: a student of one university is given
 * a course of another. The model forbids it with an OCL invariant, but nothing
 * said so - attachTo only remembered the resource, and a change was never
 * validated. These tests pin down that it is now: right after the change,
 * again after the fix, and not for documents that were let go.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest'
import {
  BasicResourceSet, XMIResourceFactory, URI,
  registerEcorePackage, EPackageRegistry,
  type EPackage, type EClass, type EObject, type Resource
} from '@emfts/core'
import { useProblemsService } from '../composables/useProblemsService'
import type { OclValidationIssue } from '../types'

/** The university model of the workspace, with its two invariants on Student */
const UNIVERSITY_ECORE = `<?xml version="1.0" encoding="UTF-8"?>
<ecore:EPackage xmi:version="2.0" xmlns:xmi="http://www.omg.org/XMI" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"
    xmlns:ecore="http://www.eclipse.org/emf/2002/Ecore" name="university" nsURI="http://example.com/university-live" nsPrefix="uni">
  <eClassifiers xsi:type="ecore:EClass" name="Student">
    <eAnnotations source="http://www.eclipse.org/emf/2002/Ecore/OCL">
      <details key="KurseNurVonEigenerUni"
               value="self.uni &lt;> null implies self.kurse->forAll(k | self.uni.kurse->exists(uk | uk = k))"/>
      <details key="KurseNurMitUni" value="self.kurse->notEmpty() implies self.uni &lt;> null"/>
    </eAnnotations>
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

let pkg: EPackage
let rs: BasicResourceSet

function loadModel(): EPackage {
  registerEcorePackage()
  rs = new BasicResourceSet()
  const factory = new XMIResourceFactory()
  const map = rs.getResourceFactoryRegistry().getExtensionToFactoryMap()
  map.set('xmi', factory)
  map.set('ecore', factory)
  const res = rs.createResource(URI.createURI('university.ecore')) as any
  res.loadFromString(UNIVERSITY_ECORE)
  const loaded = res.getContents().get(0) as unknown as EPackage
  EPackageRegistry.INSTANCE.set(loaded.getNsURI()!, loaded)
  return loaded
}

function create(className: string, name: string): EObject {
  const obj = pkg.getEFactoryInstance()!.create(pkg.getEClassifier(className) as EClass) as unknown as EObject
  set(obj, 'name', name)
  return obj
}
function set(obj: EObject, feature: string, value: unknown): void {
  obj.eSet(obj.eClass().getEStructuralFeature(feature)!, value)
}
function list(obj: EObject, feature: string): any {
  return obj.eGet(obj.eClass().getEStructuralFeature(feature)!)
}

/** A document as the instance editor holds it: two universities and a student of the first */
function universityDocument(file: string) {
  const jena = create('Uni', 'Uni Jena')
  const mathe = create('Kurs', 'Mathe')
  list(jena, 'kurse').add(mathe)
  const mittweida = create('Uni', 'Uni Mittweida')
  const informatik = create('Kurs', 'Informatik')
  list(mittweida, 'kurse').add(informatik)
  const martin = create('Student', 'Martin')
  set(martin, 'uni', jena)

  const resource = rs.createResource(URI.createURI(file)) as unknown as Resource
  for (const root of [jena, mittweida, martin]) (resource.getContents() as any).add(root)
  return { resource, martin, mathe, informatik }
}

describe('validating a document', () => {
  let problems: ReturnType<typeof useProblemsService>

  beforeEach(async () => {
    problems = useProblemsService({ debounceMs: 10 })
    problems.reset()
    pkg = loadModel()
    await problems.registerPackage(pkg)
  })

  const violations = (constraint: string) =>
    problems.issues.value.filter((i: OclValidationIssue) => i.constraintName === constraint)

  it('finds the course of a foreign university when asked', async () => {
    const { resource, martin, informatik } = universityDocument('a.xmi')
    list(martin, 'kurse').add(informatik)

    await problems.validateResource(resource)

    expect(violations('KurseNurVonEigenerUni')).toHaveLength(1)
    expect(violations('KurseNurVonEigenerUni')[0]!.objectLabel).toContain('Martin')
  })

  it('accepts a course of the own university', async () => {
    // OCL compares objects by identity; with a fresh wrapper per access
    // `uk = k` was never true and every course counted as a foreign one
    const { resource, martin, mathe } = universityDocument('a.xmi')
    list(martin, 'kurse').add(mathe)

    await problems.validateResource(resource)

    expect(violations('KurseNurVonEigenerUni')).toHaveLength(0)
  })

  it('reports it live, right after the course is assigned - and clears it after the fix', async () => {
    const { resource, martin, informatik, mathe } = universityDocument('a.xmi')
    await problems.attachTo(resource, { validateImmediately: true })
    expect(violations('KurseNurVonEigenerUni')).toHaveLength(0)

    list(martin, 'kurse').add(informatik)
    await vi.waitFor(() => expect(violations('KurseNurVonEigenerUni')).toHaveLength(1))

    list(martin, 'kurse').remove(informatik)
    list(martin, 'kurse').add(mathe)
    await vi.waitFor(() => expect(violations('KurseNurVonEigenerUni')).toHaveLength(0))
  })

  it('observes objects added to the document later', async () => {
    const { resource, informatik } = universityDocument('a.xmi')
    await problems.attachTo(resource)

    const neu = create('Student', 'Neu')
    ;(resource.getContents() as any).add(neu)
    await vi.waitFor(() => expect(violations('KurseNurMitUni')).toHaveLength(0))

    // The new student has courses but no university
    list(neu, 'kurse').add(informatik)
    await vi.waitFor(() => expect(violations('KurseNurMitUni')).toHaveLength(1))
  })

  it('a detached document is no longer validated, and its findings go', async () => {
    const { resource, martin, informatik } = universityDocument('a.xmi')
    await problems.attachTo(resource)
    list(martin, 'kurse').add(informatik)
    await vi.waitFor(() => expect(violations('KurseNurVonEigenerUni')).toHaveLength(1))

    await problems.detachFrom(resource)
    expect(violations('KurseNurVonEigenerUni')).toHaveLength(0)

    list(martin, 'kurse').remove(informatik)
    list(martin, 'kurse').add(informatik)
    await new Promise((r) => setTimeout(r, 60))
    expect(violations('KurseNurVonEigenerUni')).toHaveLength(0)
  })

  it('validating one document keeps the findings of another and the parser messages', async () => {
    const first = universityDocument('first.xmi')
    const second = universityDocument('second.xmi')
    list(first.martin, 'kurse').add(first.informatik)
    list(second.martin, 'kurse').add(second.informatik)
    problems.addIssue({ severity: 'error', message: 'broken XML', source: 'xmi-parser', objectLabel: 'first.xmi', eClassName: 'XMI Parser' })

    await problems.validateResource(first.resource)
    await problems.validateResource(second.resource)
    expect(violations('KurseNurVonEigenerUni')).toHaveLength(2)

    // Fix the first and validate it again: the second's finding stays
    list(first.martin, 'kurse').remove(first.informatik)
    await problems.validateResource(first.resource)
    const left = violations('KurseNurVonEigenerUni')
    expect(left).toHaveLength(1)
    expect(left[0]!.object).toBeDefined()
    expect(problems.issues.value.some((i: OclValidationIssue) => i.source === 'xmi-parser')).toBe(true)
  })
})

/** The reference filter of the workspace's university.c-ocl */
const UNIVERSITY_COCL = `<?xml version="1.0" encoding="UTF-8"?>
<cocl:OclConstraintSet xmi:version="2.0" xmlns:xmi="http://www.omg.org/XMI"
    xmlns:cocl="http://www.gme.org/cocl/1.0" name="UniversityConstraints" version="1.0"
    targetModelNsURIs="http://example.com/university-live">
  <constraints name="StudentKurseFilter" contextClass="university.Student"
    expression="self.uni &lt;> null implies self.uni.kurse->exists(uk | uk = target)"
    severity="ERROR" role="REFERENCE_FILTER" featureName="kurse" active="true"/>
</cocl:OclConstraintSet>`

describe('the reference filter of a constraint file', () => {
  it('offers only the courses of the own university', async () => {
    const problems = useProblemsService()
    problems.reset()
    pkg = loadModel()
    await problems.registerPackage(pkg)
    const { martin } = universityDocument('a.xmi')

    expect(await problems.loadCoclFile(UNIVERSITY_COCL, 'uni/university.c-ocl')).toBe(true)
    const filter = await problems.getCoclReferenceFilter('Student', 'kurse')
    expect(filter).toContain('target')

    // What the reference field evaluates: the collection behind "->exists(uk | uk = target)"
    const allowed = await problems.query(martin, 'if self.uni <> null then self.uni.kurse else Set{} endif')
    const names = [...(allowed as Iterable<any>)].map((k) => k.eGet('name'))
    expect(names).toEqual(['Mathe'])
  })
})
