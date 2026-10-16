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

export const HEADER_H = 34
export const ROW_H = 20
export const SUBROW_H = 16
export const TITLE_H = 16
export const MIN_NODE_W = 160

export interface NodeRef {
  obj: EObject
  mapping: EObject
}
export interface EdgeMeta {
  kind: string
  sourceCardinality: string
  targetCardinality: string
  sourceDecoration: string
  targetDecoration: string
  sourcePortY?: number
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
  marker: string
  rowObjId: string
}
export interface CompartmentView {
  separator: boolean
  title: string
  rows: RowView[]
}
export interface NodeView {
  title: string
  stereotype: string
  subtitle: string
  icon: string
  compartments: CompartmentView[]
}

export type LayoutItem =
  | { type: 'title'; y: number; h: number; title: string; sep: boolean }
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

export function resolveNodeView(obj: EObject, mapping: EObject): NodeView {
  const title = readScalar(obj, featureOf(mapping, 'labelFeature'))
  const stereotype = String(get(mapping, 'stereotype') ?? '')
  const subtitle = readScalar(obj, featureOf(mapping, 'subtitleFeature'))
  const icon = String(get(mapping, 'icon') ?? '')
  const compartments: CompartmentView[] = []
  for (const comp of items(mapping, 'compartments')) {
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
    const callable = subFromPath.length > 0
    const rows: RowView[] = follow(obj, pathOf(comp, 'from'))
      .filter((r) => !rowSCName || r.eClass().getName() === rowSCName)
      .filter(
        (r) =>
          !rowCond ||
          evaluateBoolean(
            { language: String(get(rowCond, 'language') ?? ''), body: String(get(rowCond, 'body') ?? '') },
            r,
          ),
      )
      .map((r) => {
        const base = readScalar(r, labelFeature)
        const subRows: SubRowView[] = callable
          ? follow(r, subFromPath).map((sr) => ({
              label: readScalar(sr, subLabelF),
              detail: readScalar(sr, subDetailF),
              multiplicity: multiplicityOf(sr, lowerF, upperF),
            }))
          : []
        return {
          label: callable ? `${base}(${subRows.length ? '…' : ''})` : base,
          detail: readScalar(r, detailFeature),
          multiplicity: multiplicityOf(r, lowerF, upperF),
          badges: badges
            .filter((b) => {
              const wf = featureOf(b, 'whenFeature')
              return !wf || truthy(readScalar(r, wf))
            })
            .map((b) => String(get(b, 'icon'))),
          subRows,
          op: callable,
          key: keyF ? truthy(readScalar(r, keyF)) : false,
          marker: markerF ? (truthy(readScalar(r, markerF)) ? 'diamond' : 'arrow') : '',
          rowObjId: nodeId(r),
        }
      })
    if (rows.length) compartments.push({ separator, title, rows })
  }
  return { title, stereotype, subtitle, icon, compartments }
}

/** Estimate text width in px (approximate char widths for SVG fonts). */
function textWidth(text: string, fontSize: number, mono = false): number {
  if (!text) return 0
  const avgChar = mono ? fontSize * 0.6 : fontSize * 0.55
  return text.length * avgChar
}

/** Compute the minimum node width to fit all content. */
export function computeNodeWidth(view: NodeView): number {
  // Header: icon(18) + stereotype/title
  const titleW = textWidth(view.title, 13) + (view.icon ? 28 : 10) + 10
  const subtitleW = view.subtitle ? textWidth(view.subtitle, 9, true) + (view.icon ? 28 : 10) + 10 : 0
  let maxRow = 0
  for (const comp of view.compartments) {
    for (const r of comp.rows) {
      const labelW = textWidth(r.label, 11)
      const typeW = textWidth(r.detail, 10, true)
      const multW = r.multiplicity ? textWidth(r.multiplicity, 10, true) : 0
      const badgeW = r.badges.length * 13
      const markerW = r.marker ? 14 : 0
      const padLeft = r.key ? 20 : r.op ? 22 : 12
      const rowW = padLeft + labelW + 12 + typeW + 8 + multW + badgeW + markerW + 8
      if (rowW > maxRow) maxRow = rowW
      for (const sr of r.subRows) {
        const subW = 26 + textWidth(sr.label, 10) + 12 + textWidth(sr.detail, 9, true) + 8
        if (subW > maxRow) maxRow = subW
      }
    }
  }
  return Math.max(MIN_NODE_W, titleW, subtitleW, maxRow)
}

