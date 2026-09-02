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

type Roh = EObject & {
  eClass: () => any
  eGet: (f: EStructuralFeature) => unknown
  eSet: (f: EStructuralFeature, v: unknown) => void
}

function istReferenz(f: EStructuralFeature): f is EReference {
  return typeof (f as EReference).isContainment === 'function'
}

function alsListe(wert: unknown): unknown[] | null {
  if (wert === null || wert === undefined) return null
  if (Array.isArray(wert)) return wert
  const l = wert as { size?: () => number; get?: (i: number) => unknown }
  if (typeof l.size === 'function' && typeof l.get === 'function') {
    const out: unknown[] = []
    for (let i = 0; i < l.size(); i++) out.push(l.get(i))
    return out
  }
  return null
}

function leereUndFuelle(ziel: Roh, feature: EStructuralFeature, werte: unknown[]): void {
  const liste = ziel.eGet(feature) as unknown as {
    clear?: () => void
    add?: (v: unknown) => void
  } | null
  if (!liste || typeof liste.add !== 'function') return
  liste.clear?.()
  for (const w of werte) liste.add(w)
}

/**
 * Kopiert `original` samt Containment-Kindern.
 *
 * @param zuordnung sammelt Original → Kopie; wird für das Umbiegen der
 *   Querverweise gebraucht und kann von Aufrufern mitgelesen werden.
 */
export function kopiereTief(original: EObject, zuordnung = new Map<EObject, EObject>()): EObject {
  const kopie = ersteDurchgang(original as Roh, zuordnung)
  zweiterDurchgang(zuordnung)
  return kopie
}

/** Mehrere Objekte in einem Zug — Querverweise zwischen ihnen werden umgebogen. */
export function kopiereAlle(originale: EObject[]): EObject[] {
  const zuordnung = new Map<EObject, EObject>()
  const kopien = originale.map(o => ersteDurchgang(o as Roh, zuordnung))
  zweiterDurchgang(zuordnung)
  return kopien
}

/** Erster Durchgang: Struktur und Attribute, Querverweise noch nicht. */
function ersteDurchgang(original: Roh, zuordnung: Map<EObject, EObject>): EObject {
  const eClass = original.eClass()
  const factory = eClass?.getEPackage?.()?.getEFactoryInstance?.()
  if (!factory) throw new Error('Kein EFactory für ' + (eClass?.getName?.() ?? 'unbekannte Klasse'))

  const kopie = factory.create(eClass) as Roh
  zuordnung.set(original, kopie)

  for (const feature of eClass.getEAllStructuralFeatures()) {
    if (feature.isDerived?.() || feature.isTransient?.()) continue
    // Nicht änderbare Merkmale (z. B. berechnete) übergehen
    if (typeof feature.isChangeable === 'function' && !feature.isChangeable()) continue

    const wert = original.eGet(feature)

    if (istReferenz(feature) && feature.isContainment()) {
      const kinder = alsListe(wert)
      if (kinder) {
        leereUndFuelle(kopie, feature, kinder.map(k => ersteDurchgang(k as Roh, zuordnung)))
      } else if (wert) {
        kopie.eSet(feature, ersteDurchgang(wert as Roh, zuordnung))
      }
      continue
    }

    if (istReferenz(feature)) continue   // Querverweise erst im zweiten Durchgang

    // Attribut
    const werte = alsListe(wert)
    if (werte) leereUndFuelle(kopie, feature, werte)
    else if (wert !== null && wert !== undefined) kopie.eSet(feature, wert)
  }
  return kopie
}

/**
 * Zweiter Durchgang: Querverweise setzen. Zeigt ein Verweis auf etwas, das
 * mitkopiert wurde, bekommt die Kopie die Kopie — sonst das Original.
 */
function zweiterDurchgang(zuordnung: Map<EObject, EObject>): void {
  for (const [original, kopie] of zuordnung) {
    const eClass = (original as Roh).eClass()
    for (const feature of eClass.getEAllStructuralFeatures()) {
      if (!istReferenz(feature) || feature.isContainment()) continue
      if (feature.isDerived?.() || feature.isTransient?.()) continue
      if (typeof feature.isChangeable === 'function' && !feature.isChangeable()) continue
      // eOpposite wird von der Gegenseite mitgesetzt; eigenes Setzen doppelt
      if (typeof feature.getEOpposite === 'function' && feature.getEOpposite()) continue

      const wert = (original as Roh).eGet(feature)
      const ziel = (o: unknown) => zuordnung.get(o as EObject) ?? o

      const werte = alsListe(wert)
      if (werte) leereUndFuelle(kopie as Roh, feature, werte.map(ziel))
      else if (wert !== null && wert !== undefined) (kopie as Roh).eSet(feature, ziel(wert))
    }
  }
}
