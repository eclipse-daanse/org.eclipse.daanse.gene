/**
 * Wohin darf ein Element? Containment-Prüfung für Bäume.
 *
 * Dieselbe Frage stellt sich beim Verschieben (Drag & Drop) wie beim Einfügen
 * aus der Zwischenablage, und in beiden Bäumen — Instanzen wie Metamodell.
 * Deshalb liegt sie hier und nicht in einem der Bäume.
 */
import type { EClass, EObject, EReference } from '@emfts/core'

/** Alle Containment-Referenzen einer Klasse, geerbte eingeschlossen. */
export function containmentReferences(eClass: EClass): EReference[] {
  const features = eClass.getEAllStructuralFeatures()
  return [...features].filter(
    (f: unknown) => !!f && typeof (f as EReference).isContainment === 'function' && (f as EReference).isContainment()
  ) as EReference[]
}

/** Nimmt diese Referenz einen Wert dieser Klasse auf (Untertypen eingeschlossen)? */
export function referenceAcceptsType(ref: EReference, eClass: EClass): boolean {
  const refType = typeof ref.getEReferenceType === 'function'
    ? ref.getEReferenceType()
    : (ref as unknown as { getEType?: () => EClass }).getEType?.()
  if (!refType || !eClass) return false
  if (refType === eClass) return true
  return typeof refType.isSuperTypeOf === 'function' && refType.isSuperTypeOf(eClass)
}

/**
 * Das enthaltende Objekt.
 *
 * `eContainer()` ist bei Ecore-Modellen nicht durchgaengig gesetzt: Ein
 * EAttribute kennt seine EClass, eine EClass aber nicht ihr EPackage — auch
 * programmatisch aufgebaut nicht (emf.ts#80). Deshalb hier zusaetzlich die
 * Ecore-eigenen Wege, sonst bricht jeder Aufstieg bei den Klassifizierern ab
 * und die Zyklus-Pruefung waere wirkungslos.
 */
export function elternteil(obj: EObject): EObject | null {
  const o = obj as unknown as {
    eContainer?: () => EObject | null
    getEContainingClass?: () => EObject | null
    getEPackage?: () => EObject | null
    getESuperPackage?: () => EObject | null
  }
  return o.eContainer?.()
    ?? o.getEContainingClass?.()      // EStructuralFeature, EOperation
    ?? o.getEPackage?.()              // EClassifier
    ?? o.getESuperPackage?.()         // EPackage
    ?? null
}

/** Läge `moeglicherNachfahre` innerhalb des Teilbaums von `vorfahre`? */
export function istNachfahre(vorfahre: EObject, moeglicherNachfahre: EObject): boolean {
  let lauf: EObject | null = moeglicherNachfahre
  // Tiefenbegrenzung: Ein Modell mit einem Zyklus in den Containern wuerde
  // hier sonst haengen.
  for (let tiefe = 0; lauf && tiefe < 1000; tiefe++) {
    if (lauf === vorfahre) return true
    lauf = elternteil(lauf)
  }
  return false
}

export interface AufnahmeOptionen {
  /**
   * Beim Verschieben darf das Ziel nicht im eigenen Teilbaum liegen, sonst
   * hinge der Baum in sich selbst. Beim Einfügen einer Kopie entfällt das:
   * Die Kopie ist ein neues Objekt und in keinem Teilbaum enthalten.
   */
  zyklusPruefen?: boolean
}

/**
 * Containment-Referenzen von `ziel`, die `element` aufnehmen können:
 * typverträglich, und entweder mehrwertig oder eine noch leere einwertige
 * Referenz — eine belegte einwertige wird nie überschrieben.
 */
export function aufnehmendeReferenzen(
  element: EObject,
  ziel: EObject,
  optionen: AufnahmeOptionen = {}
): EReference[] {
  const { zyklusPruefen = true } = optionen
  if (!element || !ziel || element === ziel) return []
  if (zyklusPruefen && istNachfahre(element, ziel)) return []

  const zielKlasse = ziel.eClass?.()
  const elementKlasse = element.eClass?.()
  if (!zielKlasse || !elementKlasse) return []

  return containmentReferences(zielKlasse).filter(ref => {
    if (!referenceAcceptsType(ref, elementKlasse)) return false
    if (typeof ref.isMany === 'function' && ref.isMany()) return true
    const belegt = ziel.eGet(ref)
    return belegt === null || belegt === undefined ||
      (Array.isArray(belegt) && belegt.length === 0)
  })
}

export interface AufnahmeErgebnis {
  ok: boolean
  refs: EReference[]
  grund?: string
}

/** Wie `aufnehmendeReferenzen`, aber mit Begründung für die Oberfläche. */
export function pruefeAufnahme(
  element: EObject,
  ziel: EObject,
  optionen: AufnahmeOptionen = {}
): AufnahmeErgebnis {
  const refs = aufnehmendeReferenzen(element, ziel, optionen)
  if (refs.length === 0) {
    return { ok: false, refs, grund: 'Kann hier nicht eingefügt werden (kein passender Container).' }
  }
  return { ok: true, refs }
}

/** Fügt `element` in die Containment-Referenz `ref` von `ziel` ein. */
export function fuegeEin(element: EObject, ziel: EObject, ref: EReference): boolean {
  try {
    const liste = ziel.eGet(ref) as unknown as { add?: (v: unknown) => void; push?: (v: unknown) => void } | null
    if (liste && typeof liste.add === 'function') liste.add(element)
    else if (liste && typeof liste.push === 'function') liste.push(element)
    else ziel.eSet(ref, element)   // leere einwertige Containment-Referenz
    return true
  } catch (e) {
    console.warn('[model-editing] Einfügen fehlgeschlagen:', e)
    return false
  }
}
