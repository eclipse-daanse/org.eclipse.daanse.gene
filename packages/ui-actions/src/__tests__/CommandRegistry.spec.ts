import { describe, it, expect, vi, beforeEach } from 'vitest'
import { CommandRegistryImpl, evaluateWhen } from '../CommandRegistry'
import type { CommandDefinition } from '../EcoreCommandParser'

function makeDef(overrides: Partial<CommandDefinition> = {}): CommandDefinition {
  return {
    commandId: 'test.command',
    label: 'Test Command',
    category: 'TOOLS',
    scope: 'GLOBAL',
    parameters: [],
    moduleId: 'test-module',
    enabled: true,
    ...overrides
  }
}

describe('CommandRegistry', () => {
  let registry: CommandRegistryImpl

  beforeEach(() => {
    registry = new CommandRegistryImpl()
  })

  it('registers and retrieves a command', () => {
    const def = makeDef({ commandId: 'test.save' })
    registry.registerCommand({ definition: def })

    expect(registry.getCommand('test.save')).toEqual(def)
  })

  it('returns undefined for unknown command', () => {
    expect(registry.getCommand('nonexistent')).toBeUndefined()
  })

  it('registers commands from ecore', () => {
    const ecore = `<?xml version="1.0" encoding="UTF-8"?>
<ecore:EPackage xmi:version="2.0" xmlns:xmi="http://www.omg.org/XMI" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"
    xmlns:ecore="http://www.eclipse.org/emf/2002/Ecore" name="test" nsURI="http://test/1.0" nsPrefix="test">
  <eClassifiers xsi:type="ecore:EClass" name="Cmds" eSuperTypes="command-model.ecore#//CommandInterface">
    <eOperations name="doStuff">
      <eAnnotations source="http://gene/model/command/Command">
        <details key="commandId" value="test.doStuff"/>
        <details key="label" value="Do Stuff"/>
        <details key="category" value="EDIT"/>
        <details key="scope" value="GLOBAL"/>
      </eAnnotations>
    </eOperations>
  </eClassifiers>
</ecore:EPackage>`

    const defs = registry.registerCommandsFromEcore(ecore, 'test-mod')
    expect(defs).toHaveLength(1)
    expect(registry.getCommand('test.doStuff')).toBeDefined()
    expect(registry.getCommand('test.doStuff')!.category).toBe('EDIT')
  })

  it('getAllCommands returns all registered commands', () => {
    registry.registerCommand({ definition: makeDef({ commandId: 'a' }) })
    registry.registerCommand({ definition: makeDef({ commandId: 'b' }) })

    const all = registry.getAllCommands()
    expect(all).toHaveLength(2)
  })

  it('getCommandsByCategory filters correctly', () => {
    registry.registerCommand({ definition: makeDef({ commandId: 'a', category: 'FILE' }) })
    registry.registerCommand({ definition: makeDef({ commandId: 'b', category: 'EDIT' }) })
    registry.registerCommand({ definition: makeDef({ commandId: 'c', category: 'FILE' }) })

    const fileCommands = registry.getCommandsByCategory('FILE')
    expect(fileCommands).toHaveLength(2)
    expect(fileCommands.every(c => c.category === 'FILE')).toBe(true)
  })

  it('unregisterByModule removes all module commands', () => {
    registry.registerCommand({ definition: makeDef({ commandId: 'a', moduleId: 'mod1' }) })
    registry.registerCommand({ definition: makeDef({ commandId: 'b', moduleId: 'mod1' }) })
    registry.registerCommand({ definition: makeDef({ commandId: 'c', moduleId: 'mod2' }) })

    registry.unregisterByModule('mod1')

    expect(registry.getCommand('a')).toBeUndefined()
    expect(registry.getCommand('b')).toBeUndefined()
    expect(registry.getCommand('c')).toBeDefined()
  })

  it('executes registered handler', async () => {
    const handler = vi.fn()
    registry.registerCommand({ definition: makeDef({ commandId: 'test.run' }), handler })

    await registry.execute('test.run', { foo: 'bar' })
    expect(handler).toHaveBeenCalledWith({ foo: 'bar' })
  })

  it('registerHandler adds handler after registration', async () => {
    const handler = vi.fn()
    registry.registerCommand({ definition: makeDef({ commandId: 'test.late' }) })
    registry.registerHandler('test.late', handler)

    await registry.execute('test.late')
    expect(handler).toHaveBeenCalled()
  })

  it('getExecutableCommands respects when-conditions', () => {
    registry.registerCommand({ definition: makeDef({ commandId: 'a', when: 'hasWorkspace' }) })
    registry.registerCommand({ definition: makeDef({ commandId: 'b' }) })
    registry.registerCommand({ definition: makeDef({ commandId: 'c', enabled: false }) })

    const withWorkspace = registry.getExecutableCommands({
      perspectiveId: 'explorer',
      hasWorkspace: true,
      hasSelection: false
    })
    expect(withWorkspace.map(c => c.commandId)).toContain('a')
    expect(withWorkspace.map(c => c.commandId)).toContain('b')
    expect(withWorkspace.map(c => c.commandId)).not.toContain('c')

    const withoutWorkspace = registry.getExecutableCommands({
      perspectiveId: 'explorer',
      hasWorkspace: false,
      hasSelection: false
    })
    expect(withoutWorkspace.map(c => c.commandId)).not.toContain('a')
    expect(withoutWorkspace.map(c => c.commandId)).toContain('b')
  })

  it('onChange notifies listeners', () => {
    const listener = vi.fn()
    registry.onChange(listener)

    registry.registerCommand({ definition: makeDef({ commandId: 'x' }) })
    expect(listener).toHaveBeenCalledTimes(1)

    registry.unregisterByModule('test-module')
    expect(listener).toHaveBeenCalledTimes(2)
  })

  it('onChange returns unsubscribe function', () => {
    const listener = vi.fn()
    const unsub = registry.onChange(listener)

    registry.registerCommand({ definition: makeDef({ commandId: 'x' }) })
    expect(listener).toHaveBeenCalledTimes(1)

    unsub()
    registry.registerCommand({ definition: makeDef({ commandId: 'y' }) })
    expect(listener).toHaveBeenCalledTimes(1) // not called again
  })

  it('hasHandler returns correct state', () => {
    registry.registerCommand({ definition: makeDef({ commandId: 'a' }) })
    expect(registry.hasHandler('a')).toBe(false)

    registry.registerHandler('a', vi.fn())
    expect(registry.hasHandler('a')).toBe(true)
  })
})

