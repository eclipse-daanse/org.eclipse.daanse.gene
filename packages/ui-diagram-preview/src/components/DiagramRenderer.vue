<script setup lang="ts">
/**
 * Read-only SVG diagram renderer with Pan/Zoom.
 * Simplified copy of DiagramViewComposer.vue — no node dragging.
 */
import { computed } from 'tsm:vue'
import type { EObject } from '@emfts/core'
import type { ElkNode } from 'elkjs/lib/elk.bundled.js'
import { usePanZoom } from '../diagram/usePanZoom'
import { HEADER_H, ROW_H, MIN_NODE_W, resolveNodeView, nodeHeaderColor, layoutNode, connectorCount } from '../diagram/interpret'
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
  /** Zoom with the wheel only while Ctrl/Cmd is held - for diagrams inside a scrolling page */
  wheelZoomNeedsModifier?: boolean
}>()

const emit = defineEmits<{
  (e: 'navigate', obj: EObject): void
}>()

function onNodeClick(node: RNode) {
  const ref = props.nodeIndex.get(node.id)
  if (ref) emit('navigate', ref.obj)
}

const { view, onWheel, onPanStart, onPanMove, onPanEnd, fitToContent } = usePanZoom()

/** Without the modifier (when it is needed) the wheel scrolls the page as usual */
function onWheelEvent(e: WheelEvent): void {
  if (props.wheelZoomNeedsModifier && !e.ctrlKey && !e.metaKey) return
  onWheel(e)
}

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
  headerBadges: { icon: string; color: string }[]
  italic: boolean
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
        const nv = resolveNodeView(ref.obj, ref.mapping, ref.ctx)
        const nodeItems = layoutNode(nv).items
        const bc = countBrackets(nodeItems) + connectorCount(nodeItems)
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
          headerBadges: nv.headerBadges,
          italic: nv.italic,
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
          headerBadges: [],
          italic: false,
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
  let hasKey = false, hasFk = false, hasOp = false, hasMarker = false, hasMult = false, maxBadges = 0
  for (const item of items) {
    if (item.type === 'row') {
      if (item.row.key) hasKey = true
      if (item.row.fk) hasFk = true
      if (item.row.op) hasOp = true
      if (item.row.marker) hasMarker = true
      if (item.row.multiplicity) hasMult = true
      if (item.row.badges.length > maxBadges) maxBadges = item.row.badges.length
    }
  }
  let maxGlyphs = 0
  for (const item of items) if (item.type === 'row') maxGlyphs = Math.max(maxGlyphs, item.row.glyphs.length)
  const labelX = (hasKey || hasFk ? 26 : hasOp ? 22 : maxGlyphs ? 8 : 12) + maxGlyphs * 12
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

