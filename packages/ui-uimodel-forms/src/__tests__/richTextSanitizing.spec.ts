/**
 * XSS-Absicherung der String-Editor-Widgets.
 *
 * Der Wert eines RichTextWidget ist HTML aus einer Modelldatei — Instanzen
 * kommen aus Git, von Atlas-Servern oder aus fremden Workspaces und sind
 * damit nicht vertrauenswuerdig. Ohne Bereinigung wuerde Quill sie in sein
 * contenteditable rendern und aktive Inhalte ausfuehren; dasselbe gilt fuer
 * die per v-html eingesetzte Markdown-Vorschau.
 *
 * Deckt zugleich GHSA-v3m3-f69x-jf25 ab (Quill 2.0.3, HTML-Export ohne
 * Validierung) — versionsunabhaengig, weil der Wert selbst bereinigt wird.
 *
 * Getestet wird die reine Funktion: .vue-Komponenten sind hier nicht
 * unit-testbar, weil `tsm:`-Importe erst zur Laufzeit vom TSM-Plugin
 * aufgeloest werden. Die Verdrahtung in den Komponenten deckt der
 * E2E-Test ab (e2e/uimodel-properties.spec.ts).
 */
import { describe, it, expect } from 'vitest'
import { sanitizeHtml } from '../sanitizeHtml'

const ANGRIFFE: Array<{ name: string; payload: string }> = [
  { name: 'img/onerror', payload: '<img src=x onerror="alert(1)">' },
  { name: 'script-Tag', payload: '<p>ok</p><script>alert(1)</script>' },
  { name: 'javascript:-Link', payload: '<a href="javascript:alert(1)">klick</a>' },
  { name: 'svg/onload', payload: '<svg onload="alert(1)"></svg>' },
  { name: 'iframe', payload: '<iframe src="https://example.invalid"></iframe>' },
  { name: 'body/onload', payload: '<body onload="alert(1)">x</body>' },
  { name: 'style-Ausbruch', payload: '<style>@import "javascript:alert(1)";</style>' },
  { name: 'verschachtelt', payload: '<div><span><img src=x onerror=alert(1)></span></div>' }
]

describe('sanitizeHtml', () => {
  it.each(ANGRIFFE)('entfernt aktive Inhalte: $name', ({ payload }) => {
    const clean = sanitizeHtml(payload)
    expect(clean).not.toMatch(/onerror/i)
    expect(clean).not.toMatch(/onload/i)
    expect(clean).not.toMatch(/javascript:/i)
    expect(clean).not.toMatch(/<script/i)
    expect(clean).not.toMatch(/<iframe/i)
  })

  it('erhaelt harmlose Formatierung', () => {
    const clean = sanitizeHtml(
      '<p><strong>Kafka</strong>, <em>Franz</em></p><ul><li>Prozess</li></ul>'
    )
    expect(clean).toContain('<strong>Kafka</strong>')
    expect(clean).toContain('<em>Franz</em>')
    expect(clean).toContain('<li>Prozess</li>')
  })

  it('erhaelt normale Links und Bilder', () => {
    const clean = sanitizeHtml('<a href="https://example.org">x</a><img src="bild.png">')
    expect(clean).toContain('href="https://example.org"')
    expect(clean).toContain('src="bild.png"')
  })

  it('ist idempotent (bereinigtes HTML bleibt unveraendert)', () => {
    for (const { payload } of ANGRIFFE) {
      const einmal = sanitizeHtml(payload)
      expect(sanitizeHtml(einmal)).toBe(einmal)
    }
  })

  it('behandelt leere Werte', () => {
    expect(sanitizeHtml('')).toBe('')
    expect(sanitizeHtml(null)).toBe('')
    expect(sanitizeHtml(undefined)).toBe('')
  })
})
