/**
 * Minimal LSP client for OCL language support over Web Worker.
 *
 * Communicates with the ocl-lsp-worker via JSON-RPC 2.0 over postMessage.
 * Provides initialize, document sync, completion, hover, and diagnostics.
 */
import type { EPackage } from '@emfts/core'

/**
 * Serialize an EPackage to XMI string for transfer to the worker.
 * Uses the EPackage's existing Resource to avoid breaking containment.
 */
function serializeEPackageToXMI(ePackage: EPackage): string {
  const resource = ePackage.eResource?.()
  if (resource && typeof (resource as any).saveToString === 'function') {
    return (resource as any).saveToString() as string
  }
  throw new Error(`EPackage '${ePackage.getName?.()}' has no Resource for XMI serialization`)
}

// --- JSON-RPC Types ---

interface JsonRpcRequest {
  jsonrpc: '2.0'
  id: number
  method: string
  params?: unknown
}

interface JsonRpcNotification {
  jsonrpc: '2.0'
  method: string
  params?: unknown
}

interface JsonRpcResponse {
  jsonrpc: '2.0'
  id: number
  result?: unknown
  error?: { code: number; message: string; data?: unknown }
}

// --- LSP Types (subset) ---

export interface LspPosition {
  line: number
  character: number
}

export interface LspRange {
  start: LspPosition
  end: LspPosition
}

export interface LspCompletionItem {
  label: string
  kind?: number
  detail?: string
  documentation?: string | { kind: string; value: string }
  insertText?: string
  sortText?: string
}

export interface LspCompletionList {
  isIncomplete: boolean
  items: LspCompletionItem[]
}

export interface LspHover {
  contents: string | { kind: string; value: string } | Array<string | { language: string; value: string }>
  range?: LspRange
}

export interface LspDiagnostic {
  range: LspRange
  severity?: number
  message: string
  source?: string
}

// --- Client ---

type PendingRequest = {
  resolve: (result: unknown) => void
  reject: (error: unknown) => void
}

export class OclLanguageClient {
  private worker: Worker
  private nextId = 1
  private pendingRequests = new Map<number, PendingRequest>()
  private initialized = false
  private diagnosticListeners: Array<(uri: string, diagnostics: LspDiagnostic[]) => void> = []

  constructor(workerUrl: URL | string) {
    this.worker = new Worker(workerUrl, { type: 'module' })
    this.worker.onmessage = (event) => this.handleMessage(event.data)
    this.worker.onerror = (err) => console.error('[OclLSP] Worker error:', err)
  }

  private handleMessage(msg: unknown) {
    if (!msg || typeof msg !== 'object') return
    const data = msg as Record<string, unknown>

    // Response to a request
    if ('id' in data && typeof data.id === 'number') {
      const pending = this.pendingRequests.get(data.id)
      if (pending) {
        this.pendingRequests.delete(data.id)
        if ('error' in data && data.error) {
          pending.reject(data.error)
        } else {
          pending.resolve(data.result)
        }
      }
      return
    }

    // Notification from server
    if ('method' in data && typeof data.method === 'string') {
      if (data.method === 'textDocument/publishDiagnostics') {
        const params = data.params as { uri: string; diagnostics: LspDiagnostic[] }
        for (const listener of this.diagnosticListeners) {
          listener(params.uri, params.diagnostics)
        }
      }
    }
  }

  private sendRequest(method: string, params?: unknown): Promise<unknown> {
    const id = this.nextId++
    const message: JsonRpcRequest = { jsonrpc: '2.0', id, method, params }

    return new Promise((resolve, reject) => {
      this.pendingRequests.set(id, { resolve, reject })
      this.worker.postMessage(message)

      // Timeout after 10s
      setTimeout(() => {
        if (this.pendingRequests.has(id)) {
          this.pendingRequests.delete(id)
          reject(new Error(`LSP request timeout: ${method}`))
        }
      }, 10000)
    })
  }

  private sendNotification(method: string, params?: unknown) {
    const message: JsonRpcNotification = { jsonrpc: '2.0', method, params }
    this.worker.postMessage(message)
  }

  // --- Custom worker messages ---

  registerPackage(ePackage: EPackage) {
    const xmi = serializeEPackageToXMI(ePackage)
    this.worker.postMessage({ type: 'registerPackage', data: xmi })
  }

  // --- LSP Lifecycle ---

  async initialize(): Promise<void> {
    if (this.initialized) return

    await this.sendRequest('initialize', {
      processId: null,
      capabilities: {
        textDocument: {
          completion: {
            completionItem: { snippetSupport: false }
          },
          hover: { contentFormat: ['markdown', 'plaintext'] },
          publishDiagnostics: { relatedInformation: false }
        }
      },
      rootUri: null
    })

    this.sendNotification('initialized', {})
    this.initialized = true
  }

  // --- Document Sync ---

  didOpen(uri: string, text: string) {
    this.sendNotification('textDocument/didOpen', {
      textDocument: {
        uri,
        languageId: 'ocl',
        version: 1,
        text
      }
    })
  }

  didChange(uri: string, version: number, text: string) {
    this.sendNotification('textDocument/didChange', {
      textDocument: { uri, version },
      contentChanges: [{ text }]
    })
  }

  didClose(uri: string) {
    this.sendNotification('textDocument/didClose', {
      textDocument: { uri }
    })
  }

  // --- Language Features ---

  async completion(uri: string, position: LspPosition): Promise<LspCompletionItem[]> {
    const result = await this.sendRequest('textDocument/completion', {
      textDocument: { uri },
      position
    })
    if (!result) return []
    if (Array.isArray(result)) return result as LspCompletionItem[]
    if (typeof result === 'object' && 'items' in (result as object)) {
      return (result as LspCompletionList).items
    }
    return []
  }

  async hover(uri: string, position: LspPosition): Promise<LspHover | null> {
    const result = await this.sendRequest('textDocument/hover', {
      textDocument: { uri },
      position
    })
    return (result as LspHover) ?? null
  }

  // --- Diagnostics ---

  onDiagnostics(listener: (uri: string, diagnostics: LspDiagnostic[]) => void) {
    this.diagnosticListeners.push(listener)
    return () => {
      const idx = this.diagnosticListeners.indexOf(listener)
      if (idx >= 0) this.diagnosticListeners.splice(idx, 1)
    }
  }

  // --- Cleanup ---

  dispose() {
    this.worker.terminate()
    this.pendingRequests.clear()
    this.diagnosticListeners.length = 0
  }
}

// Singleton
let sharedClient: OclLanguageClient | null = null

export function getSharedOclClient(): OclLanguageClient {
  if (!sharedClient) {
    const workerUrl = new URL('../workers/ocl-lsp-worker.ts', import.meta.url)
    sharedClient = new OclLanguageClient(workerUrl)
  }
  return sharedClient
}
