<script setup lang="ts">
/**
 * InstanceTree Component
 *
 * Tree view of EMF model instances (or Ecore elements in Metamodeler mode).
 * Supports drag-drop from Model Browser to create new instances.
 *
 * Uses EditorContext via inject() to support both:
 * - Instance Editor: shows .xmi instances
 * - Metamodeler: shows .ecore elements as instances of Ecore.ecore
 */

import { ref, computed, watch, inject, nextTick } from 'tsm:vue'
import { Tree } from 'tsm:primevue'
import { Button } from 'tsm:primevue'
import { ContextMenu } from 'tsm:primevue'
import { Menu } from 'tsm:primevue'
import { Dialog } from 'tsm:primevue'
import { Dropdown } from 'tsm:primevue'
import { InputText } from 'tsm:primevue'
import type { EditorContext } from '../context/editorContext'
import { createInstanceContext } from '../context/instanceContext'
import { useSharedInstanceTree } from '../composables/useInstanceTree'
import { useSharedViews, getTypeUri, getElementUri } from '../composables/useViews'
import type { InstanceTreeNode } from '../types'
import type { EObject, EClass, EReference } from '@emfts/core'
import ViewsEditorDialog from './ViewsEditorDialog.vue'

// Props - context can be provided by parent (for different perspectives)
const props = defineProps<{
  context?: EditorContext
}>()

const emit = defineEmits<{
  'object-select': [object: EObject | null]
  'object-create': [object: EObject]
  'object-delete': [object: EObject]
}>()

// TSM for service access
const tsm = inject<any>('tsm')

// Use provided context, or global context (mode-aware), or create default
const ctx = props.context
  || tsm?.getService('gene.editor.context')?.getCurrentContext?.()
  || createInstanceContext()
const eventBus = tsm?.getService('gene.eventbus') as any
const sharedTree = useSharedInstanceTree()

// Listen for events from sidebar header actions and central menu
eventBus?.on?.('show-new-instance-dialog', () => { showNewInstanceDialog.value = true })
// The header "+" opens a menu: New Instance / New Resource
eventBus?.on?.('show-add-menu', (e: any) => { addMenu.value?.show?.(e) })


// Helper to get name from ENamedElement - handles both native and DynamicEObject
function getElementName(element: any): string {
  if (!element) return 'unknown'
  // Try native getName first
  if (typeof element.getName === 'function') {
    const name = element.getName()
    if (name) return name
  }
  // DynamicEObject - try eGet
  try {
    const eClass = element.eClass?.()
    if (eClass) {
      const nameFeature = eClass.getEStructuralFeature?.('name')
      if (nameFeature) {
        const name = element.eGet?.(nameFeature)
        if (name) return String(name)
      }
    }
  } catch { /* ignore */ }
  // Try eSettings Map
  try {
    if (element.eSettings instanceof Map) {
      const name = element.eSettings.get('name')
      if (name) return String(name)
    }
  } catch { /* ignore */ }
  return 'unknown'
}

// Create reactive computed properties from the context
const ctxTreeNodes = computed(() => ctx.treeNodes.value)
const ctxSelectedKeys = computed({
  get: () => ctx.selectedKeys.value,
  set: (v) => { ctx.selectedKeys.value = v }
})
const ctxExpandedKeys = computed({
  get: () => ctx.expandedKeys.value,
  set: (v) => { ctx.expandedKeys.value = v }
})
const ctxSelectedObject = computed(() => ctx.selectedObject.value)
const ctxSelectedNode = computed(() => ctx.selectedNode.value)
const ctxAllPackages = computed(() => ctx.allPackages.value)

// Context menu ref
const contextMenu = ref<InstanceType<typeof ContextMenu> | null>(null)

// Node captured on right-click — may be a resource node (which has no selectedNode)
const ctxMenuNode = ref<any>(null)

function onNodeContextMenu(node: any, event: MouseEvent) {
  ctxMenuNode.value = node
  ctx.selectNode(node)
  handleContextMenu(event)
}

// ── Node drag-and-drop via PrimeVue Tree (draggableNodes / droppableNodes) ──
/**
 * PrimeVue's node-drop event does NOT expose the drop position (before/after/into);
 * `dropPosition` is internal to the node component. Derive before/after ourselves
 * from the pointer position relative to the target row: upper half → before,
 * lower half → after. This makes the two drop-points of the same gap (target's
 * "after" and next node's "before") resolve consistently — otherwise an "insert
 * before" gesture was silently turned into "insert after" (one row too low).
 */
function isDropAfter(event: any, fallback = true): boolean {
  const oe = event?.originalEvent
  const y = oe?.clientY
  const tgt = oe?.target as HTMLElement | undefined
  if (typeof y !== 'number' || !tgt?.closest) return fallback
  const nodeEl = tgt.closest('.p-tree-node') as HTMLElement | null
  const rowEl = (nodeEl?.querySelector(':scope > .p-tree-node-content') as HTMLElement | null) || nodeEl
  const rect = rowEl?.getBoundingClientRect?.()
  if (!rect || !rect.height) return fallback
  return y >= rect.top + rect.height / 2
}

// ── FLIP animation: after a reorder/move, glide rows to their new positions ──
const treeContainerRef = ref<HTMLElement | null>(null)

/** Snapshot each visible row's viewport position, keyed by node key. */
function captureRowRects(): Map<string, { top: number; left: number }> {
  const map = new Map<string, { top: number; left: number }>()
  const root = treeContainerRef.value
  if (!root) return map
  root.querySelectorAll<HTMLElement>('.tree-node[data-node-key]').forEach(el => {
    const key = el.getAttribute('data-node-key')
    const row = el.closest('.p-tree-node-content') as HTMLElement | null
    if (!key || !row) return
    const r = row.getBoundingClientRect()
    map.set(key, { top: r.top, left: r.left })
  })
  return map
}

