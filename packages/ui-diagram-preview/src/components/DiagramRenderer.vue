<script setup lang="ts">
/**
 * Read-only SVG diagram renderer with Pan/Zoom.
 * Simplified copy of DiagramViewComposer.vue — no node dragging.
 */
import { computed } from 'tsm:vue'
import type { EObject } from '@emfts/core'
import type { ElkNode } from 'elkjs/lib/elk.bundled.js'
import { usePanZoom } from '../diagram/usePanZoom'
import { HEADER_H, ROW_H, MIN_NODE_W, resolveNodeView, nodeHeaderColor, layoutNode } from '../diagram/interpret'
import type { LayoutItem } from '../diagram/interpret'
import { routeAllEdges, type NodeRect, type EdgeInput } from '../diagram/orthogonalRouter'
import type { NodeRef, EdgeMeta } from '../diagram/interpret'
import { nodeId as getNodeId } from '../diagram/interpret'

const props = defineProps<{
  laidOut: ElkNode | null
  nodeIndex: Map<string, NodeRef>
  edgeMeta: Map<string, EdgeMeta>
  renderVersion: number
  portNodeMap: Map<string, string>
  highlightId?: string | null
}>()

const emit = defineEmits<{
  (e: 'navigate', obj: EObject): void
}>()

function onNodeClick(node: RNode) {
  const ref = props.nodeIndex.get(node.id)
  if (ref) emit('navigate', ref.obj)
}

const { view, onWheel, onPanStart, onPanMove, onPanEnd, fitToContent } = usePanZoom()

interface RNode {
  id: string
  x: number; y: number; w: number; h: number
  name: string
  stereotype: string
  subtitle: string
  icon: string
  headerColor: string
  items: LayoutItem[]
  container: boolean
  bracketLane: number
  highlighted: boolean
}

const nodeParentId = new Map<string, string>()

const nodes = computed<RNode[]>(() => {
  void props.renderVersion
  const g = props.laidOut
  if (!g) return []
  const out: RNode[] = []
  nodeParentId.clear()
  const walk = (parent: any, offX: number, offY: number, parentNodeId?: string) => {
    for (const c of parent.children ?? []) {
      const x = offX + (c.x ?? 0)
      const y = offY + (c.y ?? 0)
      if (parentNodeId) nodeParentId.set(c.id, parentNodeId)
      const ref = props.nodeIndex.get(c.id)
      if (ref) {
        const nv = resolveNodeView(ref.obj, ref.mapping)
        const nodeItems = layoutNode(nv).items
        const bc = countBrackets(nodeItems)
        out.push({
          id: c.id,
          x, y,
          w: c.width ?? MIN_NODE_W,
          h: c.height ?? HEADER_H + ROW_H,
          name: nv.title,
          stereotype: nv.stereotype,
          subtitle: nv.subtitle,
          icon: nv.icon,
          headerColor: nodeHeaderColor(ref.mapping),
          items: nodeItems,
          container: (c.children?.length ?? 0) > 0,
          bracketLane: bc > 0 ? 6 + bc * 9 : 0,
          highlighted: isHighlighted(ref.obj),
        })
      } else if (c.children?.length) {
        out.push({
          id: c.id,
          x, y,
          w: c.width ?? MIN_NODE_W,
          h: c.height ?? HEADER_H,
          name: c.labels?.[0]?.text ?? '',
          stereotype: '', subtitle: '', icon: '',
          headerColor: '#475569',
          items: [],
          container: true,
          bracketLane: 0,
          highlighted: false,
        })
      }
      walk(c, x, y, c.id)
    }
  }
  walk(g, 0, 0)
  return out
})

function isHighlighted(obj: EObject): boolean {
  if (!props.highlightId) return false
  return getNodeId(obj) === props.highlightId
}

const containerNodes = computed(() => nodes.value.filter((n) => n.container))
const leafNodes = computed(() => nodes.value.filter((n) => !n.container))

interface NodeCols {
  labelX: number
  typeX: number
  multX: number
  badgeStart: number
  markerX: number
}
function computeNodeCols(items: LayoutItem[], w: number, bracketLane: number): NodeCols {
  let hasKey = false, hasOp = false, hasMarker = false, hasMult = false, maxBadges = 0
  for (const item of items) {
    if (item.type === 'row') {
      if (item.row.key) hasKey = true
      if (item.row.op) hasOp = true
      if (item.row.marker) hasMarker = true
      if (item.row.multiplicity) hasMult = true
      if (item.row.badges.length > maxBadges) maxBadges = item.row.badges.length
    }
  }
  const labelX = hasKey ? 20 : hasOp ? 22 : 12
  const R = w - bracketLane - 8
  const markerX = R - 5
  let right = hasMarker ? R - 14 : R
  const badgeStart = right - maxBadges * 13
  if (maxBadges) right = badgeStart - 4
  const multX = right
  const typeX = multX - (hasMult ? 34 : 2)
  return { labelX, typeX, multX, badgeStart, markerX }
}

