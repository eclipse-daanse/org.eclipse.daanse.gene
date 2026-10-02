/**
 * Welche Ansichten eine Datei öffnen können.
 *
 * Eine Datei hat nicht *einen* Editor. Ein eorm-Mapping lässt sich als
 * eorm-Ansicht öffnen oder als gewöhnlicher Instanzbaum; eine `.ecore` als
 * Metamodell-Editor oder als rohes XMI. Welcher es wird, entscheidet sich an
 * drei Dingen, in dieser Reihenfolge:
 *
 *  1. einer Regel aus dem Workspace — der Nutzer hat es dort festgelegt,
 *  2. dem Metamodell der Wurzel (nsURI) — das ist die genauere Aussage,
 *  3. der Dateiendung, und unter gleichen Kandidaten der Rangzahl.
 *
 * Wer eine andere Ansicht will, nimmt „Öffnen mit"; die Wahl lässt sich als
 * Regel in den Workspace schreiben.
 */
import { ref, type Component } from 'tsm:vue'

export interface EditorArt {
  /** Kurzname, z. B. 'metamodel', 'instance', 'eorm' */
  id: string
  /** Was im Menü „Öffnen mit" steht */
  name: string
  icon?: string
  /** Endungen, mit Punkt: ['.ecore'] */
  extensions: string[]
  /**
   * Metamodelle, für die diese Ansicht gedacht ist. Trifft eines zu, geht sie
   * einer Ansicht vor, die nur die Endung kennt.
   */
  nsURIs?: string[]
  /** Unter gleich genauen Kandidaten entscheidet die höhere Zahl. Vorgabe 0. */
  priority?: number
  /** Die Ansicht selbst — der Inhalt des Tabs. */
  component?: Component
  /** Öffnet die Datei in dieser Ansicht. */
  oeffnen?: (datei: { name: string; path: string }, inhalt: string) => void | Promise<void>
  /**
   * Die Perspektive, die diese Ansicht ablöst.
   *
   * Sie gehört damit nicht mehr in die Aktivitätsleiste: Links stehen die
   * Navigatoren — Explorer, Model Atlas —, und was eine Datei bearbeitet,
   * ergibt sich aus dem Tab, der vorn liegt.
   */
  ersetztPerspektive?: string
}

/** Eine Zuordnung, wie sie im Workspace steht. */
export interface EditorZuordnung {
  /** Pfadmuster, z. B. 'instances/*.xmi' — oder leer, wenn nsURI gilt */
  pattern?: string
  /** Metamodell der Wurzel */
  nsURI?: string
  /** Die Ansicht, die dann genommen wird */
  editorId: string
}

const arten = ref<EditorArt[]>([])
let zuordnungen: EditorZuordnung[] = []

export function registerEditorArt(art: EditorArt): void {
  const ohneAlte = arten.value.filter((a: EditorArt) => a.id !== art.id)
  arten.value = [...ohneAlte, art]
}

export function unregisterEditorArt(id: string): boolean {
  const vorher = arten.value.length
  arten.value = arten.value.filter((a: EditorArt) => a.id !== id)
  return arten.value.length < vorher
}

export function alleEditorArten(): EditorArt[] {
  return arten.value
}

/** Perspektiven, die von einer Ansicht abgeloest sind — sie gehoeren nicht in die Leiste. */
export function abgeloestePerspektiven(): string[] {
  return arten.value
    .map((a: EditorArt) => a.ersetztPerspektive)
    .filter((id: string | undefined): id is string => !!id)
}

/** Die Zuordnungen aus dem Workspace; ersetzt die bisherigen. */
export function setEditorZuordnungen(neue: EditorZuordnung[]): void {
  zuordnungen = [...neue]
}

export function alleEditorZuordnungen(): EditorZuordnung[] {
  return [...zuordnungen]
}

/** Die Endung eines Pfades, klein und mit Punkt. */
export function endungVon(pfad: string): string {
  const name = pfad.split('/').pop() ?? pfad
  const punkt = name.lastIndexOf('.')
  return punkt >= 0 ? name.slice(punkt).toLowerCase() : ''
}

