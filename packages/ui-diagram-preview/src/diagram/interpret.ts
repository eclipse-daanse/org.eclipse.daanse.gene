/**
 * Generic, model-driven projection: (DiagramModel, domainRoot) -> ELK graph.
 *
 * Copied from diagram-vue-prototype. All feature references are typed Ecore
 * references — the interpreter reads values with obj.eGet(feature) directly.
 */
import {
  EcoreUtil,
  type EObject,
  type EStructuralFeature,
  type EReference,
} from '@emfts/core'
import type { ElkNode } from 'elkjs/lib/elk.bundled.js'
import { get, items } from './emf'
import { evaluateBoolean } from './evaluateExpression'
import { createContext, evalCondition, readValue, runQuery, type DiagramContext } from './query'

export const HEADER_H = 34
export const ROW_H = 20
export const SUBROW_H = 16
export const TITLE_H = 16
export const MIN_NODE_W = 160

export interface NodeRef {
  obj: EObject
  mapping: EObject
  /** The context the node was built in; its view is resolved in the same one */
  ctx?: DiagramContext
}
export interface EdgeMeta {
  kind: string
  /** SOLID | DASHED; '' = by kind */
  lineStyle: string
  sourceCardinality: string
  targetCardinality: string
  sourceDecoration: string
  targetDecoration: string
  sourcePortY?: number
  /** Texts at the ends (role names) */
  sourceLabel?: string
  targetLabel?: string
}
export interface InterpretResult {
  graph: ElkNode
  index: Map<string, NodeRef>
  edgeMeta: Map<string, EdgeMeta>
  portNodeMap: Map<string, string>
}
export interface SubRowView {
  label: string
  detail: string
  multiplicity: string
}
export interface RowView {
  label: string
  detail: string
  multiplicity: string
  badges: string[]
  subRows: SubRowView[]
  op: boolean
  key: boolean
  /** Foreign-key icon before the row */
  fk: boolean
  /** Free leading glyphs (parameter direction ...), with colours */
  glyphs: { glyph: string; color: string }[]
  /** Colour per badge, parallel to badges; '' = default */
  badgeColors: string[]
  marker: string
  rowObjId: string
  /** Section colour of the row's compartment, '' = none */
  color: string
  /** Rows of this node the row connects to (index row -> its columns), by rowObjId */
  links: string[]
}
export interface CompartmentView {
  separator: boolean
  title: string
  rows: RowView[]
  color: string
}
export interface NodeView {
  title: string
  stereotype: string
  subtitle: string
  icon: string
  compartments: CompartmentView[]
  /** Badges in the header (TMP, SYS, abstract) */
  headerBadges: { icon: string; color: string }[]
  italic: boolean
}

export type LayoutItem =
  | { type: 'title'; y: number; h: number; title: string; sep: boolean; color: string }
  | { type: 'row'; y: number; h: number; row: RowView; sep: boolean }
  | { type: 'subrow'; y: number; h: number; sub: SubRowView }

export function nodeId(o: EObject): string {
  const res = (o as { eResource?: () => { getURIFragment?: (e: EObject) => string } | null }).eResource?.()
  if (res?.getURIFragment) {
    try {
      const frag = res.getURIFragment(o)
      if (frag) return frag
    } catch { /* fall through */ }
  }
  const uri = EcoreUtil.getURI(o)?.toString()
  if (uri) return uri
  const parts: string[] = []
  for (
    let cur: EObject | null | undefined = o;
    cur && typeof (cur as { eClass?: unknown }).eClass === 'function';
    cur = cur.eContainer?.()
  ) {
    const nf = cur.eClass().getEStructuralFeature('name')
    const nm = nf ? cur.eGet(nf) : null
    parts.unshift(nm != null && nm !== '' ? String(nm) : '_')
  }
  return parts.join('/')
}

function truthy(v: unknown): boolean {
  return v === true || v === 'true' || (typeof v === 'number' && v !== 0)
}

function deproxy<T extends EObject>(o: T | null | undefined, ctx: EObject): T | undefined {
  if (!o) return undefined
  return (typeof o.eIsProxy === 'function' && o.eIsProxy() ? EcoreUtil.resolve(o, ctx) : o) as T
}

function featureOf(mappingObj: EObject, name: string): EStructuralFeature | undefined {
  return deproxy(get(mappingObj, name) as EObject | undefined, mappingObj) as
    | EStructuralFeature
    | undefined
}

