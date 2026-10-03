/**
 * One document per editor tab.
 *
 * The editor area shows only the tab in front and rebuilds its component on
 * every switch. Were the file kept in the component, switching back would show
 * nothing. So the file lives here, by tab id, and the tab component fetches it
 * again on every mount.
 *
 * This replaces a service per file type that the opener filled and the editor
 * read once - with two files of the same kind open, the second overwrote the
 * first. Now every tab has its own.
 */

export interface TransformationDocument {
  /** The parsed .qvtr content (format 'gene-qvtr') */
  data: unknown
  filePath: string
}

const documents = new Map<string, TransformationDocument>()

/** Puts a tab's document in place - called by whoever opens the tab. */
export function setTabDocument(tabId: string, document: TransformationDocument): void {
  documents.set(tabId, document)
}

/** The document of a tab, or undefined when nobody opened one. */
export function tabDocument(tabId: string): TransformationDocument | undefined {
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
