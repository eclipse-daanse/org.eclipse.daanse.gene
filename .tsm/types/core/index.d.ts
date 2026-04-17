/**
 * Core Module - Type Definitions
 * Downloaded from remote: http://localhost:5200/core/index.d.ts
 *
 * Diese Datei wird von TSM automatisch heruntergeladen wenn:
 *   tsm.install('core')
 * ausgeführt wird.
 */

export declare const name: string
export declare const version: string

export declare class CoreService {
  initialized: boolean
  initialize(): void
  getMessage(): string
}

export declare function activate(context: import('tsm').ModuleContext): Promise<void>
export declare function deactivate(context: import('tsm').ModuleContext): Promise<void>