function pathOf(mappingObj: EObject, name: string): EReference[] {
  return items(mappingObj, name)
    .map((r) => deproxy(r, mappingObj))
    .filter(Boolean) as EReference[]
}

function readScalar(obj: EObject, feature: EStructuralFeature | undefined): string {
  if (!feature) return ''
  let v: unknown
  try { v = obj.eGet(feature) } catch { return '' }
  if (v == null) return ''
  if (typeof (v as { eClass?: unknown }).eClass === 'function') {
    const ref = deproxy(v as EObject, obj)
    if (!ref) return ''
    // Handle unresolved proxies: extract name from URI fragment
    if (typeof ref.eIsProxy === 'function' && ref.eIsProxy()) {
      try {
        const uri = EcoreUtil.getURI(ref)?.toString() ?? ''
        const frag = uri.includes('#//') ? uri.split('#//').pop()! : uri
        return frag.split('/').pop() ?? ''
      } catch { return '?' }
    }
    try {
      const nf = ref.eClass().getEStructuralFeature('name')
      return nf ? String(ref.eGet(nf) ?? '') : ''
    } catch { return '' }
  }
  return String(v)
}

function follow(start: EObject, path: EReference[]): EObject[] {
  let current: EObject[] = [start]
  for (const ref of path) {
    current = current.flatMap((o) => {
      let v: unknown
      try { v = o.eGet(ref) } catch { return [] }
      if (v == null) return []
      const arr = Array.isArray(v)
        ? (v as EObject[])
        : typeof (v as { toArray?: unknown }).toArray === 'function'
          ? (v as { toArray(): EObject[] }).toArray()
          : [v as EObject]
      return arr.map((x) => deproxy(x, o)).filter(Boolean) as EObject[]
    })
  }
  return current
}

function nodeContaining(obj: EObject | null | undefined, index: Map<string, NodeRef>): string | null {
  let cur: EObject | null | undefined = obj
  while (cur && typeof (cur as { eClass?: unknown }).eClass === 'function') {
    const id = nodeId(cur)
    if (index.has(id)) return id
    cur = cur.eContainer?.()
  }
  return null
}

function multiplicityOf(
  r: EObject,
  lowerF: EStructuralFeature | undefined,
  upperF: EStructuralFeature | undefined,
): string {
  if (!lowerF && !upperF) return ''
  return formatMultiplicity(lowerF ? r.eGet(lowerF) : null, upperF ? r.eGet(upperF) : null)
}

function attrText(o: EObject, name: string): string {
  const f = o.eClass().getEStructuralFeature(name)
  const v = f ? o.eGet(f) : null
  return v == null ? '' : String(v)
}

function child(o: EObject, name: string): EObject | null {
  const f = o.eClass().getEStructuralFeature(name)
  return f ? ((o.eGet(f) as EObject | null) ?? null) : null
}

function kids(o: EObject, name: string): EObject[] {
  const f = o.eClass().getEStructuralFeature(name)
  const v = f ? o.eGet(f) : null
  return v && typeof (v as any).toArray === 'function' ? (v as any).toArray() : []
}

/**
 * Whether a definition element's `when` holds for a domain object (the node,
 * row or edge object). A SWITCH condition ignores the object. Without a
 * context every element applies.
 */
export function applies(el: EObject, obj: EObject, ctx?: DiagramContext): boolean {
  if (!ctx) return true
  return evalCondition(child(el, 'when'), obj, ctx)
}

const EMPTY_CTX: DiagramContext = { settings: new Map(), inverse: new Map(), scope: () => [] }

