<script setup lang="ts">
/**
 * One CWM file as a tab: its instance tree on the left, the context view in
 * the middle (one row per object below the context object), the models on
 * the right. The tree marks the object on top of the context view (PH-3).
 *
 * The document is the same kind the instance editor uses - loaded by the same
 * loader into the tab's own document - so saving, validation and the model
 * browser work unchanged. Only the middle differs.
 */
import { inject, provide, ref, shallowRef } from 'tsm:vue'
import CwmContextView from './CwmContextView.vue'
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

const contextView = ref<{ setContext: (object: any) => void } | null>(null)

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
        <CwmContextView ref="contextView" :context="ctx" @top-object="topObject = $event" />
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