const nodeColsMap = computed(() => {
  const m = new Map<string, NodeCols>()
  for (const n of nodes.value) m.set(n.id, computeNodeCols(n.items, n.w, n.bracketLane))
  return m
})

function countBrackets(items: LayoutItem[]): number {
  const counts = new Map<string, number>()
  for (const item of items) {
    if (item.type === 'row' && item.row.rowObjId) {
      counts.set(item.row.rowObjId, (counts.get(item.row.rowObjId) ?? 0) + 1)
    }
  }
  let n = 0
  for (const c of counts.values()) if (c >= 2) n++
  return n
}

interface Bracket { topY: number; bottomY: number; x: number }
function computeBrackets(node: RNode): Bracket[] {
  const byId = new Map<string, number[]>()
  for (const item of node.items) {
    if (item.type === 'row' && item.row.rowObjId) {
      const arr = byId.get(item.row.rowObjId)
      if (arr) arr.push(HEADER_H + item.y + ROW_H / 2)
      else byId.set(item.row.rowObjId, [HEADER_H + item.y + ROW_H / 2])
    }
  }
  const brackets: Bracket[] = []
  let bracketIdx = 0
  for (const positions of byId.values()) {
    if (positions.length >= 2) {
      brackets.push({
        topY: positions[0],
        bottomY: positions[positions.length - 1],
        x: node.w - node.bracketLane + 2 + bracketIdx * 9,
      })
      bracketIdx++
    }
  }
  return brackets
}

const DECO: Record<string, string> = {
  OPEN_ARROW: 'url(#mk-assoc)',
  TRIANGLE_HOLLOW: 'url(#mk-inherit)',
  TRIANGLE_FILLED: 'url(#mk-tri-filled)',
  DIAMOND_HOLLOW: 'url(#mk-diamond-hollow)',
  DIAMOND_FILLED: 'url(#mk-diamond-filled)',
  NONE: '',
}

function edgeStyle(meta?: { kind?: string; sourceDecoration?: string; targetDecoration?: string }) {
  const kind = meta?.kind ?? ''
  const cls = kind === 'INHERITANCE' ? 'edge-inherit'
    : kind === 'ASSOCIATION' ? 'edge-assoc'
    : kind === 'DEPENDENCY' ? 'edge-dep' : 'edge-fk'
  const start = DECO[meta?.sourceDecoration ?? ''] ?? ''
  let end = DECO[meta?.targetDecoration ?? ''] ?? ''
  if (!meta?.sourceDecoration && !meta?.targetDecoration) {
    if (kind === 'INHERITANCE') end = 'url(#mk-inherit)'
    else if (kind === 'ASSOCIATION' || kind === 'DEPENDENCY') end = 'url(#mk-assoc)'
  }
  return { cls, start, end }
}

/** Simple straight-line fallback for large graphs where tsrouter is too slow. */
function straightEdges(
  nodeRects: NodeRect[],
  edgeInputs: EdgeInput[],
): Map<string, EdgeRoute> {
  const nodeMap = new Map<string, NodeRect>()
  for (const n of nodeRects) nodeMap.set(n.id, n)
  const result = new Map<string, EdgeRoute>()
  for (const edge of edgeInputs) {
    const src = nodeMap.get(edge.srcId)
    const tgt = nodeMap.get(edge.tgtId)
    if (!src || !tgt) continue
    const sx = src.x + src.w / 2, sy = src.y + src.h / 2
    const tx = tgt.x + tgt.w / 2, ty = tgt.y + tgt.h / 2
    result.set(edge.id, { path: [{ x: sx, y: sy }, { x: tx, y: ty }], d: `M${sx},${sy} L${tx},${ty}` })
  }
  return result
}

const TSROUTER_LIMIT = 50 // max nodes for full orthogonal routing