/** FLIP: invert to the old positions, then play back to the new ones. */
async function animateReorder(first: Map<string, { top: number; left: number }>) {
  if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return
  await nextTick()
  const root = treeContainerRef.value
  if (!root) return
  const rows: HTMLElement[] = []
  root.querySelectorAll<HTMLElement>('.tree-node[data-node-key]').forEach(el => {
    const key = el.getAttribute('data-node-key')
    const row = el.closest('.p-tree-node-content') as HTMLElement | null
    if (!key || !row) return
    const prev = first.get(key)
    if (!prev) return
    const now = row.getBoundingClientRect()
    const dx = prev.left - now.left
    const dy = prev.top - now.top
    if (!dx && !dy) return
    // Invert: place the row where it used to be, without transition
    row.style.transition = 'none'
    row.style.transform = `translate(${dx}px, ${dy}px)`
    rows.push(row)
  })
  if (rows.length === 0) return
  // Force reflow so the inverted state is committed before playing
  void root.offsetHeight
  // Play: animate back to the natural (new) position
  for (const row of rows) {
    row.style.transition = 'transform 0.22s cubic-bezier(0.2, 0, 0, 1)'
    row.style.transform = ''
  }
  window.setTimeout(() => {
    for (const row of rows) {
      row.style.transition = ''
      row.style.transform = ''
    }
  }, 280)
}

// ── Drop validation feedback ────────────────────────────────────────────────
// Key of the row currently highlighted as an INVALID drop target (during drag).
const invalidDropKey = ref<string | null>(null)
// Transient message shown when a drop is rejected.
const dropMessage = ref<string | null>(null)
let dropMessageTimer: number | undefined

function showDropMessage(reason?: string) {
  dropMessage.value = reason || 'Verschieben an dieser Stelle nicht möglich.'
  if (dropMessageTimer) window.clearTimeout(dropMessageTimer)
  dropMessageTimer = window.setTimeout(() => { dropMessage.value = null }, 3000)
}

/** Find a tree node by its key by walking the current tree. */
function findTreeNode(key: string | null): any {
  if (!key) return null
  const stack = [...(ctxTreeNodes.value || [])]
  while (stack.length) {
    const n = stack.pop()
    if (!n) continue
    if (n.key === key) return n
    if (n.children) stack.push(...n.children)
  }
  return null
}

/** Resolve the object currently being dragged via PrimeVue's data-p-dragging marker. */
function resolveDraggingObject(): any {
  const root = treeContainerRef.value
  const src = root?.querySelector('.p-tree-node-content[data-p-dragging="true"]')
  const key = src?.querySelector('[data-node-key]')?.getAttribute('data-node-key') ?? null
  return findTreeNode(key)?.data ?? null
}

// Mark an object row red while hovering it during a drag if the move is not allowed.
function onNodeDragEnter(e: any) {
  const target = e?.node
  if (!target || target.kind === 'resource' || !target.data) { invalidDropKey.value = null; return }
  const dragged = resolveDraggingObject()
  if (!dragged) { invalidDropKey.value = null; return }
  const check = (ctx as any).canMoveBeside?.(dragged, target.data) ?? { ok: true }
  invalidDropKey.value = check.ok ? null : target.key
}
function clearDragFeedback() { invalidDropKey.value = null }

function onTreeNodeDrop(event: any) {
  clearDragFeedback()
  const dragNode = event?.dragNode
  const dropNode = event?.dropNode
  const draggedObj = dragNode?.data
  // Only object nodes are moved; resource nodes are not draggable
  if (!draggedObj || dragNode?.kind === 'resource') return
  if (!dropNode || dropNode === dragNode) return

  // Validate object-to-object moves and reject with feedback (resource drops are
  // always allowed — a resource root accepts any type).
  if (dropNode.kind !== 'resource' && dropNode.data) {
    const check = (ctx as any).canMoveBeside?.(draggedObj, dropNode.data) ?? { ok: true }
    if (!check.ok) { showDropMessage(check.reason); return }
  }

  // Snapshot positions BEFORE the model changes, then animate the delta.
  const first = captureRowRects()
  let moved = false
  if (dropNode.kind === 'resource') {
    // Dropped onto a resource → make it a root of that resource
    moved = !!(ctx as any).moveToResource?.(draggedObj, dropNode.resource)
  } else if (dropNode.data) {
    // Dropped next to another object → reorder/move to that side (before/after)
    moved = !!(ctx as any).moveObjectBeside?.(draggedObj, dropNode.data, isDropAfter(event))
  }
  if (moved) animateReorder(first)
}

// New Resource dialog (name + path)
const showNewResourceDialog = ref(false)
const newResourceName = ref('new-resource')
const newResourcePath = ref('instances')

const newResourcePreview = computed(() => {
  const folder = newResourcePath.value.trim().replace(/^\/+|\/+$/g, '')
  const base = (newResourceName.value.trim() || 'resource')
    .toLowerCase().replace(/[^a-z0-9äöüß_-]/gi, '-').replace(/-+/g, '-').replace(/^-|-$/g, '') || 'resource'
  return (folder ? `${folder}/` : '') + base + '.xmi'
})

function createResourcePrompt() {
  newResourceName.value = 'new-resource'
  newResourcePath.value = 'instances'
  showNewResourceDialog.value = true
}

function confirmNewResource() {
  const name = newResourceName.value.trim()
  if (!name) return
  ;(ctx as any).createResource?.(name, newResourcePath.value.trim())
  showNewResourceDialog.value = false
}

// Folder options for the New Resource dialog (scan existing workspace folders)
const editorConfigService = computed(() => tsm?.getService('gene.editor.config'))

const newResourceWorkspaceInfo = computed(() => {
  const ec: any = editorConfigService.value
  const entry = ec?.workspaceFileEntry?.value
  const path = ec?.workspaceFilePath?.value
  if (!entry || !path) return null
  const lastSlash = path.lastIndexOf('/')
  const parentPath = lastSlash > 0 ? path.substring(0, lastSlash) : ''
  return { parentPath, sourceId: entry.sourceId }
})

