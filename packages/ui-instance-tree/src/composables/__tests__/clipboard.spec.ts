/**
 * Zwischenablage im Instanzbaum (#63).
 *
 * Gleiche Bedienung wie im Metamodeler, andere Daten. Der Unterschied, der
 * hier zaehlt: Instanzen tragen eine xmi:id. Eine Kopie muss eine eigene
 * bekommen — sonst stuenden zwei Objekte mit derselben Id in der Datei, und
 * Verweise darauf waeren nicht mehr eindeutig aufloesbar.
 */
import { describe, it, expect, beforeEach } from 'vitest'
import { ref } from 'vue'
import {
  BasicResourceSet, XMIResourceFactory, URI,
  registerEcorePackage, EPackageRegistry,
  type EPackage, type EClass, type EObject, type Resource
} from '@emfts/core'
import { useInstanceTree, getXmiId } from '../useInstanceTree'

const ECORE = `<?xml version="1.0" encoding="UTF-8"?>
<ecore:EPackage xmlns:xmi="http://www.omg.org/XMI" xmi:version="2.0"
    xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"
    xmlns:ecore="http://www.eclipse.org/emf/2002/Ecore"
    name="lib" nsURI="http://test.local/clipboard-instances" nsPrefix="lib">
  <eClassifiers xsi:type="ecore:EClass" name="Library">
    <eStructuralFeatures xsi:type="ecore:EReference" name="books" upperBound="-1"
        eType="#//Book" containment="true"/>
    <eStructuralFeatures xsi:type="ecore:EReference" name="archive" upperBound="-1"
        eType="#//Book" containment="true"/>
  </eClassifiers>
  <eClassifiers xsi:type="ecore:EClass" name="Book">
    <eStructuralFeatures xsi:type="ecore:EAttribute" name="title"
        eType="ecore:EDataType http://www.eclipse.org/emf/2002/Ecore#//EString"/>
  </eClassifiers>
</ecore:EPackage>`

describe('Instanzbaum-Zwischenablage (#63)', () => {
  let pkg: EPackage
  let library: EObject
  let book: EObject
  let tree: ReturnType<typeof useInstanceTree>
  let rs: BasicResourceSet

  const buecher = (feature: string) =>
    Array.from((library.eGet(library.eClass().getEStructuralFeature(feature)!) ?? []) as Iterable<EObject>)

  beforeEach(() => {
    registerEcorePackage()
    rs = new BasicResourceSet()
    const f = new XMIResourceFactory()
    const map = rs.getResourceFactoryRegistry().getExtensionToFactoryMap()
    map.set('xmi', f); map.set('ecore', f)
    const ecoreRes = rs.createResource(URI.createURI('lib.ecore')) as any
    ecoreRes.loadFromString(ECORE)
    pkg = ecoreRes.getContents().get(0) as unknown as EPackage
    EPackageRegistry.INSTANCE.set(pkg.getNsURI()!, pkg)

    const factory = pkg.getEFactoryInstance()!
    library = factory.create(pkg.getEClassifier('Library') as EClass) as unknown as EObject
    book = factory.create(pkg.getEClassifier('Book') as EClass) as unknown as EObject
    book.eSet(book.eClass().getEStructuralFeature('title')!, 'Moby Dick')
    ;(library.eGet(library.eClass().getEStructuralFeature('books')!) as any).add(book)

    const instRes = rs.createResource(URI.createURI('lib.xmi')) as Resource
    ;(instRes.getContents() as any).add(library)

    const resources = ref<Resource[]>([instRes])
    tree = useInstanceTree(resources, ref(instRes))
    tree.clearClipboard()
  })

  it('ein kopiertes Buch darf in dieselbe Bibliothek', () => {
    tree.copyToClipboard(book)
    expect(tree.canPasteInto(library).ok).toBe(true)
  })

  it('Einfuegen legt eine Kopie an, das Original bleibt', () => {
    tree.copyToClipboard(book)
    expect(tree.pasteInto(library)).toBe(true)

    const alle = buecher('books')
    expect(alle).toHaveLength(2)
    expect(alle[0]).toBe(book)
    expect(alle[1]).not.toBe(book)
    const titel = alle[1].eGet(alle[1].eClass().getEStructuralFeature('title')!)
    expect(titel).toBe('Moby Dick')
  })

  it('die Kopie bekommt eine eigene xmi:id', () => {
    tree.copyToClipboard(book)
    tree.pasteInto(library)
    const [original, kopie] = buecher('books')
    const idOriginal = getXmiId(original)
    const idKopie = getXmiId(kopie)
    expect(idKopie).toBeTruthy()
    expect(idKopie).not.toBe(idOriginal)
  })

  it('Ausschneiden verschiebt und behaelt die Identitaet', () => {
    tree.cutToClipboard(book)
    expect(tree.pasteInto(library)).toBe(true)
    // Immer noch genau ein Buch, und zwar dasselbe Objekt
    const alle = buecher('books')
    expect(alle).toHaveLength(1)
    expect(alle[0]).toBe(book)
    expect(tree.hasClipboardContent.value).toBe(false)
  })

  it('ohne Inhalt meldet canPasteInto den Grund', () => {
    const ergebnis = tree.canPasteInto(library)
    expect(ergebnis.ok).toBe(false)
    expect(ergebnis.reason).toMatch(/leer/i)
  })

  it('Einfuegen auf einer Resource macht das Element zum Wurzelobjekt', () => {
    const zweite = rs.createResource(URI.createURI('lib2.xmi')) as Resource
    tree.copyToClipboard(book)
    expect(tree.canPasteIntoResource(zweite).ok).toBe(true)
    expect(tree.pasteIntoResource(zweite)).toBe(true)

    const wurzeln = Array.from(zweite.getContents() as Iterable<EObject>)
    expect(wurzeln).toHaveLength(1)
    expect(wurzeln[0]).not.toBe(book)   // Kopie, nicht das Original
    expect(getXmiId(wurzeln[0])).not.toBe(getXmiId(book))
    // Das Original bleibt, wo es war
    expect(buecher('books')).toHaveLength(1)
  })

  it('Ausschneiden auf eine andere Resource verschiebt das Original', () => {
    const zweite = rs.createResource(URI.createURI('lib3.xmi')) as Resource
    tree.cutToClipboard(book)
    expect(tree.pasteIntoResource(zweite)).toBe(true)

    expect(Array.from(zweite.getContents() as Iterable<EObject>)[0]).toBe(book)
    expect(buecher('books')).toHaveLength(0)
    expect(tree.hasClipboardContent.value).toBe(false)
  })

  it('ohne Inhalt meldet canPasteIntoResource den Grund', () => {
    const zweite = rs.createResource(URI.createURI('lib4.xmi')) as Resource
    const ergebnis = tree.canPasteIntoResource(zweite)
    expect(ergebnis.ok).toBe(false)
    expect(ergebnis.reason).toMatch(/leer/i)
  })

  it('eine Bibliothek passt nicht in ein Buch', () => {
    tree.copyToClipboard(library)
    expect(tree.canPasteInto(book).ok).toBe(false)
  })
})
