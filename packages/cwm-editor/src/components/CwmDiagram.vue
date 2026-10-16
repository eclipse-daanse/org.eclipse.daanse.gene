<script setup lang="ts">
/**
 * The diagram of a row's object, drawn by the generic renderer of
 * ui-diagram-preview. Which diagram, from which root and focused on which
 * objects, the definitions' bindings decide; the object itself is the main
 * object. A click on a node selects its object.
 */
import { computed, nextTick, onBeforeUnmount, onMounted, ref, shallowRef, toRaw, watch } from 'tsm:vue'
import { DiagramRenderer, nodeId, presetsOf, useElkLayout } from 'ui-diagram-preview'
import { diagramFor } from '../composables/cwmDiagram'

const props = defineProps<{
  object: any
  /** Fill the given space (Vollbild); otherwise the area takes the graph's proportions */
  fill?: boolean
}>()

const emit = defineEmits<{ select: [object: any] }>()

const definition = shallowRef<any | null>(null)
const loading = ref(true)

const root = shallowRef<any[] | null>(null)
const focus = shallowRef<any[] | null>(null)

watch(() => toRaw(props.object), async o => {
  loading.value = true
  const d = await diagramFor(o)
  definition.value = d?.definition ?? null
  root.value = d?.roots ?? null
  focus.value = d?.focus ?? null
  loading.value = false
}, { immediate: true })

/** The row's own object is the main object - marked even when it is the container */
const highlightId = computed(() => nodeId(toRaw(props.object)))

/* Detail level: the definition's presets; "full" when it has one, else the first */
const variants = computed(() => presetsOf(definition.value))
const chosen = ref<string | undefined>(undefined)
watch(variants, list => {
  if (!list.some(v => v.name === chosen.value)) chosen.value = (list.find(v => v.name === 'full') ?? list[0])?.name
}, { immediate: true })

const { laidOut, nodeIndex, edgeMeta, renderVersion, portNodeMap, layoutPending } = useElkLayout(definition, root, chosen, focus)

const renderer = ref<any>(null)

const container = ref<HTMLElement | null>(null)

/* In the row the area follows the graph's proportions - as large as the width allows - within bounds */
const sizeStyle = computed(() => {
  const g = laidOut.value
  if (props.fill || !g?.width || !g?.height) return {}
  return { aspectRatio: `${g.width} / ${g.height}`, height: 'auto' }
})

/* Fit the whole graph into the area - once it is laid out and shown, and again when the area changes size (Vollbild) */
async function fit(): Promise<void> {
  if (!laidOut.value || layoutPending.value) return
  await nextTick()
  // Wait until the renderer has drawn the graph and the area has its size
  await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)))
  const g = laidOut.value
  if (!g || layoutPending.value) return
  const r = renderer.value
  const el = container.value
  if (!r || !el || el.clientWidth === 0) return
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity
  const walk = (parent: any, offX: number, offY: number) => {
    for (const c of parent.children ?? []) {
      const x = offX + (c.x ?? 0)
      const y = offY + (c.y ?? 0)
      minX = Math.min(minX, x)
      minY = Math.min(minY, y)
      maxX = Math.max(maxX, x + (c.width ?? 0))
      maxY = Math.max(maxY, y + (c.height ?? 0))
      walk(c, x, y)
    }
  }
  walk(g, 0, 0)
  if (minX === Infinity) return
  // A margin all round, so nothing touches the edge
  const pad = 24
  r.fitToContent(
    { x: minX - pad, y: minY - pad, w: maxX - minX + 2 * pad, h: maxY - minY + 2 * pad },
    el.clientWidth,
    el.clientHeight
  )
}

watch([laidOut, layoutPending, renderVersion], () => { void fit() })

let resizeObserver: ResizeObserver | null = null
onMounted(() => {
  resizeObserver = new ResizeObserver(() => { void fit() })
  if (container.value) resizeObserver.observe(container.value)
})
onBeforeUnmount(() => resizeObserver?.disconnect())
</script>

<template>
  <div ref="container" class="cwm-diagram" :class="{ fill }" :style="sizeStyle">
    <select
      v-if="variants.length > 1"
      v-model="chosen"
      class="variant"
      aria-label="Detailstufe"
      title="Detailstufe des Diagramms"
      data-testid="cwm.Editor.Diagram.Variant"
    >
      <option v-for="v in variants" :key="v.name" :value="v.name">{{ v.label }}</option>
    </select>
    <div v-if="loading || layoutPending" class="state"><i class="pi pi-spin pi-spinner"></i> Diagramm wird gezeichnet …</div>
    <div v-else-if="!definition || !root" class="state">Kein Diagramm verfügbar</div>
    <DiagramRenderer
      v-show="!loading && !layoutPending && definition && root"
      ref="renderer"
      :laid-out="laidOut"
      :node-index="nodeIndex"
      :edge-meta="edgeMeta"
      :render-version="renderVersion"
      :port-node-map="portNodeMap"
      :highlight-id="highlightId"
      :wheel-zoom-needs-modifier="!fill"
      @navigate="o => emit('select', o)"
    />
  </div>
</template>

<style scoped>
.cwm-diagram {
  position: relative;
  width: 100%;
  height: 20rem;
  min-height: 15rem;
  max-height: 75vh;
  overflow: hidden;
  border-radius: 4px;
  /* Lies on the row's card like the tables: a light tint, no black panel */
  background: color-mix(in srgb, var(--text-color) 3%, transparent);
  border: 1px solid var(--surface-border);
}

.cwm-diagram.fill {
  height: 100%;
  max-height: none;
}

/* The renderer brings its own ground colour; here the card shows through */
.cwm-diagram :deep(.diagram-svg) {
  background: transparent;
}

/* Group boxes (DATENTYPEN) likewise: a light tint instead of the ground colour */
.cwm-diagram :deep(.frame-container) {
  fill: color-mix(in srgb, var(--text-color) 4%, transparent);
}

/* Detail level, top left above the graph */
.variant {
  position: absolute;
  top: 0.4rem;
  left: 0.4rem;
  z-index: 1;
  font: inherit;
  font-size: 0.75rem;
  padding: 0.1rem 0.3rem;
  color: var(--text-color);
  background: var(--surface-card, var(--surface-ground));
  border: 1px solid var(--surface-border);
  border-radius: 3px;
}

.state {
  position: absolute;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 0.4rem;
  font-size: 0.8rem;
  color: var(--text-color-secondary);
}
</style>
