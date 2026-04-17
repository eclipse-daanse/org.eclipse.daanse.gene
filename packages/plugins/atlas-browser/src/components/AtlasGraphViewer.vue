<script setup lang="ts">
/**
 * AtlasGraphViewer Component
 *
 * Read-only Vue Flow based visualization of an Ecore schema.
 * Parses XMI → EPackage → extracts EClasses, EAttributes, EReferences, EDataTypes
 * and renders them as a UML-like class diagram.
 */

import { ref, watch, computed, markRaw, nextTick } from 'tsm:vue'
import { VueFlow, useVueFlow } from '@vue-flow/core'
import { Background } from '@vue-flow/background'
import { Controls } from '@vue-flow/controls'
import { MiniMap } from '@vue-flow/minimap'
import type { Node, Edge } from '@vue-flow/core'
import { EResourceSetImpl, XMIResource, URI, getEcorePackage } from '@emfts/core'
import type { EPackage, EClass, EDataType, EEnum } from '@emfts/core'

import { useSharedAtlasBrowser } from '../composables/useAtlasBrowser'
import AtlasClassNode from './flow/AtlasClassNode.vue'
import AtlasPackageNode from './flow/AtlasPackageNode.vue'
import AtlasDataTypeNode from './flow/AtlasDataTypeNode.vue'

const props = defineProps<{
  content?: string
  name?: string
}>()

const emit = defineEmits<{
  'node-click': [data: any]
}>()

// Use shared state — auto-loads content for current tree selection
const browser = useSharedAtlasBrowser()
const activeContent = computed(() => props.content || browser.graphContent.value)
const activeName = computed(() => props.name || browser.graphName.value)

// Auto-load content when tree selection changes
watch(() => browser.selectedNodeData.value, () => {
  browser.ensureContentForSelection()
}, { immediate: true })

// Node types for Vue Flow
const nodeTypes = {
  classNode: markRaw(AtlasClassNode),
  packageNode: markRaw(AtlasPackageNode),
  dataTypeNode: markRaw(AtlasDataTypeNode)
}

const loading = ref(false)
const error = ref<string | null>(null)
const nodes = ref<Node[]>([])
const edges = ref<Edge[]>([])

const { fitView } = useVueFlow({ id: 'atlas-graph' })

// Watch for content changes (props or shared state)
watch(activeContent, async (newContent) => {
  if (newContent) {
    await parseAndLayout(newContent)
  } else {
    nodes.value = []
    edges.value = []
  }
}, { immediate: true })

/**
 * Parse ecore XMI content and create flow nodes/edges
 */
async function parseAndLayout(xmiContent: string) {
  loading.value = true
  error.value = null

  try {
    const rs = new EResourceSetImpl()
    // Register ecore package for resolving type references
    rs.getPackageRegistry().set('http://www.eclipse.org/emf/2002/Ecore', getEcorePackage())

    const uri = URI.createURI('atlas://schema.ecore')
    const res = new XMIResource(uri)
    rs.getResources().push(res)
    res.setResourceSet(rs)
    res.loadFromString(xmiContent)

    const contents = res.getContents()
    const contentsSize = typeof contents.size === 'function' ? contents.size() : contents.length
    if (contentsSize === 0) {
      error.value = 'No contents found in schema'
      return
    }

    const ePackage = contents.get(0) as EPackage
    if (!ePackage.getName || !ePackage.getEClassifiers) {
      error.value = 'Root element is not an EPackage'
      return
    }

    buildGraph(ePackage)

    // Fit view after rendering
    await nextTick()
    setTimeout(() => fitView({ padding: 0.2 }), 100)
  } catch (e: any) {
    console.error('[AtlasGraphViewer] Parse error:', e)
    error.value = e.message || 'Failed to parse schema'
  } finally {
    loading.value = false
  }
}

/**
 * Build flow nodes and edges from an EPackage
 */
