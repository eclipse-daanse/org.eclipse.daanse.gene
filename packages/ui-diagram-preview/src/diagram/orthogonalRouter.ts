/**
 * Edge routing adapter using tsrouter (OrthogonalRouter).
 * Copied from diagram-vue-prototype.
 */
import { OrthogonalRouter } from 'tsrouter'
import type { Port } from 'tsrouter'

export interface Point { x: number; y: number }
export interface NodeRect {
  id: string
  x: number; y: number; w: number; h: number
  parentId?: string
}
export interface EdgeInput {
  id: string
  srcId: string
  tgtId: string
  sourcePortY?: number
  /** Comes into its target from above, in the middle - edges of one group there through one shared port */
  entryTop?: boolean
  /** Edges of one group (e.g. one kind of reference) into one node share their port at its top */
  group?: string
}
export interface EdgeRoute {
  path: Point[]
  d: string
}

const HEADER_HEIGHT = 34

export function routeAllEdges(
  nodes: NodeRect[],
  edges: EdgeInput[],
): Map<string, EdgeRoute> {
  const nodeMap = new Map<string, NodeRect>()
  for (const n of nodes) nodeMap.set(n.id, n)

  const isContainer = new Set<string>()
  for (const n of nodes) {
    if (n.parentId) isContainer.add(n.parentId)
  }

  function getAncestors(nodeId: string): Set<string> {
    const anc = new Set<string>()
    let cur = nodeMap.get(nodeId)
    while (cur?.parentId) {
      anc.add(cur.parentId)
      cur = nodeMap.get(cur.parentId)
    }
    return anc
  }

  const globalPermeable = new Set<string>()
  for (const edge of edges) {
    const srcAnc = getAncestors(edge.srcId)
    const tgtAnc = getAncestors(edge.tgtId)
    for (const a of srcAnc) globalPermeable.add(a)
    for (const a of tgtAnc) globalPermeable.add(a)
    globalPermeable.add(edge.srcId)
    globalPermeable.add(edge.tgtId)
  }

  const router = new OrthogonalRouter({
    // Edges coming in from above run between elements laid out closer: a smaller berth keeps ways open
    margin: edges.some(e => e.entryTop) ? 8 : 20,
    // Straight out of and into a port for twice an arrow head (11px) before the first bend
    portStub: 24,
    // Room around an arrow: an arrow's width (11px) on either side
    arrowGuard: edges.some(e => e.entryTop) ? 11 : 0,
    // Coming in from above: few bends (inside the frames too)
    bendPenalty: edges.some(e => e.entryTop) ? 150 : 50,
    allowCrossings: true,
    crossingPenalty: 100,
    allowOverlap: false,
    // Lines that are not bundled keep 8px apart
    nudgeDistance: 8,
    lineMargin: 8,
  })

  const addedNodes = new Set<string>()

  for (const n of nodes) {
    if (globalPermeable.has(n.id)) continue
    router.addNode({
      id: n.id,
      rect: { x: n.x, y: n.y, width: n.w, height: n.h },
      ports: [],
    })
    addedNodes.add(n.id)
  }

  for (const n of nodes) {
    if (globalPermeable.has(n.id) && isContainer.has(n.id)) {
      const hdrId = n.id + '__hdr'
      router.addNode({
        id: hdrId,
        rect: { x: n.x, y: n.y, width: n.w, height: HEADER_HEIGHT },
        ports: [],
      })
      addedNodes.add(hdrId)
    }
  }

  const nodePortsMap = new Map<string, Port[]>()
  const edgesByTarget = new Map<string, string[]>()
  for (const edge of edges) {
    if (!nodeMap.get(edge.srcId) || !nodeMap.get(edge.tgtId)) continue
    if (!edgesByTarget.has(edge.tgtId)) edgesByTarget.set(edge.tgtId, [])
    edgesByTarget.get(edge.tgtId)!.push(edge.id)
  }

  // Groups coming into a node from above, in order: each takes a place around the top's middle
  const topGroups = new Map<string, string[]>()
  for (const edge of edges) {
    if (!edge.entryTop) continue
    const list = topGroups.get(edge.tgtId) ?? []
    const g = edge.group ?? edge.id
    if (!list.includes(g)) list.push(g)
    topGroups.set(edge.tgtId, list)
  }
  const sharedPorts = new Set<string>()
  // Frames are zones: an edge coming in from above crosses only the frames it starts or ends in
  if (edges.some(e => e.entryTop)) {
    for (const n of nodes) if (isContainer.has(n.id)) router.addZone({ id: n.id, rect: { x: n.x, y: n.y, width: n.w, height: n.h } })
  }

  /*
   * Gathering points: edges of one kind into one node coming from two or more other frames meet before
   * the target's frame - at a point beside it (the side most of them come from), level with the way in -
   * and go in from there as one line. Each such edge is routed to the point, the point once to the target.
   */
  const gatherings = new Map<string, { id: string; tgtId: string; group: string; x: number; y: number; side: 'left' | 'right'; edges: EdgeInput[] }>()
  {
    const byTarget = new Map<string, EdgeInput[]>()
    for (const edge of edges) {
      const tgt = nodeMap.get(edge.tgtId)
      const tgtFrame = tgt?.parentId
      if (!edge.entryTop || !tgt || !tgtFrame || nodeMap.get(edge.srcId)?.parentId === tgtFrame) continue
      const key = `${edge.tgtId}|${edge.group ?? edge.id}`
      byTarget.set(key, [...(byTarget.get(key) ?? []), edge])
    }
    for (const [key, list] of byTarget) {
      const frames = new Set(list.map(e => nodeMap.get(e.srcId)?.parentId ?? e.srcId))
      if (frames.size < 2) continue
      const tgt = nodeMap.get(list[0].tgtId)!
      const frame = nodeMap.get(tgt.parentId!)
      if (!frame) continue
      const leftCount = list.filter(e => { const s = nodeMap.get(e.srcId)!; return s.x + s.w / 2 < frame.x + frame.w / 2 }).length
      const side = leftCount * 2 >= list.length ? 'left' : 'right'
      gatherings.set(key, {
        id: `gather__${key}`,
        tgtId: tgt.id,
        group: list[0].group ?? list[0].id,
        x: side === 'left' ? frame.x - 16 : frame.x + frame.w + 16,
        y: tgt.y - 32,
        side,
        edges: list,
      })
    }
  }
  /** How far beyond a gathering point a line starts: from there it comes in across, else from above */
  const beyond = (g: { x: number; side: 'left' | 'right' }, x: number) => g.side === 'right' ? x - g.x : g.x - x
  const THRU_MIN = 32
  /** The port a line coming from x goes into a gathering point by: from well beyond its far side straight through
   * it, else from above */
  const gatherPort = (g: { id: string; x: number; side: 'left' | 'right' }, x: number) =>
    beyond(g, x) > THRU_MIN ? `${g.id}__thru` : `${g.id}__in`
  const gatheringOf = (e: EdgeInput) => {
    const g = gatherings.get(`${e.tgtId}|${e.group ?? e.id}`)
    return g && g.edges.includes(e) ? g : null
  }
  const gatheredOut = new Set<string>()
  /** Per kind out of a frame: targets to the left minus those to the right - the side all those edges leave at */
  const rowLeft = new Map<string, number>()
  const sideKey = (e: EdgeInput) => `${nodeMap.get(e.srcId)?.parentId ?? e.srcId}@${e.group ?? ''}`
  for (const edge of edges) {
    const src = nodeMap.get(edge.srcId)
    const tgt = nodeMap.get(edge.tgtId)
    if (!edge.entryTop || edge.sourcePortY == null || !src || !tgt) continue
    const key = sideKey(edge)
    // Towards the target - or the gathering point it goes through
    const tx = gatheringOf(edge)?.x ?? tgt.x + tgt.w / 2
    const left = tx < src.x ? 1 : tx > src.x + src.w ? -1 : 0
    rowLeft.set(key, (rowLeft.get(key) ?? 0) + left)
  }

  /*
   * Exit points: edges of one kind leaving one frame from two or more rows meet inside that frame - in the
   * free strip beside its nodes, each kind on a lane of its own - and leave it as one line from there:
   * straight on down through the frame's bottom when all their targets lie below it, else to the side.
   */
  const exits = new Map<string, { id: string; x: number; y: number; side: 'left' | 'right'; out: 'left' | 'right' | 'bottom'; stub: number; edges: EdgeInput[] }>()
  const lanes = new Map<string, number>()
  {
    const byFrame = new Map<string, EdgeInput[]>()
    for (const edge of edges) {
      const src = nodeMap.get(edge.srcId)
      const frameId = src?.parentId
      if (!edge.entryTop || edge.sourcePortY == null || !src || !frameId) continue
      if (getAncestors(edge.tgtId).has(frameId)) continue
      const key = sideKey(edge)
      byFrame.set(key, [...(byFrame.get(key) ?? []), edge])
    }
    for (const [key, list] of byFrame) {
      if (new Set(list.map(e => `${e.srcId}|${e.sourcePortY}`)).size < 2) continue
      const frame = nodeMap.get(nodeMap.get(list[0].srcId)!.parentId!)
      if (!frame) continue
      const side = (rowLeft.get(key) ?? 0) > 0 ? 'left' : 'right'
      const children = nodes.filter(n => n.parentId === frame.id)
      // Right where the rows' straight pieces (24) end - so they turn down once - and each further kind a
      // lane further out, clear of the room (8) kept round the point before it; but inside the frame
      const lane = lanes.get(`${frame.id}@${side}`) ?? 0
      lanes.set(`${frame.id}@${side}`, lane + 1)
      const x = side === 'left'
        ? Math.max(frame.x + 6, Math.min(...children.map(n => n.x)) - 24 - lane * 20)
        : Math.min(frame.x + frame.w - 6, Math.max(...children.map(n => n.x + n.w)) + 24 + lane * 20)
      const below = list.every(e => (gatheringOf(e)?.y ?? nodeMap.get(e.tgtId)!.y) > frame.y + frame.h)
      const lowest = Math.max(...list.map(e => nodeMap.get(e.srcId)!.y + e.sourcePortY!))
      const y = below ? frame.y + frame.h - 6 : Math.min(lowest + 16, frame.y + frame.h - 6)
      // Down out of the frame: straight on a little past its bottom before turning - room under the frame
      exits.set(key, { id: `exit__${key}`, x, y, side, out: below ? 'bottom' : side, stub: below ? frame.y + frame.h - y + 16 : 0, edges: list })
    }
    for (const x of exits.values()) {
      router.addNode({
        id: x.id,
        rect: { x: x.x - 1, y: x.y - 1, width: 2, height: 2 },
        ports: [
          { id: `${x.id}__in`, nodeId: x.id, side: 'top', offset: 0.5, stub: 0 },
          { id: `${x.id}__out`, nodeId: x.id, side: x.out, offset: 0.5, stub: x.stub },
        ],
      })
      addedNodes.add(x.id)
    }
  }
  const exitOf = (e: EdgeInput) => {
    const x = exits.get(sideKey(e))
    return x && x.edges.includes(e) ? x : null
  }
  for (const g of gatherings.values()) {
    // Coming in across: level with the point all the way from below its source - down there first, then
    // straight across (one bend), meeting the others from above in a T
    const from = g.edges.map(e => exitOf(e)?.x ?? nodeMap.get(e.srcId)!.x + nodeMap.get(e.srcId)!.w / 2)
    const thru = from.map(x => beyond(g, x)).filter(d => d > THRU_MIN)
    router.addNode({
      id: g.id,
      rect: { x: g.x - 1, y: g.y - 1, width: 2, height: 2 },
      ports: [
        { id: `${g.id}__in`, nodeId: g.id, side: 'top', offset: 0.5, stub: 0 },
        { id: `${g.id}__out`, nodeId: g.id, side: g.side === 'left' ? 'right' : 'left', offset: 0.5, stub: 0 },
        { id: `${g.id}__thru`, nodeId: g.id, side: g.side, offset: 0.5, stub: thru.length ? Math.min(...thru) - 1 : 0 },
      ],
    })
    addedNodes.add(g.id)
  }
  const exitedOut = new Set<string>()

  for (const edge of edges) {
    const src = nodeMap.get(edge.srcId)
    const tgt = nodeMap.get(edge.tgtId)
    if (!src || !tgt) continue

    // The edges of one kind out of one frame leave at one side - left when most of their targets lie to the left
    const toLeft = !!edge.entryTop && (rowLeft.get(sideKey(edge)) ?? 0) > 0
    // Coming in from above, a reference leaves at the side - never down or up
    const srcSide = edge.sourcePortY != null || edge.entryTop
      ? (toLeft ? 'left' as const : 'right' as const)
      : bestSide(src, tgt)
    const srcOffset = edge.sourcePortY != null ? edge.sourcePortY / src.h : 0.5
    // Edges coming in from above that start at one row start at one port there
    const rowKey = `${edge.srcId}__row__${edge.sourcePortY ?? 'node'}__${srcSide}__${edge.group ?? ''}`
    const srcPortId = edge.entryTop ? rowKey : `${edge.id}__src`
    if (!nodePortsMap.has(edge.srcId)) nodePortsMap.set(edge.srcId, [])
    if (!sharedPorts.has(srcPortId)) {
      if (edge.entryTop) sharedPorts.add(srcPortId)
      nodePortsMap.get(edge.srcId)!.push({ id: srcPortId, nodeId: edge.srcId, side: srcSide, offset: srcOffset })
    }

    if (edge.entryTop) {
      const groups = topGroups.get(edge.tgtId) ?? []
      const g = edge.group ?? edge.id
      const tgtPortId = `${edge.tgtId}__top__${g}`
      if (!sharedPorts.has(tgtPortId)) {
        sharedPorts.add(tgtPortId)
        const offset = 0.5 + ((groups.indexOf(g) - (groups.length - 1) / 2) * 14) / tgt.w
        if (!nodePortsMap.has(edge.tgtId)) nodePortsMap.set(edge.tgtId, [])
        nodePortsMap.get(edge.tgtId)!.push({ id: tgtPortId, nodeId: edge.tgtId, side: 'top', offset })
      }
      // Bundles of one kind: into one node, out of one row, out of one frame, into one frame - each merges
      // into one line as early as it can. Frames it neither starts nor ends in it keeps out of.
      const srcFrame = nodeMap.get(edge.srcId)?.parentId ?? ''
      const tgtFrame = nodeMap.get(edge.tgtId)?.parentId ?? ''
      const kind = edge.group ?? ''
      const gathering = gatheringOf(edge)
      const exit = exitOf(edge)
      if (exit) {
        // To the exit point inside the own frame (bundled with the others going there) - and, once per
        // destination, from there out to the gathering point or the target
        router.addConnection({
          id: `${edge.id}::exit`,
          sourcePortId: srcPortId,
          targetPortId: `${exit.id}__in`,
          groups: [`${exit.id}__in`, srcPortId],
          zones: [...getAncestors(edge.srcId)],
        })
        const destPortId = gathering ? gatherPort(gathering, exit.x) : tgtPortId
        const legId = `${exit.id}::to::${destPortId}`
        if (!exitedOut.has(legId)) {
          exitedOut.add(legId)
          router.addConnection({
            id: legId,
            sourcePortId: `${exit.id}__out`,
            targetPortId: destPortId,
            groups: gathering
              ? [destPortId, `out:${srcFrame}:${kind}`]
              : [destPortId, `out:${srcFrame}:${kind}`, `in:${tgtFrame}:${kind}`],
            zones: gathering
              ? [...getAncestors(edge.srcId)]
              : [...getAncestors(edge.srcId), ...getAncestors(edge.tgtId)],
          })
        }
      }
      if (gathering) {
        // To the gathering point (bundled with the others going there) - and, once, from there in
        if (!exit) router.addConnection({
          id: `${edge.id}::gather`,
          sourcePortId: srcPortId,
          targetPortId: gatherPort(gathering, src.x + src.w / 2),
          groups: [`${gathering.id}__in`, srcPortId, `out:${srcFrame}:${kind}`],
          zones: [...getAncestors(edge.srcId)],
        })
        if (!gatheredOut.has(gathering.id)) {
          gatheredOut.add(gathering.id)
          router.addConnection({
            id: `${gathering.id}::in`,
            sourcePortId: `${gathering.id}__out`,
            targetPortId: tgtPortId,
            groups: [tgtPortId],
            zones: [...getAncestors(edge.tgtId)],
          })
        }
        continue
      }
      if (!exit) router.addConnection({
        id: edge.id,
        sourcePortId: srcPortId,
        targetPortId: tgtPortId,
        groups: [tgtPortId, srcPortId, `out:${srcFrame}:${kind}`, `in:${tgtFrame}:${kind}`],
        zones: [...getAncestors(edge.srcId), ...getAncestors(edge.tgtId)],
      })
      continue
    }

    const tgtSide = bestSide(tgt, src)
    const tgtPortId = `${edge.id}__tgt`
    const altPortIds: string[] = []
    const allEdgesToTgt = edgesByTarget.get(edge.tgtId)!
    const idx = allEdgesToTgt.indexOf(edge.id)
    const count = allEdgesToTgt.length

    const sides: Array<'top' | 'left' | 'right'> = ['top', 'left', 'right']
    const orderedSides = [tgtSide, ...sides.filter(s => s !== tgtSide)].filter(
      (s): s is 'top' | 'left' | 'right' => s === 'top' || s === 'left' || s === 'right'
    )

    if (!nodePortsMap.has(edge.tgtId)) nodePortsMap.set(edge.tgtId, [])
    for (let i = 0; i < orderedSides.length; i++) {
      const side = orderedSides[i]
      let offset: number
      if (side === 'top') {
        offset = count === 1 ? 0.5 : 0.2 + (0.6 * idx) / (count - 1)
      } else {
        const headerTop = HEADER_HEIGHT * 0.2 / tgt.h
        const headerBot = HEADER_HEIGHT * 0.8 / tgt.h
        offset = count === 1
          ? Math.min(0.5, (HEADER_HEIGHT / 2) / tgt.h)
          : headerTop + ((headerBot - headerTop) * idx) / (count - 1)
      }
      const portId = i === 0 ? tgtPortId : `${edge.id}__tgt_alt${i}`
      nodePortsMap.get(edge.tgtId)!.push({ id: portId, nodeId: edge.tgtId, side, offset })
      if (i > 0) altPortIds.push(portId)
    }

    router.addConnection({
      id: edge.id,
      sourcePortId: srcPortId,
      targetPortId: tgtPortId,
      alternativeTargetPortIds: altPortIds.length > 0 ? altPortIds : undefined,
    })
  }

  for (const [nId, ports] of nodePortsMap) {
    const n = nodeMap.get(nId)!
    if (!addedNodes.has(nId)) {
      router.addNode({
        id: nId,
        rect: { x: n.x, y: n.y, width: n.w, height: n.h },
        ports,
      })
      addedNodes.add(nId)
    }
  }

  const routeResult = router.route()
  const result = new Map<string, EdgeRoute>()
  const pathOf = (id: string) => routeResult.paths.find(p => p.connectionId === id)?.points
  for (const edge of edges) {
    const g = edge.entryTop ? gatheringOf(edge) : null
    const x = edge.entryTop ? exitOf(edge) : null
    // Through an exit point and/or a gathering point: the way to each, then the shared way on
    // (joined at the point itself, not at its two ports a pixel apart - and the last stretch there and the first
    // from there put back onto the point when nudging moved them a little)
    let points: Point[] | undefined
    if (x) {
      const toExit = pathOf(`${edge.id}::exit`)
      const out = pathOf(`${x.id}::to::${g ? gatherPort(g, x.x) : `${edge.tgtId}__top__${edge.group ?? edge.id}`}`)
      points = toExit && out ? joinAt(toExit, out, x) : undefined
    } else {
      points = g ? pathOf(`${edge.id}::gather`) : pathOf(edge.id)
    }
    if (g && points) {
      const inside = pathOf(`${g.id}::in`)
      points = inside ? joinAt(points, inside, g) : undefined
    }
    if (points && points.length >= 2) {
      const d = 'M' + points.map(p => `${p.x},${p.y}`).join(' L')
      result.set(edge.id, { path: points, d })
    }
  }
  return result
}

