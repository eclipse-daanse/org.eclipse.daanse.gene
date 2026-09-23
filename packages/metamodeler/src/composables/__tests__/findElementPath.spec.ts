/**
 * Den Weg zu einem Element im Baum finden (#156).
 *
 * Ein Link im Properties-Panel zeigt auf den Obertyp einer Klasse oder auf ein
 * Feature irgendwo sonst im Modell. Damit der Baum dorthin aufklappen und die
 * Zeile markieren kann, braucht er die Kette der Knoten von der Wurzel bis zum
 * Ziel — der Vergleich läuft über die Objektidentität, nicht über Namen.
 */
import { describe, it, expect, beforeEach } from 'vitest'
import { useSharedMetamodeler } from '../useMetamodeler'

const ECORE = `<?xml version="1.0" encoding="UTF-8"?>
<ecore:EPackage xmlns:xmi="http://www.omg.org/XMI" xmi:version="2.0"
    xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"
    xmlns:ecore="http://www.eclipse.org/emf/2002/Ecore"
    name="shop" nsURI="urn:issue156" nsPrefix="shop">
  <eClassifiers xsi:type="ecore:EClass" name="Base" abstract="true">
    <eStructuralFeatures xsi:type="ecore:EAttribute" name="id"
        eType="ecore:EDataType http://www.eclipse.org/emf/2002/Ecore#//EString"/>
  </eClassifiers>
  <eClassifiers xsi:type="ecore:EClass" name="Article" eSuperTypes="#//Base">
    <eStructuralFeatures xsi:type="ecore:EAttribute" name="title"
        eType="ecore:EDataType http://www.eclipse.org/emf/2002/Ecore#//EString"/>
  </eClassifiers>
</ecore:EPackage>`

let metamodeler: ReturnType<typeof useSharedMetamodeler>

beforeEach(async () => {
  metamodeler = useSharedMetamodeler()
  await metamodeler.loadFromEcoreString(ECORE, 'model/issue156.ecore')
})

/** Wie das Properties-Panel: das Ziel eines Links, hier der Obertyp. */
function superTypeOfArticle() {
  const pkg: any = metamodeler.rootPackage.value
  const article: any = pkg.getEClassifier('Article')
  return [...article.getESuperTypes()][0]
}

describe('findElementPath (#156)', () => {
  it('findet den Weg zum Obertyp einer Klasse', () => {
    const base = superTypeOfArticle()
    const path = metamodeler.findElementPath(base)

    expect(path.length).toBeGreaterThan(1)
    expect(path[path.length - 1].data).toBe(base)
    // Alles davor ist der aufzuklappende Weg — beginnend beim Package
    expect(path[0].type).toBe('package')
  })

  it('findet auch ein Feature tief im Baum', () => {
    const pkg: any = metamodeler.rootPackage.value
    const article: any = pkg.getEClassifier('Article')
    const title = [...article.getEStructuralFeatures()][0]

    const path = metamodeler.findElementPath(title)
    expect(path[path.length - 1].data).toBe(title)
    // Die Klasse liegt dazwischen, sie muss aufgeklappt werden
    expect(path.map((n) => n.data)).toContain(article)
  })

  it('ein Element aus einem anderen Modell ergibt keinen Weg', () => {
    // Der Obertyp kann auch aus einem Modell kommen, das hier nicht offen ist
    expect(metamodeler.findElementPath({ getName: () => 'Fremd' })).toEqual([])
    expect(metamodeler.findElementPath(null)).toEqual([])
  })
})