export function resolveNodeView(obj: EObject, mapping: EObject, ctx?: DiagramContext): NodeView {
  const c = ctx ?? EMPTY_CTX
  const title = readScalar(obj, featureOf(mapping, 'labelFeature'))
  const headerBadges = kids(mapping, 'headerBadges')
    .filter(b => applies(b, obj, ctx))
    .filter(b => {
      const wf = featureOf(b, 'whenFeature')
      return !wf || truthy(readScalar(obj, wf))
    })
    .map(b => ({ icon: String(get(b, 'icon') ?? ''), color: attrText(b, 'color') }))
  const italicWhen = child(mapping, 'italicWhen')
  const italic = italicWhen ? evalCondition(italicWhen, obj, c) : false
  const stereotype = String(get(mapping, 'stereotype') ?? '')
  const subtitle = readScalar(obj, featureOf(mapping, 'subtitleFeature'))
  const icon = String(get(mapping, 'icon') ?? '')
  const compartments: CompartmentView[] = []
  for (const comp of items(mapping, 'compartments')) {
    if (!applies(comp, obj, ctx)) continue
    const color = attrText(comp, 'color')
    const rowsFrom = child(comp, 'rowsFrom')
    const labelValue = child(comp, 'label')
    const detailValue = child(comp, 'detail')
    const rowWhen = child(comp, 'rowWhen')
    const icons = kids(comp, 'icons')
    const links = child(comp, 'links')
    const labelFeature = featureOf(comp, 'labelFeature')
    const detailFeature = featureOf(comp, 'detailFeature')
    const lowerF = featureOf(comp, 'lowerBoundFeature')
    const upperF = featureOf(comp, 'upperBoundFeature')
    const subFromPath = pathOf(comp, 'subFrom')
    const subLabelF = featureOf(comp, 'subLabelFeature')
    const subDetailF = featureOf(comp, 'subDetailFeature')
    const separator = truthy(get(comp, 'separator'))
    const title = String(get(comp, 'title') ?? '')
    const badges = items(comp, 'badges')
    const keyF = featureOf(comp, 'keyFeature')
    const markerF = featureOf(comp, 'markerFeature')
    const rowCond = get(comp, 'rowCondition') as EObject | undefined | null
    const rowSC = deproxy(get(comp, 'sourceClass') as EObject | undefined, comp)
    const rowSCName = rowSC ? String(get(rowSC, 'name') ?? '') : ''
    const callable = subFromPath.length > 0 || !!child(comp, 'subRowsFrom')
    const rowObjects = rowsFrom ? runQuery(rowsFrom, obj, c) : follow(obj, pathOf(comp, 'from'))
    const rows: RowView[] = rowObjects
      .filter((r) => !rowSCName || r.eClass().getName() === rowSCName)
      .filter((r) => !rowWhen || evalCondition(rowWhen, r, c))
      .filter(
        (r) =>
          !rowCond ||
          evaluateBoolean(
            { language: String(get(rowCond, 'language') ?? ''), body: String(get(rowCond, 'body') ?? '') },
            r,
          ),
      )
      .map((r) => {
        const base = labelValue ? readValue(labelValue, r, c) : readScalar(r, labelFeature)
        const shownIcons = icons.filter(i => evalCondition(child(i, 'when'), r, c))
        const iconKinds = shownIcons.map(i => attrText(i, 'kind').toUpperCase())
        const subRowsQuery = child(comp, 'subRowsFrom')
        const subObjects = subRowsQuery ? runQuery(subRowsQuery, r, c) : callable ? follow(r, subFromPath) : []
        const subRows: SubRowView[] = subObjects.length || callable
          ? subObjects.map((sr) => ({
              label: child(comp, 'subLabel') ? readValue(child(comp, 'subLabel'), sr, c) : readScalar(sr, subLabelF),
              detail: child(comp, 'subDetail') ? readValue(child(comp, 'subDetail'), sr, c) : readScalar(sr, subDetailF),
              multiplicity: multiplicityOf(sr, lowerF, upperF),
            }))
          : []
        return {
          label: callable ? `${base}(${subRows.length ? '…' : ''})` : base,
          detail: detailValue ? readValue(detailValue, r, c) : readScalar(r, detailFeature),
          multiplicity: child(comp, 'multiplicityValue') ? readValue(child(comp, 'multiplicityValue'), r, c) : multiplicityOf(r, lowerF, upperF),
          badges: badges.filter((b) => badgeShows(b, r, c)).map((b) => String(get(b, 'icon'))),
          badgeColors: badges.filter((b) => badgeShows(b, r, c)).map((b) => attrText(b, 'color')),
          glyphs: shownIcons
            .filter(i => attrText(i, 'glyph'))
            .map(i => ({ glyph: attrText(i, 'glyph'), color: attrText(i, 'color') })),
          subRows,
          op: callable,
          key: iconKinds.includes('PRIMARY_KEY') || (keyF ? truthy(readScalar(r, keyF)) : false),
          fk: iconKinds.includes('FOREIGN_KEY'),
          color,
          links: links ? runQuery(links, r, c).filter(x => x !== r).map(x => nodeId(x)) : [],
          marker: markerF ? (truthy(readScalar(r, markerF)) ? 'diamond' : 'arrow') : '',
          rowObjId: nodeId(r),
        }
      })
    if (rows.length) compartments.push({ separator, title, rows, color })
  }
  return { title, stereotype, subtitle, icon, compartments, headerBadges, italic }
}

