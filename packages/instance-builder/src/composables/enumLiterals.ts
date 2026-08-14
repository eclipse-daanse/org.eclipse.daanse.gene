/**
 * Enum-Literal-Zugriff fuer Formularfelder
 *
 * Enum-Attributwerte sind EEnumLiteral-Objekte: die XMI-Schicht loest sie beim
 * Laden dorthin auf und serialisiert sie ueber getLiteral(). Die UI braucht
 * daraus drei Dinge — ein Label, einen strikt vergleichbaren optionValue und
 * den Weg zurueck vom ausgewaehlten String zum Literal-Objekt.
 *
 * Die Getter werden defensiv gelesen, weil Literale je nach Herkunft typisiert
 * (BasicEEnumLiteral) oder dynamisch (DynamicEObject, nur eGet) vorliegen.
 */

/** Ein Enum-Literal in der Form, die Dropdown und Wertabgleich brauchen. */
export interface EnumLiteralInfo {
  /** Das EEnumLiteral selbst — genau das landet im Modell */
  literal: any
  name: string
  /** Serialisierungsform; faellt auf den Namen zurueck wie EEnumLiteral.getLiteral() */
  literalString: string
  ordinal: number | null
}

/**
 * Ein Feature eines Literals lesen — typisierte Literale ueber den Getter,
 * DynamicEObjects ueber eGet.
 */
export function readLiteralFeature(literal: any, getter: string, featureName: string): any {
  if (typeof literal?.[getter] === 'function') {
    const value = literal[getter]()
    if (value !== null && value !== undefined) return value
  }
  try {
    const feature = literal?.eClass?.()?.getEStructuralFeature?.(featureName)
    if (feature) return literal.eGet?.(feature)
  } catch {
    // Ignore — Literal liefert dieses Feature nicht
  }
  return undefined
}

/** Literale eines EEnum einlesen — getELiterals() bzw. eGet fuer DynamicEObjects */
export function readEnumLiterals(eType: any): any[] {
  if (!eType) return []
  try {
    if (typeof eType.getELiterals === 'function') {
      const literals = eType.getELiterals()
      return [...(literals?.data ?? literals ?? [])]
    }
    const feature = eType.eClass?.()?.getEStructuralFeature?.('eLiterals')
    if (feature) {
      const literals = eType.eGet?.(feature)
      return [...(literals?.data ?? literals ?? [])]
    }
  } catch (e) {
    console.warn('[enumLiterals] Error reading enum literals:', e)
  }
  return []
}

/** Die Literale eines EEnum als EnumLiteralInfo lesen */
export function enumLiteralInfos(eType: any): EnumLiteralInfo[] {
  return readEnumLiterals(eType)
    .map((literal): EnumLiteralInfo | null => {
      const name = readLiteralFeature(literal, 'getName', 'name')
      if (!name) return null
      const literalString = readLiteralFeature(literal, 'getLiteral', 'literal') ?? name
      const ordinal = readLiteralFeature(literal, 'getValue', 'value')
      return {
        literal,
        name: String(name),
        literalString: String(literalString),
        ordinal: typeof ordinal === 'number' ? ordinal : null
      }
    })
    .filter((info): info is EnumLiteralInfo => info !== null)
}

/**
 * Einen beliebigen Wert auf sein Literal abbilden.
 *
 * Regulaer ist der Wert ein EEnumLiteral. String, Name und Ordinalzahl bleiben
 * als Netz: In-Memory erzeugte Modelle koennen den Rohwert tragen, und Dateien,
 * die frueher mit Ordinalzahlen geschrieben wurden, sollen weiter bedienbar sein.
 */
export function resolveEnumLiteral(infos: EnumLiteralInfo[], value: any): EnumLiteralInfo | null {
  if (value === null || value === undefined || value === '') return null

  if (typeof value === 'object') {
    const byIdentity = infos.find(info => info.literal === value)
    if (byIdentity) return byIdentity
    const name = readLiteralFeature(value, 'getName', 'name')
    return name ? infos.find(info => info.name === String(name)) ?? null : null
  }

  if (typeof value === 'number') {
    return infos.find(info => info.ordinal === value) ?? null
  }

  const text = String(value).trim()
  const byLiteral = infos.find(info => info.literalString === text)
  if (byLiteral) return byLiteral
  const byName = infos.find(info => info.name === text)
  if (byName) return byName
  if (/^-?\d+$/.test(text)) {
    return infos.find(info => info.ordinal === Number(text)) ?? null
  }
  return null
}