const edges = computed(() => {
  const g = props.laidOut
  if (!g) return []
  const root = nodes.value[0]
  const nodeRects: NodeRect[] = nodes.value
    .filter(n => n !== root)
    .map(n => ({ id: n.id, x: n.x, y: n.y, w: n.w, h: n.h, parentId: nodeParentId.get(n.id) }))
  const elkEdges = (g.edges ?? []) as any[]
  const edgeInputs: EdgeInput[] = elkEdges.map(e => {
    const rawSrcId = e.sources?.[0] as string
    const tgtId = e.targets?.[0] as string
    const srcNodeId = props.portNodeMap.get(rawSrcId) ?? rawSrcId
    const meta = props.edgeMeta.get(e.id)
    return { id: e.id, srcId: srcNodeId, tgtId, sourcePortY: meta?.sourcePortY }
  })
  // Use tsrouter for small graphs, straight lines for large ones
  const routes = nodeRects.length <= TSROUTER_LIMIT
    ? routeAllEdges(nodeRects, edgeInputs)
    : straightEdges(nodeRects, edgeInputs)
  return elkEdges.map((e: any) => {
    const lbl = e.labels?.[0]
    const meta = props.edgeMeta.get(e.id)
    const { cls, start, end } = edgeStyle(meta)
    const route = routes.get(e.id)
    const path = route?.path ?? []
    const sp = path[0] ?? { x: 0, y: 0 }
    const ep = path[path.length - 1] ?? { x: 0, y: 0 }
    const mid = path[Math.floor(path.length / 2)] ?? sp
    return { id: e.id, d: route?.d ?? '', lx: mid.x, ly: mid.y - 8,
      label: lbl?.text ?? '', cls, start, end, sp, ep }
  })
})

const viewTransform = computed(() => `translate(${view.x}, ${view.y}) scale(${view.scale})`)

defineExpose({ fitToContent, view })
</script>

