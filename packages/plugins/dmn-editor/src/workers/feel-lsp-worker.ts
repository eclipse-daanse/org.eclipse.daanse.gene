/**
 * FEEL LSP Worker entry point for Vite bundling.
 *
 * Provides FEEL language support (completion, hover, diagnostics)
 * for the DMN editor via Monaco integration.
 */
import { EmptyFileSystem } from 'langium'
import { startLanguageServer } from 'langium/lsp'
import {
  BrowserMessageReader,
  BrowserMessageWriter,
  createConnection,
} from 'vscode-languageserver/browser.js'
import { createFeelLspServices } from '@eclipse-daanse/org.eclipse.daanse.feel.langium'

declare const self: DedicatedWorkerGlobalScope

export interface WorkerMessage {
  type: 'registerContext' | 'init'
  data?: unknown
}

const messageReader = new BrowserMessageReader(self)
const messageWriter = new BrowserMessageWriter(self)

const connection = createConnection(messageReader, messageWriter)

const { shared, feel } = createFeelLspServices({
  connection,
  ...EmptyFileSystem,
})

// Handle custom messages from the main thread
self.addEventListener('message', (event: MessageEvent<WorkerMessage>) => {
  const msg = event.data
  if (!msg || !msg.type) return

  switch (msg.type) {
    case 'registerContext': {
      if (Array.isArray(msg.data)) {
        feel.context.variables.length = 0
        for (const v of msg.data as Array<{ name: string; type: string }>) {
          feel.context.variables.push(v)
        }
      }
      break
    }
  }
})

startLanguageServer(shared)
