/**
 * Tiefkopie eines Teilbaums.
 *
 * `EcoreUtil.copy` aus @emfts/core kopiert derzeit nur Attributwerte des
 * übergebenen Objekts — Containment-Kinder bleiben weg (emf.ts#79). Für
 * "Klasse kopieren" braucht es aber die Attribute mit. Diese Umsetzung folgt
 * dem Copier aus Java-EMF:
 *
 * - Containment-Kinder werden mitkopiert
 * - Querverweise, deren Ziel im kopierten Teilbaum liegt, zeigen auf die Kopie
 * - Verweise nach außen bleiben auf das Original gerichtet
 *
 * Der letzte Punkt ist der wichtige: Kopiert man eine EClass, sollen ihre
 * Attribute weiter auf dieselben Datentypen zeigen (EString bleibt EString),
 * nicht auf Kopien davon.
 */
import type { EObject, EReference, EStructuralFeature } from '@emfts/core'

type Raw = EObject & {
  eClass: () => any
  eGet: (f: EStructuralFeature) => unknown
  eSet: (f: EStructuralFeature, v: unknown) => void
}

function isReference(f: EStructuralFeature): f is EReference {
  return typeof (f as EReference).isContainment === 'function'
}

function asArray(value: unknown): unknown[] | null {
  if (value === null || value === undefined) return null
  if (Array.isArray(value)) return value
  const l = value as { size?: () => number; get?: (i: number) => unknown }
  if (typeof l.size === 'function' && typeof l.get === 'function') {
    const out: unknown[] = []
    for (let i = 0; i < l.size(); i++) out.push(l.get(i))
    return out
  }
  return null
}

function replaceAll(target: Raw, feature: EStructuralFeature, values: unknown[]): void {
  const list = target.eGet(feature) as unknown as {
    clear?: () => void
    add?: (v: unknown) => void
  } | null
  if (!list || typeof list.add !== 'function') return
  list.clear?.()
  for (const w of values) list.add(w)
}

/**
 * Kopiert `source` samt Containment-Kindern.
 *
 * @param mapping sammelt Original → Kopie; wird für das Umbiegen der
 *   Querverweise gebraucht und kann von Aufrufern mitgelesen werden.
 */
export function copyDeep(source: EObject, mapping = new Map<EObject, EObject>()): EObject {
  const copy = firstPass(source as Raw, mapping)
  secondPass(mapping)
  return copy
}

/** Mehrere Objekte in einem Zug — Querverweise zwischen ihnen werden umgebogen. */
export function copyAll(sources: EObject[]): EObject[] {
  const mapping = new Map<EObject, EObject>()
  const kopien = sources.map(o => firstPass(o as Raw, mapping))
  secondPass(mapping)
  return kopien
}

/** Erster Durchgang: Struktur und Attribute, Querverweise noch nicht. */
function firstPass(source: Raw, mapping: Map<EObject, EObject>): EObject {
  const eClass = source.eClass()
  const factory = eClass?.getEPackage?.()?.getEFactoryInstance?.()
  if (!factory) throw new Error('Kein EFactory für ' + (eClass?.getName?.() ?? 'unbekannte Klasse'))

  const copy = factory.create(eClass) as Raw
  mapping.set(source, copy)

  for (const feature of eClass.getEAllStructuralFeatures()) {
    if (feature.isDerived?.() || feature.isTransient?.()) continue
    // Nicht änderbare Merkmale (z. B. berechnete) übergehen
    if (typeof feature.isChangeable === 'function' && !feature.isChangeable()) continue

    const value = source.eGet(feature)

    if (isReference(feature) && feature.isContainment()) {
      const children = asArray(value)
      if (children) {
        replaceAll(copy, feature, children.map(k => firstPass(k as Raw, mapping)))
      } else if (value) {
        copy.eSet(feature, firstPass(value as Raw, mapping))
      }
      continue
    }

    if (isReference(feature)) continue   // Querverweise erst im zweiten Durchgang

    // Attribut
    const values = asArray(value)
    if (values) replaceAll(copy, feature, values)
    else if (value !== null && value !== undefined) copy.eSet(feature, value)
  }
  return copy
}

/**
 * Zweiter Durchgang: Querverweise setzen. Zeigt ein Verweis auf etwas, das
 * mitkopiert wurde, bekommt die Kopie die Kopie — sonst das Original.
 */
function secondPass(mapping: Map<EObject, EObject>): void {
  for (const [source, copy] of mapping) {
    const eClass = (source as Raw).eClass()
    for (const feature of eClass.getEAllStructuralFeatures()) {
      if (!isReference(feature) || feature.isContainment()) continue
      if (feature.isDerived?.() || feature.isTransient?.()) continue
      if (typeof feature.isChangeable === 'function' && !feature.isChangeable()) continue
      // eOpposite wird von der Gegenseite mitgesetzt; eigenes Setzen doppelt
      if (typeof feature.getEOpposite === 'function' && feature.getEOpposite()) continue

      const value = (source as Raw).eGet(feature)
      const target = (o: unknown) => mapping.get(o as EObject) ?? o

      const values = asArray(value)
      if (values) replaceAll(copy as Raw, feature, values.map(target))
      else if (value !== null && value !== undefined) (copy as Raw).eSet(feature, target(value))
    }
  }
}