describe('evaluateWhen', () => {
  const context = {
    perspectiveId: 'model-editor',
    hasWorkspace: true,
    hasSelection: false,
    editorMode: 'instance'
  }

  it('evaluates truthy boolean', () => {
    expect(evaluateWhen('hasWorkspace', context)).toBe(true)
    expect(evaluateWhen('hasSelection', context)).toBe(false)
  })

  it('evaluates equality', () => {
    expect(evaluateWhen("perspectiveId == 'model-editor'", context)).toBe(true)
    expect(evaluateWhen("perspectiveId == 'explorer'", context)).toBe(false)
  })

  it('evaluates inequality', () => {
    expect(evaluateWhen("perspectiveId != 'explorer'", context)).toBe(true)
    expect(evaluateWhen("perspectiveId != 'model-editor'", context)).toBe(false)
  })

  it('evaluates negation', () => {
    expect(evaluateWhen('!hasSelection', context)).toBe(true)
    expect(evaluateWhen('!hasWorkspace', context)).toBe(false)
  })

  it('evaluates compound && expressions', () => {
    expect(evaluateWhen("perspectiveId == 'model-editor' && hasWorkspace", context)).toBe(true)
    expect(evaluateWhen("perspectiveId == 'model-editor' && hasSelection", context)).toBe(false)
    expect(evaluateWhen("perspectiveId == 'explorer' && hasWorkspace", context)).toBe(false)
  })

  it('returns true for empty string', () => {
    expect(evaluateWhen('', context)).toBe(true)
  })
})