function collectResourceFolders(entries: any[], basePath: string, prefix: string, options: { label: string; value: string }[]) {
  if (!entries) return
  for (const entry of entries) {
    if (!entry.isDirectory) continue
    const entryPath = entry.path || ''
    if (basePath && !entryPath.startsWith(basePath)) continue
    const relativePath = basePath ? entryPath.substring(basePath.length + 1) : entryPath
    if (!relativePath || relativePath.startsWith('.')) continue
    const indent = prefix ? `${prefix}/${entry.name}` : entry.name
    if (!options.some(o => o.value === relativePath)) options.push({ label: indent, value: relativePath })
    if (entry.children) collectResourceFolders(entry.children, basePath, indent, options)
  }
}

const folderOptions = computed(() => {
  const options: { label: string; value: string }[] = [
    { label: '/ (workspace root)', value: '' },
    { label: 'instances', value: 'instances' }
  ]
  const geneFS: any = tsm?.getService('gene.filesystem')
  const info = newResourceWorkspaceInfo.value
  if (geneFS && info) {
    const source = geneFS.sources?.value?.find((s: any) => s.id === info.sourceId)
    if (source?.data?.entries) collectResourceFolders(source.data.entries, info.parentPath, '', options)
  }
  const cur = newResourcePath.value?.trim()
  if (cur && !options.some(o => o.value === cur)) options.push({ label: `${cur} (new)`, value: cur })
  return options
})

function renameResourcePrompt(res: any) {
  const cur = ctxMenuNode.value?.label || ''
  const name = window.prompt('Rename resource:', cur)
  if (name && name.trim()) (ctx as any).renameResource?.(res, name.trim())
}

// Drag state
const isDragOver = ref(false)

// New root instance dialog
const showNewInstanceDialog = ref(false)
const selectedClass = ref<any>(null)

// Views editor dialog
const showViewsEditor = ref(false)

// View filter menu
const viewFilterMenu = ref<any>(null)

const viewFilterMenuItems = computed(() => {
  const items: any[] = [
    {
      label: 'Kein Filter',
      icon: views.activeView.value ? undefined : 'pi pi-check',
      command: () => views.setActiveView(null)
    },
    { separator: true }
  ]
  for (const v of views.views.value) {
    if (v.enabled) {
      items.push({
        label: v.name,
        icon: views.activeView.value?.id === v.id ? 'pi pi-check' : undefined,
        command: () => views.setActiveView(v.id)
      })
    }
  }
  return items
})

function toggleViewFilterMenu(event: Event) {
  viewFilterMenu.value?.toggle(event)
}

// "+" add menu: New Instance / New Resource
const addMenu = ref<any>(null)
const addMenuItems = computed(() => {
  const items: any[] = [
    { label: 'New Instance', icon: 'pi pi-plus', command: () => { showNewInstanceDialog.value = true } }
  ]
  if (canManageResources.value) {
    items.push({ label: 'New Resource…', icon: 'pi pi-box', command: () => createResourcePrompt() })
  }
  return items
})

// Available classes for creating instances (filtered by active view)
const views = useSharedViews()
const availableClasses = computed(() => {
  const classes: any[] = []
  for (const pkg of ctxAllPackages.value) {
    const concreteClasses = ctx.getConcreteClasses(pkg)
    classes.push(...concreteClasses)
  }
  // Apply view filter if active
  if (views.activeView.value) {
    return classes.filter(cls => !views.isTypeHidden(cls.eClass))
  }
  return classes
})

// Check if we have any models loaded
const hasModels = computed(() => ctxAllPackages.value.length > 0)

// Check if we have any instances
const hasInstances = computed(() => ctxTreeNodes.value.length > 0)

// Whether the active editor context supports explicit resource management
const canManageResources = computed(() => typeof (ctx as any).createResource === 'function')

// Check if we're in instance mode (not metamodel mode)
const isInstanceMode = computed(() => ctx.mode === 'instance')

// OCL Validation state
const isValidating = ref(false)
const hasValidationErrors = ref(false)

// Toolbar actions from ActionRegistry (contributed by plugins)
const toolbarActions = ref<any[]>([])
const executingActions = ref<Record<string, boolean>>({})

function loadToolbarActions() {
  const actionRegistry = tsm?.getService('gene.action.registry')
  if (!actionRegistry) return
  const perspectiveManager = tsm?.getService('ui.registry.perspectives')
  const perspectiveId = perspectiveManager?.state?.currentPerspectiveId || ''
  toolbarActions.value = actionRegistry.getActionsForPerspective(perspectiveId)
}

// Reload when registry changes — retry until registry is available
function initToolbarActions() {
  const actionRegistry = tsm?.getService('gene.action.registry')
  if (actionRegistry?.onChange) {
    actionRegistry.onChange(() => loadToolbarActions())
    loadToolbarActions()
  } else {
    // Registry not yet available, retry on next tick
    setTimeout(initToolbarActions, 500)
  }
}
initToolbarActions()

async function executeToolbarAction(action: any) {
  const actionManager = tsm?.getService('gene.action.manager')
  if (!actionManager) return

  const actionId = action.definition.actionId
  executingActions.value = { ...executingActions.value, [actionId]: true }
  try {
    const context = {
      selectedObject: ctxSelectedObject.value,
      selectedObjects: [],
      perspectiveId: '',
      timestamp: new Date()
    }
    await actionManager.execute(actionId, context)
  } finally {
    const { [actionId]: _, ...rest } = executingActions.value
    executingActions.value = rest
  }
}

