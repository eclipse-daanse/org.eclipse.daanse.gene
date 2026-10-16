<script setup lang="ts">
/**
 * One CWM file as a tab: its instance tree on the left, the context view in
 * the middle (one row per object below the context object), the models on
 * the right. The tree marks the object on top of the context view (PH-3).
 *
 * The document is the same kind the instance editor uses - loaded by the same
 * loader into the tab's own document - so saving, validation and the model
 * browser work unchanged. Only the middle differs: the context view, and
 * beside it - on demand - the glossary (split side by side or one above the other).
 */
import { computed, inject, provide, ref, shallowRef, watch } from 'tsm:vue'
import CwmContextView from './CwmContextView.vue'
import GlossaryView from './GlossaryView.vue'
import { objectSlug } from '../composables/documentation'

const props = defineProps<{ tabId: string }>()

const tsm = inject<any>('tsm')
const trees = tsm?.getService('ui.instance-tree.composables')
const contexts = tsm?.getService('ui.instance-tree.context')

const tabDocument = trees?.instanzTabDokument?.(props.tabId)
const ctx = tabDocument && contexts?.createInstanceContext ? contexts.createInstanceContext(tabDocument.instance) : null
if (ctx && contexts?.EDITOR_CONTEXT_KEY) provide(contexts.EDITOR_CONTEXT_KEY, ctx)

const TabLayout = tsm?.getService('ui.layout.components')?.EditorTabLayout ?? null
const InstanceTree = tsm?.getService('ui.instance-tree.components')?.InstanceTree ?? null
const ModelBrowser = tsm?.getService('ui.model-browser.components')?.ModelBrowser ?? null

/** The object on top of the context view; the tree marks it (PH-3) */
const topObject = shallowRef<any>(null)

const contextView = ref<{ setContext: (object: any) => void; objects: any[]; modelClasses: any[] } | null>(null)

/* ── glossary beside the context view ────────────────────────────── */

const LAYOUT_KEY = 'cwm.editor.glossary'

function loadLayout(): { open: boolean; orientation: 'row' | 'column'; share: number } {
  try {
    const saved = JSON.parse(localStorage.getItem(LAYOUT_KEY) ?? 'null')
    if (saved) return { open: !!saved.open, orientation: saved.orientation === 'column' ? 'column' : 'row', share: Number(saved.share) || 40 }
  } catch { /* no storage - defaults */ }
  return { open: false, orientation: 'row', share: 40 }
}

const saved = loadLayout()
const glossaryOpen = ref(saved.open)
const orientation = ref<'row' | 'column'>(saved.orientation)
/** Share of the glossary in percent */
const share = ref(saved.share)

watch([glossaryOpen, orientation, share], () => {
  try {
    localStorage.setItem(LAYOUT_KEY, JSON.stringify({ open: glossaryOpen.value, orientation: orientation.value, share: share.value }))
  } catch { /* no storage */ }
})

const version = computed<number>(() => ctx?.version?.value ?? 0)

const splitEl = ref<HTMLElement | null>(null)

/** Dragging the divider sets the glossary's share */
function startDrag(event: PointerEvent): void {
  const el = splitEl.value
  if (!el) return
  event.preventDefault()
  const box = el.getBoundingClientRect()
  const move = (e: PointerEvent) => {
    const rest = orientation.value === 'row'
      ? (box.right - e.clientX) / box.width
      : (box.bottom - e.clientY) / box.height
    share.value = Math.round(Math.min(85, Math.max(15, rest * 100)))
  }
  const up = () => {
    window.removeEventListener('pointermove', move)
    window.removeEventListener('pointerup', up)
  }
  window.addEventListener('pointermove', move)
  window.addEventListener('pointerup', up)
}

/** A jump from the glossary works like a click in the tree: the row moves to the top */
function jumpTo(object: any): void {
  ctx?.selectObject?.(object)
}

