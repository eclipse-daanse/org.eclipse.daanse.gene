/**
 * Mermaid texts as diagrams (FR-2.5).
 *
 * Mermaid is large, so it loads on first use. It runs with securityLevel
 * "strict" - no scripts, no clicks, HTML labels encoded - which makes the SVG
 * safe to put into the page. The theme follows GenE's dark mode (the
 * `dark-theme` class on <html>); a change of theme re-initializes Mermaid.
 */

type MermaidApi = {
  initialize: (config: Record<string, unknown>) => void
  render: (id: string, text: string) => Promise<{ svg: string }>
}

let loading: Promise<MermaidApi> | null = null
let initializedTheme: string | null = null
let counter = 0

function currentTheme(): string {
  return document.documentElement.classList.contains('dark-theme') ? 'dark' : 'default'
}

async function mermaid(): Promise<MermaidApi> {
  loading ??= import('mermaid').then(m => m.default as unknown as MermaidApi)
  const api = await loading
  const theme = currentTheme()
  if (initializedTheme !== theme) {
    api.initialize({ startOnLoad: false, securityLevel: 'strict', theme })
    initializedTheme = theme
  }
  return api
}

/** The diagram as SVG markup; throws with Mermaid's message when the text has errors */
export async function renderMermaid(text: string): Promise<string> {
  const api = await mermaid()
  const id = `cwm-mermaid-${++counter}`
  try {
    const { svg } = await api.render(id, text)
    return svg
  } catch (e) {
    // A failed render can leave its scratch element in the body
    document.getElementById(`d${id}`)?.remove()
    document.getElementById(id)?.remove()
    throw e
  }
}
