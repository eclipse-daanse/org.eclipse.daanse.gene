/**
 * Verschieben innerhalb eines Baums.
 *
 * Zwei Fälle, die die Oberfläche unterscheidet: ein Element *in* ein anderes
 * hinein (es wird dessen Kind) oder *neben* ein anderes (Reihenfolge ändern,
 * gegebenenfalls in einen anderen Container). Beides braucht dieselbe
 * Containment-Prüfung wie das Einfügen aus der Zwischenablage.
 */
import type { EObject, EReference } from '@emfts/core'
import { acceptingReferences, addToContainment, parentOf } from './containment'

interface EditableList {
  add?: (v: unknown) => boolean
  remove?: (v: unknown) => boolean
  indexOf?: (v: unknown) => number
  move?: (toIndex: number, fromIndex: number) => unknown
  size?: () => number
}

function asEditableList(value: unknown): EditableList | null {
  if (!value || typeof value !== 'object') return null
  const l = value as EditableList
  return typeof l.add === 'function' && typeof l.indexOf === 'function' ? l : null
}

/** Löst ein Element aus seinem Container. */
export function detach(element: EObject): boolean {
  const parent = parentOf(element)
  if (!parent) return false
  const parentClass = parent.eClass?.()
  if (!parentClass) return false
  for (const feature of parentClass.getEAllStructuralFeatures()) {
    const ref = feature as unknown as { isContainment?: () => boolean }
    if (typeof ref.isContainment !== 'function' || !ref.isContainment()) continue
    const list = asEditableList(parent.eGet(feature))
    if (list?.remove?.(element)) return true
  }
  return false
}

/** Hängt `element` als Kind unter `target` in die Referenz `ref`. */
export function moveInto(element: EObject, target: EObject, ref: EReference): boolean {
  // Gegen den aktuellen Modellstand erneut prüfen: Zwischen Prüfung und
  // Ausführung kann sich das Modell geändert haben (anderer Editor, Undo).
  if (!acceptingReferences(element, target).some(r => r === ref)) return false
  const vorher = parentOf(element)
  if (vorher && !detach(element)) return false
  if (addToContainment(element, target, ref)) return true
  // Zurückhängen, damit ein gescheiterter Zug nichts verliert
  if (vorher) {
    const zurueck = acceptingReferences(element, vorher, { checkCycle: false })[0]
    if (zurueck) addToContainment(element, vorher, zurueck)
  }
  return false
}

/**
 * Setzt `element` neben `target` — davor oder dahinter. Liegen beide schon in
 * derselben Liste, wird nur umsortiert; sonst wechselt das Element den
 * Container.
 */
export function moveBeside(element: EObject, target: EObject, after = false): boolean {
  const parent = parentOf(target)
  if (!parent || element === target) return false

  const refs = acceptingReferences(element, parent)
  // Die Referenz nehmen, in der das Ziel tatsächlich liegt — bei mehreren
  // passenden ist das die einzige, die "daneben" bedeutet.
  const ref = refs.find(r => {
    const list = asEditableList(parent.eGet(r))
    return !!list && (list.indexOf?.(target) ?? -1) >= 0
  }) ?? refs[0]
  if (!ref) return false

  const list = asEditableList(parent.eGet(ref))
  if (!list) return false

  const schonDrin = (list.indexOf?.(element) ?? -1) >= 0
  if (!schonDrin) {
    if (parentOf(element) && !detach(element)) return false
    if (!list.add?.(element)) return false
  }

  const von = list.indexOf?.(element) ?? -1
  let nach = list.indexOf?.(target) ?? -1
  if (von < 0 || nach < 0) return false
  // Beim Einfügen dahinter zählt die Position nach dem Herausnehmen: Liegt das
  // Element vor dem Ziel, rutscht das Ziel um eins nach vorn.
  if (after && von > nach) nach += 1
  if (!after && von < nach) nach -= 1
  if (von !== nach) list.move?.(nach, von)
  return true
}

export interface MoveCheck {
  ok: boolean
  reason?: string
}

/** Darf `element` neben `target`? */
export function canMoveBeside(element: EObject, target: EObject): MoveCheck {
  if (element === target) return { ok: false, reason: 'Ein Element kann nicht neben sich selbst.' }
  const parent = parentOf(target)
  if (!parent) return { ok: false, reason: 'Das Ziel hat keinen Container.' }
  if (acceptingReferences(element, parent).length === 0) {
    return { ok: false, reason: 'Passt nicht in denselben Container wie das Ziel.' }
  }
  return { ok: true }
}
