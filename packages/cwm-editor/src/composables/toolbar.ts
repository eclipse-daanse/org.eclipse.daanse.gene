/**
 * The CWM editor's own toolbar (menu "cwm-editor" in the app's menu bar):
 * save, the overview beside the context view, field rules, numbering and
 * the icon settings. Numbering is kept per browser and holds for every CWM
 * tab; overview and field rules act on the tab in front, which registers its
 * handlers here while it is open.
 */
import { ref, shallowReactive, watch } from 'tsm:vue'

function stored(key: string, fallback: boolean) {
  const value = ref((() => {
    try {
      const v = localStorage.getItem(key)
      return v == null ? fallback : v === 'on'
    } catch { return fallback }
  })())
  watch(value, on => { try { localStorage.setItem(key, on ? 'on' : 'off') } catch { /* no storage */ } })
  return value
}

/** Outline numbers on the rows */
export const numbering = stored('cwm.editor.numbering', false)

export interface CwmTabTools {
  openFieldRules: () => void
  toggleOverview: () => void
  overviewOpen: () => boolean
}

/** Reactive, so the menu enables its buttons once a tab has registered */
const tabs = shallowReactive(new Map<string, CwmTabTools>())

export function registerTabTools(tabId: string, tools: CwmTabTools): () => void {
  tabs.set(tabId, tools)
  return () => { if (tabs.get(tabId) === tools) tabs.delete(tabId) }
}

/** The menu of the CWM tabs; `frontTabId` names the tab in front */
export function cwmMenu(frontTabId: () => string | undefined, emit: (event: string, payload?: any) => void): any[] {
  const front = () => {
    const id = frontTabId()
    return id ? tabs.get(id) ?? null : null
  }
  return [
    {
      id: 'cwm.save',
      icon: 'pi pi-save',
      label: 'Speichern',
      action: () => emit('save-instances-request')
    },
    { id: 'cwm.sep1', separator: true, icon: '', label: '', action: () => {} },
    {
      id: 'cwm.overview',
      icon: 'pi pi-table',
      label: 'Overview ein-/ausblenden',
      active: () => !!front()?.overviewOpen(),
      disabled: () => !front(),
      action: () => front()?.toggleOverview()
    },
    {
      id: 'cwm.fieldRules',
      icon: 'pi pi-sliders-h',
      label: 'Feldregeln: Vorschlagswerte, Defaults und ausgeblendete Attribute',
      disabled: () => !front(),
      action: () => front()?.openFieldRules()
    },
    {
      id: 'cwm.numbering',
      icon: 'pi pi-sort-numeric-down',
      label: 'Nummerierung ein-/ausblenden',
      active: () => numbering.value,
      action: () => { numbering.value = !numbering.value }
    },
    { id: 'cwm.sep2', separator: true, icon: '', label: '', action: () => {} },
    {
      id: 'cwm.iconSettings',
      icon: 'pi pi-cog',
      label: 'Icon Settings',
      // The general (workspace) icon settings, on the Icon Mappings tab - as in the instance editor
      action: () => emit('show-workspace-settings', { section: 'icons' })
    }
  ]
}