/** A way to a gathering point and the way on from it, joined at the point */
function joinAt(there: Point[], on: Point[], at: Point): Point[] {
  const a = there.slice(0, -1).map(p => ({ ...p }))
  const b = on.slice(1).map(p => ({ ...p }))
  // The stretch coming into the point - down or across: onto its x or y
  const n = there.length
  const across = n > 1 && Math.abs(there[n - 1].y - there[n - 2].y) < 1e-6
  const inAxis = across ? 'y' : 'x'
  const av = a[a.length - 1]?.[inAxis]
  for (let k = a.length - 1; k >= 0 && Math.abs(a[k][inAxis] - av) < 1e-6; k--) a[k][inAxis] = at[inAxis]
  // The stretch going on from it - across or down: onto its y or x
  const down = on.length > 1 && Math.abs(on[0].x - on[1].x) < 1e-6
  const axis = down ? 'x' : 'y'
  const bv = b[0]?.[axis]
  for (let k = 0; k < b.length && Math.abs(b[k][axis] - bv) < 1e-6; k++) b[k][axis] = at[axis]
  return [...a, { x: at.x, y: at.y }, ...b]
}

function bestSide(from: NodeRect, to: NodeRect): 'top' | 'right' | 'bottom' | 'left' {
  const dx = (to.x + to.w / 2) - (from.x + from.w / 2)
  const dy = (to.y + to.h / 2) - (from.y + from.h / 2)
  if (Math.abs(dx) > Math.abs(dy)) return dx > 0 ? 'right' : 'left'
  return dy > 0 ? 'bottom' : 'top'
}
