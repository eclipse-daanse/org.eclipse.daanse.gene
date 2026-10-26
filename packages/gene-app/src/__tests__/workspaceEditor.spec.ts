/**
 * The workspace editor: the open workspace with its actions - and another
 * workspace file, read-only, with a way to open it.
 */
import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import WorkspaceEditor from '../workspace/WorkspaceEditor.vue'
import type { WorkspaceOverview } from '../services/workspaceOverview'

const overview: WorkspaceOverview = {
  models: [
    { key: 'm0', label: 'university', location: 'uni/university.ecore', status: 'not-loaded' },
    { key: 'm1', label: 'gone', location: 'uni/gone.ecore', status: 'missing' },
  ],
  instances: [{ key: 'i0', label: 'a.xmi', location: 'uni/a.xmi', status: 'loaded' }],
  constraints: [],
  atlas: [{ key: 'a0', label: 'jena', location: 'https://atlas', status: 'disconnected' }],
  resolvers: [],
}

function editor(readonly: boolean) {
  return mount(WorkspaceEditor, {
    props: { name: 'uni', path: 'uni/uni.wsp', dirty: false, overview, addableModels: [], addableInstances: [], readonly },
  })
}

describe('workspace editor', () => {
  it('the open workspace: save, add, open, remove, connect', () => {
    const wrapper = editor(false)
    expect(wrapper.find('[data-testid="gene.WorkspaceEditor.Save"]').exists()).toBe(true)
    expect(wrapper.find('[data-testid="gene.WorkspaceEditor.model.Add"]').exists()).toBe(true)
    expect(wrapper.findAll('.ws-icon-btn--danger')).toHaveLength(3)
    expect(wrapper.find('[title="Verbinden"]').exists()).toBe(true)
    expect(wrapper.text()).toContain('nicht geladen')
  })

  it('another workspace: read-only, only missing files named, a button to open it', async () => {
    const wrapper = editor(true)
    expect(wrapper.text()).toContain('Vorschau')
    expect(wrapper.find('[data-testid="gene.WorkspaceEditor.Save"]').exists()).toBe(false)
    expect(wrapper.find('[data-testid="gene.WorkspaceEditor.model.Add"]').exists()).toBe(false)
    expect(wrapper.findAll('.ws-icon-btn')).toHaveLength(0)
    expect(wrapper.text()).toContain('nicht gefunden')
    expect(wrapper.text()).not.toContain('nicht geladen')
    expect(wrapper.text()).not.toContain('getrennt')

    await wrapper.find('[data-testid="gene.WorkspaceEditor.OpenWorkspace"]').trigger('click')
    expect(wrapper.emitted('openWorkspace')).toHaveLength(1)
  })
})
