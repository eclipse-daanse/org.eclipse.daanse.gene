/**
 * Recent Workspaces Store
 *
 * Persists last opened workspaces in localStorage.
 * Displayed in the FileExplorer empty state for quick re-open.
 */

import { ref } from 'tsm:vue'

const STORAGE_KEY = 'gene-recent-workspaces'
const MAX_RECENT = 10

export interface RecentWorkspace {
  /** Display name (from .wsp file or directory) */
  name: string
  /** File path within the source */
  filePath: string
  /** Source ID (for matching restored directory handles) */
  sourceId: string
  /** Source name (directory name) */
  sourceName: string
  /** Last opened timestamp */
  lastOpened: number
}

const recentWorkspaces = ref<RecentWorkspace[]>(loadFromStorage())

function loadFromStorage(): RecentWorkspace[] {
  try {
    const stored = localStorage.getItem(STORAGE_KEY)
    return stored ? JSON.parse(stored) : []
  } catch {
    return []
  }
}

function saveToStorage(): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(recentWorkspaces.value))
  } catch { /* ignore quota errors */ }
}

/**
 * Add or update a workspace in the recent list.
 */
export function addRecentWorkspace(entry: { name: string; filePath: string; sourceId: string; sourceName: string }): void {
  // Remove existing entry with same path + source
  recentWorkspaces.value = recentWorkspaces.value.filter(
    w => !(w.filePath === entry.filePath && w.sourceId === entry.sourceId)
  )

  // Add to front
  recentWorkspaces.value.unshift({
    ...entry,
    lastOpened: Date.now()
  })

  // Trim to max
  if (recentWorkspaces.value.length > MAX_RECENT) {
    recentWorkspaces.value = recentWorkspaces.value.slice(0, MAX_RECENT)
  }

  saveToStorage()
}

/**
 * Remove a workspace from the recent list.
 */
export function removeRecentWorkspace(filePath: string, sourceId: string): void {
  recentWorkspaces.value = recentWorkspaces.value.filter(
    w => !(w.filePath === filePath && w.sourceId === sourceId)
  )
  saveToStorage()
}

/**
 * Clear all recent workspaces.
 */
export function clearRecentWorkspaces(): void {
  recentWorkspaces.value = []
  saveToStorage()
}

/**
 * Get the reactive list of recent workspaces.
 */
export function useRecentWorkspaces() {
  return {
    recentWorkspaces,
    addRecentWorkspace,
    removeRecentWorkspace,
    clearRecentWorkspaces
  }
}
