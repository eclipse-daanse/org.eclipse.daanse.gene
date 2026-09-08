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

/**
 * Die Containment-Referenz, in der `element` derzeit steckt.
 *
 * `eContainingFeature()` liefert bei einem Containment-Kind die Referenz des
 * Elterns; bei einem Wurzelobjekt und bei Ecore-Metaobjekten (emf.ts#80) ist
 * sie leer.
 */
export function containingReferenceOf(element: EObject): EReference | null {
  const e = element as unknown as {
    eContainmentFeature?: () => EReference | null
    eContainingFeature?: () => EReference | null
  }
  const ref = e.eContainmentFeature?.() ?? e.eContainingFeature?.() ?? null
  if (!ref) return null
  return typeof (ref as EReference).isContainment === 'function' && ref.isContainment() ? ref : null
}

/**
 * Dieselbe Referenz? Ueber die Identitaet, denn eine geerbte Referenz ist in
 * jeder Unterklasse dasselbe EReference-Objekt. Der Namensvergleich fasst den
 * Fall, dass Quelle und Ziel aus verschiedenen Modellen stammen und die
 * Referenz nur gleich heisst.
 */
function isSameReference(a: EReference, b: EReference): boolean {
  if (a === b) return true
  const nameA = a.getName?.()
  return !!nameA && nameA === b.getName?.()
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

  const refs = containmentReferences(targetClass).filter(ref => {
    if (!referenceAcceptsType(ref, elementClass)) return false
    if (typeof ref.isMany === 'function' && ref.isMany()) return true
    // Einwertige Referenz: nur eine noch leere nimmt etwas auf, eine belegte
    // wird nie überschrieben.
    return countValues(valueOf(target, ref)) === 0
  })

  return withSourceReferenceFirst(element, refs)
}

/**
 * Stellt die Referenz nach vorn, in der das Element bisher steckte.
 *
 * Ohne das entscheidet die Reihenfolge von `getEAllStructuralFeatures()`, und
 * die faengt bei den geerbten Referenzen an. In CWM landete deshalb die Kopie
 * eines als `feature` enthaltenen Attributes in `ownedElement` — beides nimmt
 * ein ModelElement auf, `ownedElement` steht nur weiter vorn (#148). Wer eine
 * Auswahl anbietet, zeigt damit zugleich die naheliegende Wahl oben.
 */
function withSourceReferenceFirst(element: EObject, refs: EReference[]): EReference[] {
  if (refs.length < 2) return refs
  const source = containingReferenceOf(element)
  if (!source) return refs
  const index = refs.findIndex(ref => isSameReference(ref, source))
  if (index <= 0) return refs
  return [refs[index]!, ...refs.slice(0, index), ...refs.slice(index + 1)]
}

/**
 * Zahl der belegten Werte. eGet liefert je nach Feature einen Einzelwert, ein
 * Array oder eine EList — ein blosses `Array.isArray` uebersieht die EList und
 * haelt jede gefuellte Liste faelschlich fuer belegt.
 */
function countValues(value: unknown): number {
  if (value === null || value === undefined) return 0
  if (Array.isArray(value)) return value.length
  const list = value as { size?: () => number }
  if (typeof list.size === 'function') return list.size()
  return 1
}

export interface ContainmentResult {
  ok: boolean
  refs: EReference[]
  /**
   * Die Referenz, in der das Element bisher steckte — sofern das Ziel sie
   * ueberhaupt hat. Wer sie kennt, muss nicht fragen: Das Kind kommt dorthin
   * zurueck, wo es herkam. Fehlt sie und passen mehrere Referenzen, ist die
   * Wahl offen und gehoert dem Nutzer.
   */
  origin?: EReference | null
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
  const source = containingReferenceOf(element)
  const origin = source ? refs.find(ref => isSameReference(ref, source)) ?? null : null
  return { ok: true, refs, origin }
}

/**
 * Der Wert einer Referenz.
 *
 * `eGet` ist bei den mitgelieferten Ecore-Klassen nicht durchgaengig
 * implementiert: Eine EAnnotation liefert fuer `eAnnotations` nichts zurueck,
 * obwohl `getEAnnotations()` die Liste hat. Deshalb hier zusaetzlich der
 * Getter nach EMF-Namenskonvention — ohne ihn hielte das Einfuegen eine leere
 * Referenz fuer belegt oder umgekehrt.
 */
function valueOf(target: EObject, ref: EReference): unknown {
  const direct = target.eGet(ref)
  if (direct !== null && direct !== undefined) return direct
  const name = ref.getName?.()
  if (!name) return null
  const getter = `get${name[0]!.toUpperCase()}${name.slice(1)}`
  const fn = (target as unknown as Record<string, unknown>)[getter]
  return typeof fn === 'function' ? (fn as () => unknown).call(target) : null
}

/** Enthaelt der Wert dieser Referenz das Element? */
function containsValue(value: unknown, element: EObject): boolean {
  if (value === element) return true
  if (Array.isArray(value)) return value.includes(element)
  const list = value as { contains?: (v: unknown) => boolean }
  return typeof list?.contains === 'function' ? list.contains(element) : false
}

/**
 * Fügt `element` in die Containment-Referenz `ref` von `target` ein.
 *
 * Der Erfolg wird nachgelesen: Ohne diese Kontrolle meldete das Einfuegen
 * Erfolg, auch wenn `eSet` auf einer nicht reflektiv bedienbaren Referenz
 * wirkungslos blieb — beim Ausschneiden waere das Element damit verschwunden,
 * denn es ist vorher aus seinem Container geloest.
 */
export function addToContainment(element: EObject, target: EObject, ref: EReference): boolean {
  try {
    const list = valueOf(target, ref) as { add?: (v: unknown) => void; push?: (v: unknown) => void } | null
    if (list && typeof list.add === 'function') list.add(element)
    else if (list && typeof list.push === 'function') list.push(element)
    else target.eSet(ref, element)   // leere einwertige Containment-Referenz
    return containsValue(valueOf(target, ref), element)
  } catch (e) {
    console.warn('[model-editing] Einfügen fehlgeschlagen:', e)
    return false
  }
}
