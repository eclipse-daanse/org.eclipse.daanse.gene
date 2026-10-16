/**
 * The file behind a Document: `reference` names it - a URL, or a path in
 * the workspace (relative to the model file's folder, or to the workspace
 * root) - and `type` says what it is (png, svg, jpg ... or a MIME type).
 * Images show inline, a PDF opens in a new tab.
 */
import { toRaw } from 'tsm:vue'
import { attr } from './documentation'

interface FileEntryLike {
  name: string
  path: string
  isDirectory?: boolean
  children?: FileEntryLike[]
  /** Local sources: the browser's file handle */
  handle?: any
}

interface FileSystemLike {
  sources: { value: { id: string }[] }
  filesBySource: Map<string, FileEntryLike[]>
}

let fileSystem: FileSystemLike | null = null

export function setDocumentFileSystem(fs: FileSystemLike | null): void {
  fileSystem = fs
}

const IMAGE = ['png', 'svg', 'jpg', 'jpeg', 'gif', 'webp', 'bmp']
const ENDINGS = [...IMAGE, 'pdf']

export type DocumentKind = 'image' | 'pdf' | 'other' | 'none'

function extensionOf(path: string): string {
  const clean = path.split(/[?#]/)[0]
  const dot = clean.lastIndexOf('.')
  return dot >= 0 ? clean.slice(dot + 1).toLowerCase() : ''
}

/** What the document is: from `type` (an ending or a MIME type), else from the reference's ending */
export function documentKind(document: any): DocumentKind {
  const reference = String(attr(document, 'reference') ?? '').trim()
  if (!reference) return 'none'
  const type = String(attr(document, 'type') ?? '').trim().toLowerCase()
  const t = type.startsWith('image/') ? 'png' : type === 'application/pdf' ? 'pdf' : type.replace(/^\./, '')
  const kind = t || extensionOf(reference)
  if (IMAGE.includes(kind)) return 'image'
  if (kind === 'pdf') return 'pdf'
  return 'other'
}

export function isUrl(reference: string): boolean {
  return /^(https?:|data:|blob:)/i.test(reference.trim())
}

/** All files of the workspace, by path */
export function workspaceFiles(): FileEntryLike[] {
  if (!fileSystem) return []
  const out: FileEntryLike[] = []
  const walk = (entries: FileEntryLike[]) => {
    for (const e of entries) {
      if (e.isDirectory) walk(e.children ?? [])
      else out.push(e)
    }
  }
  for (const s of fileSystem.sources.value) walk(fileSystem.filesBySource.get(s.id) ?? [])
  return out
}

/** Workspace files a document can show: images and PDFs */
export function documentFiles(): FileEntryLike[] {
  return workspaceFiles().filter(e => ENDINGS.includes(extensionOf(e.name)))
}

function normalize(path: string): string {
  const parts: string[] = []
  for (const p of path.replace(/\\/g, '/').split('/')) {
    if (!p || p === '.') continue
    if (p === '..') parts.pop()
    else parts.push(p)
  }
  return parts.join('/')
}

/** The workspace file a reference names: relative to the model file's folder, else to the root */
export function findFile(document: any, reference: string): FileEntryLike | null {
  const files = workspaceFiles()
  const modelPath = String(toRaw(document)?.eResource?.()?.getURI?.()?.toString?.() ?? '')
  const folder = modelPath.includes('/') ? modelPath.slice(0, modelPath.lastIndexOf('/')) : ''
  const candidates = [normalize(`${folder}/${reference}`), normalize(reference)]
  for (const c of candidates) {
    const hit = files.find(f => normalize(f.path) === c)
    if (hit) return hit
  }
  return null
}

/** The path to store as reference: relative to the model file's folder when the file lies below it */
export function referenceFor(document: any, entry: FileEntryLike): string {
  const modelPath = String(toRaw(document)?.eResource?.()?.getURI?.()?.toString?.() ?? '')
  const folder = modelPath.includes('/') ? normalize(modelPath.slice(0, modelPath.lastIndexOf('/'))) : ''
  const path = normalize(entry.path)
  return folder && path.startsWith(`${folder}/`) ? path.slice(folder.length + 1) : path
}

/**
 * A URL the browser can show for the document's file: the reference itself
 * when it is one, else an object URL of the workspace file (to revoke when
 * done). Null when the file is not found or cannot be read.
 */
export async function documentUrl(document: any): Promise<{ url: string; revoke: boolean } | null> {
  const reference = String(attr(document, 'reference') ?? '').trim()
  if (!reference) return null
  if (isUrl(reference)) return { url: reference, revoke: false }
  const entry = findFile(document, reference)
  const file = await entry?.handle?.getFile?.()
  if (!file) return null
  // An SVG needs its type, else the browser will not draw it from a blob
  const blob = extensionOf(entry!.name) === 'svg' && !file.type ? new Blob([await file.text()], { type: 'image/svg+xml' }) : file
  return { url: URL.createObjectURL(blob), revoke: true }
}

/** The type to store for a chosen file: its ending */
export function typeFor(path: string): string {
  return extensionOf(path)
}
