/**
 * Die Zuordnung „welche Ansicht öffnet welche Datei" muss die .wsp überleben.
 *
 * Das Workspace-Modell kennt `EditorConfig.editorBindings`; im erzeugten Paket
 * fehlt das Feature, weil der Codegen das Generat derzeit leert
 * (emf.ts.codegen#47). Ohne Feature verwirft der Loader die Einträge
 * stillschweigend — deshalb wird die Klasse zur Laufzeit ergänzt.
 *
 * Fällt dieser Test um, weil das Feature schon da ist, liefert der Codegen es
 * wieder und der Fixup kann weg.
 */
import { describe, it, expect, beforeEach } from 'vitest'
import { XMIResource, URI, BasicResourceSet, EPackageRegistry, BasicEClass } from '@emfts/core'
import { FennecuiPackage } from '../generated/fennecui'
import { fixupEditorConfigPackage, resetEditorConfigFixup } from '../services/editorConfigFixup'

const WSP = `<?xml version="1.0" encoding="UTF-8"?>
<fennecui:EditorConfig xmlns:xmi="http://www.omg.org/XMI" xmi:version="2.0"
    xmlns:fennecui="https://eclipse.org/fennec/ts/generic/ui" name="sim">
  <editorBindings nsURI="https://eclipse.org/fennec/persistence/eorm/1.0.0" editorId="eorm"/>
  <editorBindings pattern="instances/*.xmi" editorId="instance"/>
</fennecui:EditorConfig>`

function editorConfigKlasse() {
  return [...FennecuiPackage.eINSTANCE.getEClassifiers()].find(
    (c: any) => c.getName?.() === 'EditorConfig'
  ) as any
}

describe('editorBindings am EditorConfig', () => {
  beforeEach(() => {
    resetEditorConfigFixup()
  })

  it('ergaenzt das Feature, solange der Codegen es nicht liefert', () => {
    fixupEditorConfigPackage(FennecuiPackage.eINSTANCE as any)
    const feature = editorConfigKlasse()?.getEStructuralFeature?.('editorBindings')
    expect(feature).toBeTruthy()
    expect(feature.isMany()).toBe(true)
    expect(feature.isContainment()).toBe(true)
  })

  it('ergaenzt kein zweites Mal', () => {
    fixupEditorConfigPackage(FennecuiPackage.eINSTANCE as any)
    const anzahl = [...editorConfigKlasse().getEStructuralFeatures()].filter(
      (f: any) => f.getName?.() === 'editorBindings'
    ).length
    resetEditorConfigFixup()
    fixupEditorConfigPackage(FennecuiPackage.eINSTANCE as any)
    const danach = [...editorConfigKlasse().getEStructuralFeatures()].filter(
      (f: any) => f.getName?.() === 'editorBindings'
    ).length
    expect(danach).toBe(anzahl)
  })

  it('erzeugt auch eine fremde Kopie der Klasse', () => {
    /*
     * Zur Laufzeit liegt das Paket zweimal vor; die Klassenliste des
     * Instanzbaums kommt aus der anderen Kopie als die Fabrik. Die Fabrik muss
     * eine EditorBinding-Klasse am Namen erkennen, nicht an der Identitaet.
     */
    fixupEditorConfigPackage(FennecuiPackage.eINSTANCE as any)
    const fremd = new BasicEClass()
    fremd.setName('EditorBinding')
    const fabrik = (FennecuiPackage.eINSTANCE as any).getEFactoryInstance()
    expect(fabrik.create(fremd)).toBeTruthy()
  })

  it('liest die Zuordnungen aus einer .wsp', async () => {
    fixupEditorConfigPackage(FennecuiPackage.eINSTANCE as any)
    const nsURI = FennecuiPackage.eINSTANCE.getNsURI()
    if (nsURI) EPackageRegistry.INSTANCE.set(nsURI, FennecuiPackage.eINSTANCE as any)

    const rs = new BasicResourceSet()
    const res = new XMIResource(URI.createURI('sim.wsp'))
    res.setResourceSet(rs)
    res.loadFromString(WSP)

    const config = res.getContents().get(0) as any
    const feature = config.eClass().getEStructuralFeature('editorBindings')
    const bindings = [...config.eGet(feature)]

    expect(bindings).toHaveLength(2)
    const lesen = (b: any, name: string) => b.eGet(b.eClass().getEStructuralFeature(name))
    expect(lesen(bindings[0], 'nsURI')).toBe('https://eclipse.org/fennec/persistence/eorm/1.0.0')
    expect(lesen(bindings[0], 'editorId')).toBe('eorm')
    expect(lesen(bindings[1], 'pattern')).toBe('instances/*.xmi')
    expect(lesen(bindings[1], 'editorId')).toBe('instance')
  })
})
