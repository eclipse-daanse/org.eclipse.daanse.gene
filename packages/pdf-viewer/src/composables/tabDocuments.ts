/**
 * One document per viewer tab, by tab id - the tab component is rebuilt on
 * every switch and fetches its document here again.
 */

export interface PdfDocument {
  filePath: string
  /** The workspace entry; a local one carries the browser's file handle */
  fileEntry?: unknown
}

const documents = new Map<string, PdfDocument>()

/** Puts a tab's document in place - called by whoever opens the tab. */
export function setTabDocument(tabId: string, document: PdfDocument): void {
  documents.set(tabId, document)
}

/** The document of a tab, or undefined when nobody opened one. */
export function tabDocument(tabId: string): PdfDocument | undefined {
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
