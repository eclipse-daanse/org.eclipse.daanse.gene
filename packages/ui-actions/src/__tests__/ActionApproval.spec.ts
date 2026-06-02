import { describe, it, expect } from 'vitest'
import type { ActionResult, ProposedAction } from '../types'

describe('ActionApproval - ProposedAction handling', () => {
  it('ActionResult can contain proposedActions', () => {
    const result: ActionResult = {
      status: 'SUCCESS',
      logs: [],
      artifacts: [],
      proposedActions: [
        {
          commandId: 'instance.loadFromXmi',
          label: 'Load derived model',
          description: 'Import the derived model into the instance tree',
          args: '{"xmiContent": "<xmi>...</xmi>"}',
          autoExecute: false
        },
        {
          commandId: 'problems.show',
          label: 'Show Problems',
          description: 'Open the Problems panel',
          autoExecute: true
        }
      ]
    }

    expect(result.proposedActions).toHaveLength(2)
    expect(result.proposedActions![0].commandId).toBe('instance.loadFromXmi')
    expect(result.proposedActions![0].autoExecute).toBe(false)
    expect(result.proposedActions![1].autoExecute).toBe(true)
  })

  it('ActionResult without proposedActions is valid', () => {
    const result: ActionResult = {
      status: 'SUCCESS',
      logs: [],
      artifacts: []
    }

    expect(result.proposedActions).toBeUndefined()
  })

  it('autoExecute defaults to undefined (treated as false)', () => {
    const action: ProposedAction = {
      commandId: 'test.action',
      label: 'Test'
    }

    expect(action.autoExecute).toBeUndefined()
  })

  it('filters autoExecute actions correctly', () => {
    const actions: ProposedAction[] = [
      { commandId: 'a', label: 'A', autoExecute: true },
      { commandId: 'b', label: 'B', autoExecute: false },
      { commandId: 'c', label: 'C' },
      { commandId: 'd', label: 'D', autoExecute: true }
    ]

    const autoExec = actions.filter(a => a.autoExecute)
    expect(autoExec.map(a => a.commandId)).toEqual(['a', 'd'])
  })

  it('parses args as JSON correctly', () => {
    const action: ProposedAction = {
      commandId: 'test.load',
      label: 'Load',
      args: '{"path": "/data/model.xmi", "reload": true}'
    }

    const parsed = JSON.parse(action.args!)
    expect(parsed.path).toBe('/data/model.xmi')
    expect(parsed.reload).toBe(true)
  })
})