async function handleValidateOcl() {
  const ps = tsm?.getService('gene.problems')
  if (!ps) {
    console.warn('[InstanceTree] Problems service not available (gene.problems)')
    return
  }

  const { getSharedResource } = await import('../composables/useInstanceTree')
  const resource = getSharedResource()
  if (!resource) {
    console.warn('[InstanceTree] No resource available for validation')
    return
  }

  isValidating.value = true
  try {
    await ps.validateResource(resource)
    hasValidationErrors.value = ps.hasErrors?.value ?? false

    const stats = ps.stats?.value
    console.log(`[InstanceTree] Validation complete: ${stats?.errorCount ?? 0} errors, ${stats?.warningCount ?? 0} warnings`)

    // Show problems panel if errors found
    if (ps.hasErrors?.value) {
      eventBus.emit('show-problems')
    }
  } catch (e) {
    console.error('[InstanceTree] Validation failed:', e)
  } finally {
    isValidating.value = false
  }
}


/**
 * Check if a class is a subtype of another
 */
function isSubtypeOf(subClass: EClass, superClass: EClass): boolean {
  if (subClass === superClass) return true
  try {
    const superTypes = typeof subClass.getESuperTypes === 'function' ? subClass.getESuperTypes() : []
    if (superTypes && (Array.isArray(superTypes) || (superTypes as any)[Symbol.iterator])) {
      for (const superType of superTypes) {
        if (isSubtypeOf(superType, superClass)) return true
      }
    }
  } catch (e) {
    // Ignore errors
  }
  return false
}

/**
 * Resolve the EClass type of a reference, handling unresolved proxies
 */
function resolveReferenceType(ref: EReference): EClass | null {
  // Try native getEReferenceType first (may auto-resolve proxies)
  if (typeof ref.getEReferenceType === 'function') {
    try {
      const resolved = ref.getEReferenceType()
      if (resolved && typeof resolved.getEAllStructuralFeatures === 'function') {
        return resolved
      }
    } catch { /* fall through */ }
  }

  // Fallback: use getEType
  const eType = ref.getEType() as EClass
  if (!eType) return null

  // Check if it's a proper EClass (not a proxy)
  if (typeof eType.getEAllStructuralFeatures === 'function') {
    return eType
  }

  // Handle unresolved proxy: parse URI and look up in loaded packages
  if (typeof (eType as any).eIsProxy === 'function' && (eType as any).eIsProxy()) {
    const proxyURI = (eType as any).eProxyURI?.()?.toString?.() || ''
    const hashIdx = proxyURI.indexOf('#//')
    if (hashIdx >= 0) {
      const nsURI = proxyURI.substring(0, hashIdx)
      const className = proxyURI.substring(hashIdx + 3)
      for (const pkg of ctxAllPackages.value) {
        if (pkg.nsURI === nsURI) {
          const concreteClasses = ctx.getConcreteClasses(pkg)
          const found = concreteClasses.find(c => c.name === className)
          if (found) return found.eClass
          // Also check abstract classes via ePackage.getEClassifier
          const classifier = pkg.ePackage.getEClassifier?.(className)
          if (classifier && typeof (classifier as any).getEAllStructuralFeatures === 'function') {
            return classifier as EClass
          }
        }
      }
    }
  }

  return null
}

/**
 * Get all valid concrete classes for a containment reference
 */
function getValidClassesForRef(ref: EReference): EClass[] {
  const refType = resolveReferenceType(ref)
  if (!refType) return []

  const result: EClass[] = []

  // If the reference type itself is concrete, include it
  if (typeof refType.isAbstract === 'function' && !refType.isAbstract() &&
      typeof refType.isInterface === 'function' && !refType.isInterface()) {
    result.push(refType)
  }

  // Find all concrete subclasses from loaded packages
  for (const pkg of ctxAllPackages.value) {
    const concreteClasses = ctx.getConcreteClasses(pkg)
    for (const classInfo of concreteClasses) {
      if (classInfo.eClass !== refType && isSubtypeOf(classInfo.eClass, refType)) {
        if (!result.includes(classInfo.eClass)) {
          result.push(classInfo.eClass)
        }
      }
    }
  }

  // Apply view filter if active
  if (views.activeView.value) {
    return result.filter(cls => !views.isTypeHidden(cls))
  }
  return result
}

