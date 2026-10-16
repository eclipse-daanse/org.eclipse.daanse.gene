/**
 * Reactive ELK layout over an interpreted domain model.
 * Uses a dedicated Web Worker for ELK layout to keep the main thread free.
 */
import { ref, shallowRef, watch, onBeforeUnmount, type Ref } from 'tsm:vue'
import type { ElkNode } from 'elkjs'
import { EContentAdapter, NotificationType, type EObject, type Notification } from '@emfts/core'
import { interpret, type NodeRef, type EdgeMeta } from './interpret'

// elk-layout-worker.js loads elk.bundled.js (full version with layered algorithm)
// via importScripts inside a Web Worker. Both files are in public/.
const elkWorkerUrl = '/elk-layout-worker.js'

let sharedWorker: Worker | null = null
let workerRefCount = 0
const pendingLayouts = new Map<number, { resolve: (v: ElkNode) => void; reject: (e: Error) => void }>()
let nextLayoutId = 0

function getWorker(): Worker {
  if (!sharedWorker) {
    sharedWorker = new Worker(elkWorkerUrl)
    sharedWorker.onmessage = (e: MessageEvent) => {
      const { id, data, error } = e.data
      const pending = pendingLayouts.get(id)
      if (!pending) return
      pendingLayouts.delete(id)
      if (error) pending.reject(new Error(String(error)))
      else pending.resolve(data)
    }
  }
  workerRefCount++
  return sharedWorker
}

function releaseWorker() {
  workerRefCount--
  if (workerRefCount <= 0 && sharedWorker) {
    sharedWorker.terminate()
    sharedWorker = null
    workerRefCount = 0
  }
}

function layoutInWorker(graph: ElkNode): Promise<ElkNode> {
  return new Promise((resolve, reject) => {
    const id = nextLayoutId++
    pendingLayouts.set(id, { resolve, reject })
    getWorker()
    sharedWorker!.postMessage({ cmd: 'layout', id, graph })
  })
}

const STRUCTURAL = new Set<number>([
  NotificationType.ADD,
  NotificationType.REMOVE,
  NotificationType.ADD_MANY,
  NotificationType.REMOVE_MANY,
])

export interface ElkLayout {
  laidOut: Ref<ElkNode | null>
  nodeIndex: Ref<Map<string, NodeRef>>
  edgeMeta: Ref<Map<string, EdgeMeta>>
  renderVersion: Ref<number>
  layoutVersion: Ref<number>
  portNodeMap: Ref<Map<string, string>>
  layoutPending: Ref<boolean>
}

export function useElkLayout(
  model: Ref<EObject | null>,
  /** The diagram root - or several, for a focus diagram spanning top-level containers */
  root: Ref<EObject | EObject[] | null>,
  /** Switch settings to use: a preset name of the definition; none = its first preset */
  preset?: Ref<string | undefined>,
  /** Focus diagram: only these objects and their containers; none = everything under the root */
  focus?: Ref<EObject[] | null>,
): ElkLayout {
  const layoutVersion = ref(0)
  const renderVersion = ref(0)
  const layoutPending = ref(false)
  const laidOut = shallowRef<ElkNode | null>(null)
  const nodeIndex = shallowRef<Map<string, NodeRef>>(new Map())
  const edgeMeta = shallowRef<Map<string, EdgeMeta>>(new Map())
  const portNodeMap = shallowRef<Map<string, string>>(new Map())

  let currentRoot: EObject | null = null
  let runId = 0

  getWorker() // pre-init

  class SyncAdapter extends EContentAdapter {
    notifyChanged(notification: Notification): void {
      super.notifyChanged(notification)
      if (notification.isTouch()) return
      if (STRUCTURAL.has(notification.getEventType())) layoutVersion.value++
      else renderVersion.value++
    }
  }
  const adapter = new SyncAdapter()

  function attachAdapter(r: EObject | null) {
    if (currentRoot) {
      const notifier = currentRoot as unknown as {
        eAdapterRemove?(a: EContentAdapter): boolean
        eAdapters(): EContentAdapter[]
      }
      if (notifier.eAdapterRemove) notifier.eAdapterRemove(adapter)
      else {
        const a = notifier.eAdapters()
        const i = a.indexOf(adapter)
        if (i >= 0) a.splice(i, 1)
      }
    }
    currentRoot = r
    if (r) {
      ;(r as unknown as { eAdapterAdd(a: EContentAdapter): void }).eAdapterAdd(adapter)
    }
  }

  let timer: ReturnType<typeof setTimeout> | undefined

  async function run(): Promise<void> {
    const thisRun = ++runId
    const m = model.value
    const r = root.value
    if (!m || !r || (Array.isArray(r) && r.length === 0)) {
      laidOut.value = null
      layoutPending.value = false
      return
    }
    layoutPending.value = true
    await new Promise(resolve => setTimeout(resolve, 0))
    if (thisRun !== runId) return

    const { graph, index, edgeMeta: meta, portNodeMap: ports } = await interpret(m, r, preset?.value, focus?.value)
    if (thisRun !== runId) return
    nodeIndex.value = index
    edgeMeta.value = meta
    portNodeMap.value = ports

    if (thisRun !== runId) return
    const result = await layoutInWorker(graph as ElkNode)
    if (thisRun !== runId) return

    laidOut.value = result
    layoutPending.value = false
  }

  watch(
    [model, root, () => preset?.value, () => focus?.value],
    () => {
      // Changes are watched under the first root
      const r = root.value
      attachAdapter(Array.isArray(r) ? r[0] ?? null : r)
      layoutVersion.value++
    },
    { immediate: true },
  )

  watch(
    layoutVersion,
    () => {
      clearTimeout(timer)
      timer = setTimeout(run, 80)
    },
    { immediate: true },
  )

  onBeforeUnmount(() => {
    clearTimeout(timer)
    attachAdapter(null)
    releaseWorker()
  })

  return { laidOut, nodeIndex, edgeMeta, renderVersion, layoutVersion, portNodeMap, layoutPending }
}
