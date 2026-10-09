<script setup lang="ts">
/**
 * One CWM file as a tab: its instance tree on the left, the context view in
 * the middle (one row per object below the context object), the models on
 * the right.
 *
 * The document is the same kind the instance editor uses - loaded by the same
 * loader into the tab's own document - so saving, validation and the model
 * browser work unchanged. Only the middle differs.
 */
import { inject, provide } from 'tsm:vue'
import CwmContextView from './CwmContextView.vue'

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
          <component :is="InstanceTree" v-if="InstanceTree" :context="ctx" />
        </div>
      </template>
      <template #center>
        <CwmContextView :context="ctx" />
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

.missing {
  padding: 1rem;
  color: var(--text-color-secondary);
}
</style>