export function layoutNode(view: NodeView): { items: LayoutItem[]; height: number; width: number } {
  const items: LayoutItem[] = []
  let y = 0
  for (const comp of view.compartments) {
    if (comp.title) {
      items.push({ type: 'title', y, h: TITLE_H, title: comp.title, sep: comp.separator })
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
): Promise<NonNullable<ElkNode['children']>> {
  const out: NonNullable<ElkNode['children']> = []
  for (const nm of mappings) {
    if (truthy(get(nm, 'group'))) {
      const groupChildren = await buildNodes(items(nm, 'children'), parentObj, index, portNodeMap, rowYMap)
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
    const objs = follow(parentObj, pathOf(nm, 'from'))
    for (let oi = 0; oi < objs.length; oi++) {
      const obj = objs[oi]
      if (sourceClassName && obj.eClass().getName() !== sourceClassName) continue
      if (condition && !evaluateBoolean(
        { language: String(get(condition, 'language') ?? ''), body: String(get(condition, 'body') ?? '') },
        obj,
      )) continue
      const id = nodeId(obj)
      index.set(id, { obj, mapping: nm })
      const view = resolveNodeView(obj, nm)
      const childNodes = await buildNodes(items(nm, 'children'), obj, index, portNodeMap, rowYMap)

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
      }

      const bracketExtra = bracketCount > 0 ? 10 + bracketCount * 9 : 0

      if (childNodes.length) {
        out.push({
          id,
          labels: [{ text: view.title }],
          children: childNodes,
          layoutOptions: { 'elk.padding': `[top=${HEADER_H + 16},left=20,bottom=20,right=20]`, 'elk.spacing.nodeNode': '80', 'elk.layered.spacing.nodeNodeBetweenLayers': '100' },
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

export async function interpret(model: EObject, root: EObject): Promise<InterpretResult> {
  const index = new Map<string, NodeRef>()
  const portNodeMap = new Map<string, string>()
  const rowYMap = new Map<string, number>()
  const children = await buildNodes(items(model, 'nodes'), root, index, portNodeMap, rowYMap)

  const edges: NonNullable<ElkNode['edges']> = []
  const edgeMeta = new Map<string, EdgeMeta>()
  const usedPorts = new Set<string>()
  const edgeMappings = items(model, 'edges')
  for (const em of edgeMappings) {
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
    const edgeObjs = follow(root, pathOf(em, 'fromPath'))
    for (let ei = 0; ei < edgeObjs.length; ei++) {
      const e = edgeObjs[ei]
      if (edgeSCName && e.eClass().getName() !== edgeSCName) continue
      const srcObj = sourcePath.length ? (follow(e, sourcePath)[0] ?? null) : e
      const srcNode = nodeContaining(srcObj, index)
      if (!srcNode) continue
      const label = labelFeature ? readScalar(e, labelFeature) : ''
      const portId = `${srcNode}__port__${nodeId(e)}`
      const hasPort = portNodeMap.has(portId)
      follow(e, targetPath).forEach((tObj, i) => {
        const tgtNode = nodeContaining(tObj, index)
        if (!tgtNode) return
        const id = `${nodeId(e)}#${i}`
        const usePort = hasPort && tgtNode !== srcNode
        if (usePort) usedPorts.add(portId)
        edges.push({
          id,
          sources: [usePort ? portId : srcNode],
          targets: [tgtNode],
          labels: label ? [{ text: label, width: label.length * 6 + 4, height: 12 }] : [],
        })
        edgeMeta.set(id, {
          kind,
          sourceCardinality,
          targetCardinality,
          sourceDecoration,
          targetDecoration,
          sourcePortY: usePort ? rowYMap.get(portId) : undefined,
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

  const layoutOptions: Record<string, string> = {}
  for (const opt of items(model, 'layoutOptions')) {
    layoutOptions[String(get(opt, 'key'))] = String(get(opt, 'value'))
  }

  return { graph: { id: 'root', layoutOptions, children, edges }, index, edgeMeta, portNodeMap }
}