interface Bracket {
  topY: number
  bottomY: number
  x: number
  /** Connector: the rows it reaches (y), drawn as ticks; the source row is topY or bottomY */
  ticks?: number[]
  sourceY?: number
  color?: string
}
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
  // Connectors: a row (index, unique, trigger ...) to the rows of its objects
  const rowY = new Map<string, number>()
  for (const item of node.items) {
    if (item.type === 'row' && item.row.rowObjId && !rowY.has(item.row.rowObjId)) rowY.set(item.row.rowObjId, HEADER_H + item.y + ROW_H / 2)
  }
  for (const item of node.items) {
    if (item.type !== 'row') continue
    const ys = item.row.links.map(l => rowY.get(l)).filter((y): y is number => y != null)
    if (!ys.length) continue
    const sourceY = HEADER_H + item.y + ROW_H / 2
    const all = [...ys, sourceY]
    brackets.push({
      topY: Math.min(...all),
      bottomY: Math.max(...all),
      x: node.w - node.bracketLane + 2 + bracketIdx * 9,
      ticks: ys,
      sourceY,
      color: item.row.color || undefined,
    })
    bracketIdx++
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

function edgeStyle(meta?: { kind?: string; lineStyle?: string; sourceDecoration?: string; targetDecoration?: string }) {
  const kind = meta?.kind ?? ''
  const base = kind === 'INHERITANCE' ? 'edge-inherit'
    : kind === 'ASSOCIATION' ? 'edge-assoc'
    : kind === 'DEPENDENCY' ? 'edge-dep' : 'edge-fk'
  const cls = meta?.lineStyle === 'DASHED' ? `${base} edge-dashed` : meta?.lineStyle === 'SOLID' ? `${base} edge-solid` : base
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

/** Where an end's cardinality sits: a little way along the edge from that end */
function cardinalityAt(path: { x: number; y: number }[], atEnd: boolean): { x: number; y: number } {
  if (path.length === 0) return { x: 0, y: 0 }
  const a = atEnd ? path[path.length - 1] : path[0]
  const b = atEnd ? path[path.length - 2] ?? a : path[1] ?? a
  const dx = b.x - a.x, dy = b.y - a.y
  const len = Math.hypot(dx, dy) || 1
  const d = Math.min(16, len / 2)
  return { x: a.x + (dx / len) * d, y: a.y + (dy / len) * d }
}

/** Where an end's role name sits: beside the edge, a little further from the node than the cardinality */
function endLabelAt(path: { x: number; y: number }[], atEnd: boolean): { x: number; y: number; anchor: string } {
  const p = cardinalityAt(path, atEnd)
  if (path.length < 2) return { ...p, anchor: 'start' }
  const a = atEnd ? path[path.length - 1] : path[0]
  const b = atEnd ? path[path.length - 2] : path[1]
  const horizontal = Math.abs(b.x - a.x) >= Math.abs(b.y - a.y)
  // Horizontal end: above the line, past the cardinality; vertical end: to the right of it
  return horizontal
    ? { x: p.x + (b.x > a.x ? 14 : -14), y: p.y - 8, anchor: b.x > a.x ? 'start' : 'end' }
    : { x: p.x + 9, y: p.y + (b.y > a.y ? 14 : -10), anchor: 'start' }
}

const TSROUTER_LIMIT = 50 // max nodes for full orthogonal routing

const edges = computed(() => {
  const g = props.laidOut
  if (!g) return []
  const root = nodes.value[0]
  const nodeRects: NodeRect[] = nodes.value
    .filter(n => n !== root)
    .map(n => ({ id: n.id, x: n.x, y: n.y, w: n.w, h: n.h, parentId: nodeParentId.get(n.id) }))
  // Edges live in the innermost container holding both ends - gather them from every level
  const elkEdges: any[] = []
  const gather = (n: any) => {
    for (const e of n.edges ?? []) elkEdges.push(e)
    for (const c of n.children ?? []) gather(c)
  }
  gather(g)
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
    // The label sits in the middle of the longest stretch, clear of the nodes at the ends
    let mid = sp
    let longest = -1
    for (let i = 0; i + 1 < path.length; i++) {
      const len = Math.hypot(path[i + 1].x - path[i].x, path[i + 1].y - path[i].y)
      if (len > longest) {
        longest = len
        mid = { x: (path[i].x + path[i + 1].x) / 2, y: (path[i].y + path[i + 1].y) / 2 }
      }
    }
    return { id: e.id, d: route?.d ?? '', lx: mid.x, ly: mid.y - 8,
      label: lbl?.text ?? '', cls, start, end, sp, ep,
      sourceCard: meta?.sourceCardinality ?? '', targetCard: meta?.targetCardinality ?? '',
      sourceLabel: meta?.sourceLabel ?? '', targetLabel: meta?.targetLabel ?? '',
      sl: endLabelAt(path, false), tl: endLabelAt(path, true),
      sc: cardinalityAt(path, false), tc: cardinalityAt(path, true) }
  })
})

function headerBadgeW(text: string): number {
  return Math.max(22, text.length * 6 + 12)
}

/** Header badges sit right-aligned in a row, the first rightmost */
function headerBadgeOffset(badges: { icon: string }[], index: number): number {
  let x = 0
  for (let i = 0; i < index; i++) x += headerBadgeW(badges[i].icon) + 4
  return x
}

function cardW(text: string): number {
  return Math.max(12, text.length * 5.5 + 6)
}

const viewTransform = computed(() => `translate(${view.x}, ${view.y}) scale(${view.scale})`)

defineExpose({ fitToContent, view })
</script>