// Context menu items
const contextMenuItems = computed(() => {
  const menuNode = ctxMenuNode.value

  // Resource-node menu (New / Save / Rename / Delete)
  if (menuNode?.kind === 'resource') {
    const res = menuNode.resource
    return [
      { label: 'New Resource…', icon: 'pi pi-plus', command: () => createResourcePrompt() },
      { separator: true },
      { label: 'Save…', icon: 'pi pi-save', command: () => eventBus?.emit('save-instances-request') },
      { label: 'Rename…', icon: 'pi pi-pencil', command: () => renameResourcePrompt(res) },
      { label: 'Delete Resource', icon: 'pi pi-trash', command: () => (ctx as any).deleteResource?.(res) }
    ]
  }

  if (!ctxSelectedNode.value) return []

  const items = []

  // Add child submenu
  const containmentRefs = ctx.getAvailableContainmentRefs()

  if (containmentRefs.length > 0) {
    items.push({
      label: 'Add Child',
      icon: 'pi pi-plus',
      items: containmentRefs.map(ref => {
        const validClasses = getValidClassesForRef(ref)

        // If only one class, create directly on click
        if (validClasses.length === 1) {
          return {
            label: getElementName(ref),
            icon: 'pi pi-arrow-right',
            command: () => handleAddChild(validClasses[0], ref)
          }
        }

        // Multiple classes - create nested submenu
        return {
          label: getElementName(ref),
          icon: 'pi pi-arrow-right',
          items: validClasses.map(eClass => ({
            label: getElementName(eClass),
            icon: 'pi pi-file',
            command: () => handleAddChild(eClass, ref)
          }))
        }
      })
    })
  }

  items.push({ separator: true })

  // Delete
  items.push({
    label: 'Delete',
    icon: 'pi pi-trash',
    disabled: false,
    command: handleDelete
  })

  // Set Icon — opens the icon settings prefilled with this object's class.
  // Routed through the command framework (instance.setIcon, scope OBJECT).
  const setIconData = ctxSelectedNode.value?.data
  const setIconEClass = typeof setIconData?.eClass === 'function' ? setIconData.eClass() : null
  if (setIconEClass) {
    items.push({
      label: 'Set Icon…',
      icon: 'pi pi-palette',
      command: () => {
        const nsUri = setIconEClass.getEPackage?.()?.getNsURI?.() || ''
        const targetType = `${nsUri}#${setIconEClass.getName()}`
        const commandRegistry = tsm?.getService('gene.command.registry')
        commandRegistry?.execute('instance.setIcon', { targetType })
      }
    })
  }

  // Move to Resource — move the selected object's subtree into another resource
  const moveData = ctxSelectedNode.value?.data
  const moveTargets = (((ctx as any).resources?.value) || []).filter((ri: any) => {
    try { return ri.resource !== moveData?.eResource?.() } catch { return true }
  })
  if (moveData && moveTargets.length > 0) {
    items.push({
      label: 'Move to Resource',
      icon: 'pi pi-arrow-right',
      items: moveTargets.map((ri: any) => ({
        label: ri.name,
        icon: 'pi pi-folder',
        command: () => (ctx as any).moveToResource?.(moveData, ri.resource)
      }))
    })
  }

  // Quick Actions from ActionRegistry
  const selectedData = ctxSelectedNode.value?.data
  if (selectedData && tsm) {
    const actionRegistry = tsm.getService('gene.action.registry')
    const actionManager = tsm.getService('gene.action.manager')
    if (actionRegistry && actionManager) {
      const perspectiveManager = tsm.getService('ui.registry.perspectives')
      const perspectiveId = perspectiveManager?.state?.currentPerspectiveId || ''
      const availableActions = actionRegistry.getActionsForObject(selectedData, perspectiveId)

      if (availableActions.length > 0) {
        items.push({ separator: true })
        items.push({
          label: 'Actions',
          icon: 'pi pi-bolt',
          items: availableActions.map((ra: any) => ({
            label: ra.definition.label || ra.definition.actionId,
            icon: ra.definition.icon?.cssClass || 'pi pi-play',
            disabled: !actionManager.canExecute(ra.definition.actionId, {
              selectedObject: selectedData,
              selectedObjects: [selectedData],
              perspectiveId,
              timestamp: new Date()
            }),
            command: async () => {
              const result = await actionManager.execute(ra.definition.actionId, {
                selectedObject: selectedData,
                selectedObjects: [selectedData],
                perspectiveId,
                timestamp: new Date()
              })
              // Handle result (toast notification)
              if (result.status === 'SUCCESS') {
                console.log(`[Action] ${ra.definition.label}: Success`, result.logs)
              } else if (result.status === 'ERROR') {
                console.error(`[Action] ${ra.definition.label}: Error`, result.logs)
              }
              // Handle artifacts
              for (const artifact of result.artifacts || []) {
                handleActionArtifact(artifact)
              }
            }
          }))
        })
      }
    }
  }

  // View/Filter options
  const views = useSharedViews()
  if (views.activeView.value) {
    items.push({ separator: true })

    const selectedData = ctxSelectedNode.value?.data
    if (selectedData) {
      const eClass = typeof selectedData.eClass === 'function' ? selectedData.eClass() : null

      if (eClass) {
        items.push({
          label: `Hide "${getElementName(eClass)}" Type`,
          icon: 'pi pi-eye-slash',
          command: () => {
            views.hideTypeByClass(eClass, 'TYPE_ONLY')
          }
        })

        items.push({
          label: `Hide "${getElementName(eClass)}" & Subtypes`,
          icon: 'pi pi-eye-slash',
          command: () => {
            views.hideTypeByClass(eClass, 'TYPE_AND_SUBTYPES')
          }
        })
      }

      items.push({
        label: 'Hide This Element',
        icon: 'pi pi-eye-slash',
        command: () => {
          views.hideElementByObject(selectedData)
        }
      })
    }
  }

  return items
})


/**
 * Handle action result artifacts
 */
function handleActionArtifact(artifact: any) {
  switch (artifact.type) {
    case 'FILE':
      if (artifact.handling === 'DOWNLOAD' && artifact.content) {
        const blob = artifact.content instanceof Blob ? artifact.content : new Blob([artifact.content])
        const url = URL.createObjectURL(blob)
        const a = document.createElement('a')
        a.href = url
        a.download = artifact.fileName || 'download'
        a.click()
        URL.revokeObjectURL(url)
      }
      break
    case 'VALIDATION_MESSAGES':
      // Validation results are stored in the job — visible in Jobs panel.
      // Not auto-applied to Problems panel (user navigates there manually).
      console.log('[Action] Validation result:', artifact.messages?.length, 'issue(s)')
      break
    case 'MARKDOWN':
      console.log('[Action] Markdown result:', artifact.content)
      break
    case 'XMI':
      console.log('[Action] XMI result:', artifact.xmiContent?.substring(0, 200))
      break
    default:
      console.log('[Action] Artifact:', artifact.type, artifact)
  }
}

/**
 * Handle tree node selection
 */
function handleNodeSelect(node: any) {
  ctx.selectNode(node as any)
  // Resource nodes have no EObject payload — clear the object selection
  emit('object-select', node?.kind === 'resource' ? null : node.data)
}

/**
 * Handle context menu
 */
function handleContextMenu(event: MouseEvent) {
  contextMenu.value?.show(event)
}

/**
 * Handle adding a child
 */
function handleAddChild(eClass: EClass, ref: EReference) {
  const newObj = ctx.createChildInSelected(eClass, ref)
  if (newObj) {
    emit('object-create', newObj)
  }
}

/**
 * Handle delete
 */
function handleDelete() {
  const obj = ctxSelectedObject.value
  if (obj && ctx.deleteSelected()) {
    emit('object-delete', obj)
    emit('object-select', null)
  }
}

/**
 * Handle drag over (for dropping EClasses from model browser)
 */