/** A row badge shows when its whenFeature is truthy - and, in a context, its `when` holds for the row */
function badgeShows(b: EObject, r: EObject, c: DiagramContext): boolean {
  const wf = featureOf(b, 'whenFeature')
  if (wf && !truthy(readScalar(r, wf))) return false
  return evalCondition(child(b, 'when'), r, c)
}

/** Estimate text width in px (approximate char widths for SVG fonts). */
function textWidth(text: string, fontSize: number, mono = false): number {
  if (!text) return 0
  // Generous averages: an underestimate lets a long name run into its type
  const avgChar = mono ? fontSize * 0.62 : fontSize * 0.6
  return text.length * avgChar
}

/** Compute the minimum node width to fit all content. */
export function computeNodeWidth(view: NodeView): number {
  // Header: icon(18) + stereotype/title
  const titleW = textWidth(view.title, 13) + (view.icon ? 28 : 10) + 10
  const subtitleW = view.subtitle ? textWidth(view.subtitle, 9, true) + (view.icon ? 28 : 10) + 10 : 0
  // Badge, key and glyph columns are laid out for the whole node, not per row
  const rowsAll = view.compartments.flatMap(c => c.rows)
  const maxBadges = Math.max(0, ...rowsAll.map(r => r.badges.length))
  const anyKey = rowsAll.some(r => r.key || r.fk)
  const anyOp = rowsAll.some(r => r.op)
  const maxGlyphs = Math.max(0, ...rowsAll.map(r => r.glyphs.length))
  const anyMarker = rowsAll.some(r => r.marker)
  const anyMult = rowsAll.some(r => r.multiplicity)
  const padLeft = (anyKey ? 26 : anyOp ? 22 : maxGlyphs ? 8 : 12) + maxGlyphs * 12
  const right = maxBadges * 13 + (maxBadges ? 4 : 0) + (anyMarker ? 14 : 0) + (anyMult ? 34 : 0) + 10
  let maxRow = 0
  for (const r of rowsAll) {
    const rowW = padLeft + textWidth(r.label, 11) + 16 + textWidth(r.detail, 10, true) + right
    if (rowW > maxRow) maxRow = rowW
    for (const sr of r.subRows) {
      const subW = 26 + textWidth(sr.label, 10) + 12 + textWidth(sr.detail, 9, true) + right
      if (subW > maxRow) maxRow = subW
    }
  }
  const headerBadgesW = view.headerBadges.reduce((w, b) => w + Math.max(22, b.icon.length * 6 + 12) + 4, 0)
  return Math.max(MIN_NODE_W, titleW + headerBadgesW, subtitleW, maxRow)
}

export function layoutNode(view: NodeView): { items: LayoutItem[]; height: number; width: number } {
  const items: LayoutItem[] = []
  let y = 0
  for (const comp of view.compartments) {
    if (comp.title) {
      items.push({ type: 'title', y, h: TITLE_H, title: comp.title, sep: comp.separator, color: comp.color })
      y += TITLE_H
    }
    comp.rows.forEach((r, ri) => {
      items.push({ type: 'row', y, h: ROW_H, row: r, sep: !comp.title && comp.separator && ri === 0 })
      y += ROW_H
      r.subRows.forEach((sr) => {
        items.push({ type: 'subrow', y, h: SUBROW_H, sub: sr })
        y += SUBROW_H
      })
    })
  }
  return { items, height: Math.max(ROW_H, y), width: computeNodeWidth(view) }
}

function formatMultiplicity(lowVal: unknown, upVal: unknown): string {
  const hasLow = lowVal !== null && lowVal !== undefined && lowVal !== ''
  const hasUp = upVal !== null && upVal !== undefined && upVal !== ''
  if (!hasLow && !hasUp) return ''
  const low = hasLow ? String(Number(lowVal)) : '0'
  const upN = hasUp ? Number(upVal) : -1
  return `${low}..${upN === -1 ? '*' : upN}`
}

