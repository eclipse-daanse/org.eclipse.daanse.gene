/**
 * Unit-Tests fuer die Overlay-Regel-Serialisierung (Plan Abschnitt 9, D3).
 */
import { describe, it, expect } from 'vitest'
import { rulesToOverlayXmi, parseOverlayRules, ruleWhenBody, isValidRule, compatibleWidgets } from '../overlayRules'

describe('overlayRules', () => {
  it('ruleWhenBody kombiniert featureName und eType mit UND', () => {
    expect(ruleWhenBody({ featureName: 'x', eTypeName: 'EString', widget: 'textarea' }))
      .toBe("self.getName() === 'x' && self.getEType()?.getName() === 'EString'")
    expect(ruleWhenBody({ featureName: 'description', widget: 'textarea' }))
      .toBe("self.getName() === 'description'")
    expect(ruleWhenBody({ eTypeName: 'EDate', widget: 'date' }))
      .toBe("self.getEType()?.getName() === 'EDate'")
  })

  it('isValidRule verlangt mindestens ein Kriterium', () => {
    expect(isValidRule({ widget: 'textarea' })).toBe(false)
    expect(isValidRule({ featureName: ' ', widget: 'textarea' })).toBe(false)
    expect(isValidRule({ featureName: 'x', widget: 'textarea' })).toBe(true)
  })

  it('serialisiert Regeln als UIModelOverlay mit referenzierten Prototypen', () => {
    const xmi = rulesToOverlayXmi([
      { featureName: 'x', eTypeName: 'EString', widget: 'textarea' },
      { eTypeName: 'EDate', widget: 'date' },
      { widget: 'input' } // ungueltig → wird verworfen
    ])
    expect(xmi).toContain('<uimodel:UIModelOverlay')
    expect(xmi).toContain('priority="100"')
    // nur genutzte Prototypen
    expect(xmi).toContain('xsi:type="uimodel:TextAreaWidget" xmi:id="t-textarea"')
    expect(xmi).toContain('xsi:type="uimodel:DateWidget" xmi:id="t-date"')
    expect(xmi).not.toContain('t-checkbox')
    // Cases mit escaptem when-Body
    expect(xmi).toContain('<cases widget="#t-textarea">')
    expect(xmi).toContain("self.getName() === 'x'")
    expect(xmi).toContain('&amp;&amp;')
  })

  it('parseOverlayRules rekonstruiert eigene Regeln und markiert fremde als raw', () => {
    const overlay = {
      cases: [
        { when: { body: "self.getName() === 'x' && self.getEType()?.getName() === 'EString'" }, widget: { name: 'textarea' } },
        { when: { body: "self.getEType()?.getName() === 'EDate'" }, widget: { name: 'date' } },
        { when: { body: 'self.derived === true' }, widget: { name: 'input' } }, // fremdes Muster
        { widget: { name: 'input' } } // Default-Fall
      ]
    }
    const parsed = parseOverlayRules(overlay)
    expect(parsed[0]).toEqual({ featureName: 'x', eTypeName: 'EString', widget: 'textarea' })
    expect(parsed[1]).toEqual({ featureName: undefined, eTypeName: 'EDate', widget: 'date' })
    expect(parsed[2]).toEqual({ raw: 'self.derived === true' })
    expect(parsed[3]).toEqual({ raw: '(Default-Fall)' })
  })

  it('compatibleWidgets verhindert tote Kombinationen', () => {
    expect(compatibleWidgets('EString')).toEqual(['input', 'textarea'])
    expect(compatibleWidgets('EDate')).toEqual(['date', 'input'])
    expect(compatibleWidgets('EBoolean')).toEqual(['checkbox', 'input'])
    expect(compatibleWidgets('EInt')).toEqual(['number', 'input'])
    // Multiline fuer EDate ist NICHT waehlbar
    expect(compatibleWidgets('EDate')).not.toContain('textarea')
    // unbekannt/leer: alles erlaubt
    expect(compatibleWidgets(undefined).length).toBe(7)
    expect(compatibleWidgets('Genre')).toContain('select')
  })

  it('Roundtrip: serialisieren → parsen liefert dieselben Regeln', () => {
    const rules = [
      { featureName: 'description', eTypeName: 'EString', widget: 'textarea' as const },
      { eTypeName: 'EBoolean', widget: 'checkbox' as const }
    ]
    const xmi = rulesToOverlayXmi(rules)
    // Pseudo-Parse ueber Regex-freundliche Struktur (ohne Metamodell):
    // when-Bodies + Widget-Namen aus dem XMI extrahieren
    const caseBlocks = [...xmi.matchAll(/<cases widget="#t-([a-z]+)">\s*<when language="JS" body="([^"]+)"\/>/g)]
    const parsed = parseOverlayRules({
      cases: caseBlocks.map(m => ({
        widget: { name: m[1] },
        when: { body: m[2].replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"') }
      }))
    })
    expect(parsed).toEqual(rules.map(r => ({ featureName: r.featureName, eTypeName: r.eTypeName, widget: r.widget })))
  })
})
