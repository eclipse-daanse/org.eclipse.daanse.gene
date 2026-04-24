/**
 * useAtlasBrowser Composable
 *
 * Manages Atlas server connections, tree data, and detail loading.
 */

import { ref, shallowRef } from 'tsm:vue'
import {
  ModelAtlasClient,
  parseScopeXmi,
  parseMetadataListXmi,
  parseMetadataXmi
} from 'storage-model-atlas'
import type { ObjectMetadata, Scope, Stage, StageTransition } from 'storage-model-atlas'
import type { AtlasConnection, AtlasTreeNodeData, ConnectFormData } from '../types'

/** PrimeVue-compatible tree node */
interface TreeNode {
  key?: string
  label?: string
  icon?: string
  leaf?: boolean
  data?: any
  children?: TreeNode[]
}

let connectionCounter = 0

/**
 * Decode a Base64 / Base64-URL encoded objectId to the plain nsUri.
 * Falls back to the original string if decoding fails.
 */
function safeAtob(encoded: string): string {
  try {
    // Restore standard Base64 from URL-safe variant
    const b64 = encoded.replace(/-/g, '+').replace(/_/g, '/')
    return atob(b64)
  } catch {
    // Not valid Base64 — return as-is
    return encoded
  }
}

function createAtlasBrowser() {
  // State
  const connections = ref<AtlasConnection[]>([])
  const treeNodes = ref<TreeNode[]>([])
  const selectedNodeKey = ref<string | null>(null)
  const selectedDetail = shallowRef<ObjectMetadata | null>(null)
  const selectedNodeData = shallowRef<AtlasTreeNodeData | null>(null)
  const loading = ref(false)
  const rawContent = ref<string | null>(null)
  const rawContentLoading = ref(false)

  // Graph viewer state
  const graphContent = ref<string | null>(null)
  const graphName = ref<string | null>(null)

  // Schema explorer state
  const schemaTreeContent = ref<string | null>(null)
  const selectedSchemaElement = shallowRef<any>(null)

  // Client instances per connection
  const clients = new Map<string, ModelAtlasClient>()

  // Scope data per connection (for transition rules)
  const scopeData = new Map<string, Scope>()
  // Reactive scope data for components
  const scopeDataRef = ref<Map<string, Scope>>(new Map())

  /**
   * Connect to an Atlas server
   */
  async function connect(form: ConnectFormData): Promise<AtlasConnection> {
    const id = `atlas-${++connectionCounter}`
    const connection: AtlasConnection = {
      id,
      label: `${form.scopeName}@${new URL(form.baseUrl).host}`,
      baseUrl: form.baseUrl,
      scopeName: form.scopeName,
      token: form.token || undefined,
      status: 'connecting'
    }

    connections.value = [...connections.value, connection]

    const client = new ModelAtlasClient({
      baseUrl: form.baseUrl,
      token: form.token || undefined
    })
    clients.set(id, client)

    try {
      // Test connection and load scope
      const scopeXml = await client.getScope(form.scopeName)
      if (!scopeXml) {
        throw new Error(`Scope '${form.scopeName}' not found`)
      }

      const scope = parseScopeXmi(scopeXml)
      if (!scope) {
        throw new Error(`Failed to parse scope '${form.scopeName}'`)
      }

      // Store scope data for transitions
      scopeData.set(id, scope)
      scopeDataRef.value = new Map(scopeData)

      // Build tree nodes from scope
      const scopeNode = buildScopeTree(id, form.scopeName, scope)

      // Load parent scope if inherited
      const parentScopeName = scope.parentScope
      if (parentScopeName) {
        try {
          const parentXml = await client.getScope(parentScopeName)
          if (parentXml) {
            const parentScope = parseScopeXmi(parentXml)
            if (parentScope) {
              const parentNode = buildScopeTree(id, parentScopeName, parentScope)
              parentNode.label = `[inherited] ${parentScopeName}`
              parentNode.icon = 'pi pi-link'
              // Insert parent as first child of scope node
              scopeNode.children = [parentNode, ...(scopeNode.children || [])]
            }
          }
        } catch (e) {
          console.warn(`[AtlasBrowser] Failed to load parent scope '${parentScopeName}':`, e)
        }
      }

      // Update connection status
      updateConnection(id, { status: 'connected' })

      // Add to tree
      treeNodes.value = [...treeNodes.value, scopeNode]

      return connections.value.find(c => c.id === id)!
    } catch (e: any) {
      updateConnection(id, {
        status: 'error',
        error: e.message || 'Connection failed'
      })
      throw e
    }
  }

  /**
   * Disconnect from an Atlas server
   */
  function disconnect(connectionId: string) {
    clients.delete(connectionId)
    scopeData.delete(connectionId)
    scopeDataRef.value = new Map(scopeData)
    connections.value = connections.value.filter(c => c.id !== connectionId)
    treeNodes.value = treeNodes.value.filter(n => {
      const data = n.data as AtlasTreeNodeData
      return data.connectionId !== connectionId
    })

    // Clear selection if it belonged to this connection
    if (selectedNodeData.value?.connectionId === connectionId) {
      selectedNodeKey.value = null
      selectedDetail.value = null
      selectedNodeData.value = null
      rawContent.value = null
    }
  }

  /**
   * Build tree from a Scope object
   */
  function buildScopeTree(connectionId: string, scopeName: string, scope: Scope): TreeNode {
    const registries = scope.registries || []

    const children: TreeNode[] = registries.map(registry => {
      const regName = registry.name || 'unknown'
      const isSchema = regName === 'schema'
      const stages = registry.stages || []

      const stageChildren: TreeNode[] = stages.map(stage => {
        const stageName = stage.name || 'unknown'
        const isWritable = stage.writable !== false
        const isFinal = !!stage.final
        const stageLabel = !isWritable ? `${stageName} (read-only)` : stageName
        return {
          key: `${connectionId}/${scopeName}/${regName}/${stageName}`,
          label: stageLabel,
          icon: isFinal ? 'pi pi-lock' : !isWritable ? 'pi pi-eye' : 'pi pi-folder',
          leaf: false,
          data: {
            type: 'stage',
            connectionId,
            scopeName,
            registryName: regName,
            stageName,
            isSchemaRegistry: isSchema
          } as AtlasTreeNodeData,
          children: [] // lazy loaded
        }
      })

      return {
        key: `${connectionId}/${scopeName}/${regName}`,
        label: regName,
        icon: isSchema ? 'pi pi-database' : 'pi pi-folder-open',
        data: {
          type: 'registry',
          connectionId,
          scopeName,
          registryName: regName,
          isSchemaRegistry: isSchema
        } as AtlasTreeNodeData,
        children: stageChildren
      }
    })

    return {
      key: `${connectionId}/${scopeName}`,
      label: `${scopeName}`,
      icon: 'pi pi-box',
      data: {
        type: 'scope',
        connectionId,
        scopeName
      } as AtlasTreeNodeData,
      children
    }
  }

  /**
   * Load children for a stage node (lazy loading)
   */
  async function loadStageChildren(node: TreeNode): Promise<void> {
    const data = node.data as AtlasTreeNodeData
    if (!data || data.type !== 'stage') return

    const client = clients.get(data.connectionId)
    if (!client) return

    loading.value = true
    try {
      let metadataList: ObjectMetadata[] = []

      if (data.isSchemaRegistry) {
        const xml = await client.listSchemas(data.scopeName!, data.stageName!)
        if (xml) {
          metadataList = parseMetadataListXmi(xml)
        }
      } else {
        const xml = await client.listObjects(data.scopeName!, data.registryName!, data.stageName!)
        if (xml) {
          metadataList = parseMetadataListXmi(xml)
        }
      }

      const children: TreeNode[] = metadataList.map(meta => {
        const label = meta.objectName || meta.objectId
        const isSchema = data.isSchemaRegistry
        return {
          key: `${node.key}/${meta.objectId}`,
          label,
          icon: isSchema ? 'pi pi-file' : 'pi pi-file-edit',
          leaf: true,
          data: {
            type: isSchema ? 'schema' : 'object',
            connectionId: data.connectionId,
            scopeName: data.scopeName,
            registryName: data.registryName,
            stageName: data.stageName,
            isSchemaRegistry: isSchema,
            objectId: meta.objectId,
            metadata: meta
          } as AtlasTreeNodeData
        }
      })

      // Update the node's children (reactive update)
      node.children = children

      // Force tree reactivity
      treeNodes.value = [...treeNodes.value]
    } catch (e: any) {
      console.error('Failed to load stage children:', e)
      node.children = [{
        key: `${node.key}/_error`,
        label: `Error: ${e.message}`,
        icon: 'pi pi-exclamation-triangle',
        leaf: true,
        data: null
      }]
      treeNodes.value = [...treeNodes.value]
    } finally {
      loading.value = false
    }
  }

  /**
   * Handle tree node selection
   */
  function selectNode(nodeKey: string | null) {
    selectedNodeKey.value = nodeKey
    rawContent.value = null
    lastLoadedObjectId = null

    if (!nodeKey) {
      selectedDetail.value = null
      selectedNodeData.value = null
      return
    }

    // Find the node data
    const nodeData = findNodeData(treeNodes.value, nodeKey)
    selectedNodeData.value = nodeData

    if (nodeData?.metadata) {
      selectedDetail.value = nodeData.metadata
    } else {
      selectedDetail.value = null
    }
  }

  /**
   * Find node data by key (recursive)
   */
  function findNodeData(nodes: TreeNode[], key: string): AtlasTreeNodeData | null {
    for (const node of nodes) {
      if (node.key === key) return node.data as AtlasTreeNodeData
      if (node.children) {
        const found = findNodeData(node.children, key)
        if (found) return found
      }
    }
    return null
  }

  /**
   * Find a tree node by objectId (recursive)
   */
  function findNodeByObjectId(nodes: TreeNode[], objectId: string): TreeNode | null {
    for (const node of nodes) {
      const data = node.data as AtlasTreeNodeData
      if (data?.objectId === objectId) return node
      if (node.children) {
        const found = findNodeByObjectId(node.children, objectId)
        if (found) return found
      }
    }
    return null
  }

  /**
   * Re-select the currently selected object after a tree refresh.
   * Finds the object by its objectId in the updated tree and updates selection + detail.
   */
  function reselectCurrentObject() {
    const currentId = selectedNodeData.value?.objectId
    if (!currentId) return

    const node = findNodeByObjectId(treeNodes.value, currentId)
    if (node) {
      const data = node.data as AtlasTreeNodeData
      selectedNodeKey.value = node.key ?? null
      selectedNodeData.value = data
      selectedDetail.value = data?.metadata ?? null
      lastLoadedObjectId = null
      rawContent.value = null
    }
  }

  /**
   * Load raw content of a schema or object
   */
  async function loadRawContent(): Promise<string | null> {
    const data = selectedNodeData.value
    console.log('[useAtlasBrowser] loadRawContent called, data:', data ? { connectionId: data.connectionId, objectId: data.objectId, scopeName: data.scopeName, stageName: data.stageName, isSchemaRegistry: data.isSchemaRegistry } : null)
    if (!data || !data.objectId) {
      console.warn('[useAtlasBrowser] loadRawContent: no data or objectId')
      return null
    }

    const client = clients.get(data.connectionId)
    console.log('[useAtlasBrowser] client found:', !!client, 'for connectionId:', data.connectionId, 'clients size:', clients.size)
    if (!client) return null

    rawContentLoading.value = true
    try {
      let content: string | null = null

      // Only Base64-decode for schema registry (nsURI-based IDs)
      const resolvedId = data.isSchemaRegistry ? safeAtob(data.objectId) : data.objectId
      if (data.isSchemaRegistry) {
        console.log('[useAtlasBrowser] getSchemaContent:', data.scopeName, data.stageName, resolvedId, '(raw:', data.objectId, ')')
        content = await client.getSchemaContent(
          data.scopeName!,
          data.stageName!,
          resolvedId
        )
      } else {
        console.log('[useAtlasBrowser] getObjectContent:', data.scopeName, data.registryName, data.stageName, resolvedId)
        content = await client.getObjectContent(
          data.scopeName!,
          data.registryName!,
          data.stageName!,
          resolvedId
        )
      }

      console.log('[useAtlasBrowser] loadRawContent result:', content ? `${content.length} chars` : 'null')
      rawContent.value = content
      return content
    } catch (e: any) {
      console.error('[useAtlasBrowser] loadRawContent error:', e)
      rawContent.value = null
      return null
    } finally {
      rawContentLoading.value = false
    }
  }

  /**
   * Get content for adding to workspace
   */
  async function getContentForWorkspace(nodeData: AtlasTreeNodeData): Promise<{ content: string; filename: string; isSchema: boolean } | null> {
    console.log('[useAtlasBrowser] getContentForWorkspace called, nodeData:', { connectionId: nodeData.connectionId, objectId: nodeData.objectId, isSchemaRegistry: nodeData.isSchemaRegistry })
    const client = clients.get(nodeData.connectionId)
    if (!client || !nodeData.objectId) {
      console.warn('[useAtlasBrowser] getContentForWorkspace: no client or objectId, client:', !!client, 'objectId:', nodeData.objectId)
      return null
    }

    try {
      let content: string | null = null

      // Only Base64-decode for schema registry (nsURI-based IDs)
      const resolvedId = nodeData.isSchemaRegistry ? safeAtob(nodeData.objectId) : nodeData.objectId
      if (nodeData.isSchemaRegistry) {
        console.log('[useAtlasBrowser] getSchemaContent:', nodeData.scopeName, nodeData.stageName, resolvedId, '(raw:', nodeData.objectId, ')')
        content = await client.getSchemaContent(
          nodeData.scopeName!,
          nodeData.stageName!,
          resolvedId
        )
      } else {
        console.log('[useAtlasBrowser] getObjectContent:', nodeData.scopeName, nodeData.registryName, nodeData.stageName, resolvedId)
        content = await client.getObjectContent(
          nodeData.scopeName!,
          nodeData.registryName!,
          nodeData.stageName!,
          resolvedId
        )
      }

      console.log('[useAtlasBrowser] getContentForWorkspace result:', content ? `${content.length} chars` : 'null')
      if (!content) return null

      const meta = nodeData.metadata
      const name = meta?.objectName || nodeData.objectId
      const ext = nodeData.isSchemaRegistry ? '.ecore' : '.xmi'
      const filename = name.endsWith(ext) ? name : name + ext

      return {
        content,
        filename,
        isSchema: !!nodeData.isSchemaRegistry
      }
    } catch (e: any) {
      console.error('[useAtlasBrowser] getContentForWorkspace error:', e)
      return null
    }
  }

  /**
   * Upload a schema to an Atlas server
   */
  async function uploadSchema(
    connectionId: string,
    stageName: string,
    content: string,
    options?: { nsUri?: string; name?: string; version?: string; overwrite?: boolean }
  ): Promise<{ success: boolean; error?: string }> {
    const client = clients.get(connectionId)
    if (!client) {
      return { success: false, error: 'Connection not found' }
    }

    const connection = connections.value.find(c => c.id === connectionId)
    if (!connection) {
      return { success: false, error: 'Connection not found' }
    }

    try {
      // Atlas server expects '_type' instead of 'eType' as attribute name
      const atlasContent = content.replace(/ eType="/g, ' _type="')
      await client.uploadSchema(connection.scopeName, stageName, atlasContent, options)
      return { success: true }
    } catch (e: any) {
      return { success: false, error: e.message || 'Upload failed' }
    }
  }

  /**
   * Get available stages for schema upload from a connection
   */
  function getSchemaStages(connectionId: string): Array<{ name: string; final: boolean }> {
    const scopeNode = treeNodes.value.find(n => {
      const data = n.data as AtlasTreeNodeData
      return data.connectionId === connectionId
    })
    if (!scopeNode?.children) return []

    const schemaRegistry = scopeNode.children.find(n => {
      const data = n.data as AtlasTreeNodeData
      return data.isSchemaRegistry
    })
    if (!schemaRegistry?.children) return []

    return schemaRegistry.children.map(stageNode => {
      const data = stageNode.data as AtlasTreeNodeData
      return {
        name: data.stageName || 'unknown',
        final: stageNode.icon === 'pi pi-lock'
      }
    })
  }

  // Helper to update a connection
  function updateConnection(id: string, updates: Partial<AtlasConnection>) {
    connections.value = connections.value.map(c =>
      c.id === id ? { ...c, ...updates } : c
    )
  }

  /**
   * Set graph content for the Graph-Viewer
   */
  function showGraph(content: string, name: string) {
    graphContent.value = content
    graphName.value = name
  }

  /**
   * Set schema tree content for the Schema Explorer
   */
  function showSchemaTree(content: string, name: string) {
    schemaTreeContent.value = content
  }

  // Validation dialog state — Promise-based communication between handler and Vue component
  const showValidationDialog = ref(false)
  let validationResolve: ((oclId: string | null | 'cancelled') => void) | null = null

  /**
   * Open the validation dialog and return the user's choice.
   * Returns oclId string, null (EMF-only), or 'cancelled'.
   */
  function requestValidationChoice(): Promise<string | null | 'cancelled'> {
    return new Promise((resolve) => {
      validationResolve = resolve
      showValidationDialog.value = true
    })
  }

  /**
   * Resolve the pending validation choice. Called from ValidationDialog component.
   */
  function resolveValidationChoice(oclId: string | null | 'cancelled') {
    showValidationDialog.value = false
    if (validationResolve) {
      validationResolve(oclId)
      validationResolve = null
    }
  }

  // Track which content was loaded for the current selection (avoid re-fetching)
  let lastLoadedObjectId: string | null = null

  /**
   * Ensure content is loaded for the currently selected schema.
   * Called when switching editor tabs so each tab shows the right data.
   */
  async function ensureContentForSelection(): Promise<boolean> {
    const data = selectedNodeData.value
    if (!data?.objectId) return false

    // Already loaded for this selection
    if (lastLoadedObjectId === data.objectId && rawContent.value) return true

    const result = await getContentForWorkspace(data)
    if (!result) return false

    lastLoadedObjectId = data.objectId
    rawContent.value = result.content
    graphContent.value = result.content
    graphName.value = data.metadata?.objectName || 'Schema'
    schemaTreeContent.value = result.content
    return true
  }

  /**
   * Collect all loaded object metadata from tree nodes
   */
  function getAllLoadedMetadata(): Array<{ metadata: ObjectMetadata; nodeData: AtlasTreeNodeData }> {
    const result: Array<{ metadata: ObjectMetadata; nodeData: AtlasTreeNodeData }> = []
    function collect(nodes: TreeNode[]) {
      for (const node of nodes) {
        const data = node.data as AtlasTreeNodeData
        if (data?.metadata && (data.type === 'schema' || data.type === 'object')) {
          result.push({ metadata: data.metadata, nodeData: data })
        }
        if (node.children) collect(node.children)
      }
    }
    collect(treeNodes.value)
    return result
  }

  /**
   * Get registry info (stages + allowed transitions) for a connection and registry
   */
  function getRegistryInfo(connectionId: string, registryName: string): { stages: Stage[]; transitions: StageTransition[] } | null {
    const scope = scopeData.get(connectionId)
    if (!scope) return null
    const registry = scope.registries?.find(r => r.name === registryName)
    if (!registry) return null
    return {
      stages: registry.stages || [],
      transitions: registry.allowedTransitions || []
    }
  }

  /**
   * Perform a stage transition on a schema or object
   */
  async function performTransition(
    connectionId: string,
    scopeName: string,
    registryName: string,
    fromStage: string,
    objectId: string,
    targetStage: string
  ): Promise<{ success: boolean; error?: string; metadata?: ObjectMetadata }> {
    const client = clients.get(connectionId)
    if (!client) return { success: false, error: 'Connection not found' }

    try {
      const isSchema = registryName === 'schema'
      // Only Base64-decode for schema registry (nsURI-based IDs)
      const resolvedId = isSchema ? safeAtob(objectId) : objectId

      let resultXml: string | null
      if (isSchema) {
        resultXml = await client.transitionSchema(scopeName, fromStage, resolvedId, targetStage)
      } else {
        resultXml = await client.transitionObject(scopeName, registryName, fromStage, resolvedId, targetStage)
      }

      if (resultXml === null) {
        return { success: false, error: 'Transition failed - no response from server' }
      }

      // 204 No Content → success, update selection optimistically
      if (!resultXml) {
        // Update the selected detail's stage immediately
        if (selectedDetail.value && selectedDetail.value.objectId === objectId) {
          selectedDetail.value = { ...selectedDetail.value, stage: targetStage }
        }
        if (selectedNodeData.value && selectedNodeData.value.objectId === objectId && selectedNodeData.value.metadata) {
          selectedNodeData.value = {
            ...selectedNodeData.value,
            stageName: targetStage,
            metadata: { ...selectedNodeData.value.metadata, stage: targetStage }
          }
        }
        return { success: true }
      }

      const metadata = parseMetadataXmi(resultXml)
      if (metadata) {
        // Update selected detail with server response
        if (selectedDetail.value && selectedDetail.value.objectId === objectId) {
          selectedDetail.value = metadata
        }
      }
      return { success: true, metadata: metadata || undefined }
    } catch (e: any) {
      return { success: false, error: e.message || 'Transition failed' }
    }
  }

  /**
   * Reload stage children (refresh after transition)
   */
  async function refreshStage(connectionId: string, scopeName: string, registryName: string, stageName: string): Promise<void> {
    const stageKey = `${connectionId}/${scopeName}/${registryName}/${stageName}`
    function findNode(nodes: TreeNode[]): TreeNode | null {
      for (const node of nodes) {
        if (node.key === stageKey) return node
        if (node.children) {
          const found = findNode(node.children)
          if (found) return found
        }
      }
      return null
    }
    const stageNode = findNode(treeNodes.value)
    if (stageNode) {
      await loadStageChildren(stageNode)
    }
  }

  return {
    // State (all as plain refs — components access with .value)
    connections,
    treeNodes,
    selectedNodeKey,
    selectedDetail,
    selectedNodeData,
    loading,
    rawContent,
    rawContentLoading,
    graphContent,
    graphName,
    schemaTreeContent,
    selectedSchemaElement,
    scopeDataRef,

    // Actions
    connect,
    disconnect,
    loadStageChildren,
    selectNode,
    loadRawContent,
    getContentForWorkspace,
    uploadSchema,
    getSchemaStages,
    getAllLoadedMetadata,
    showGraph,
    showSchemaTree,
    ensureContentForSelection,
    reselectCurrentObject,
    getRegistryInfo,
    performTransition,
    refreshStage,

    // Validation dialog
    showValidationDialog,
    requestValidationChoice,
    resolveValidationChoice,

    /** Get the ModelAtlasClient for a connection */
    getClient(connectionId: string): ModelAtlasClient | undefined {
      return clients.get(connectionId)
    }
  }
}

// Singleton instance for shared state
let sharedInstance: ReturnType<typeof createAtlasBrowser> | null = null

export function useAtlasBrowser() {
  return createAtlasBrowser()
}

export function useSharedAtlasBrowser() {
  if (!sharedInstance) {
    sharedInstance = createAtlasBrowser()
  }
  return sharedInstance
}
