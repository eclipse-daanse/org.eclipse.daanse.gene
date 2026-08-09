/**
 * Workspace-Overlay-Regeln (Plan Abschnitt 9, emf.ts.ui#8):
 * einfaches Regel-Modell fuer die Settings-Page + Serialisierung in das
 * UIModelOverlay-XMI. Die Datei (workspace-overrides.uimodel.xmi) ist die
 * Quelle der Wahrheit — die Page pflegt sie, die UiModelRegistry laedt sie
 * wie jedes andere *.uimodel.xmi des Workspace.
 *
 * v1-Scope (D1): nur Widget-Wahl — eine Regel = TemplateCase mit
 * when-Expression aus featureName und/oder eTypeName.
 */

export const OVERLAY_FILE_NAME = 'workspace-overrides.uimodel.xmi'

export type WidgetKind =
  | 'input' | 'textarea' | 'checkbox' | 'number' | 'date' | 'select' | 'reference'

export const WIDGET_KINDS: Array<{ kind: WidgetKind; label: string; eClass: string }> = [
  { kind: 'input', label: 'Input (einzeilig)', eClass: 'InputWidget' },
  { kind: 'textarea', label: 'Multiline (TextArea)', eClass: 'TextAreaWidget' },
  { kind: 'checkbox', label: 'Checkbox', eClass: 'CheckboxWidget' },
  { kind: 'number', label: 'Number', eClass: 'NumberWidget' },
  { kind: 'date', label: 'Date', eClass: 'DateWidget' },
  { kind: 'select', label: 'Select', eClass: 'SelectWidget' },
  { kind: 'reference', label: 'Reference', eClass: 'ReferenceLinkWidget' }
]

export interface OverlayRule {
  /** Feature-Name (klassenuebergreifend); leer = beliebig */
  featureName?: string
  /** eType-Name (z. B. EString); leer = beliebig */
  eTypeName?: string
  widget: WidgetKind
}

export function isValidRule(rule: OverlayRule): boolean {
  return !!(rule.featureName?.trim() || rule.eTypeName?.trim()) && !!rule.widget
}

/** when-Expression einer Regel (Meta-Ebene, self = EStructuralFeature). */
export function ruleWhenBody(rule: OverlayRule): string {
  const parts: string[] = []
  if (rule.featureName?.trim()) {
    parts.push(`self.getName() === '${rule.featureName.trim()}'`)
  }
  if (rule.eTypeName?.trim()) {
    parts.push(`self.getEType()?.getName() === '${rule.eTypeName.trim()}'`)
  }
  return parts.join(' && ')
}

function xmlEscape(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}

/**
 * Serialisiert Regeln in das UIModelOverlay-XMI (emf.ts.ui#8).
 * Prototypen werden nur fuer tatsaechlich genutzte Widget-Arten emittiert.
 */
export function rulesToOverlayXmi(rules: OverlayRule[], name = 'workspace-overrides'): string {
  const valid = rules.filter(isValidRule)
  const used = [...new Set(valid.map(r => r.widget))]
  const templates = used.map(kind => {
    const def = WIDGET_KINDS.find(w => w.kind === kind)!
    return `  <templates xsi:type="uimodel:${def.eClass}" xmi:id="t-${kind}" name="${kind}"/>`
  }).join('\n')
  const cases = valid.map(rule => {
    const body = xmlEscape(ruleWhenBody(rule))
    return `  <cases widget="#t-${rule.widget}">\n    <when language="JS" body="${body}"/>\n  </cases>`
  }).join('\n')

  return `<?xml version="1.0" encoding="UTF-8"?>
<!-- Von der gene Settings-Page verwaltet (Workspace Settings > Property
     Widgets). Manuelle Aenderungen an den generierten cases werden beim
     naechsten Speichern ueberschrieben. -->
<uimodel:UIModelOverlay
    xmlns:xmi="http://www.omg.org/XMI"
    xmi:version="2.0"
    xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"
    xmlns:uimodel="http://uimodel/1.0"
    name="${xmlEscape(name)}" priority="100">
${templates}
${cases}
</uimodel:UIModelOverlay>
`
}

/**
 * Rekonstruiert Regeln aus einem geladenen UIModelOverlay-EObject.
 * Erkennt nur das eigene Erzeugungs-Muster (getName/getEType-Vergleiche);
 * fremde/manuell editierte Cases liefern null-Eintraege → die Page zeigt
 * sie als "manuell" an und laesst sie beim Speichern unangetastet? Nein —
 * v1: Datei gehoert der Page (Kommentar im XMI), unbekannte Cases werden
 * als nicht-editierbare Rohtexte gelistet und beim Speichern verworfen.
 */
export function parseOverlayRules(overlay: unknown): Array<OverlayRule | { raw: string }> {
  const result: Array<OverlayRule | { raw: string }> = []
  const cases = (overlay as { cases?: Array<{ when?: { body?: string }; widget?: { name?: string } }> })?.cases ?? []
  for (const c of cases) {
    const body = c.when?.body ?? ''
    const widgetName = c.widget?.name as WidgetKind | undefined
    const featureName = /self\.getName\(\) === '([^']*)'/.exec(body)?.[1]
    const eTypeName = /self\.getEType\(\)\?\.getName\(\) === '([^']*)'/.exec(body)?.[1]
    if ((featureName || eTypeName) && widgetName && WIDGET_KINDS.some(w => w.kind === widgetName)) {
      result.push({ featureName, eTypeName, widget: widgetName })
    } else {
      result.push({ raw: body || '(Default-Fall)' })
    }
  }
  return result
}