function handleDragOver(event: DragEvent) {
  if (event.dataTransfer?.types.includes('application/x-eclass')) {
    event.preventDefault()
    isDragOver.value = true
  }
}

/**
 * Handle drag leave
 */
function handleDragLeave() {
  isDragOver.value = false
}

/**
 * Handle drop (create instance from dropped EClass)
 */
function handleDrop(event: DragEvent) {
  isDragOver.value = false

  const qualifiedName = event.dataTransfer?.getData('application/x-eclass')
  if (!qualifiedName) return

  const classInfo = ctx.findClass(qualifiedName)
  if (!classInfo) {
    console.warn(`Class not found: ${qualifiedName}`)
    return
  }

  // If an object is selected, try to create the drop as its child
  if (ctxSelectedObject.value) {
    const containmentRefs = ctx.getAvailableContainmentRefs()
    for (const ref of containmentRefs) {
      const refType = ref.getEType() as EClass
      if (refType && isSubtypeOf(classInfo.eClass, refType)) {
        handleAddChild(classInfo.eClass, ref)
        return
      }
    }
  }

  // Otherwise (a resource node is active / nothing selected): create as a ROOT
  // object in the active resource.
  try {
    const factory = classInfo.eClass.getEPackage().getEFactoryInstance()
    const newObj = factory.create(classInfo.eClass)
    ctx.addRootObject(newObj)
    emit('object-create', newObj)
  } catch (e) {
    console.warn(`Could not create root instance for ${qualifiedName}:`, e)
  }
}

/**
 * Create a new root instance from selected class
 */
function handleCreateRootInstance() {
  if (!selectedClass.value) return

  const classInfo = selectedClass.value
  const eClass = classInfo.eClass

  // Create instance using factory
  const factory = eClass.getEPackage().getEFactoryInstance()
  const newObj = factory.create(eClass)

  // Add to resource (create resource if needed)
  ctx.addRootObject(newObj)

  showNewInstanceDialog.value = false
  selectedClass.value = null

  emit('object-create', newObj)
}

// Watch for selection changes to emit events
watch(ctxSelectedObject, (obj) => {
  emit('object-select', obj)
})
</script>

<template>
  <div
    class="instance-tree"
    :class="{ 'drag-over': isDragOver }"
    @dragover="handleDragOver"
    @dragleave="handleDragLeave"
    @drop="handleDrop"
  >

    <!-- No models loaded -->
    <div v-if="!hasModels" class="empty-state">
      <i class="pi pi-box"></i>
      <p>No models loaded</p>
      <p class="hint">Add a .ecore model from the File Explorer first</p>
    </div>

    <!-- Empty tree (no instances) -->
    <div v-else-if="ctxTreeNodes.length === 0" class="empty-state">
      <i class="pi pi-plus-circle"></i>
      <p>No instances</p>
      <p class="hint">Click + to create an instance, or drag a class from the Model Browser</p>
      <Button
        label="New Instance"
        icon="pi pi-plus"
        size="small"
        @click="showNewInstanceDialog = true"
      />
      <Button
        v-if="canManageResources"
        label="New Resource"
        icon="pi pi-folder-plus"
        size="small"
        severity="secondary"
        outlined
        @click="createResourcePrompt"
      />
    </div>

    <!-- Instance tree -->
    <div v-else class="tree-container" ref="treeContainerRef" @dragend.capture="clearDragFeedback">
      <Tree
        :value="ctxTreeNodes"
        v-model:selectionKeys="ctxSelectedKeys"
        v-model:expandedKeys="ctxExpandedKeys"
        selectionMode="single"
        :draggableNodes="true"
        :droppableNodes="true"
        @node-select="handleNodeSelect"
        @node-drop="onTreeNodeDrop"
        @node-dragenter="onNodeDragEnter"
        @node-dragleave="clearDragFeedback"
        class="emf-tree"
      >
        <template #default="{ node }">
          <div
            class="tree-node"
            :class="{
              'tree-node--resource': node.kind === 'resource',
              'tree-node--invalid-drop': node.key === invalidDropKey
            }"
            :data-node-key="node.key"
            @contextmenu.prevent="(event) => onNodeContextMenu(node, event)"
          >
            <template v-if="node.kind === 'resource'">
              <i class="node-icon node-icon--resource pi pi-box"></i>
              <span class="node-label node-label--resource" :title="node.uri">{{ node.label }}</span>
              <span v-if="node.dirty" class="resource-dirty" title="Ungespeicherte Änderungen">●</span>
            </template>
            <template v-else>
              <img v-if="node.iconDataUrl" :src="node.iconDataUrl" class="node-icon node-icon--img" alt="" />
              <i v-else-if="node.iconClass" :class="node.iconClass" class="node-icon" />
              <span class="node-label" :title="node.xmiId ? `XMI-ID: ${node.xmiId}` : undefined">{{ node.label }}</span>
            </template>
          </div>
        </template>
      </Tree>

      <!-- Transient feedback when a drop was rejected -->
      <transition name="drop-msg">
        <div v-if="dropMessage" class="drop-message">
          <i class="pi pi-ban"></i>
          <span>{{ dropMessage }}</span>
        </div>
      </transition>
    </div>

    <!-- Drag overlay -->
    <div v-if="isDragOver" class="drag-overlay">
      <i class="pi pi-download"></i>
      <span>Drop to create instance</span>
    </div>

    <!-- Context Menu -->
    <ContextMenu ref="contextMenu" :model="contextMenuItems" />

    <!-- "+" add menu (New Instance / New Resource) -->
    <Menu ref="addMenu" :model="addMenuItems" :popup="true" />

    <!-- New Instance Dialog -->
    <Dialog
      v-model:visible="showNewInstanceDialog"
      header="Create New Instance"
      :modal="true"
      :style="{ width: '400px' }"
    >
      <div class="dialog-content">
        <div class="field">
          <label>Select Class</label>
          <Dropdown
            v-model="selectedClass"
            :options="availableClasses"
            optionLabel="name"
            placeholder="Select a class"
            filter
            :filterFields="['name', 'qualifiedName', 'packageInfo.name', 'packageInfo.nsURI']"
            class="w-full"
          >
            <template #option="{ option }">
              <div class="class-option">
                <span class="class-name">{{ option.name }}</span>
                <span class="class-uri">{{ option.packageInfo?.nsURI }}</span>
              </div>
            </template>
            <template #value="{ value }">
              <div v-if="value" class="class-option">
                <span class="class-name">{{ value.name }}</span>
                <span class="class-uri">{{ value.packageInfo?.nsURI }}</span>
              </div>
              <span v-else>Select a class</span>
            </template>
          </Dropdown>
        </div>
      </div>
      <template #footer>
        <Button label="Cancel" severity="secondary" @click="showNewInstanceDialog = false" />
        <Button label="Create" @click="handleCreateRootInstance" :disabled="!selectedClass" />
      </template>
    </Dialog>

    <!-- New Resource Dialog -->
    <Dialog
      v-model:visible="showNewResourceDialog"
      header="New Resource"
      :modal="true"
      :style="{ width: '440px' }"
    >
      <div class="dialog-content">
        <div class="field">
          <label>Name</label>
          <InputText v-model="newResourceName" placeholder="my-instances" class="w-full" @keyup.enter="confirmNewResource" />
        </div>
        <div class="field">
          <label>Path (folder, relative to workspace)</label>
          <Dropdown
            v-model="newResourcePath"
            :options="folderOptions"
            optionLabel="label"
            optionValue="value"
            placeholder="Select or type a folder…"
            editable
            class="w-full"
          />
        </div>
        <p class="new-resource-preview">
          <i class="pi pi-box"></i>
          <span>{{ newResourcePreview }}</span>
        </p>
      </div>
      <template #footer>
        <Button label="Cancel" severity="secondary" @click="showNewResourceDialog = false" />
        <Button label="Create" icon="pi pi-plus" @click="confirmNewResource" :disabled="!newResourceName.trim()" />
      </template>
    </Dialog>

    <!-- Views Editor Dialog -->
    <ViewsEditorDialog
      v-model:visible="showViewsEditor"
      :packages="ctxAllPackages"
    />
  </div>
