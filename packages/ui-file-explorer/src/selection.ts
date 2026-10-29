/**
 * Selecting several files in the explorer tree.
 *
 * The tree selects with Ctrl/Cmd-click itself; Shift-click ranges and the
 * question which of the selected rows are models are answered here. Pure:
 * the caller hands in the tree nodes and the keys.
 */

import type { FileEntry, FileTreeNode } from './types'

export type SelectionKeys = Record<string, boolean>

/** The keys of all rows that can be seen, top to bottom - collapsed folders hide theirs. */
export function visibleKeys(nodes: FileTreeNode[], expandedKeys: SelectionKeys): string[] {
  const keys: string[] = []
  const walk = (list: FileTreeNode[]) => {
    for (const node of list) {
      keys.push(node.key)
      if (node.children?.length && expandedKeys[node.key]) walk(node.children)
    }
  }
  walk(nodes)
  return keys
}

/** The rows from one key to the other, both included, in either direction. */
export function rangeKeys(order: string[], from: string, to: string): SelectionKeys {
  const a = order.indexOf(from)
  const b = order.indexOf(to)
  if (a < 0 || b < 0) return { [to]: true }
  const [start, end] = a <= b ? [a, b] : [b, a]
  return Object.fromEntries(order.slice(start, end + 1).map((key) => [key, true]))
}

export function isEcoreEntry(entry: FileEntry | undefined): boolean {
  return !!entry && !entry.isDirectory && entry.extension?.toLowerCase() === '.ecore'
}

function isFileNode(node: FileTreeNode): boolean {
  return node.type === 'file' || node.type === 'workspace'
}

/** The selected `.ecore` files, in tree order. */
export function selectedEcoreFiles(nodes: FileTreeNode[], keys: SelectionKeys): FileEntry[] {
  const found: FileEntry[] = []
  const walk = (list: FileTreeNode[]) => {
    for (const node of list) {
      if (keys[node.key] && isFileNode(node) && isEcoreEntry(node.data as FileEntry)) {
        found.push(node.data as FileEntry)
      }
      if (node.children) walk(node.children)
    }
  }
  walk(nodes)
  return found
}

/** All `.ecore` files in a folder or source, subfolders included. */
export function ecoreFilesBelow(node: FileTreeNode): FileEntry[] {
  const found: FileEntry[] = []
  const walk = (list: FileTreeNode[] | undefined) => {
    for (const child of list ?? []) {
      if (isFileNode(child) && isEcoreEntry(child.data as FileEntry)) found.push(child.data as FileEntry)
      walk(child.children)
    }
  }
  walk(node.children)
  return found
}