/** Rows with connectors to other rows of the same node - each takes a lane at the right */
export function connectorCount(items: LayoutItem[]): number {
  const ids = new Set(items.filter(i => i.type === 'row').map(i => (i as any).row.rowObjId))
  return items.filter(i => i.type === 'row' && i.row.links.some(l => ids.has(l))).length
}

export function rowCount(view: NodeView): number {
  return view.compartments.reduce(
    (n, c) => n + c.rows.reduce((m, r) => m + 1 + r.subRows.length, 0),
    0,
  )
}

export function nodeHeaderColor(mapping: EObject): string {
  const style = deproxy(get(mapping, 'style') as EObject | undefined, mapping)
  return style ? String(get(style, 'headerColor') ?? '#1e3a8a') : '#1e3a8a'
}

const yieldToMain = () => new Promise<void>(resolve => setTimeout(resolve, 0))

async function buildNodes(
  mappings: EObject[],
  parentObj: EObject,
  index: Map<string, NodeRef>,
  portNodeMap: Map<string, string>,
  rowYMap: Map<string, number>,
  ctx: DiagramContext,
): Promise<NonNullable<ElkNode['children']>> {
  const out: NonNullable<ElkNode['children']> = []
  for (const nm of mappings) {
    if (truthy(get(nm, 'group'))) {
      if (!applies(nm, parentObj, ctx)) continue
      const groupChildren = await buildNodes(items(nm, 'children'), parentObj, index, portNodeMap, rowYMap, ctx)
      if (groupChildren.length) {
        out.push({
          id: `${nodeId(parentObj)}::${String(get(nm, 'name') ?? 'group')}`,
          labels: [{ text: String(get(nm, 'groupLabel') ?? '') }],
          children: groupChildren,
          layoutOptions: { 'elk.padding': `[top=${HEADER_H + 16},left=20,bottom=20,right=20]`, 'elk.spacing.nodeNode': '80', 'elk.layered.spacing.nodeNodeBetweenLayers': '100' },
        })
      }
      continue
    }
    const condition = get(nm, 'condition') as EObject | undefined | null
    const sc = deproxy(get(nm, 'sourceClass') as EObject | undefined, nm)
    const sourceClassName = sc ? String(get(sc, 'name') ?? '') : ''
    const rowsFrom = child(nm, 'rowsFrom')
    const objs = rowsFrom ? runQuery(rowsFrom, parentObj, ctx) : follow(parentObj, pathOf(nm, 'from'))
    for (let oi = 0; oi < objs.length; oi++) {
      const obj = objs[oi]
      if (sourceClassName && obj.eClass().getName() !== sourceClassName) continue
      // Focus diagram: only the focus objects, and their containers as frames
      if (ctx.focus && !ctx.focus.has(obj) && !ctx.focusAncestors?.has(obj)) continue
      if (!applies(nm, obj, ctx)) continue
      if (condition && !evaluateBoolean(
        { language: String(get(condition, 'language') ?? ''), body: String(get(condition, 'body') ?? '') },
        obj,
      )) continue
      const id = nodeId(obj)
      index.set(id, { obj, mapping: nm, ctx })
      const view = resolveNodeView(obj, nm, ctx)
      const childNodes = await buildNodes(items(nm, 'children'), obj, index, portNodeMap, rowYMap, ctx)

      let bracketCount = 0
      if (!childNodes.length) {
        const lay = layoutNode(view)
        const seen = new Set<string>()
        const rowIdCounts = new Map<string, number>()
        for (const item of lay.items) {
          if (item.type === 'row' && item.row.rowObjId) {
            rowIdCounts.set(item.row.rowObjId, (rowIdCounts.get(item.row.rowObjId) ?? 0) + 1)
            if (!seen.has(item.row.rowObjId)) {
              seen.add(item.row.rowObjId)
              const portId = `${id}__port__${item.row.rowObjId}`
              const yCenter = HEADER_H + item.y + ROW_H / 2
              portNodeMap.set(portId, id)
              rowYMap.set(portId, yCenter)
            }
          }
        }
        for (const c of rowIdCounts.values()) if (c >= 2) bracketCount++
        bracketCount += connectorCount(lay.items)
      }

      const bracketExtra = bracketCount > 0 ? 10 + bracketCount * 9 : 0

      if (childNodes.length) {
        const own: Record<string, string> = {}
        for (const opt of items(nm, 'layoutOptions')) own[String(get(opt, 'key'))] = String(get(opt, 'value'))
        out.push({
          id,
          labels: [{ text: view.title }],
          children: childNodes,
          layoutOptions: { 'elk.padding': `[top=${HEADER_H + 16},left=20,bottom=20,right=20]`, 'elk.spacing.nodeNode': '80', 'elk.layered.spacing.nodeNodeBetweenLayers': '100', ...own },
        })
      } else {
        const lay = layoutNode(view)
        out.push({
          id,
          width: lay.width + bracketExtra,
          height: HEADER_H + lay.height,
          labels: [{ text: view.title }],
        })
      }

      await yieldToMain()
    }
  }
  return out
}

