/**
 * The reference filter in the search dialog.
 *
 * A many-valued reference like Student.kurse is filled through the search.
 * Its filter speaks of the student (`self`) and the course (`target`); the
 * search could only evaluate filters about the candidate alone and gave up on
 * this one - nothing was greyed out.
 */
import { describe, it, expect, beforeAll } from 'vitest'
import {
  BasicResourceSet, XMIResourceFactory, URI, registerEcorePackage, EPackageRegistry,
  type EPackage, type EClass, type EObject, type Resource
} from '@emfts/core'
import { search } from '../composables/useSearchService'
import { useProblemsService } from '../../../ui-problems-panel/src/composables/useProblemsService'

const UNIVERSITY_ECORE = `<?xml version="1.0" encoding="UTF-8"?>
<ecore:EPackage xmi:version="2.0" xmlns:xmi="http://www.omg.org/XMI" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"
    xmlns:ecore="http://www.eclipse.org/emf/2002/Ecore" name="university" nsURI="http://example.com/university-search" nsPrefix="uni">
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

let pkg: EPackage
let rs: BasicResourceSet
const problems = useProblemsService()

beforeAll(async () => {
  registerEcorePackage()
  rs = new BasicResourceSet()
  const factory = new XMIResourceFactory()
  const map = rs.getResourceFactoryRegistry().getExtensionToFactoryMap()
  map.set('ecore', factory)
  map.set('xmi', factory)
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

describe('reference filter in the search', () => {
  it('greys out the courses of a foreign university for the student', async () => {
    const jena = create('Uni', 'Uni Jena')
    list(jena, 'kurse').add(create('Kurs', 'Mathe'))
    const mittweida = create('Uni', 'Uni Mittweida')
    list(mittweida, 'kurse').add(create('Kurs', 'Informatik'))
    const martin = create('Student', 'Martin')
    martin.eSet(martin.eClass().getEStructuralFeature('uni')!, jena)
    const resource = rs.createResource(URI.createURI('instances.xmi')) as unknown as Resource
    for (const root of [jena, mittweida, martin]) (resource.getContents() as any).add(root)

    const hits = await search('', resource, {
      mode: 'scoped' as any,
      filters: {
        classes: [pkg.getEClassifier('Kurs') as EClass],
        oclExpression: FILTER,
        sourceObject: martin,
        problemsService: problems,
      },
    })

    const nameOf = (o: EObject) => o.eGet(o.eClass().getEStructuralFeature('name')!)
    const verdict = (name: string) => hits.find((h) => nameOf(h.object) === name)
    expect(verdict('Mathe')?.isFilteredByOcl).toBeFalsy()
    expect(verdict('Informatik')?.isFilteredByOcl).toBe(true)
  })
})