</template>

<style scoped>
.instance-tree {
  display: flex;
  flex-direction: column;
  height: 100%;
  background: var(--surface-ground);
  position: relative;
}

.instance-tree.drag-over {
  background: var(--primary-50);
}

.tree-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 8px 16px;
  border-bottom: 1px solid var(--surface-border);
  background: var(--surface-section);
}

.validate-error {
  color: var(--red-500) !important;
}

.header-title {
  font-weight: 600;
  font-size: 0.875rem;
  text-transform: uppercase;
  color: var(--text-color-secondary);
}

.workspace-name {
  font-size: 0.75rem;
  color: var(--text-color-secondary);
  font-family: monospace;
}

.empty-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 2rem;
  text-align: center;
  color: var(--text-color-secondary);
  flex: 1;
}

.empty-state i {
  font-size: 3rem;
  margin-bottom: 1rem;
  opacity: 0.5;
}

.empty-state .hint {
  font-size: 0.875rem;
  opacity: 0.7;
}

.tree-container {
  flex: 1;
  overflow: auto;
  position: relative;
}

.emf-tree {
  padding: 0.5rem;
  background: transparent;
}

.tree-node {
  display: flex;
  align-items: center;
  gap: 0.5rem;
}

.node-icon {
  font-size: 0.875rem;
  color: var(--text-color-secondary);
  flex-shrink: 0;
}

.node-icon--img {
  width: 1rem;
  height: 1rem;
  object-fit: contain;
}

/* Dark mode: invert monochrome custom icons so they appear light */
:root.p-dark .node-icon--img,
.dark-theme .node-icon--img {
  filter: invert(0.85);
}

.node-label {
  font-size: 0.875rem;
}

/* Resource nodes: distinct from folders — box icon, bolder row, subtle band */
.tree-node--resource {
  background: var(--surface-ground, rgba(127, 127, 127, 0.08));
  border-radius: 4px;
  padding: 2px 6px;
  margin: 1px 0;
}

.node-label--resource {
  font-weight: 700;
  font-size: 0.9rem;
  letter-spacing: 0.01em;
}

