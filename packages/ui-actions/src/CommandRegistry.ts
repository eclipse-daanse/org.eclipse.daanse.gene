/**
 * CommandRegistry - Central registry for model-driven commands
 *
 * Manages CommandDefinitions parsed from Ecore models and bridges
 * with the existing ActionRegistry for backward compatibility.
 */

import type { CommandDefinition } from './EcoreCommandParser'
import { parseCommandEcore } from './EcoreCommandParser'
import type { ActionRegistryImpl } from './ActionRegistry'

export interface CommandContext {
  perspectiveId: string
  hasWorkspace: boolean
  hasSelection: boolean
  selectionType?: string
  editorMode?: string
  isDirty?: boolean
}

export type CommandHandler = (args?: Record<string, unknown>) => void | Promise<void>

export interface RegisteredCommand {
  definition: CommandDefinition
  handler?: CommandHandler
}

export class CommandRegistryImpl {
  private commands = new Map<string, RegisteredCommand>()
  private handlers = new Map<string, CommandHandler>()
  private listeners = new Set<() => void>()
  private actionRegistry: ActionRegistryImpl | null = null

  setActionRegistry(registry: ActionRegistryImpl): void {
    this.actionRegistry = registry
  }

  registerCommand(cmd: RegisteredCommand): void {
    this.commands.set(cmd.definition.commandId, cmd)
    if (cmd.handler) {
      this.handlers.set(cmd.definition.commandId, cmd.handler)
    }
    this.notifyChange()
  }

  registerCommandsFromEcore(ecoreContent: string, moduleId: string): CommandDefinition[] {
    const defs = parseCommandEcore(ecoreContent, moduleId)
    for (const def of defs) {
      this.commands.set(def.commandId, { definition: def })
    }
    if (defs.length > 0) this.notifyChange()
    return defs
  }

  registerHandler(commandId: string, handler: CommandHandler): void {
    this.handlers.set(commandId, handler)
    const cmd = this.commands.get(commandId)
    if (cmd) cmd.handler = handler
  }

  unregisterByModule(moduleId: string): void {
    const toRemove: string[] = []
    for (const [id, cmd] of this.commands) {
      if (cmd.definition.moduleId === moduleId) {
        toRemove.push(id)
      }
    }
    for (const id of toRemove) {
      this.commands.delete(id)
      this.handlers.delete(id)
    }
    if (toRemove.length > 0) this.notifyChange()
  }

  getCommand(commandId: string): CommandDefinition | undefined {
    return this.commands.get(commandId)?.definition
  }

  getAllCommands(): CommandDefinition[] {
    const cmds = Array.from(this.commands.values()).map(c => c.definition)

    // Bridge: also include RegisteredActions as commands
    if (this.actionRegistry) {
      for (const action of this.actionRegistry.getAllActions()) {
        const def = action.definition
        const actionId = def.actionId
        if (!this.commands.has(actionId)) {
          cmds.push({
            commandId: actionId,
            label: def.label || actionId,
            category: def.actionType || 'TOOLS',
            scope: def.actionScope || 'GLOBAL',
            icon: def.icon,
            keybinding: undefined,
            when: undefined,
            parameters: [],
            moduleId: action.moduleId || 'unknown',
            enabled: def.enabled !== false
          })
        }
      }
    }

    return cmds
  }

  getCommandsByCategory(category: string): CommandDefinition[] {
    return this.getAllCommands().filter(c => c.category === category)
  }

  getExecutableCommands(context: CommandContext): CommandDefinition[] {
    return this.getAllCommands().filter(cmd => {
      if (!cmd.enabled) return false
      if (cmd.when && !evaluateWhen(cmd.when, context)) return false
      return true
    })
  }

  async execute(commandId: string, args?: Record<string, unknown>): Promise<void> {
    const handler = this.handlers.get(commandId)
    if (handler) {
      await handler(args)
      return
    }
    console.warn(`[CommandRegistry] No handler for command: ${commandId}`)
  }

  hasHandler(commandId: string): boolean {
    return this.handlers.has(commandId)
  }

  onChange(listener: () => void): () => void {
    this.listeners.add(listener)
    return () => this.listeners.delete(listener)
  }

  private notifyChange(): void {
    for (const listener of this.listeners) {
      try { listener() } catch (e) { console.error('[CommandRegistry] Listener error:', e) }
    }
  }
}

/**
 * Evaluate a when-expression against a CommandContext.
 * Supports simple key-value comparisons:
 *   "perspectiveId == 'model-editor'"
 *   "hasSelection"
 *   "perspectiveId == 'model-editor' && hasSelection"
 */
export function evaluateWhen(when: string, context: CommandContext): boolean {
  const parts = when.split('&&').map(s => s.trim())

  for (const part of parts) {
    // Equality check: key == 'value'
    const eqMatch = part.match(/^(\w+)\s*==\s*'([^']*)'$/)
    if (eqMatch) {
      const [, key, value] = eqMatch
      if (String((context as any)[key]) !== value) return false
      continue
    }

    // Inequality check: key != 'value'
    const neqMatch = part.match(/^(\w+)\s*!=\s*'([^']*)'$/)
    if (neqMatch) {
      const [, key, value] = neqMatch
      if (String((context as any)[key]) === value) return false
      continue
    }

    // Negation: !key
    const negMatch = part.match(/^!(\w+)$/)
    if (negMatch) {
      if ((context as any)[negMatch[1]]) return false
      continue
    }

    // Boolean truthy: key
    if (/^\w+$/.test(part)) {
      if (!(context as any)[part]) return false
      continue
    }

    // Unknown expression — skip (permissive)
    console.warn(`[CommandRegistry] Unknown when-expression part: "${part}"`)
  }

  return true
}
