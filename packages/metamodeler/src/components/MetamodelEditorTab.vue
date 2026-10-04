<script setup lang="ts">
/**
 * One `.ecore` as a tab: its tree, its properties, the Ecore types.
 *
 * The tab owns its metamodeler instance and builds its context from it once,
 * then hands the context down with `provide`. The tree gets the instance as a
 * prop rather than through the shared facade, so it shows this tab's model and
 * no other - whatever lies in front.
 */
import { inject, provide } from 'tsm:vue'
import MetamodelerTree from './MetamodelerTree.vue'
import { metamodelerFuerTab } from '../composables/tabDokumente'

const props = defineProps<{ tabId: string }>()

const tsm = inject<any>('tsm')

const metamodeler = metamodelerFuerTab(props.tabId)

/*
 * `Symbol.for` on purpose: the same key in every module without one importing
 * the other. `ui-instance-tree` defines it the same way.
 */
const EDITOR_CONTEXT_KEY = Symbol.for('gene:editorContext')
const ctx = tsm?.getService('gene.editor.context')?.createMetamodelContext?.(metamodeler) ?? null
if (ctx) provide(EDITOR_CONTEXT_KEY, ctx)

const TabLayout = tsm?.getService('ui.layout.components')?.EditorTabLayout ?? null
const PropertiesPanel = tsm?.getService('ui.properties-panel.components')?.PropertiesPanel ?? null
const ModelBrowser = tsm?.getService('ui.model-browser.components')?.ModelBrowser ?? null
</script>

<template>
  <component
    :is="TabLayout"
    v-if="TabLayout"
    view-id="metamodel"
    left-title="Metamodell"
    left-icon="pi pi-sitemap"
    left-dock="primary-bottom"
    right-title="Ecore-Typen"
    right-icon="pi pi-box"
    right-dock="secondary"
  >
    <template #left>
      <MetamodelerTree :metamodeler="metamodeler" />
    </template>
    <template #center>
      <component :is="PropertiesPanel" v-if="PropertiesPanel && ctx" :context="ctx" />
      <div v-else class="missing">Eigenschaften nicht verfügbar</div>
    </template>
    <template v-if="ModelBrowser && ctx" #right>
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
