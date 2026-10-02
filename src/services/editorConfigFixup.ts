/**
 * Füllt die Lücke, die der Codegen derzeit lässt.
 *
 * Das Workspace-Modell kennt seit Kurzem `EditorConfig.editorBindings` — welche
 * Ansicht eine Datei öffnet. Im erzeugten `FennecuiPackage` steht das Feature
 * aber nicht: `emfts-codegen` leert das Generat, sobald die `.genconfig` ihr
 * Paket über den nsURI referenziert (emf.ts.codegen#47). Bis das behoben ist,
 * wird die Klasse hier zur Laufzeit ergänzt.
 *
 * Ohne das Feature verwirft der Loader die Einträge aus der `.wsp` stillschweigend
 * — die Zuordnung wäre nach dem ersten Speichern weg.
 *
 * Dasselbe Vorgehen wie `wizardPackageFixup` im data-atlas-wizard: ergänzen,
 * was der Codegen schuldig bleibt, und zwar genau einmal.
 */
import {
  BasicEClass,
  BasicEAttribute,
  BasicEReference,
  getEcorePackage
} from '@emfts/core'
import type { EPackage } from '@emfts/core'

const BINDING_KLASSE = 'EditorBinding'
const BINDING_FEATURE = 'editorBindings'

let ergaenzt = false

/**
 * Ergänzt `EditorBinding` und `EditorConfig.editorBindings`, falls sie fehlen.
 *
 * @returns true, wenn etwas ergänzt wurde — false, wenn der Codegen es
 *   inzwischen selbst liefert (dann kann diese Datei weg).
 */
export function fixupEditorConfigPackage(fennecui: EPackage): boolean {
  if (ergaenzt) return false

  const klassen = [...fennecui.getEClassifiers()] as any[]
  const editorConfig = klassen.find((c) => c.getName?.() === 'EditorConfig')
  if (!editorConfig) return false

  // Schon da? Dann liefert der Codegen es wieder und hier ist nichts zu tun.
  if (editorConfig.getEStructuralFeature?.(BINDING_FEATURE)) {
    ergaenzt = true
    return false
  }

  const ecore = getEcorePackage() as any
  const eString = ecore.getEString?.() ?? ecore.getEClassifier?.('EString')
  const eBoolean = ecore.getEBoolean?.() ?? ecore.getEClassifier?.('EBoolean')

  const binding = klassen.find((c) => c.getName?.() === BINDING_KLASSE) ?? neueBindingKlasse(eString, eBoolean)
  if (!klassen.includes(binding)) {
    ;(fennecui.getEClassifiers() as any).push(binding)
  }

  const feature = new BasicEReference()
  feature.setName(BINDING_FEATURE)
  feature.setEType(binding as any)
  feature.setContainment(true)
  feature.setUpperBound(-1)
  ;(editorConfig.getEStructuralFeatures() as any).push(feature)

  lehreFactoryDieKlasse(fennecui, binding)

  ergaenzt = true
  return true
}

/**
 * Die erzeugte Factory kennt nur ihre eigenen Klassen und wirft bei allen
 * anderen ("Unknown class"). Fuer die ergaenzte Klasse wird ihr ein Erzeuger
 * beigebracht — ein gewoehnliches dynamisches EObject, mehr braucht ein
 * Eintrag mit vier Attributen nicht.
 */
function lehreFactoryDieKlasse(fennecui: EPackage, binding: any): void {
  const factory = fennecui.getEFactoryInstance?.() as any
  if (!factory) return

  /*
   * `registerCreator` der Basis-Factory hilft hier nicht: Die erzeugte Factory
   * ueberschreibt `create()` mit einer eigenen Fallunterscheidung und wirft im
   * letzten Zweig, ohne die hinterlegten Erzeuger zu fragen. Deshalb wird
   * `create` umhuellt.
   */
  const urspruenglich = factory.create?.bind(factory)
  factory.create = (eClass: any) => {
    if (eClass === binding) {
      // createDynamic gibt es an jeder Factory, die von BasicEFactory erbt
      return factory.createDynamic?.(binding) ?? null
    }
    return urspruenglich?.(eClass)
  }
}

function neueBindingKlasse(eString: any, eBoolean: any): any {
  const klasse = new BasicEClass()
  klasse.setName(BINDING_KLASSE)

  for (const name of ['pattern', 'nsURI', 'editorId']) {
    const attribut = new BasicEAttribute()
    attribut.setName(name)
    attribut.setEType(eString)
    ;(klasse.getEStructuralFeatures() as any).push(attribut)
  }

  const enabled = new BasicEAttribute()
  enabled.setName('enabled')
  enabled.setEType(eBoolean)
  enabled.setDefaultValueLiteral('true')
  ;(klasse.getEStructuralFeatures() as any).push(enabled)

  return klasse
}

/** Nur für Tests: lässt den Fixup erneut laufen. */
export function resetEditorConfigFixup(): void {
  ergaenzt = false
}
