<script setup lang="ts">
/**
 * One instance file as a tab: its tree, its properties, its model browser.
 *
 * The tab owns its context. It is built once from the tab's own document and
 * handed down with `provide`; tree, properties and browser take it with
 * `inject`. Nothing here asks "which tab is in front?" - this component *is*
 * the tab, so the question does not arise, and nothing can wander in from
 * another one.
 *
 * Properties and model browser come from other modules and are resolved as
 * services; the tree is this module's own.
 */
import { inject, provide } from 'tsm:vue'
import InstanceTree from './InstanceTree.vue'
import { instanzTabDokument } from '../composables/tabDokumente'
import { createInstanceContext } from '../context/instanceContext'
import { EDITOR_CONTEXT_KEY } from '../context/editorContext'

const props = defineProps<{ tabId: string }>()

const tsm = inject<any>('tsm')

const tabDocument = instanzTabDokument(props.tabId)

const ctx = createInstanceContext(tabDocument.instance as any)
provide(EDITOR_CONTEXT_KEY, ctx)

const TabLayout = tsm?.getService('ui.layout.components')?.EditorTabLayout ?? null
const PropertiesPanel = tsm?.getService('ui.properties-panel.components')?.PropertiesPanel ?? null
const ModelBrowser = tsm?.getService('ui.model-browser.components')?.ModelBrowser ?? null
</script>

<template>
  <component
    :is="TabLayout"
    v-if="TabLayout"
    view-id="instance"
    left-title="Instanzen"
    right-title="Modelle"
  >
    <template #left>
      <InstanceTree :context="ctx" />
    </template>
    <template #center>
      <component :is="PropertiesPanel" v-if="PropertiesPanel" :context="ctx" />
      <div v-else class="missing">Eigenschaften nicht verfügbar</div>
    </template>
    <template v-if="ModelBrowser" #right>
      <component :is="ModelBrowser" :context="ctx" />
    </template>
  </component>
  <div v-else class="missing">Layout nicht verfügbar</div>
</template>

<style scoped>
.missing {
  padding: 1rem;
  color: var(--text-color-secondary);
}
</style>