function buildGraph(ePackage: EPackage) {
  const newNodes: Node[] = []
  const newEdges: Edge[] = []

  const pkgName = ePackage.getName() || 'unknown'
  const nsUri = ePackage.getNsURI() || ''
  const nsPrefix = ePackage.getNsPrefix() || ''

  // Package node at top
  newNodes.push({
    id: `pkg-${pkgName}`,
    type: 'packageNode',
    position: { x: 0, y: 0 },
    data: { name: pkgName, nsUri, nsPrefix }
  })

  const classifiers = ePackage.getEClassifiers?.() || []
  const classifierArray = typeof (classifiers as any).toArray === 'function'
    ? (classifiers as any).toArray()
    : Array.from(classifiers)
  const classes: EClass[] = []
  const dataTypes: (EDataType | EEnum)[] = []

  // Separate classifiers
  for (const classifier of classifierArray) {
    if (isEClass(classifier)) {
      classes.push(classifier as EClass)
    } else {
      dataTypes.push(classifier as EDataType)
    }
  }

  // Layout: grid of classes, max 4 per row
  const COL_WIDTH = 280
  const ROW_HEIGHT = 280
  const START_X = 20
  const START_Y = 100
  const COLS = Math.min(4, Math.max(1, classes.length))

  // Place class nodes
  classes.forEach((eClass, idx) => {
    const col = idx % COLS
    const row = Math.floor(idx / COLS)
    const x = START_X + col * COL_WIDTH
    const y = START_Y + row * ROW_HEIGHT

    const className = eClass.getName() || 'Unnamed'
    const nodeId = `class-${className}`

    // Extract attributes
    const attributes: Array<{ name: string; type: string }> = []
    const eAttributes = eClass.getEAttributes?.() || []
    for (const attr of eAttributes) {
      const attrName = attr.getName?.() || ''
      let typeName = 'EString'
      try {
        const attrType = attr.getEAttributeType?.()
        if (attrType) typeName = attrType.getName?.() || 'EString'
      } catch { /* type not resolved */ }
      attributes.push({ name: attrName, type: typeName })
    }

    // Extract references
    const references: Array<{ name: string; type: string; lower: number; upper: number; containment: boolean }> = []
    const eReferences = eClass.getEReferences?.() || []
    for (const eRef of eReferences) {
      const refName = eRef.getName?.() || ''
      let typeName = 'EObject'
      try {
        const refType = eRef.getEReferenceType?.()
        if (refType) typeName = refType.getName?.() || 'EObject'
      } catch { /* type not resolved */ }
      references.push({
        name: refName,
        type: typeName,
        lower: eRef.getLowerBound?.() ?? 0,
        upper: eRef.getUpperBound?.() ?? -1,
        containment: eRef.isContainment?.() ?? false
      })
    }

    // Extract super types
    const eSuperTypes = eClass.getESuperTypes?.() || []
    const superTypeArray = Array.from(eSuperTypes)

    newNodes.push({
      id: nodeId,
      type: 'classNode',
      position: { x, y },
      data: {
        name: className,
        isAbstract: eClass.isAbstract?.() ?? false,
        attributes,
        references,
        superTypes: superTypeArray.map((st: any) => st.getName?.() || '')
      }
    })

    // Create inheritance edges (eSuperTypes)
    for (const superType of superTypeArray) {
      const superName = (superType as any).getName?.() || ''
      const superNodeId = `class-${superName}`
      // Only create edge if target class exists
      if (classes.some(c => c.getName?.() === superName)) {
        newEdges.push({
          id: `inherit-${className}-${superName}`,
          source: nodeId,
          target: superNodeId,
          type: 'smoothstep',
          animated: false,
          style: { stroke: '#4f7cac', strokeWidth: 2 },
          markerEnd: { type: 'arrowclosed', color: '#4f7cac' },
          label: '▷ extends'
        })
      }
    }

    // Create reference edges (reuse already extracted eReferences list)
    for (const eRef of eReferences) {
      let refType: any = null
      try { refType = eRef.getEReferenceType?.() } catch { /* unresolved */ }
      if (!refType) continue
      const refTypeName = refType.getName?.() || ''
      const targetNodeId = `class-${refTypeName}`
      const refName = eRef.getName?.() || ''
      const lower = eRef.getLowerBound?.() ?? 0
      const upper = eRef.getUpperBound?.() ?? -1
      const cardLabel = `${refName} [${lower}..${upper === -1 ? '*' : upper}]`

      // Only create edge if target exists in our classes
      if (classes.some(c => c.getName?.() === refTypeName)) {
        newEdges.push({
          id: `ref-${className}-${refName}`,
          source: nodeId,
          target: targetNodeId,
          type: 'smoothstep',
          animated: false,
          style: {
            stroke: '#e88b23',
            strokeWidth: 1.5,
            strokeDasharray: eRef.isContainment?.() ? '0' : '5 3'
          },
          markerEnd: { type: 'arrowclosed', color: '#e88b23' },
          label: cardLabel
        })
      }
    }
  })

  // Place data type nodes in a row below classes
  const classRows = Math.ceil(classes.length / COLS)
  const dtStartY = START_Y + classRows * ROW_HEIGHT + 40
  const DT_COL_WIDTH = 180

  dataTypes.forEach((dt, idx) => {
    const x = START_X + idx * DT_COL_WIDTH
    const y = dtStartY
    const dtName = dt.getName?.() || 'Unnamed'
    const nodeId = `dt-${dtName}`

    const isEnum = isEEnum(dt)
    const literals: string[] = []
    if (isEnum) {
      const eLiterals = (dt as any).getELiterals?.() || []
      for (const lit of eLiterals) {
        literals.push(lit.getName?.() || '')
      }
    }

    newNodes.push({
      id: nodeId,
      type: 'dataTypeNode',
      position: { x, y },
      data: {
        name: dtName,
        isEnum,
        literals,
        instanceClassName: !isEnum ? (dt as any).getInstanceClassName?.() : undefined
      }
    })
  })

  nodes.value = newNodes
  edges.value = newEdges
}

