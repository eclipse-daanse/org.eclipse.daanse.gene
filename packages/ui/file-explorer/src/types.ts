/**
 * File Explorer Types
 *
 * Unified file explorer supporting multiple sources:
 * - Local filesystem (File System Access API)
 * - Git repositories
 * - IndexedDB storage
 */

/**
 * Source types for the file explorer
 */
export type SourceType = 'local' | 'git' | 'indexeddb' | 'model-atlas'

/**
 * Represents a file/folder source (mount point)
 */
export interface FileSource {
  /** Unique identifier */
  id: string
  /** Display name */
  name: string
  /** Source type */
  type: SourceType
  /** Icon class */
  icon: string
  /** Whether the source is connected/available */
  connected: boolean
  /** Error message if not connected */
  error?: string
  /** Source-specific data */
  data?: any
}

/**
 * Represents a file or directory entry
 */
export interface FileEntry {
  /** File/folder name */
  name: string
  /** Full path within the source */
  path: string
  /** Whether this is a directory */
  isDirectory: boolean
  /** Source this entry belongs to */
  sourceId: string
  /** File extension (for files) */
  extension?: string
  /** Whether this is a workspace file */
  isWorkspace?: boolean
  /** File size in bytes (for files) */
  size?: number
  /** Last modified date */
  lastModified?: Date
  /** Child entries (for directories) */
  children?: FileEntry[]
  /** Source-specific handle/reference */
  handle?: any
}

/**
 * Tree node for PrimeVue Tree component
 */
export interface FileTreeNode {
  key: string
  label: string
  icon: string
  data: FileEntry | FileSource
  children?: FileTreeNode[]
  leaf: boolean
  /** Node type discriminator */
  type: 'source' | 'directory' | 'file' | 'workspace'
  /** Whether node is loading */
  loading?: boolean
}

/**
 * File filter options
 */
export interface FileFilter {
  /** File extensions to show (e.g., ['.wsp', '.xmi']) */
  extensions?: string[]
  /** Show hidden files */
  showHidden?: boolean
  /** Show directories */
  showDirectories?: boolean
}

/**
 * Workspace file extensions
 */
export const WORKSPACE_EXTENSIONS = ['.wsp', '.workspace', '.xmi']

/**
 * Check if a file is a workspace file
 */
export function isWorkspaceFile(entry: FileEntry): boolean {
  if (entry.isDirectory) return false
  const ext = entry.extension?.toLowerCase() ?? ''
  return WORKSPACE_EXTENSIONS.includes(ext)
}

/**
 * Icon mapping for different file types and sources
 */
export const FILE_ICONS: Record<string, string> = {
  // Sources
  'source-local': 'pi pi-folder',
  'source-git': 'pi pi-github',
  'source-indexeddb': 'pi pi-database',
  'source-model-atlas': 'pi pi-globe',

  // Special files
  'workspace': 'pi pi-box',

  // Directories
  'folder': 'pi pi-folder',
  'folder-open': 'pi pi-folder-open',

  // Files by extension
  '.json': 'pi pi-file',
  '.xml': 'pi pi-code',
  '.xmi': 'pi pi-box',
  '.ecore': 'pi pi-sitemap',
  '.wsp': 'pi pi-box',
  '.workspace': 'pi pi-box',
  '.md': 'pi pi-file',
  '.txt': 'pi pi-file',
  '.ts': 'pi pi-file',
  '.js': 'pi pi-file',
  '.vue': 'pi pi-file',

  // Default
  'default': 'pi pi-file',
  'unknown': 'pi pi-question'
}

/**
 * Get icon for a file entry
 */
export function getFileIcon(entry: FileEntry, isOpen = false): string {
  if (entry.isDirectory) {
    return isOpen ? FILE_ICONS['folder-open'] : FILE_ICONS['folder']
  }

  if (isWorkspaceFile(entry)) {
    return FILE_ICONS['workspace']
  }

  const ext = entry.extension?.toLowerCase() ?? ''
  return FILE_ICONS[ext] ?? FILE_ICONS['default']
}

/**
 * Get icon for a source
 */
export function getSourceIcon(type: SourceType): string {
  return FILE_ICONS[`source-${type}`] ?? FILE_ICONS['unknown']
}

/**
 * Workspace info extracted from .wsp file
 */
export interface WorkspaceInfo {
  /** Workspace name */
  name: string
  /** Description */
  description?: string
  /** File path */
  path: string
  /** Source ID */
  sourceId: string
  /** Associated models/packages */
  models?: string[]
  /** Number of instances */
  instanceCount?: number
  /** Last modified */
  lastModified?: Date
  /** File handle */
  handle?: any
}