/**
 * Interprets a definition against a root object. `preset` names the switch
 * settings to use (the definition's first preset when omitted); `focus`
 * limits the nodes to those objects and their containers.
 */
export async function interpret(model: EObject, rootOrRoots: EObject | EObject[], preset?: string, focus?: EObject[] | null): Promise<InterpretResult> {
  // Several roots: a focus diagram whose objects lie under different top-level containers
  const roots = Array.isArray(rootOrRoots) ? rootOrRoots : [rootOrRoots]
  const root = roots[0]
  const ctx = createContext(model, root, preset, focus)
  const index = new Map<string, NodeRef>()
  const portNodeMap = new Map<string, string>()
  const rowYMap = new Map<string, number>()
  const children: NonNullable<ElkNode['children']> = []
  for (const r of roots) children.push(...await buildNodes(items(model, 'nodes'), r, index, portNodeMap, rowYMap, ctx))

  const edges: NonNullable<ElkNode['edges']> = []
  const edgeMeta = new Map<string, EdgeMeta>()
  const usedPorts = new Set<string>()
  const edgeMappings = items(model, 'edges')
  for (const em of edgeMappings) {
    const lineStyle = attrText(em, 'lineStyle').toUpperCase()
    const sourceCardValue = child(em, 'sourceCardinalityValue')
    const targetCardValue = child(em, 'targetCardinalityValue')
    const sourcePath = pathOf(em, 'sourcePath')
    const targetPath = pathOf(em, 'targetPath')
    const labelFeature = featureOf(em, 'labelFeature')
    const kind = String(get(em, 'kind') ?? '')
    const sourceCardinality = String(get(em, 'sourceCardinality') ?? '')
    const targetCardinality = String(get(em, 'targetCardinality') ?? '')
    const sourceDecoration = String(get(em, 'sourceDecoration') ?? '')
    const targetDecoration = String(get(em, 'targetDecoration') ?? '')
    const edgeSC = deproxy(get(em, 'sourceClass') as EObject | undefined, em)
    const edgeSCName = edgeSC ? String(get(edgeSC, 'name') ?? '') : ''
    const edgeObjs = roots.flatMap(r => follow(r, pathOf(em, 'fromPath')))
    for (let ei = 0; ei < edgeObjs.length; ei++) {
      const e = edgeObjs[ei]
      if (edgeSCName && e.eClass().getName() !== edgeSCName) continue
      if (!applies(em, e, ctx)) continue
      // One edge per source object that has a row (a composite foreign key: one per column), else one from the node
      const sourceQuery = child(em, 'sourceQuery')
      const targetQuery = child(em, 'targetQuery')
      const srcObjs = sourceQuery ? runQuery(sourceQuery, e, ctx) : sourcePath.length ? follow(e, sourcePath) : [e]
      const srcNode = nodeContaining(srcObjs[0] ?? null, index)
      if (!srcNode) continue
      const label = labelFeature ? readScalar(e, labelFeature) : ''
      const rowPorts = srcObjs
        .map(o => `${nodeContaining(o, index)}__port__${nodeId(o)}`)
        .filter(p => portNodeMap.has(p))
      const fallback = `${srcNode}__port__${nodeId(e)}`
      const ports = rowPorts.length ? rowPorts : [portNodeMap.has(fallback) ? fallback : '']
      const sourceCard = sourceCardValue ? readValue(sourceCardValue, e, ctx) : sourceCardinality
      const targetCard = targetCardValue ? readValue(targetCardValue, e, ctx) : targetCardinality
      // The target nodes, each once (a key's several columns lie in one table)
      const tgtObjs = targetQuery ? runQuery(targetQuery, e, ctx) : follow(e, targetPath)
      // In a focus diagram an end that is only a frame (a package around the focus) takes no edge
      const shown = (id: string | null): id is string => {
        if (!id) return false
        if (!ctx.focus) return true
        const o = index.get(id)?.obj
        return !!o && !(ctx.focusAncestors?.has(o) && !ctx.focus.has(o))
      }
      if (!shown(srcNode)) continue
      const tgtNodes = [...new Set(tgtObjs.map(t => nodeContaining(t, index)).filter(shown))]
      const sourceLabel = readValue(child(em, 'sourceLabelValue'), e, ctx)
      const targetLabel = readValue(child(em, 'targetLabelValue'), e, ctx)
      const srcDeco = child(em, 'sourceDecorationValue') ? readValue(child(em, 'sourceDecorationValue'), e, ctx) : sourceDecoration
      const tgtDeco = child(em, 'targetDecorationValue') ? readValue(child(em, 'targetDecorationValue'), e, ctx) : targetDecoration
      ports.forEach((portId, pi) => {
        const fromNode = portId ? portNodeMap.get(portId)! : srcNode
        tgtNodes.forEach((tgtNode, i) => {
          const id = `${nodeId(e)}#${pi}.${i}`
          const usePort = !!portId && tgtNode !== fromNode
          if (usePort) usedPorts.add(portId)
          const first = pi === 0 && i === 0
          edges.push({
            id,
            sources: [usePort ? portId : fromNode],
            targets: [tgtNode],
            labels: label && first ? [{ text: label, width: label.length * 6 + 4, height: 12 }] : [],
          })
          edgeMeta.set(id, {
            kind,
            lineStyle,
            sourceCardinality: first ? sourceCard : '',
            targetCardinality: first ? targetCard : '',
            sourceDecoration: srcDeco,
            targetDecoration: tgtDeco,
            sourcePortY: usePort ? rowYMap.get(portId) : undefined,
            sourceLabel: first ? sourceLabel : '',
            targetLabel: first ? targetLabel : '',
          })
        })
      })

      await yieldToMain()
    }
  }

  const elkNodeMap = new Map<string, Record<string, unknown>>()
  function indexElkChildren(ch: NonNullable<ElkNode['children']>) {
    for (const c of ch) {
      elkNodeMap.set(c.id, c as unknown as Record<string, unknown>)
      if (c.children) indexElkChildren(c.children)
    }
  }
  indexElkChildren(children)
  for (const pid of usedPorts) {
    const nid = portNodeMap.get(pid)!
    const node = elkNodeMap.get(nid)
    if (!node) continue
    const ports = (node.ports ?? []) as { id: string; x: number; y: number; width: number; height: number }[]
    ports.push({ id: pid, x: (node.width as number) ?? MIN_NODE_W, y: rowYMap.get(pid)!, width: 0, height: 0 })
    node.ports = ports
    node.layoutOptions = { ...((node.layoutOptions as Record<string, string>) ?? {}), 'elk.portConstraints': 'FIXED_POS' }
  }

  // Every edge lives in the innermost container holding both ends, so each container lays out on its own
  const parentOf = new Map<string, string | null>()
  const walkParents = (ch: NonNullable<ElkNode['children']>, parent: string | null) => {
    for (const c of ch) {
      parentOf.set(c.id, parent)
      if (c.children) walkParents(c.children, c.id)
    }
  }
  walkParents(children, null)
  const chain = (id: string): string[] => {
    const out: string[] = []
    for (let p = parentOf.get(id) ?? null; p; p = parentOf.get(p) ?? null) out.push(p)
    return out
  }
  const rootEdges: NonNullable<ElkNode['edges']> = []
  for (const edge of edges) {
    const src = portNodeMap.get(edge.sources[0]) ?? edge.sources[0]
    const tgt = edge.targets[0]
    const tgtChain = new Set(chain(tgt))
    const lca = chain(src).find(p => tgtChain.has(p) && p !== src && p !== tgt) ?? null
    const host = lca ? (elkNodeMap.get(lca) as unknown as ElkNode | undefined) : undefined
    if (host) (host.edges ??= []).push(edge)
    else rootEdges.push(edge)
  }

  const layoutOptions: Record<string, string> = {}
  for (const opt of items(model, 'layoutOptions')) {
    layoutOptions[String(get(opt, 'key'))] = String(get(opt, 'value'))
  }

  return { graph: { id: 'root', layoutOptions, children, edges: rootEdges }, index, edgeMeta, portNodeMap }
}
