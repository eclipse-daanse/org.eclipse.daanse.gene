/**
 * File Viewer Registry Composable
 *
 * Manages registration and lookup of file viewer contributions.
 */

import { ref, computed, shallowRef, type ShallowRef } from 'tsm:vue'
import type { FileViewerContribution } from '../types'

// Singleton registry
const viewers: ShallowRef<Map<string, FileViewerContribution>> = shallowRef(new Map())

/**
 * Extension point ID for file viewers
 */
export const FILE_VIEWER_EXTENSION_POINT = 'gene.file.viewer'

/**
 * Default XMI extensions
 */
export const XMI_EXTENSIONS = ['.xmi', '.ecore', '.xml']

/**
 * Composable for file viewer registration and lookup
 */
export function useFileViewerRegistry() {
  /**
   * Register a file viewer contribution
   */
  function registerViewer(contribution: FileViewerContribution): void {
    const newMap = new Map(viewers.value)
    newMap.set(contribution.id, contribution)
    viewers.value = newMap
    console.log(`[FileViewerRegistry] Registered viewer: ${contribution.id} for extensions:`, contribution.extensions)
  }

  /**
   * Unregister a file viewer
   */
  function unregisterViewer(id: string): boolean {
    if (!viewers.value.has(id)) return false
    const newMap = new Map(viewers.value)
    newMap.delete(id)
    viewers.value = newMap
    console.log(`[FileViewerRegistry] Unregistered viewer: ${id}`)
    return true
  }

  /**
   * Get viewer for a specific file extension
   */
  function getViewerForExtension(extension: string, content?: string): FileViewerContribution | undefined {
    const ext = extension.toLowerCase()
    let bestMatch: FileViewerContribution | undefined
    let bestPriority = -Infinity

    for (const viewer of viewers.value.values()) {
      // Check if extension matches
      if (!viewer.extensions.some(e => e.toLowerCase() === ext)) {
        continue
      }

      // Check content if canHandle is provided
      if (content && viewer.canHandle && !viewer.canHandle(content, ext)) {
        continue
      }

      // Compare priority
      const priority = viewer.priority ?? 0
      if (priority > bestPriority) {
        bestMatch = viewer
        bestPriority = priority
      }
    }

    return bestMatch
  }

  /**
   * Get all registered viewers
   */
  const allViewers = computed(() => Array.from(viewers.value.values()))

  /**
   * Get all supported extensions
   */
  const supportedExtensions = computed(() => {
    const extensions = new Set<string>()
    for (const viewer of viewers.value.values()) {
      viewer.extensions.forEach(ext => extensions.add(ext.toLowerCase()))
    }
    return Array.from(extensions)
  })

  /**
   * Check if an extension is supported
   */
  function isExtensionSupported(extension: string): boolean {
    const ext = extension.toLowerCase()
    for (const viewer of viewers.value.values()) {
      if (viewer.extensions.some(e => e.toLowerCase() === ext)) {
        return true
      }
    }
    return false
  }

  /**
   * Clear all registrations
   */
  function clear(): void {
    viewers.value = new Map()
  }

  return {
    registerViewer,
    unregisterViewer,
    getViewerForExtension,
    allViewers,
    supportedExtensions,
    isExtensionSupported,
    clear
  }
}