/** The tree's context menu offers to show an object as context object */
function treeMenuExtras(object: any) {
  return [{
    label: 'Als Kontextobjekt setzen',
    icon: 'pi pi-sitemap',
    command: () => contextView.value?.setContext(object)
  }]
}

/** Test id of a tree entry (PH-C1) */
function treeItemTestId(object: any): string {
  return `cwm.Editor.Tree.TreeItem@${objectSlug(object)}`
}
</script>

<template>
  <div v-if="TabLayout && ctx" class="cwm-editor" data-testid="cwm.Editor">
    <component
      :is="TabLayout"
      view-id="cwm"
      left-title="Instanzen"
      left-icon="pi pi-sitemap"
      left-dock="primary-bottom"
      right-title="Modelle"
      right-icon="pi pi-box"
      right-dock="secondary"
    >
      <template #left>
        <div class="tree" data-testid="cwm.Editor.Tree" data-wire-kind="REGION">
          <component
            :is="InstanceTree"
            v-if="InstanceTree"
            :context="ctx"
            :node-test-id="treeItemTestId"
            :current-object="topObject"
            :context-menu-extras="treeMenuExtras"
          />
        </div>
      </template>
      <template #center>
        <div ref="splitEl" class="split" :class="orientation">
          <div class="pane main">
            <CwmContextView ref="contextView" :context="ctx" @top-object="topObject = $event">
              <template #tools>
                <button
                  type="button"
                  class="glossary-toggle"
                  :class="{ active: glossaryOpen }"
                  data-testid="cwm.Editor.ContextView.Header.Glossary"
                  title="Glossar ein-/ausblenden"
                  @click="glossaryOpen = !glossaryOpen"
                >Glossar</button>
              </template>
            </CwmContextView>
          </div>
          <template v-if="glossaryOpen">
            <div class="divider" @pointerdown="startDrag"></div>
            <div class="pane side" :style="{ flexBasis: `${share}%` }">
              <GlossaryView
                :objects="contextView?.objects ?? []"
                :classes="contextView?.modelClasses ?? []"
                :selected="ctx.selectedObject?.value ?? null"
                :version="version"
                :orientation="orientation"
                @jump="jumpTo"
                @close="glossaryOpen = false"
                @orientation="orientation = $event"
              />
            </div>
          </template>
        </div>
      </template>
      <template v-if="ModelBrowser" #right>
        <component :is="ModelBrowser" :context="ctx" />
      </template>
    </component>
  </div>
  <div v-else class="missing">CWM-Editor nicht verfügbar — Instanzbaum oder Layout fehlen.</div>
</template>

<style scoped>
.cwm-editor,
.tree {
  height: 100%;
}

.split {
  height: 100%;
  display: flex;
  min-width: 0;
  min-height: 0;
}

.split.column {
  flex-direction: column;
}

.pane {
  min-width: 0;
  min-height: 0;
  overflow: hidden;
  /* The panes fill their share in both directions, so their content scrolls inside */
  display: flex;
  flex-direction: column;
}

.pane > * {
  flex: 1 1 auto;
  min-height: 0;
}

.main {
  flex: 1 1 0;
}

.side {
  flex: 0 0 auto;
}

.divider {
  flex: 0 0 5px;
  background: var(--surface-border);
  cursor: col-resize;
}

.split.column .divider {
  cursor: row-resize;
}

.divider:hover {
  background: color-mix(in srgb, var(--primary-color) 55%, transparent);
}

.glossary-toggle {
  font: inherit;
  font-size: 0.75rem;
  padding: 0.15rem 0.5rem;
  border: 1px solid var(--surface-border);
  border-radius: 3px;
  background: transparent;
  color: var(--text-color);
  cursor: pointer;
}

.glossary-toggle.active {
  border-color: var(--primary-color);
  color: var(--primary-color);
}

.missing {
  padding: 1rem;
  color: var(--text-color-secondary);
}
</style>
