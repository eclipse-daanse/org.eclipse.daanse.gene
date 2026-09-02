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
export function parentOf(obj: EObject): EObject | null {
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

/** Läge `candidate` innerhalb des Teilbaums von `ancestor`? */
export function isDescendant(ancestor: EObject, candidate: EObject): boolean {
  let current: EObject | null = candidate
  // Tiefenbegrenzung: Ein Modell mit einem Zyklus in den Containern wuerde
  // hier sonst haengen.
  for (let depth = 0; current && depth < 1000; depth++) {
    if (current === ancestor) return true
    current = parentOf(current)
  }
  return false
}

export interface ContainmentOptions {
  /**
   * Beim Verschieben darf das Ziel nicht im eigenen Teilbaum liegen, sonst
   * hinge der Baum in sich selbst. Beim Einfügen einer Kopie entfällt das:
   * Die Kopie ist ein neues Objekt und in keinem Teilbaum enthalten.
   */
  checkCycle?: boolean
}

/**
 * Containment-Referenzen von `target`, die `element` aufnehmen können:
 * typverträglich, und entweder mehrwertig oder eine noch leere einwertige
 * Referenz — eine belegte einwertige wird nie überschrieben.
 */
export function acceptingReferences(
  element: EObject,
  target: EObject,
  optionen: ContainmentOptions = {}
): EReference[] {
  const { checkCycle = true } = optionen
  if (!element || !target || element === target) return []
  if (checkCycle && isDescendant(element, target)) return []

  const targetClass = target.eClass?.()
  const elementClass = element.eClass?.()
  if (!targetClass || !elementClass) return []

  return containmentReferences(targetClass).filter(ref => {
    if (!referenceAcceptsType(ref, elementClass)) return false
    if (typeof ref.isMany === 'function' && ref.isMany()) return true
    const occupied = target.eGet(ref)
    return occupied === null || occupied === undefined ||
      (Array.isArray(occupied) && occupied.length === 0)
  })
}

export interface ContainmentResult {
  ok: boolean
  refs: EReference[]
  reason?: string
}

/** Wie `acceptingReferences`, aber mit Begründung für die Oberfläche. */
export function checkContainment(
  element: EObject,
  target: EObject,
  optionen: ContainmentOptions = {}
): ContainmentResult {
  const refs = acceptingReferences(element, target, optionen)
  if (refs.length === 0) {
    return { ok: false, refs, reason: 'Kann hier nicht eingefügt werden (kein passender Container).' }
  }
  return { ok: true, refs }
}

/** Fügt `element` in die Containment-Referenz `ref` von `target` ein. */
export function addToContainment(element: EObject, target: EObject, ref: EReference): boolean {
  try {
    const list = target.eGet(ref) as unknown as { add?: (v: unknown) => void; push?: (v: unknown) => void } | null
    if (list && typeof list.add === 'function') list.add(element)
    else if (list && typeof list.push === 'function') list.push(element)
    else target.eSet(ref, element)   // leere einwertige Containment-Referenz
    return true
  } catch (e) {
    console.warn('[model-editing] Einfügen fehlgeschlagen:', e)
    return false
  }
}
