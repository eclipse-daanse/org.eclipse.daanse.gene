/**
 * Metamodelle tragen ihre nsURI als Resource-URI, der Ort steht in der
 * URI-Abbildung.
 *
 * Seit @emfts/core 0.3 haben EClassifier eine Resource, und `XMLSave.getHref()`
 * schreibt einen Verweis darauf gegen das Dokument aufgelöst
 * (`model/shop.ecore#//Product`). Für eine Datei neben der Instanz ist das
 * richtig; ein Metamodell aus dem Model Atlas hat dafür keinen Bezugspunkt, und
 * der Verweis ist beim nächsten Laden nicht mehr auflösbar.
 *
 * Heißt die Resource nach ihrer nsURI, schreibt derselbe Serializer wieder
 * `nsURI#//Klasse` — ohne Überschreibung. Damit bestehende Dateien weiter
 * laden, bildet die URI-Abbildung den Pfad auf die nsURI ab; `getResource()`
 * vergleicht durch den URIConverter (emf.ts#110).
 */
import { describe, it, expect, beforeEach } from 'vitest'
import { URI, XMIResource, XMIResourceFactory, Resource as ResourceKonstanten } from '@emfts/core'
import { useModelRegistry, setSharedResourceSet } from 'ui-model-browser'
import { getSharedResourceSet } from 'ui-instance-tree'

const NS = 'http://example.org/logical/shop'

const SHOP_ECORE = `<?xml version="1.0" encoding="UTF-8"?>
<ecore:EPackage xmlns:xmi="http://www.omg.org/XMI" xmi:version="2.0"
    xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"
    xmlns:ecore="http://www.eclipse.org/emf/2002/Ecore"
    name="shop" nsURI="${NS}" nsPrefix="shop">
  <eClassifiers xsi:type="ecore:EClass" name="Product"/>
  <eClassifiers xsi:type="ecore:EClass" name="Order">
    <eStructuralFeatures xsi:type="ecore:EReference" name="kind"
        eType="ecore:EClass http://www.eclipse.org/emf/2002/Ecore#//EClass"/>
  </eClassifiers>
</ecore:EPackage>`

/** So sieht ein Workspace von gestern aus: das Metamodell über seinen Pfad. */
const ALTE_INSTANZ = `<?xml version="1.0" encoding="UTF-8"?>
<shop:Order xmlns:xmi="http://www.omg.org/XMI" xmi:version="2.0"
    xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"
    xmlns:shop="${NS}">
  <kind href="model/shop.ecore#//Product"/>
</shop:Order>`

async function ladeMetamodell() {
  const rs = getSharedResourceSet()
  // Was sonst das Plugin verdrahtet: Metamodelle in dasselbe Resource-Set
  setSharedResourceSet(rs)
  rs.getResourceFactoryRegistry()
    .getExtensionToFactoryMap()
    .set(ResourceKonstanten.DEFAULT_EXTENSION, new XMIResourceFactory())
  const info = await useModelRegistry().loadEcoreFile(SHOP_ECORE, 'model/shop.ecore')
  expect(info).toBeTruthy()
  return rs
}

function ladeInstanz(rs: ReturnType<typeof getSharedResourceSet>, xmi: string) {
  const res = new XMIResource(URI.createURI('order.xmi'))
  res.setResourceSet(rs)
  rs.getResources().push(res)
  res.loadFromString(xmi)
  return res
}

describe('Metamodelle unter ihrer nsURI', () => {
  beforeEach(() => {
    // Das Package ist global registriert; der Test läuft gegen genau diese
    // eine Instanz, ein zweites Laden würde nichts hinzufügen.
  })

  it('löst einen Pfad-Verweis aus einem bestehenden Workspace weiter auf', async () => {
    const rs = await ladeMetamodell()
    const res = ladeInstanz(rs, ALTE_INSTANZ)

    const order = res.getContents().get(0) as any
    const kind = order.eGet(order.eClass().getEStructuralFeature('kind'))
    expect(kind).toBeTruthy()
    expect(kind.eIsProxy?.()).toBe(false)
    expect(kind.getName?.()).toBe('Product')
  })

  it('schreibt den Verweis beim Speichern als nsURI', async () => {
    const rs = await ladeMetamodell()
    const res = ladeInstanz(rs, ALTE_INSTANZ)

    const gespeichert = (res as any).saveToString()
    expect(gespeichert).toContain(`${NS}#//Product`)
    // Der Pfad taucht nicht mehr auf — die Datei wird im Vorbeigehen migriert
    expect(gespeichert).not.toContain('model/shop.ecore#//Product')
  })

  it('findet die Resource über beide Namen', async () => {
    const rs = await ladeMetamodell()

    const ueberNsURI = rs.getResource(URI.createURI(NS), false)
    const ueberPfad = rs.getResource(URI.createURI('model/shop.ecore'), false)
    expect(ueberNsURI).toBeTruthy()
    expect(ueberPfad).toBe(ueberNsURI)
  })
})