/**
 * Das Metamodell der Wurzel, aus dem Dateianfang gelesen.
 *
 * Reicht für die Entscheidung und kostet kein Parsen: Im XMI steht der nsURI
 * als Namensraum des Wurzelelements, in einer .ecore als dessen `nsURI`.
 */
export function wurzelNsUri(inhalt: string): string | null {
  const anfang = inhalt.slice(0, 4000)

  // .ecore: <ecore:EPackage … nsURI="…">
  const ecore = /\bnsURI="([^"]+)"/.exec(anfang)
  if (ecore && /<ecore:EPackage/.test(anfang)) return ecore[1] ?? null

  // XMI: das Wurzelelement traegt ein Praefix, dessen xmlns die Antwort ist
  const wurzel = /<([A-Za-z_][\w.-]*):([A-Za-z_][\w.-]*)[\s>]/.exec(
    anfang.replace(/<\?xml[^>]*\?>/, '')
  )
  const praefix = wurzel?.[1]
  if (praefix) {
    const raum = new RegExp(`xmlns:${praefix}="([^"]+)"`).exec(anfang)
    if (raum) return raum[1] ?? null
  }
  return null
}

function passtMuster(pattern: string, pfad: string): boolean {
  // Nur '*' und '?' — mehr braucht ein Pfadmuster hier nicht
  const regex = new RegExp(
    '^' + pattern.split('*').map((t: string) => t.split('?').map(maskieren).join('.')).join('.*') + '$'
  )
  return regex.test(pfad)
}

function maskieren(text: string): string {
  return text.replace(/[.+^${}()|[\]\\]/g, '\\$&')
}

/**
 * Die Ansichten, die diese Datei öffnen können — die beste zuerst.
 *
 * Ohne Inhalt wird nur nach der Endung entschieden; mit Inhalt zählt der nsURI
 * der Wurzel mehr, weil er die genauere Aussage ist.
 */
export function kandidatenFuer(pfad: string, inhalt?: string): EditorArt[] {
  const endung = endungVon(pfad)
  const nsURI = inhalt ? wurzelNsUri(inhalt) : null

  const passend = arten.value.filter((art: EditorArt) => {
    const ueberNsUri = !!nsURI && !!art.nsURIs?.includes(nsURI)
    const ueberEndung = art.extensions.some((e: string) => e.toLowerCase() === endung)
    return ueberNsUri || ueberEndung
  })

  return passend.sort((a: EditorArt, b: EditorArt) => rang(b, endung, nsURI) - rang(a, endung, nsURI))
}

function rang(art: EditorArt, endung: string, nsURI: string | null): number {
  // Ein Treffer auf das Metamodell wiegt schwerer als einer auf die Endung
  const nsTreffer = nsURI && art.nsURIs?.includes(nsURI) ? 1000 : 0
  const endungsTreffer = art.extensions.some((e: string) => e.toLowerCase() === endung) ? 100 : 0
  return nsTreffer + endungsTreffer + (art.priority ?? 0)
}

/**
 * Die Ansicht, mit der die Datei geöffnet wird.
 *
 * Eine Regel aus dem Workspace geht allem vor — dort hat jemand entschieden.
 * Eine Regel auf den Pfad ist dabei genauer als eine auf das Metamodell.
 */
export function editorFuer(pfad: string, inhalt?: string): EditorArt | null {
  const nsURI = inhalt ? wurzelNsUri(inhalt) : null

  const ueberPfad = zuordnungen.find((z: EditorZuordnung) => z.pattern && passtMuster(z.pattern, pfad))
  const ueberNsUri = nsURI ? zuordnungen.find((z: EditorZuordnung) => !z.pattern && z.nsURI === nsURI) : undefined
  const regel = ueberPfad ?? ueberNsUri
  if (regel) {
    const gewuenscht = arten.value.find((a: EditorArt) => a.id === regel.editorId)
    if (gewuenscht) return gewuenscht
  }

  return kandidatenFuer(pfad, inhalt)[0] ?? null
}
