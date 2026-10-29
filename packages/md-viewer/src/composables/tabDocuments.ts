/**
 * One document per viewer tab, by tab id - the tab component is rebuilt on
 * every switch and fetches its document here again.
 */

export interface MdDocument {
  /** The Markdown text as read */
  content: string
  filePath: string
  fileEntry?: unknown
}

const documents = new Map<string, MdDocument>()

/** Puts a tab's document in place - called by whoever opens the tab. */
export function setTabDocument(tabId: string, document: MdDocument): void {
  documents.set(tabId, document)
}

/** The document of a tab, or undefined when nobody opened one. */
export function tabDocument(tabId: string): MdDocument | undefined {
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
