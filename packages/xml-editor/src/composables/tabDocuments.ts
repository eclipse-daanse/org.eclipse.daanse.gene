/**
 * One document per editor tab.
 *
 * The editor area shows only the tab in front and rebuilds its component on
 * every switch. Were the text kept in the component, switching back would show
 * the file as read from disk and lose what was typed. So the text lives here,
 * by tab id: the editor writes every change back, and the tab component fetches
 * it again on every mount.
 */

export interface XmlDocument {
  /** The text as it stands in the editor - saved or not */
  content: string
  filePath: string
  /** The workspace entry, for saving back */
  fileEntry?: unknown
  /** Changed since it was read or last saved */
  dirty: boolean
}

const documents = new Map<string, XmlDocument>()

/** Puts a tab's document in place - called by whoever opens the tab. */
export function setTabDocument(tabId: string, document: XmlDocument): void {
  documents.set(tabId, { dirty: false, ...document })
}

/** The document of a tab, or undefined when nobody opened one. */
export function tabDocument(tabId: string): XmlDocument | undefined {
  return documents.get(tabId)
}

/** Forgets a closed tab's document. */
export function closeTabDocument(tabId: string): void {
  documents.delete(tabId)
}

/** Which tabs have a document. */
export function openTabIds(): string[] {
  return [...documents.keys()]
}
