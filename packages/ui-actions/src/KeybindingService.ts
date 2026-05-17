/**
 * KeybindingService - Keyboard shortcut management
 *
 * Registers keybindings from CommandDefinitions and listens
 * for keyboard events to execute matching commands.
 */

import type { CommandDefinition } from './EcoreCommandParser'
import type { CommandRegistryImpl, CommandContext } from './CommandRegistry'
import { evaluateWhen } from './CommandRegistry'

export interface KeybindingEntry {
  commandId: string
  keys: string
  when?: string
}

type ContextProvider = () => CommandContext

export class KeybindingServiceImpl {
  private bindings = new Map<string, KeybindingEntry[]>()
  private commandRegistry: CommandRegistryImpl | null = null
  private contextProvider: ContextProvider = () => ({
    perspectiveId: '',
    hasWorkspace: false,
    hasSelection: false
  })
  private boundHandler: ((e: KeyboardEvent) => void) | null = null

  setCommandRegistry(registry: CommandRegistryImpl): void {
    this.commandRegistry = registry
  }

  setContextProvider(provider: ContextProvider): void {
    this.contextProvider = provider
  }

  registerFromCommands(commands: CommandDefinition[]): void {
    for (const cmd of commands) {
      if (cmd.keybinding) {
        this.register({
          commandId: cmd.commandId,
          keys: cmd.keybinding,
          when: cmd.when
        })
      }
    }
  }

  register(entry: KeybindingEntry): void {
    const normalized = normalizeKeys(entry.keys)
    const existing = this.bindings.get(normalized) || []
    existing.push({ ...entry, keys: normalized })
    this.bindings.set(normalized, existing)
  }

  unregister(commandId: string): void {
    for (const [key, entries] of this.bindings) {
      const filtered = entries.filter(e => e.commandId !== commandId)
      if (filtered.length === 0) {
        this.bindings.delete(key)
      } else {
        this.bindings.set(key, filtered)
      }
    }
  }

  unregisterByModule(moduleId: string): void {
    if (!this.commandRegistry) return
    for (const [key, entries] of this.bindings) {
      const filtered = entries.filter(e => {
        const cmd = this.commandRegistry!.getCommand(e.commandId)
        return !cmd || cmd.moduleId !== moduleId
      })
      if (filtered.length === 0) {
        this.bindings.delete(key)
      } else {
        this.bindings.set(key, filtered)
      }
    }
  }

  getBindingForCommand(commandId: string): string | undefined {
    for (const entries of this.bindings.values()) {
      const entry = entries.find(e => e.commandId === commandId)
      if (entry) return entry.keys
    }
    return undefined
  }

  getAllBindings(): KeybindingEntry[] {
    const result: KeybindingEntry[] = []
    for (const entries of this.bindings.values()) {
      result.push(...entries)
    }
    return result
  }

  activate(): void {
    if (this.boundHandler) return
    this.boundHandler = (e: KeyboardEvent) => this.handleKeydown(e)
    document.addEventListener('keydown', this.boundHandler, true)
  }

  deactivate(): void {
    if (this.boundHandler) {
      document.removeEventListener('keydown', this.boundHandler, true)
      this.boundHandler = null
    }
  }

  private handleKeydown(e: KeyboardEvent): void {
    // Don't intercept when typing in input/textarea
    const target = e.target as HTMLElement
    if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable) {
      // Exception: allow Escape and specific Ctrl+ shortcuts
      if (!e.ctrlKey && !e.metaKey && e.key !== 'Escape') return
    }

    const pressed = keyEventToString(e)
    const entries = this.bindings.get(pressed)
    if (!entries || entries.length === 0) return

    const context = this.contextProvider()

    // Find first matching entry (respecting when-conditions)
    for (const entry of entries) {
      if (entry.when && !evaluateWhen(entry.when, context)) continue

      e.preventDefault()
      e.stopPropagation()

      if (this.commandRegistry) {
        this.commandRegistry.execute(entry.commandId).catch(err => {
          console.error(`[KeybindingService] Error executing ${entry.commandId}:`, err)
        })
      }
      return
    }
  }
}

/**
 * Normalize key string to a canonical form.
 * "Ctrl+Shift+P" → "ctrl+shift+p"
 * Handles platform differences (Cmd → Ctrl on Mac is handled at event time)
 */
export function normalizeKeys(keys: string): string {
  return keys
    .toLowerCase()
    .split('+')
    .map(k => k.trim())
    .map(k => {
      if (k === 'cmd' || k === 'meta' || k === 'command') return 'ctrl'
      if (k === 'option') return 'alt'
      return k
    })
    .sort((a, b) => {
      const order: Record<string, number> = { ctrl: 0, alt: 1, shift: 2 }
      return (order[a] ?? 3) - (order[b] ?? 3)
    })
    .join('+')
}

/**
 * Convert a KeyboardEvent to a normalized key string.
 */
function keyEventToString(e: KeyboardEvent): string {
  const parts: string[] = []

  if (e.ctrlKey || e.metaKey) parts.push('ctrl')
  if (e.altKey) parts.push('alt')
  if (e.shiftKey) parts.push('shift')

  const key = e.key.toLowerCase()
  // Don't add modifier keys themselves
  if (!['control', 'alt', 'shift', 'meta'].includes(key)) {
    parts.push(key)
  }

  return parts.sort((a, b) => {
    const order: Record<string, number> = { ctrl: 0, alt: 1, shift: 2 }
    return (order[a] ?? 3) - (order[b] ?? 3)
  }).join('+')
}
