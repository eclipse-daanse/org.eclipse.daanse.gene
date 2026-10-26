/**
 * The loaded workspace in the title bar, with a dot while it has unsaved
 * changes. Changes to a workspace used to show only inside the settings
 * dialog; the dot puts them in sight and saves on click.
 */
import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import WorkspaceTitle from '../components/WorkspaceTitle.vue'
import { workspaceBadge } from '../composables/workspaceBadge'

const uni = workspaceBadge('uni/uni.wsp', 'uni')

describe('workspace in the title bar', () => {
  it('shows letter and name of the loaded workspace', () => {
    const wrapper = mount(WorkspaceTitle, { props: { badge: uni, fallbackName: 'Gene Workspace' } })
    expect(wrapper.find('.workspace-initial').text()).toBe('U')
    expect(wrapper.find('.workspace-name').text()).toBe('uni')
  })

  it('no workspace loaded: the fallback name, no letter', () => {
    const wrapper = mount(WorkspaceTitle, { props: { badge: null, fallbackName: 'Gene Workspace' } })
    expect(wrapper.find('.workspace-initial').exists()).toBe(false)
    expect(wrapper.text()).toBe('Gene Workspace')
  })

  it('no dot while everything is saved', () => {
    const wrapper = mount(WorkspaceTitle, { props: { badge: uni, fallbackName: '', dirty: false } })
    expect(wrapper.find('[data-testid="gene.WorkspaceTitle.Dirty"]').exists()).toBe(false)
  })

  it('a dot for unsaved changes - clicking it saves', async () => {
    const wrapper = mount(WorkspaceTitle, { props: { badge: uni, fallbackName: '', dirty: true } })
    const dot = wrapper.find('[data-testid="gene.WorkspaceTitle.Dirty"]')
    expect(dot.exists()).toBe(true)
    expect(dot.attributes('title')).toContain('Ungespeicherte Änderungen')

    await dot.trigger('click')
    expect(wrapper.emitted('save')).toHaveLength(1)
  })

  it('while saving the dot cannot be clicked again', () => {
    const wrapper = mount(WorkspaceTitle, { props: { badge: uni, fallbackName: '', dirty: true, saving: true } })
    expect(wrapper.find('[data-testid="gene.WorkspaceTitle.Dirty"]').attributes('disabled')).toBeDefined()
  })

  it('clicking the name shows the workspace - even after its tab was closed', async () => {
    const wrapper = mount(WorkspaceTitle, { props: { badge: uni, fallbackName: '' } })
    await wrapper.find('[data-testid="gene.WorkspaceTitle.Open"]').trigger('click')
    expect(wrapper.emitted('open')).toHaveLength(1)
    expect(wrapper.emitted('save')).toBeUndefined()
  })
})