<template>
  <svg
    class="diagram-svg"
    @wheel.prevent="onWheel"
    @pointerdown="onPanStart"
    @pointermove="onPanMove"
    @pointerup="onPanEnd"
  >
    <defs>
      <marker id="mk-inherit" viewBox="0 0 12 12" refX="11" refY="6" markerWidth="14"
          markerHeight="14" orient="auto-start-reverse">
        <path d="M1,1 L11,6 L1,11 Z" class="mk-hollow" />
      </marker>
      <marker id="mk-assoc" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="11"
          markerHeight="11" orient="auto-start-reverse">
        <path d="M1,1 L9,5 L1,9" class="mk-open" />
      </marker>
      <marker id="mk-tri-filled" viewBox="0 0 12 12" refX="11" refY="6" markerWidth="12"
          markerHeight="12" orient="auto-start-reverse">
        <path d="M1,1 L11,6 L1,11 Z" class="mk-filled" />
      </marker>
      <marker id="mk-diamond-hollow" viewBox="0 0 16 12" refX="15" refY="6" markerWidth="16"
          markerHeight="12" orient="auto-start-reverse">
        <path d="M1,6 L8,1 L15,6 L8,11 Z" class="mk-hollow" />
      </marker>
      <marker id="mk-diamond-filled" viewBox="0 0 16 12" refX="15" refY="6" markerWidth="16"
          markerHeight="12" orient="auto-start-reverse">
        <path d="M1,6 L8,1 L15,6 L8,11 Z" class="mk-filled" />
      </marker>
      <!-- Highlight glow filter -->
      <filter id="highlight-glow" x="-20%" y="-20%" width="140%" height="140%">
        <feDropShadow dx="0" dy="0" stdDeviation="4" flood-opacity="0.5" class="highlight-shadow" />
      </filter>
    </defs>

    <g :transform="viewTransform">
      <!-- containers -->
      <g v-for="node in containerNodes" :key="node.id"
        :transform="`translate(${node.x}, ${node.y})`"
        class="node clickable" :class="{ highlighted: node.highlighted }"
        @click.stop="onNodeClick(node)">
        <rect class="frame frame-container" x="0" y="0" :width="node.w" :height="node.h" rx="4" ry="4"
          :filter="node.highlighted ? 'url(#highlight-glow)' : undefined" />
        <rect class="header" x="0" y="0" :width="node.w" :height="HEADER_H" rx="4" ry="4"
          :style="{ fill: node.headerColor, fillOpacity: 0.16 }" />
        <line x1="0" :y1="HEADER_H" :x2="node.w" :y2="HEADER_H" class="header-rule" :style="{ stroke: node.headerColor }" />
        <text v-if="node.icon" x="11" y="22" class="type-icon" :style="{ fill: node.headerColor }">{{ node.icon }}</text>
        <template v-if="node.subtitle">
          <text :x="node.icon ? 28 : 10" y="15" class="title-dark">{{ node.name }}</text>
          <text :x="node.icon ? 28 : 10" y="27" class="subtitle-dim">{{ node.subtitle }}</text>
        </template>
        <template v-else-if="node.stereotype">
          <text :x="node.icon ? 28 : 10" y="14" class="kind">{{ node.stereotype }}</text>
          <text :x="node.icon ? 28 : 10" y="27" class="title-dark">{{ node.name }}</text>
        </template>
        <text v-else :x="node.icon ? 28 : 10" y="21" class="title-dark">{{ node.name }}</text>
      </g>

      <!-- edges -->
      <g v-for="edge in edges" :key="edge.id" class="edge">
        <path :d="edge.d" class="edge-line" :class="edge.cls"
          :marker-start="edge.start || undefined" :marker-end="edge.end || undefined" />
        <text v-if="edge.label" :x="edge.lx" :y="edge.ly" class="edge-label">{{ edge.label }}</text>
      </g>

      <!-- leaf nodes -->
      <g v-for="node in leafNodes" :key="node.id"
        :transform="`translate(${node.x}, ${node.y})`"
        class="node clickable" :class="{ highlighted: node.highlighted }"
        @click.stop="onNodeClick(node)">
        <rect class="frame" x="0" y="0" :width="node.w" :height="node.h" rx="4" ry="4"
          :filter="node.highlighted ? 'url(#highlight-glow)' : undefined" />
        <rect class="header" x="0" y="0" :width="node.w" :height="HEADER_H" rx="4" ry="4"
          :style="{ fill: node.headerColor, fillOpacity: 0.16 }" />
        <line x1="0" :y1="HEADER_H" :x2="node.w" :y2="HEADER_H" class="header-rule" :style="{ stroke: node.headerColor }" />
        <text v-if="node.icon" x="11" y="22" class="type-icon" :style="{ fill: node.headerColor }">{{ node.icon }}</text>
        <template v-if="node.subtitle">
          <text :x="node.icon ? 28 : 10" y="15" class="title-dark">{{ node.name }}</text>
          <text :x="node.icon ? 28 : 10" y="27" class="subtitle-dim">{{ node.subtitle }}</text>
        </template>
        <template v-else-if="node.stereotype">
          <text :x="node.icon ? 28 : 10" y="14" class="kind">{{ node.stereotype }}</text>
          <text :x="node.icon ? 28 : 10" y="27" class="title-dark">{{ node.name }}</text>
        </template>
        <text v-else :x="node.icon ? 28 : 10" y="21" class="title-dark">{{ node.name }}</text>

        <g v-for="(item, idx) in node.items" :key="idx" :transform="`translate(0, ${HEADER_H + item.y})`">
          <template v-if="item.type === 'title'">
            <line v-if="item.sep" x1="0" y1="0" :x2="node.w" y2="0" class="compartment-sep" />
            <rect x="1" y="0" :width="node.w - 2" :height="item.h" class="section-band" />
            <text x="10" y="11" class="section-title">{{ item.title }}</text>
          </template>
          <template v-else-if="item.type === 'subrow'">
            <text x="26" y="12" class="col-sub">&bull; {{ item.sub.label }}</text>
            <text :x="nodeColsMap.get(node.id)!.typeX" y="12" text-anchor="end" class="col-sub-type">{{ item.sub.detail }}</text>
            <text v-if="item.sub.multiplicity" :x="nodeColsMap.get(node.id)!.multX" y="12" text-anchor="end" class="col-mult">{{ item.sub.multiplicity }}</text>
          </template>
          <template v-else>
            <line v-if="item.sep" x1="0" y1="0" :x2="node.w" y2="0" class="compartment-sep" />
            <text v-if="item.row.key" x="6" y="14" class="key-icon">&#9911;</text>
            <text v-if="item.row.op" x="11" y="14" class="op-icon">&#402;</text>
            <text :x="nodeColsMap.get(node.id)!.labelX" y="14" class="col">{{ item.row.label }}</text>
            <text :x="nodeColsMap.get(node.id)!.typeX" y="14" text-anchor="end" class="col-type">{{ item.row.detail }}</text>
            <text v-if="item.row.multiplicity" :x="nodeColsMap.get(node.id)!.multX" y="14" text-anchor="end" class="col-mult">{{ item.row.multiplicity }}</text>
            <g v-for="(b, bi) in item.row.badges" :key="bi">
              <rect :x="nodeColsMap.get(node.id)!.badgeStart + bi * 13" y="3" width="11" height="13" rx="2" class="flag-box" />
              <text :x="nodeColsMap.get(node.id)!.badgeStart + bi * 13 + 5.5" y="13" text-anchor="middle" class="flag-text">{{ b }}</text>
            </g>
            <text v-if="item.row.marker" :x="nodeColsMap.get(node.id)!.markerX" y="15" text-anchor="middle" class="ref-marker">{{ item.row.marker === 'diamond' ? '\u25C6' : '\u203A' }}</text>
          </template>
        </g>

        <!-- brackets -->
        <g v-for="(br, bi) in computeBrackets(node)" :key="`br-${bi}`" class="bracket">
          <path
            :d="`M${br.x},${br.topY} L${br.x + 4},${br.topY} L${br.x + 4},${br.bottomY} L${br.x},${br.bottomY}`"
            class="bracket-line"
          />
          <circle :cx="br.x" :cy="br.topY" r="1.6" class="bracket-dot" />
          <circle :cx="br.x" :cy="br.bottomY" r="1.6" class="bracket-dot" />
        </g>
      </g>
    </g>
  </svg>