function isEClass(classifier: any): boolean {
  return typeof classifier.getEAttributes === 'function' &&
    typeof classifier.getEReferences === 'function'
}

function isEEnum(classifier: any): boolean {
  return typeof classifier.getELiterals === 'function'
}

function handleNodeClick(event: any) {
  if (event.node?.data) {
    emit('node-click', event.node.data)
  }
}
</script>

<template>
  <div class="atlas-graph-viewer">
    <!-- Loading -->
    <div v-if="loading" class="graph-loading">
      <i class="pi pi-spin pi-spinner" style="font-size: 2rem"></i>
      <span>Loading schema graph...</span>
    </div>

    <!-- Error -->
    <div v-else-if="error" class="graph-error">
      <i class="pi pi-exclamation-triangle"></i>
      <span>{{ error }}</span>
    </div>

    <!-- Empty state -->
    <div v-else-if="!activeContent" class="graph-empty">
      <i class="pi pi-sitemap" style="font-size: 2.5rem; opacity: 0.2"></i>
      <p>Select a schema and click "Show Graph" to visualize it.</p>
    </div>

    <!-- Vue Flow Graph -->
    <VueFlow
      v-else
      :nodes="nodes"
      :edges="edges"
      :node-types="nodeTypes"
      :default-edge-options="{ type: 'smoothstep' }"
      :nodes-draggable="true"
      :nodes-connectable="false"
      :edges-updatable="false"
      fit-view-on-init
      class="atlas-flow"
      @node-click="handleNodeClick"
    >
      <Background pattern-color="#e8e8e8" :gap="16" />
      <Controls :show-interactive="false" />
      <MiniMap />
    </VueFlow>
  </div>
</template>

<style scoped>
.atlas-graph-viewer {
  display: flex;
  flex-direction: column;
  height: 100%;
  overflow: hidden;
}

.graph-loading,
.graph-error,
.graph-empty {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 12px;
  padding: 48px;
  color: var(--p-text-muted-color);
  text-align: center;
  flex: 1;
}

.graph-error {
  color: var(--p-red-500);
}

.graph-empty p {
  margin: 0;
  font-size: 0.85rem;
  max-width: 300px;
}

.atlas-flow {
  flex: 1;
}
</style>

<style>
/* Vue Flow required styles (global) */
@import '@vue-flow/core/dist/style.css';
@import '@vue-flow/core/dist/theme-default.css';
@import '@vue-flow/controls/dist/style.css';
@import '@vue-flow/minimap/dist/style.css';
</style>
