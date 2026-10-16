<script setup lang="ts">
/**
 * Ecore Class Diagram Preview for the Properties Panel.
 *
 * Loads the ecore-class-diagram.xmi DiagramModel once, then determines the
 * diagram root and highlight based on the currently selected EObject.
 *
 * Root-Logic:
 *   EPackage       -> selectedObject is root, no highlight
 *   EClass         -> eContainer (Package) is root, class is highlighted
 *   EAttribute/Ref -> eContainer.eContainer (Package) is root, owning class highlighted
 *   EEnum          -> eContainer (Package) is root, enum is highlighted
 *   EOperation     -> eContainer.eContainer (Package) is root, owning class highlighted
 *   Instance       -> rootPackage of metamodel is root, eClass() of instance highlighted
 */
import { computed, ref, shallowRef, watch, onMounted, nextTick } from 'tsm:vue'
import {
  EResourceSetImpl, XMIResource, URI, getEcorePackage,
  type EObject, type EPackage,
} from '@emfts/core'
import { useElkLayout } from '../diagram/useElkLayout'
import { nodeId } from '../diagram/interpret'
import DiagramRenderer from './DiagramRenderer.vue'

import diagrammodelEcore from '../assets/diagrammodel.ecore?raw'
import ecoreClassDiagramXmi from '../assets/ecore-class-diagram.xmi?raw'

const props = defineProps<{
  selectedObject: EObject | null
  mode: 'instance' | 'metamodel'
  rootPackage?: EPackage | null
}>()

const emit = defineEmits<{
  (e: 'navigate', obj: EObject): void
}>()

const diagramModel = shallowRef<EObject | null>(null)
const rendererRef = ref<InstanceType<typeof DiagramRenderer> | null>(null)

// Load DiagramModel once
const loading = ref(true)
const loadError = ref<string | null>(null)
onMounted(async () => {
  try {
    const rs = new EResourceSetImpl()
    // Register Ecore metamodel
    rs.getPackageRegistry().set('http://www.eclipse.org/emf/2002/Ecore', getEcorePackage())

    // Load diagrammodel.ecore metamodel
    const metaRes = new XMIResource(new URI('diagrammodel.ecore'))
    metaRes.setResourceSet(rs)
    await metaRes.loadFromString(diagrammodelEcore)
    const dmPkg = metaRes.getContents()[0]
    if (dmPkg) {
      const nsURI = dmPkg.eGet(dmPkg.eClass().getEStructuralFeature('nsURI')!)
      rs.getPackageRegistry().set(String(nsURI), dmPkg)
    }

    // Load ecore-class-diagram.xmi
    const diagRes = new XMIResource(new URI('ecore-class-diagram.xmi'))
    diagRes.setResourceSet(rs)
    await diagRes.loadFromString(ecoreClassDiagramXmi)
    const contents = diagRes.getContents()
    if (contents.length > 0) {
      diagramModel.value = contents[0]
    }
  } catch (e) {
    loadError.value = String(e)
    console.error('[EcoreDiagramPreview] Failed to load diagram model:', e)
  } finally {
    loading.value = false
  }
})

// Determine diagram root
const diagramRoot = computed<EObject | null>(() => {
  const sel = props.selectedObject
  if (!sel) return null

  if (props.mode === 'instance') {
    return props.rootPackage ?? null
  }

  // Metamodel mode: only show diagram for classifiers and packages
  try {
    const cn = sel.eClass().getName()
    if (cn === 'EPackage' || cn === 'EClass' || cn === 'EEnum' || cn === 'EDataType') {
      return sel
    }
  } catch { /* skip */ }
  return null
})

const highlightId = computed<string | null>(() => null)

// Layout
const modelRef = computed(() => diagramModel.value)
const rootRef = computed(() => diagramRoot.value)

const { laidOut, nodeIndex, edgeMeta, renderVersion, portNodeMap, layoutPending } = useElkLayout(modelRef, rootRef)

// Auto-fit when layout changes
watch(laidOut, async (g) => {
  if (!g) return
  await nextTick()
  const renderer = rendererRef.value
  if (!renderer) return
  // Compute bounding box from the ELK result
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity
  function walkBounds(parent: any, offX: number, offY: number) {
    for (const c of parent.children ?? []) {
      const x = offX + (c.x ?? 0)
      const y = offY + (c.y ?? 0)
      const w = c.width ?? 220
      const h = c.height ?? 34
      if (x < minX) minX = x
      if (y < minY) minY = y
      if (x + w > maxX) maxX = x + w
      if (y + h > maxY) maxY = y + h
      walkBounds(c, x, y)
    }
  }
  walkBounds(g, 0, 0)
  if (minX < Infinity) {
    const svgEl = renderer.$el as SVGSVGElement
    const containerW = svgEl?.clientWidth ?? 400
    const containerH = svgEl?.clientHeight ?? 300
    renderer.fitToContent({ x: minX, y: minY, w: maxX - minX, h: maxY - minY }, containerW, containerH)
  }
})

const hasDiagram = computed(() => !!diagramModel.value && !!diagramRoot.value)
</script>

<template>
  <div class="ecore-diagram-preview">
    <div v-if="loadError" class="diagram-error">
      <span class="error-icon">&#9888;</span>
      <span>{{ loadError }}</span>
    </div>
    <div v-if="loading || layoutPending" class="diagram-loading">
      <div class="loading-bar" />
    </div>
    <div v-else-if="!hasDiagram" class="diagram-empty">
      <span class="empty-text">No diagram available</span>
    </div>
    <DiagramRenderer
      v-else
      ref="rendererRef"
      :laidOut="laidOut"
      :nodeIndex="nodeIndex"
      :edgeMeta="edgeMeta"
      :renderVersion="renderVersion"
      :portNodeMap="portNodeMap"
      :highlightId="highlightId"
      @navigate="(obj) => emit('navigate', obj)"
    />
  </div>
</template>

<style scoped>
.ecore-diagram-preview {
  width: 100%;
  height: 100%;
  overflow: hidden;
  position: relative;
  background: var(--surface-ground, #f8fafc);
}
.diagram-error {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  padding: 0.5rem;
  color: var(--red-500, #ef4444);
  font-size: 0.75rem;
}
.error-icon { font-size: 1rem; }
.diagram-loading {
  height: 100%;
  display: flex;
  align-items: flex-start;
}
.loading-bar {
  width: 100%;
  height: 3px;
  background: var(--surface-border, #e2e8f0);
  position: relative;
  overflow: hidden;
}
.loading-bar::after {
  content: '';
  position: absolute;
  top: 0;
  left: -40%;
  width: 40%;
  height: 100%;
  background: var(--primary-color, #6366f1);
  animation: loading-slide 1.2s ease-in-out infinite;
}
@keyframes loading-slide {
  0% { left: -40%; }
  100% { left: 100%; }
}
.diagram-empty {
  display: flex;
  align-items: center;
  justify-content: center;
  height: 100%;
  color: var(--text-color-secondary, #94a3b8);
  font-size: 0.8rem;
}
</style>
