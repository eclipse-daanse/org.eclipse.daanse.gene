/**
 * Stage-Flags des Atlas (#136).
 *
 * Der Server meldet `writable` und `final` als Strings ('true'/'false'), nicht
 * als Booleans. Ein `!!wert` liest daraus 'false' als wahr, ein `wert !== false`
 * ebenso — beides stand vorher im Code. Zusaetzlich wurde `final` aus dem
 * Icon-Namen des Baumknotens zurueckgerechnet, womit eine Kosmetik-Entscheidung
 * die Stage-Auswahl im Upload-Dialog verstellt haette.
 */
import { describe, it, expect } from 'vitest'
import { istWahr } from '../composables/useAtlasBrowser'

describe('istWahr (#136)', () => {
  it('liest die String-Flags des Servers richtig', () => {
    expect(istWahr('true', false)).toBe(true)
    expect(istWahr('false', true)).toBe(false)
  })

  it('nimmt auch echte Booleans', () => {
    expect(istWahr(true, false)).toBe(true)
    expect(istWahr(false, true)).toBe(false)
  })

  it('faellt auf den Vorgabewert zurueck, wenn das Flag fehlt', () => {
    // Der Atlas laesst `final` weg, wo es nicht zutrifft
    expect(istWahr(undefined, false)).toBe(false)
    expect(istWahr(null, true)).toBe(true)
  })

  it('liest Grossschreibung ebenso', () => {
    expect(istWahr('TRUE', false)).toBe(true)
    expect(istWahr('False', true)).toBe(false)
  })

  it('behandelt den frueheren Fehlerfall korrekt', () => {
    // Das alte `!!wert` bzw. `wert !== false` las 'false' als wahr
    expect(!!'false').toBe(true)
    expect(('false' as unknown) !== false).toBe(true)
    // ... die Hilfsfunktion nicht
    expect(istWahr('false', true)).toBe(false)
  })
})