.node-icon--resource {
  color: var(--primary-color, #6366f1);
}

.resource-dirty {
  color: var(--primary-color, #6366f1);
  font-size: 0.7rem;
  line-height: 1;
  margin-left: 0.25rem;
}

.new-resource-preview {
  display: flex;
  align-items: center;
  gap: 8px;
  margin: 4px 0 0;
  padding: 6px 10px;
  background: var(--surface-ground, rgba(127, 127, 127, 0.08));
  border-radius: 6px;
  font-family: monospace;
  font-size: 0.8125rem;
  color: var(--text-color-secondary);
}

.new-resource-preview i {
  color: var(--primary-color, #6366f1);
}

.drag-overlay {
  position: absolute;
  inset: 0;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  background: var(--primary-100);
  opacity: 0.9;
  pointer-events: none;
}

.drag-overlay i {
  font-size: 3rem;
  color: var(--primary-500);
  margin-bottom: 1rem;
}

.drag-overlay span {
  font-size: 1rem;
  font-weight: 600;
  color: var(--primary-700);
}

/* PrimeVue 4 Tree Styles */
:deep(.p-tree) {
  background: transparent;
  border: none;
  padding: 0;
}

:deep(.p-tree-root-children) {
  display: flex;
  flex-direction: column;
  gap: 0;
}

:deep(.p-tree-node) {
  padding: 0;
}

:deep(.p-tree-node-children) {
  padding-left: 1rem;
}

:deep(.p-tree-node-content) {
  display: flex;
  align-items: center;
  gap: 0.25rem;
  padding: 0.25rem 0.5rem;
  border-radius: var(--border-radius);
  cursor: pointer;
}

:deep(.p-tree-node-content:hover) {
  background: var(--surface-hover);
}

:deep(.p-tree-node-content.p-tree-node-selected) {
  background: var(--primary-100);
}

:deep(.p-tree-node-toggle-button) {
  width: 1rem;
  height: 1rem;
  margin-right: 0;
  padding: 0;
  border: none;
  background: transparent;
  color: var(--text-color-secondary);
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
}

:deep(.p-tree-node-toggle-button .p-icon) {
  width: 0.75rem;
  height: 0.75rem;
}

:deep(.p-tree-node-toggle-button:hover) {
  background: var(--surface-hover);
  border-radius: var(--border-radius);
}

:deep(.p-tree-node-icon) {
  display: none;
}

:deep(.p-tree-node-label) {
  font-size: 0.875rem;
}

/* ── Drag & Drop feedback ─────────────────────────────────────────────── */
/* Source row while it is being dragged (PrimeVue sets data-p-dragging) */
:deep(.p-tree-node-content[data-p-dragging='true']) {
  opacity: 0.4;
}

/* Reorder indicator between rows: a clean thin line (not the default empty box) */
:deep(.p-tree-node-drop-point) {
  height: 0;
  margin: 0 0.25rem;
  border-top: 2px solid var(--primary-color, #3b82f6);
  border-radius: 2px;
  position: relative;
}
:deep(.p-tree-node-drop-point)::before {
  content: '';
  position: absolute;
  left: -1px;
  top: 50%;
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: var(--primary-color, #3b82f6);
  transform: translateY(-50%);
}

/* Middle-of-row hover: soft highlight (cursor half still decides before/after) */
:deep(.p-tree-node-content.p-tree-node-dragover) {
  background: var(--primary-50, rgba(59, 130, 246, 0.12));
  box-shadow: inset 0 0 0 1px var(--primary-color, #3b82f6);
}

/* Invalid drop target (type not allowed / not a multi-valued container) — mark red */
.tree-node--invalid-drop {
  cursor: not-allowed;
}
:deep(.p-tree-node-content:has(.tree-node--invalid-drop)) {
  outline: 1px dashed var(--red-500, #ef4444);
  outline-offset: -1px;
  border-radius: 4px;
  background: var(--red-50, rgba(239, 68, 68, 0.1));
}
/* Recolor the reorder line/dot on an invalid target */
:deep(.p-tree-node:has(.tree-node--invalid-drop) .p-tree-node-drop-point) {
  border-top-color: var(--red-500, #ef4444);
}
:deep(.p-tree-node:has(.tree-node--invalid-drop) .p-tree-node-drop-point)::before {
  background: var(--red-500, #ef4444);
}

/* Transient rejection message */
.drop-message {
  position: absolute;
  bottom: 0.75rem;
  left: 0.75rem;
  right: 0.75rem;
  display: flex;
  align-items: center;
  gap: 0.5rem;
  padding: 0.5rem 0.75rem;
  background: var(--red-50, #fef2f2);
  color: var(--red-700, #b91c1c);
  border: 1px solid var(--red-200, #fecaca);
  border-radius: 6px;
  font-size: 0.8rem;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.12);
  z-index: 20;
}
.drop-message i { flex-shrink: 0; }
.drop-msg-enter-active,
.drop-msg-leave-active { transition: opacity 0.2s ease, transform 0.2s ease; }
.drop-msg-enter-from,
.drop-msg-leave-to { opacity: 0; transform: translateY(0.5rem); }

/* Dialog styles */
.dialog-content {
  display: flex;
  flex-direction: column;
  gap: 1rem;
}

.field {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
}

.field label {
  font-weight: 500;
  font-size: 0.875rem;
}

.w-full {
  width: 100%;
}

.class-option {
  display: flex;
  flex-direction: column;
  gap: 1px;
  width: 100%;
}

.class-name {
  font-weight: 500;
  font-size: 0.875rem;
}

.class-uri {
  font-size: 0.7rem;
  color: var(--text-color-secondary);
  overflow: hidden;
  text-overflow: ellipsis;
}

.header-actions {
  display: flex;
  gap: 0.25rem;
}

.header-actions :deep(.p-button) {
  width: 28px;
  height: 28px;
  padding: 0;
}

.header-actions :deep(.p-button-icon) {
  font-size: 0.875rem;
}

.header-actions :deep(.toggle-active) {
  color: var(--primary-color);
  background: var(--primary-50);
}

</style>

<!--
  Global (non-scoped) style for the drag ghost. PrimeVue clones the dragged row
  and appends it to <body> as the native drag image (data-pc-section="drag-image"),
  so it lives OUTSIDE this component's scoped styles and would otherwise render with
  no background/padding (looks broken). Give it a clean, solid card look here.
-->
<style>
[data-pc-section='drag-image'] {
  display: inline-flex !important;
  align-items: center;
  gap: 0.25rem;
  box-sizing: border-box;
  /* PrimeVue sets an inline width = full row width; force shrink-to-content */
  width: max-content !important;
  max-width: 320px !important;
  height: auto !important;
  padding: 0.25rem 0.6rem;
  background: var(--surface-0, #ffffff);
  color: var(--text-color, #1e293b);
  border: 1px solid var(--surface-border, #e2e8f0);
  border-radius: 6px;
  box-shadow: 0 6px 16px rgba(0, 0, 0, 0.18);
  font-size: 0.875rem;
  white-space: nowrap;
  overflow: hidden;
  opacity: 0.95;
  pointer-events: none;
}
/* Keep inner elements from stretching the ghost to full width */
[data-pc-section='drag-image'] * {
  flex: 0 0 auto !important;
  width: auto !important;
  max-width: 100%;
  overflow: hidden;
  text-overflow: ellipsis;
}
[data-pc-section='drag-image'] .p-tree-node-toggle-button {
  display: none !important;
}
</style>
