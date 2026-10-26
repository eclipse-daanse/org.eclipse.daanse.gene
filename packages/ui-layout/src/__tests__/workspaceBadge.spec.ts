/**
 * The loaded workspace in the title bar: name and a square with its first
 * letter. Before, the title said "Gene Workspace" whatever was loaded.
 */
import { describe, it, expect } from 'vitest'
import { workspaceBadge } from '../composables/workspaceBadge'

describe('workspace badge', () => {
  it('nothing loaded, no badge', () => {
    expect(workspaceBadge(null, 'uni')).toBeNull()
  })

  it('takes the name the workspace gives itself, with its first letter', () => {
    const badge = workspaceBadge('uni/uni.wsp', 'uni')!
    expect(badge.name).toBe('uni')
    expect(badge.initial).toBe('U')
    expect(badge.path).toBe('uni/uni.wsp')
  })

  it('without a name - or with the default one - it is called after its file', () => {
    expect(workspaceBadge('demo/sören.wsp', '')!.name).toBe('sören')
    expect(workspaceBadge('demo/sören.wsp', 'Workspace Configuration')!.name).toBe('sören')
    expect(workspaceBadge('demo/sören.wsp', 'Workspace Configuration')!.initial).toBe('S')
  })

  it('the same name always gets the same colour, another name another one', () => {
    const uni = workspaceBadge('a/uni.wsp', 'uni')!.color
    expect(workspaceBadge('b/other.wsp', 'uni')!.color).toBe(uni)
    expect(workspaceBadge('a/wasser.wsp', 'wasser')!.color).not.toBe(uni)
    expect(uni).toMatch(/^hsl\(\d+ 55% 42%\)$/)
  })

  it('a name starting with an umlaut keeps it', () => {
    expect(workspaceBadge('x.wsp', 'übersicht')!.initial).toBe('Ü')
  })
})