</template>

<style scoped>
/* ── Theme-aware diagram styles ── */
.diagram-svg {
  width: 100%;
  height: 100%;
  cursor: grab;
  background: var(--surface-ground, #f8fafc);
  display: block;
  --diagram-text: var(--text-color, #1f2937);
  --diagram-text-secondary: var(--text-color-secondary, #6b7280);
  --diagram-border: var(--surface-border, #374151);
  --diagram-surface: var(--surface-card, #fff);
  --diagram-surface-alt: var(--surface-ground, #f8fafc);
  --diagram-section: var(--surface-hover, #f1f5f9);
  --diagram-highlight: var(--primary-color, #3b82f6);
}
.diagram-svg:active { cursor: grabbing; }
.node { cursor: default; }
.node.clickable { cursor: pointer; }
.node.clickable:hover .frame { filter: drop-shadow(0 1px 4px rgba(99, 102, 241, 0.3)); }
.node.highlighted .frame {
  stroke: var(--diagram-highlight);
  stroke-width: 2.5;
}
.frame { fill: var(--diagram-surface); stroke: var(--diagram-border); stroke-width: 1; }
.frame-container { fill: var(--diagram-surface-alt); stroke: var(--diagram-text-secondary); stroke-dasharray: 4 3; }
.header-rule { stroke-width: 1; }
.type-icon { font: 12px sans-serif; }
.title-dark { font: 600 13px sans-serif; fill: var(--diagram-text); }
.kind { font: 9px sans-serif; fill: var(--diagram-text-secondary); letter-spacing: 0.3px; }
.subtitle-dim { font: 9px monospace; fill: var(--diagram-text-secondary); }
.section-band { fill: var(--diagram-section); }
.section-title { font: 700 8px sans-serif; fill: var(--diagram-text-secondary); letter-spacing: 0.6px; }
.compartment-sep { stroke: var(--diagram-border); stroke-width: 1; }
.col { font: 11px sans-serif; fill: var(--diagram-text); }
.key-icon { font: 11px sans-serif; fill: #d97706; }
.op-icon { font: italic 700 11px serif; fill: #7c3aed; }
.col-type { font: 10px monospace; fill: var(--diagram-text-secondary); }
.col-sub { font: italic 10px sans-serif; fill: var(--diagram-text-secondary); }
.col-sub-type { font: 9px monospace; fill: var(--diagram-text-secondary); }
.col-mult { font: 10px monospace; fill: var(--diagram-text-secondary); }
.flag-box { fill: color-mix(in srgb, #f59e0b 20%, var(--diagram-surface)); stroke: #f59e0b; stroke-width: 0.7; }
.flag-text { font: 700 8px monospace; fill: #b45309; }
.ref-marker { font: 11px sans-serif; fill: var(--diagram-text); }
.edge-line { fill: none; stroke: var(--diagram-border); stroke-width: 1.4; }
.edge-inherit { stroke: var(--diagram-border); }
.edge-assoc { stroke: var(--diagram-border); }
.edge-dep { stroke: var(--diagram-text-secondary); stroke-dasharray: 5 3; }
.edge-fk { stroke: var(--diagram-border); }
.edge-label { font: 10px sans-serif; fill: var(--diagram-text); }
.bracket-line { fill: none; stroke: var(--diagram-text-secondary); stroke-width: 1.4; stroke-linecap: round; }
.bracket-dot { fill: var(--diagram-text-secondary); }
/* SVG marker styles */
.mk-hollow { fill: var(--diagram-surface); stroke: var(--diagram-border); stroke-width: 1.2; }
.mk-open { fill: none; stroke: var(--diagram-border); stroke-width: 1.4; }
.mk-filled { fill: var(--diagram-border); stroke: var(--diagram-border); stroke-width: 1; }
.highlight-shadow { flood-color: var(--diagram-highlight); }
</style>
