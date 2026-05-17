import { describe, it, expect, vi, beforeEach } from 'vitest'
import { KeybindingServiceImpl, normalizeKeys } from '../KeybindingService'
import { CommandRegistryImpl } from '../CommandRegistry'

describe('normalizeKeys', () => {
  it('lowercases and sorts modifiers', () => {
    expect(normalizeKeys('Ctrl+Shift+P')).toBe('ctrl+shift+p')
  })

  it('maps Cmd to Ctrl', () => {
    expect(normalizeKeys('Cmd+S')).toBe('ctrl+s')
  })

  it('maps Meta to Ctrl', () => {
    expect(normalizeKeys('Meta+Z')).toBe('ctrl+z')
  })

  it('maps Option to Alt', () => {
    expect(normalizeKeys('Option+F')).toBe('alt+f')
  })

  it('sorts modifiers in canonical order (ctrl, alt, shift)', () => {
    expect(normalizeKeys('Shift+Ctrl+A')).toBe('ctrl+shift+a')
    expect(normalizeKeys('Alt+Ctrl+X')).toBe('ctrl+alt+x')
    expect(normalizeKeys('Shift+Alt+Ctrl+F1')).toBe('ctrl+alt+shift+f1')
  })

  it('handles single key', () => {
    expect(normalizeKeys('F11')).toBe('f11')
    expect(normalizeKeys('Escape')).toBe('escape')
    expect(normalizeKeys('Delete')).toBe('delete')
  })
})

describe('KeybindingService', () => {
  let service: KeybindingServiceImpl
  let commandRegistry: CommandRegistryImpl

  beforeEach(() => {
    commandRegistry = new CommandRegistryImpl()
    service = new KeybindingServiceImpl()
    service.setCommandRegistry(commandRegistry)
  })

  it('registers and retrieves keybindings', () => {
    service.register({ commandId: 'test.save', keys: 'Ctrl+S' })

    const binding = service.getBindingForCommand('test.save')
    expect(binding).toBe('ctrl+s')
  })

  it('registerFromCommands picks up keybinding field', () => {
    service.registerFromCommands([{
      commandId: 'test.copy',
      label: 'Copy',
      category: 'EDIT',
      scope: 'GLOBAL',
      keybinding: 'Ctrl+C',
      parameters: [],
      moduleId: 'test',
      enabled: true
    }])

    expect(service.getBindingForCommand('test.copy')).toBe('ctrl+c')
  })

  it('skips commands without keybinding', () => {
    service.registerFromCommands([{
      commandId: 'test.nokey',
      label: 'No Key',
      category: 'TOOLS',
      scope: 'GLOBAL',
      parameters: [],
      moduleId: 'test',
      enabled: true
    }])

    expect(service.getBindingForCommand('test.nokey')).toBeUndefined()
  })

  it('unregisters by commandId', () => {
    service.register({ commandId: 'test.x', keys: 'Ctrl+X' })
    expect(service.getBindingForCommand('test.x')).toBeDefined()

    service.unregister('test.x')
    expect(service.getBindingForCommand('test.x')).toBeUndefined()
  })

  it('getAllBindings returns all entries', () => {
    service.register({ commandId: 'a', keys: 'Ctrl+A' })
    service.register({ commandId: 'b', keys: 'Ctrl+B' })

    const all = service.getAllBindings()
    expect(all).toHaveLength(2)
  })
})
