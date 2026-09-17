/**
 * Die nsURI eines Schemas aus seinen Metadaten.
 *
 * Die `objectId` eines Schemas ist serverabhängig: manche Server kodieren den
 * nsURI in Base64, der Fennec Atlas vergibt UUIDs. Verlässlich ist nur die
 * Property `nsUri` — und die kommt Java-serialisiert und hexkodiert. Wer ein
 * Schema über seinen nsURI sucht, braucht diese Abbildung.
 */

import type { ObjectMetadata } from './generated/management'

/**
 * `ACED0005 74 <len:2> <UTF-8>` — Stream-Magic, Version, TC_STRING, Länge.
 * Alles andere ist kein serialisierter String.
 */
function decodeJavaSerializedString(hex: string): string | null {
  if (!/^[0-9A-Fa-f]+$/.test(hex) || hex.length < 16) return null
  const bytes = new Uint8Array(hex.length / 2)
  for (let i = 0; i < bytes.length; i++) {
    bytes[i] = parseInt(hex.substr(i * 2, 2), 16)
  }
  if (bytes[0] !== 0xac || bytes[1] !== 0xed || bytes[4] !== 0x74) return null
  const length = (bytes[5] << 8) | bytes[6]
  const value = new TextDecoder().decode(bytes.subarray(7, 7 + length))
  return value || null
}

/**
 * Base64 dekodieren, aber nur wenn das Ergebnis wie ein URI aussieht.
 *
 * Eine UUID übersteht die URL-sichere Rückersetzung ('-' → '+') als gültiges
 * Base64 und zerfällt zu Binärmüll, statt zu werfen — der wanderte früher in
 * Content- und Transition-Anfragen.
 */
export function safeAtob(encoded: string): string {
  if (!encoded) return encoded
  try {
    const b64 = encoded.replace(/-/g, '+').replace(/_/g, '/')
    const decoded = atob(b64)
    if (/^[\x20-\x7E]+$/.test(decoded) && decoded.includes(':')) return decoded
    return encoded
  } catch {
    // Kein gültiges Base64 — unverändert lassen
    return encoded
  }
}

/**
 * nsURI eines Schemas. Reihenfolge: Property `nsUri` (Java-serialisiert oder
 * Klartext), sonst die Base64-objectId älterer Server.
 */
export function schemaNsUri(
  metadata: ObjectMetadata | null | undefined,
  objectId?: string,
): string {
  const raw = metadata?.properties?.find((p) => p.key === 'nsUri')?.value
  if (typeof raw === 'string' && raw) {
    const decoded = decodeJavaSerializedString(raw)
    if (decoded) return decoded
    if (raw.includes(':')) return raw
  }
  return safeAtob(objectId ?? metadata?.objectId ?? '')
}