<template>
  <svg
    class="diagram-svg"
    @wheel="onWheelEvent"
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
           />
        <rect class="header" x="0" y="0" :width="node.w" :height="HEADER_H" rx="4" ry="4"
          :style="{ fill: node.headerColor, fillOpacity: 0.16 }" />
        <line x1="0" :y1="HEADER_H" :x2="node.w" :y2="HEADER_H" class="header-rule" :style="{ stroke: node.headerColor }" />
        <text v-if="node.icon" x="11" y="22" class="type-icon" :style="{ fill: node.headerColor }">{{ node.icon }}</text>
        <template v-if="node.subtitle">
          <text :x="node.icon ? 28 : 10" y="15" class="title-dark" :class="{ italic: node.italic }">{{ node.name }}</text>
          <text :x="node.icon ? 28 : 10" y="27" class="subtitle-dim">{{ node.subtitle }}</text>
        </template>
        <template v-else-if="node.stereotype">
          <text :x="node.icon ? 28 : 10" y="14" class="kind">{{ node.stereotype }}</text>
          <text :x="node.icon ? 28 : 10" y="27" class="title-dark" :class="{ italic: node.italic }">{{ node.name }}</text>
        </template>
        <text v-else :x="node.icon ? 28 : 10" y="21" class="title-dark" :class="{ italic: node.italic }">{{ node.name }}</text>
        <g v-for="(b, bi) in node.headerBadges" :key="`hb-${bi}`" class="header-badge"
          :transform="`translate(${node.w - 8 - headerBadgeOffset(node.headerBadges, bi)}, 9)`">
          <rect :x="-headerBadgeW(b.icon)" y="0" :width="headerBadgeW(b.icon)" height="15" rx="7.5"
            :style="{ fill: `color-mix(in srgb, ${b.color || '#f59e0b'} 25%, var(--diagram-surface))`, stroke: b.color || '#f59e0b' }" />
          <text :x="-headerBadgeW(b.icon) / 2" y="11" text-anchor="middle">{{ b.icon }}</text>
        </g>
        <g v-if="node.highlighted" class="main-badge" :transform="`translate(${node.w}, 0)`">
          <rect x="-30" y="-9" width="34" height="14" rx="7" />
          <text x="-13" y="2" text-anchor="middle">main</text>
        </g>
      </g>

      <!-- edges -->
      <g v-for="edge in edges" :key="edge.id" class="edge">
        <path :d="edge.d" class="edge-line" :class="edge.cls"
          :marker-start="edge.start || undefined" :marker-end="edge.end || undefined" />
        <text v-if="edge.label" :x="edge.lx" :y="edge.ly" text-anchor="middle" class="edge-label">{{ edge.label }}</text>
        <text v-if="edge.sourceLabel" :x="edge.sl.x" :y="edge.sl.y" :text-anchor="edge.sl.anchor" class="end-label">{{ edge.sourceLabel }}</text>
        <text v-if="edge.targetLabel" :x="edge.tl.x" :y="edge.tl.y" :text-anchor="edge.tl.anchor" class="end-label">{{ edge.targetLabel }}</text>
        <g v-if="edge.sourceCard" :transform="`translate(${edge.sc.x}, ${edge.sc.y})`" class="card">
          <rect :x="-cardW(edge.sourceCard) / 2" y="-6" :width="cardW(edge.sourceCard)" height="12" rx="6" />
          <text y="3" text-anchor="middle">{{ edge.sourceCard }}</text>
        </g>
        <g v-if="edge.targetCard" :transform="`translate(${edge.tc.x}, ${edge.tc.y})`" class="card">
          <rect :x="-cardW(edge.targetCard) / 2" y="-6" :width="cardW(edge.targetCard)" height="12" rx="6" />
          <text y="3" text-anchor="middle">{{ edge.targetCard }}</text>
        </g>
      </g>

      <!-- leaf nodes -->
      <g v-for="node in leafNodes" :key="node.id"
        :transform="`translate(${node.x}, ${node.y})`"
        class="node clickable" :class="{ highlighted: node.highlighted }"
        @click.stop="onNodeClick(node)">
        <rect class="frame" x="0" y="0" :width="node.w" :height="node.h" rx="4" ry="4"
           />
        <rect class="header" x="0" y="0" :width="node.w" :height="HEADER_H" rx="4" ry="4"
          :style="{ fill: node.headerColor, fillOpacity: 0.16 }" />
        <line x1="0" :y1="HEADER_H" :x2="node.w" :y2="HEADER_H" class="header-rule" :style="{ stroke: node.headerColor }" />
        <text v-if="node.icon" x="11" y="22" class="type-icon" :style="{ fill: node.headerColor }">{{ node.icon }}</text>
        <template v-if="node.subtitle">
          <text :x="node.icon ? 28 : 10" y="15" class="title-dark" :class="{ italic: node.italic }">{{ node.name }}</text>
          <text :x="node.icon ? 28 : 10" y="27" class="subtitle-dim">{{ node.subtitle }}</text>
        </template>
        <template v-else-if="node.stereotype">
          <text :x="node.icon ? 28 : 10" y="14" class="kind">{{ node.stereotype }}</text>
          <text :x="node.icon ? 28 : 10" y="27" class="title-dark" :class="{ italic: node.italic }">{{ node.name }}</text>
        </template>
        <text v-else :x="node.icon ? 28 : 10" y="21" class="title-dark" :class="{ italic: node.italic }">{{ node.name }}</text>
        <g v-for="(b, bi) in node.headerBadges" :key="`hb-${bi}`" class="header-badge"
          :transform="`translate(${node.w - 8 - headerBadgeOffset(node.headerBadges, bi)}, 9)`">
          <rect :x="-headerBadgeW(b.icon)" y="0" :width="headerBadgeW(b.icon)" height="15" rx="7.5"
            :style="{ fill: `color-mix(in srgb, ${b.color || '#f59e0b'} 25%, var(--diagram-surface))`, stroke: b.color || '#f59e0b' }" />
          <text :x="-headerBadgeW(b.icon) / 2" y="11" text-anchor="middle">{{ b.icon }}</text>
        </g>
        <g v-if="node.highlighted" class="main-badge" :transform="`translate(${node.w}, 0)`">
          <rect x="-30" y="-9" width="34" height="14" rx="7" />
          <text x="-13" y="2" text-anchor="middle">main</text>
        </g>

        <g v-for="(item, idx) in node.items" :key="idx" :transform="`translate(0, ${HEADER_H + item.y})`">
          <template v-if="item.type === 'title'">
            <line v-if="item.sep" x1="0" y1="0" :x2="node.w" y2="0" class="compartment-sep" />
            <rect x="1" y="0" :width="node.w - 2" :height="item.h" class="section-band"
              :style="item.color ? { fill: `color-mix(in srgb, ${item.color} 30%, var(--diagram-surface))` } : undefined" />
            <text x="10" y="11" class="section-title" :style="item.color ? { fill: `color-mix(in srgb, ${item.color} 75%, var(--diagram-text))` } : undefined">{{ item.title }}</text>
          </template>
          <template v-else-if="item.type === 'subrow'">
            <text x="26" y="12" class="col-sub">&bull; {{ item.sub.label }}</text>
            <text :x="nodeColsMap.get(node.id)!.typeX" y="12" text-anchor="end" class="col-sub-type">{{ item.sub.detail }}</text>
            <text v-if="item.sub.multiplicity" :x="nodeColsMap.get(node.id)!.multX" y="12" text-anchor="end" class="col-mult">{{ item.sub.multiplicity }}</text>
          </template>
          <template v-else>
            <line v-if="item.sep" x1="0" y1="0" :x2="node.w" y2="0" class="compartment-sep" />
            <rect v-if="item.row.color" x="1" y="0" :width="node.w - 2" :height="item.h"
              :style="{ fill: `color-mix(in srgb, ${item.row.color} 9%, transparent)` }" />
            <text v-if="item.row.key" x="4" y="14" class="key-icon">&#9911;</text>
            <text v-if="item.row.fk" x="13" y="14" class="fk-icon">&#8888;</text>
            <text v-for="(g, gi) in item.row.glyphs" :key="`g-${gi}`"
              :x="(item.row.key || item.row.fk ? 26 : 8) + gi * 12" y="14" class="row-glyph"
              :style="g.color ? { fill: g.color } : undefined">{{ g.glyph }}</text>
            <text v-if="item.row.op" x="11" y="14" class="op-icon">&#402;</text>
            <text :x="nodeColsMap.get(node.id)!.labelX" y="14" class="col" :class="{ 'col-key': item.row.key }">{{ item.row.label }}</text>
            <text :x="nodeColsMap.get(node.id)!.typeX" y="14" text-anchor="end" class="col-type">{{ item.row.detail }}</text>
            <text v-if="item.row.multiplicity" :x="nodeColsMap.get(node.id)!.multX" y="14" text-anchor="end" class="col-mult">{{ item.row.multiplicity }}</text>
            <g v-for="(b, bi) in item.row.badges" :key="bi">
              <rect :x="nodeColsMap.get(node.id)!.badgeStart + bi * 13" y="3" width="11" height="13" rx="2" class="flag-box"
                :style="item.row.badgeColors[bi] ? { fill: `color-mix(in srgb, ${item.row.badgeColors[bi]} 22%, var(--diagram-surface))`, stroke: item.row.badgeColors[bi] } : undefined" />
              <text :x="nodeColsMap.get(node.id)!.badgeStart + bi * 13 + 5.5" y="13" text-anchor="middle" class="flag-text">{{ b }}</text>
            </g>
            <text v-if="item.row.marker" :x="nodeColsMap.get(node.id)!.markerX" y="15" text-anchor="middle" class="ref-marker">{{ item.row.marker === 'diamond' ? '\u25C6' : '\u203A' }}</text>
          </template>
        </g>

        <!-- brackets -->
        <g v-for="(br, bi) in computeBrackets(node)" :key="`br-${bi}`" class="bracket"
          :style="br.color ? { '--bracket-color': br.color } : undefined">
          <template v-if="br.ticks">
            <path :d="`M${br.x + 4},${br.topY} L${br.x + 4},${br.bottomY}`" class="bracket-line" />
            <path v-for="(ty, ti) in br.ticks" :key="ti" :d="`M${br.x - 2},${ty} L${br.x + 4},${ty}`" class="bracket-line" />
            <path :d="`M${br.x - 2},${br.sourceY} L${br.x + 4},${br.sourceY}`" class="bracket-line" />
            <circle :cx="br.x - 2" :cy="br.sourceY" r="1.8" class="bracket-dot" />
          </template>
          <template v-else>
            <path
              :d="`M${br.x},${br.topY} L${br.x + 4},${br.topY} L${br.x + 4},${br.bottomY} L${br.x},${br.bottomY}`"
              class="bracket-line"
            />
            <circle :cx="br.x" :cy="br.topY" r="1.6" class="bracket-dot" />
            <circle :cx="br.x" :cy="br.bottomY" r="1.6" class="bracket-dot" />
          </template>
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
/* Main object: a crisp grey accent outline plus the "main" badge, no glow */
.node.highlighted .frame {
  stroke: var(--diagram-text-secondary);
  stroke-width: 2;
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
.edge-dashed { stroke-dasharray: 5 3; }
.edge-solid { stroke-dasharray: none; }
.header-badge text { font: 700 8px sans-serif; fill: var(--diagram-text); letter-spacing: 0.3px; }
.main-badge rect { fill: var(--diagram-surface); stroke: var(--diagram-text-secondary); stroke-width: 1; }
.main-badge text { font: 700 8px sans-serif; fill: var(--diagram-text-secondary); }
.row-glyph { font: 11px sans-serif; fill: var(--diagram-text-secondary); }
.title-dark.italic { font-style: italic; }
.edge-fk { stroke: var(--diagram-text-secondary); stroke-width: 1.3; }
.edge-label { font: 10px sans-serif; fill: var(--diagram-text); }
.end-label { font: italic 9px sans-serif; fill: var(--diagram-text-secondary); }
.card rect { fill: var(--diagram-surface); stroke: var(--diagram-text-secondary); stroke-width: 0.8; }
.card text { font: 8px sans-serif; fill: var(--diagram-text); }
.fk-icon { font: 11px sans-serif; fill: var(--diagram-text-secondary); }
.col-key { font-weight: 600; }
.bracket-line { fill: none; stroke: var(--bracket-color, var(--diagram-text-secondary)); stroke-width: 1.4; stroke-linecap: round; }
.bracket-dot { fill: var(--bracket-color, var(--diagram-text-secondary)); }
/* SVG marker styles */
.mk-hollow { fill: var(--diagram-surface); stroke: var(--diagram-border); stroke-width: 1.2; }
.mk-open { fill: none; stroke: var(--diagram-border); stroke-width: 1.4; }
.mk-filled { fill: var(--diagram-border); stroke: var(--diagram-border); stroke-width: 1; }
.highlight-shadow { flood-color: var(--diagram-highlight); }
</style>
