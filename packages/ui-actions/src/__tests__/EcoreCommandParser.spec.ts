import { describe, it, expect } from 'vitest'
import { parseCommandEcore } from '../EcoreCommandParser'

const SAMPLE_ECORE = `<?xml version="1.0" encoding="UTF-8"?>
<ecore:EPackage xmi:version="2.0" xmlns:xmi="http://www.omg.org/XMI" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"
    xmlns:ecore="http://www.eclipse.org/emf/2002/Ecore" name="testcommands" nsURI="http://test/commands/1.0.0"
    nsPrefix="testcommands">

  <eClassifiers xsi:type="ecore:EClass" name="TestCommands"
      eSuperTypes="command-model.ecore#//CommandInterface">

    <eOperations name="saveFile">
      <eAnnotations source="http://gene/model/command/Command">
        <details key="commandId" value="test.saveFile"/>
        <details key="label" value="Save File"/>
        <details key="category" value="FILE"/>
        <details key="scope" value="GLOBAL"/>
        <details key="keybinding" value="Ctrl+S"/>
        <details key="icon" value="pi pi-save"/>
        <details key="when" value="hasWorkspace"/>
      </eAnnotations>
    </eOperations>

    <eOperations name="openFile">
      <eAnnotations source="http://gene/model/command/Command">
        <details key="commandId" value="test.openFile"/>
        <details key="label" value="Open File"/>
        <details key="category" value="FILE"/>
        <details key="scope" value="GLOBAL"/>
      </eAnnotations>
      <eParameters name="path" eType="ecore:EDataType http://www.eclipse.org/emf/2002/Ecore#//EString" lowerBound="1"/>
      <eParameters name="readonly" eType="ecore:EDataType http://www.eclipse.org/emf/2002/Ecore#//EBoolean"/>
    </eOperations>

    <eOperations name="setCount">
      <eAnnotations source="http://gene/model/command/Command">
        <details key="commandId" value="test.setCount"/>
        <details key="label" value="Set Count"/>
        <details key="category" value="TOOLS"/>
        <details key="scope" value="EDITOR"/>
      </eAnnotations>
      <eParameters name="count" eType="ecore:EDataType http://www.eclipse.org/emf/2002/Ecore#//EInt" lowerBound="1"/>
    </eOperations>

    <!-- Operation without @Command annotation — should be ignored -->
    <eOperations name="internalHelper"/>

  </eClassifiers>

  <!-- Class that does NOT extend CommandInterface — should be ignored -->
  <eClassifiers xsi:type="ecore:EClass" name="OtherClass">
    <eOperations name="doSomething">
      <eAnnotations source="http://gene/model/command/Command">
        <details key="commandId" value="other.doSomething"/>
        <details key="label" value="Do Something"/>
        <details key="category" value="TOOLS"/>
        <details key="scope" value="GLOBAL"/>
      </eAnnotations>
    </eOperations>
  </eClassifiers>

</ecore:EPackage>`

describe('EcoreCommandParser', () => {
  it('parses commands from ecore XML', () => {
    const commands = parseCommandEcore(SAMPLE_ECORE, 'test-plugin')
    expect(commands).toHaveLength(3)
  })

  it('extracts annotation details correctly', () => {
    const commands = parseCommandEcore(SAMPLE_ECORE, 'test-plugin')
    const save = commands.find(c => c.commandId === 'test.saveFile')!

    expect(save).toBeDefined()
    expect(save.label).toBe('Save File')
    expect(save.category).toBe('FILE')
    expect(save.scope).toBe('GLOBAL')
    expect(save.keybinding).toBe('Ctrl+S')
    expect(save.icon).toBe('pi pi-save')
    expect(save.when).toBe('hasWorkspace')
    expect(save.moduleId).toBe('test-plugin')
    expect(save.enabled).toBe(true)
  })

  it('parses parameters with type mapping', () => {
    const commands = parseCommandEcore(SAMPLE_ECORE, 'test-plugin')
    const openFile = commands.find(c => c.commandId === 'test.openFile')!

    expect(openFile.parameters).toHaveLength(2)

    const pathParam = openFile.parameters.find(p => p.name === 'path')!
    expect(pathParam.type).toBe('string')
    expect(pathParam.required).toBe(true)

    const readonlyParam = openFile.parameters.find(p => p.name === 'readonly')!
    expect(readonlyParam.type).toBe('boolean')
    expect(readonlyParam.required).toBe(false)
  })

  it('maps EInt to number', () => {
    const commands = parseCommandEcore(SAMPLE_ECORE, 'test-plugin')
    const setCount = commands.find(c => c.commandId === 'test.setCount')!

    expect(setCount.parameters).toHaveLength(1)
    expect(setCount.parameters[0].name).toBe('count')
    expect(setCount.parameters[0].type).toBe('number')
    expect(setCount.parameters[0].required).toBe(true)
  })

  it('ignores operations without @Command annotation', () => {
    const commands = parseCommandEcore(SAMPLE_ECORE, 'test-plugin')
    const internal = commands.find(c => c.commandId.includes('internalHelper'))
    expect(internal).toBeUndefined()
  })

  it('ignores classes that do not extend CommandInterface', () => {
    const commands = parseCommandEcore(SAMPLE_ECORE, 'test-plugin')
    const other = commands.find(c => c.commandId === 'other.doSomething')
    expect(other).toBeUndefined()
  })

  it('uses moduleId as default commandId prefix', () => {
    const ecore = `<?xml version="1.0" encoding="UTF-8"?>
<ecore:EPackage xmi:version="2.0" xmlns:xmi="http://www.omg.org/XMI" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"
    xmlns:ecore="http://www.eclipse.org/emf/2002/Ecore" name="test" nsURI="http://test/1.0" nsPrefix="test">
  <eClassifiers xsi:type="ecore:EClass" name="Cmds" eSuperTypes="command-model.ecore#//CommandInterface">
    <eOperations name="myOp">
      <eAnnotations source="http://gene/model/command/Command">
        <details key="label" value="My Op"/>
      </eAnnotations>
    </eOperations>
  </eClassifiers>
</ecore:EPackage>`

    const commands = parseCommandEcore(ecore, 'my-plugin')
    expect(commands[0].commandId).toBe('my-plugin.myOp')
    expect(commands[0].category).toBe('TOOLS') // default
    expect(commands[0].scope).toBe('GLOBAL') // default
  })

  it('returns empty array for invalid XML', () => {
    const commands = parseCommandEcore('not valid xml!!!', 'test')
    expect(commands).toEqual([])
  })

  it('returns empty array for ecore with no CommandInterface classes', () => {
    const ecore = `<?xml version="1.0" encoding="UTF-8"?>
<ecore:EPackage xmi:version="2.0" xmlns:xmi="http://www.omg.org/XMI" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"
    xmlns:ecore="http://www.eclipse.org/emf/2002/Ecore" name="empty" nsURI="http://empty/1.0" nsPrefix="empty">
  <eClassifiers xsi:type="ecore:EClass" name="Plain">
    <eOperations name="op"/>
  </eClassifiers>
</ecore:EPackage>`

    const commands = parseCommandEcore(ecore, 'test')
    expect(commands).toEqual([])
  })
})
