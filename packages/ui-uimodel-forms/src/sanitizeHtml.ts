/**
 * HTML-Bereinigung fuer die String-Editor-Widgets.
 *
 * Werte von RichTextWidget (HTML) und die Markdown-Vorschau stammen aus
 * Modelldateien — Instanzen kommen aus Git, von Atlas-Servern oder aus
 * fremden Workspaces und sind damit nicht vertrauenswuerdig. Wird solches
 * HTML gerendert, fuehrt ein `<img src=x onerror=...>` Code aus.
 *
 * Deckt zugleich GHSA-v3m3-f69x-jf25 ab (Quill 2.0.3: HTML-Export ohne
 * Validierung). Bewusst nicht per Downgrade auf Quill 2.0.2 geloest:
 * 2.0.3 ist die neueste Version, und das Grundproblem — ungeprueftes HTML
 * aus Modelldateien — bestuende unabhaengig von der Quill-Version fort.
 *
 * Eigenes Modul, weil `tsm:`-Importe in .vue-Dateien vom TSM-Plugin erst
 * zur Laufzeit aufgeloest werden und Komponenten deshalb nicht sinnvoll
 * unit-testbar sind. Hier ist die Logik eine reine Funktion — pruefbar.
 */
import DOMPurify from 'dompurify'

/**
 * Entfernt aktive Inhalte (Event-Handler, script/iframe, javascript:-URLs)
 * und laesst Formatierung stehen. Rueckgabe ist weiterhin HTML.
 */
export function sanitizeHtml(html: string | null | undefined): string {
  if (!html) return ''
  return DOMPurify.sanitize(html, { USE_PROFILES: { html: true } })
}
