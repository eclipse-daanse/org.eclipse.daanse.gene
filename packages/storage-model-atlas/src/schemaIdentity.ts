/**
 * The nsURI of a schema, from its metadata.
 *
 * A schema's `objectId` is server-dependent: some servers encode the nsURI in
 * base64, the Fennec Atlas hands out UUIDs. Only the `nsUri` property is
 * reliable — and it arrives Java-serialized and hex-encoded. Anyone looking a
 * schema up by its nsURI needs this mapping.
 */

import type { ObjectMetadata } from './generated/management'

/**
 * `ACED0005 74 <len:2> <UTF-8>` — stream magic, version, TC_STRING, length.
 * Anything else is not a serialized string.
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
 * Decode base64, but keep the result only if it reads like a URI.
 *
 * A UUID survives the URL-safe replacement ('-' → '+') as valid base64 and
 * decodes to binary garbage instead of throwing — which used to travel into
 * content and transition requests.
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
 * A schema's nsURI. In order: the `nsUri` property (Java-serialized or plain),
 * otherwise the base64 objectId of older servers.
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
