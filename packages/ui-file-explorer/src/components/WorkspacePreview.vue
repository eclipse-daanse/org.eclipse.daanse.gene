<script setup lang="ts">
/**
 * WorkspacePreview Component
 *
 * Shows preview and metadata for a selected workspace.xmi file.
 * Uses the XMI Viewer module for displaying XMI/XML files.
 */

import { ref, watch, computed, inject } from 'tsm:vue'
import { Button } from 'tsm:primevue'
import { Card } from 'tsm:primevue'
import { Message } from 'tsm:primevue'
import type { FileEntry } from '../types'
import { useSharedFileSystem } from '../composables/useFileSystem'
import { useRecentWorkspaces, removeRecentWorkspace, addRecentWorkspace } from '../composables/useRecentWorkspaces'
const fileSystem = useSharedFileSystem()
const { recentWorkspaces, clearRecentWorkspaces } = useRecentWorkspaces()

// TSM for service access
const tsm = inject<any>('tsm')

// XMI Viewer via TSM service (avoids static dependency on ui-xmi-viewer)
const XmiViewer = ref<any>(null)
const useFileViewerRegistry = () => tsm?.getService('ui.xmi-viewer.registry')?.()

// WorkspaceActionService for direct App-level actions (replaces emits)
function getActions() {
  return tsm?.getService('gene.workspace.actions')
}

// Use shared selectedFile from fileSystem (set by FileExplorer)
const props = defineProps<{
  /** Selected file entry (optional override, normally from shared state) */
  selectedFile?: FileEntry | null
}>()

// Resolved selectedFile: prop takes priority, otherwise shared state
const selectedFile = computed(() => props.selectedFile ?? fileSystem.selectedFile.value)
const fileViewerRegistry = useFileViewerRegistry()

// Re-resolve XmiViewer on file selection (service may register after us)
watch(selectedFile, () => {
  if (!XmiViewer.value) {
    XmiViewer.value = tsm?.getService('ui.xmi-viewer.component') ?? null
  }
}, { immediate: true })

// Preview state
const loading = ref(false)
const error = ref<string | null>(null)
const fileContent = ref<string | null>(null)
const previewInfo = ref<{
  name: string
  rootElement: string
  elementCount: number
} | null>(null)

// Workspace file extensions - .wsp and .workspace are always workspaces
// .xmi files need content check to distinguish from instance data
const WORKSPACE_EXTENSIONS = ['.wsp', '.workspace']
const XMI_LIKE_EXTENSIONS = ['.xmi', '.ecore', '.xml']
const COCL_EXTENSIONS = ['.c-ocl']

// Check if selected file is a workspace file by extension
const isWorkspaceExtension = computed(() => {
  if (!selectedFile.value) return false
  const ext = selectedFile.value.extension?.toLowerCase()
  return WORKSPACE_EXTENSIONS.includes(ext ?? '')
})

// Check if file is XMI-like (XML-based model file)
const isXmiFile = computed(() => {
  if (!selectedFile.value) return false
  const ext = selectedFile.value.extension?.toLowerCase()
  return XMI_LIKE_EXTENSIONS.includes(ext ?? '')
})

// Check if file is an ecore model file
const isEcoreFile = computed(() => {
  if (!selectedFile.value) return false
  const ext = selectedFile.value.extension?.toLowerCase()
  return ext === '.ecore'
})

// Check if file is a C-OCL constraint file
const isCoclFile = computed(() => {
  if (!selectedFile.value) return false
  const ext = selectedFile.value.extension?.toLowerCase()
  return COCL_EXTENSIONS.includes(ext ?? '')
})

// C-OCL preview info
const coclPreviewInfo = ref<{
  name: string
  version: string
  description: string
  constraintCount: number
  targetNsURIs: string[]
} | null>(null)

// Track if loaded XMI is a workspace (has EditorConfig root)
const isXmiWorkspace = ref(false)

// Combined check: is this file a workspace?
const isWorkspaceFile = computed(() => {
  if (isWorkspaceExtension.value) return true
  if (isXmiFile.value && isXmiWorkspace.value) return true
  return false
})

// Load file preview when selection changes
watch(selectedFile, async (file) => {
  // Reset state
  fileContent.value = null
  previewInfo.value = null
  coclPreviewInfo.value = null
  isXmiWorkspace.value = false

  if (!file || file.isDirectory) {
    return
  }

  // Only load workspace, XMI-like, and C-OCL files
  const ext = file.extension?.toLowerCase()
  if (!WORKSPACE_EXTENSIONS.includes(ext ?? '') && !XMI_LIKE_EXTENSIONS.includes(ext ?? '') && !COCL_EXTENSIONS.includes(ext ?? '')) {
    return
  }

  try {
    loading.value = true
    error.value = null

    const content = await fileSystem.readTextFile(file)
    fileContent.value = content

    // Handle C-OCL files
    if (COCL_EXTENSIONS.includes(ext ?? '')) {
      coclPreviewInfo.value = parseCoclInfo(content, file.name)
    } else {
      // Parse basic XMI info
      previewInfo.value = parseXmiInfo(content, file.name)

      // Check if this XMI is a workspace (has EditorConfig root element)
      if (XMI_LIKE_EXTENSIONS.includes(ext ?? '')) {
        isXmiWorkspace.value = isEditorConfigXmi(content)
      } else {
        // .wsp and .workspace are always workspaces
        isXmiWorkspace.value = true
      }
    }
  } catch (e: any) {
    error.value = `Failed to load file: ${e.message}`
    fileContent.value = null
    previewInfo.value = null
    coclPreviewInfo.value = null
  } finally {
    loading.value = false
  }
}, { immediate: true })

/**
 * Check if XMI content is a workspace file (EditorConfig root)
 * Workspace files have EditorConfig as root element or fennecui namespace
 */
function isEditorConfigXmi(content: string): boolean {
  // Check for EditorConfig root element
  if (content.includes('<EditorConfig') || content.includes(':EditorConfig')) {
    return true
  }
  // Check for fennecui namespace
  if (content.includes('fennec/ts/generic/ui') || content.includes('fennecui')) {
    return true
  }
  return false
}

/**
 * Parse basic info from XMI content
 */
function parseXmiInfo(content: string, fileName: string): { name: string; rootElement: string; elementCount: number } {
  // Simple regex-based parsing for preview
  const rootMatch = content.match(/<([a-zA-Z]+:)?([a-zA-Z]+)[\s>]/)
  const rootElement = rootMatch ? rootMatch[2] : 'Unknown'

  // Count elements (rough estimate)
  const elementMatches = content.match(/<[a-zA-Z]/g)
  const elementCount = elementMatches ? elementMatches.length : 0

  // Try to find name attribute
  const nameMatch = content.match(/name="([^"]+)"/)
  const name = nameMatch ? nameMatch[1] : fileName.replace(/\.[^.]+$/, '')

  return { name, rootElement, elementCount }
}

/**
 * Parse basic info from C-OCL content
 */
function parseCoclInfo(content: string, fileName: string): { name: string; version: string; description: string; constraintCount: number; targetNsURIs: string[] } {
  const nameMatch = content.match(/name="([^"]+)"/)
  const name = nameMatch ? nameMatch[1] : fileName.replace(/\.[^.]+$/, '')

  const versionMatch = content.match(/version="([^"]+)"/)
  const version = versionMatch ? versionMatch[1] : '1.0'

  const descMatch = content.match(/description="([^"]+)"/)
  const description = descMatch ? descMatch[1] : ''

  // Count <constraints elements
  const constraintMatches = content.match(/<constraints\s/g)
  const constraintCount = constraintMatches ? constraintMatches.length : 0

  // Extract targetModelNsURIs
  const targetNsURIs: string[] = []
  const nsUriRegex = /<targetModelNsURIs>([^<]+)<\/targetModelNsURIs>/g
  let match
  while ((match = nsUriRegex.exec(content)) !== null) {
    targetNsURIs.push(match[1])
  }

  return { name, version, description, constraintCount, targetNsURIs }
}

/**
 * Handle open workspace button
 */
function handleOpenWorkspace() {
  if (selectedFile.value && fileContent.value) {
    getActions()?.openWorkspace(selectedFile.value, fileContent.value)
    // Track as recent workspace
    const source = fileSystem.getSource(selectedFile.value.sourceId)
    addRecentWorkspace({
      name: selectedFile.value.name,
      filePath: selectedFile.value.path,
      sourceId: selectedFile.value.sourceId,
      sourceName: source?.name || ''
    })
  }
}

/**
 * Handle load C-OCL button
 */
function handleLoadCocl() {
  if (selectedFile.value && fileContent.value) {
    getActions()?.loadCoclFile(selectedFile.value, fileContent.value)
  }
}

// Open a recent workspace — restore source if needed
async function handleOpenRecentWorkspace(ws: { name: string; filePath: string; sourceId: string; sourceName: string }) {
  let source = fileSystem.getSource(ws.sourceId)

  if (!source) {
    // Try to restore persisted handles (user gesture from click)
    await fileSystem.restoreLocalSources()
    source = fileSystem.getSource(ws.sourceId)

    if (!source) {
      // Ask user to re-pick the folder
      const newSource = await fileSystem.addLocalSource(ws.sourceName)
      if (!newSource) return
      source = newSource
    }
  }

  const entry = fileSystem.getFileByPath(source.id, ws.filePath)
  if (!entry) {
    console.warn('[WorkspacePreview] Workspace file not found:', ws.filePath)
    return
  }

  try {
    const content = await fileSystem.readTextFile(entry)
    if (content) getActions()?.openWorkspace(entry, content)
  } catch (e) {
    console.error('[WorkspacePreview] Failed to open recent workspace:', e)
  }
}


</script>

<template>
  <div class="workspace-preview">
    <!-- No selection — show recent workspaces -->
    <div v-if="!selectedFile" class="recent-panel">
      <div class="recent-section">
        <div class="recent-header">
          <i class="pi pi-history recent-header-icon"></i>
          <span class="recent-title">Letzte Workspaces</span>
          <button v-if="recentWorkspaces.length > 0" class="recent-clear" @click="clearRecentWorkspaces" title="Liste leeren">
            <i class="pi pi-trash"></i>
          </button>
        </div>

        <template v-if="recentWorkspaces.length > 0">
          <div
            v-for="ws in recentWorkspaces"
            :key="ws.filePath + ws.sourceId"
            class="recent-item"
            @click="handleOpenRecentWorkspace(ws)"
          >
            <div class="recent-item-badge">
              <i class="pi pi-cog"></i>
            </div>
            <div class="recent-item-info">
              <span class="recent-item-name">{{ ws.name.replace(/\.wsp$/, '') }}</span>
              <span class="recent-item-path">
                <i class="pi pi-folder"></i>
                {{ ws.sourceName }}
              </span>
            </div>
            <button class="recent-item-remove" @click.stop="removeRecentWorkspace(ws.filePath, ws.sourceId)" title="Entfernen">
              <i class="pi pi-times"></i>
            </button>
          </div>
        </template>

        <div v-else class="recent-empty">
          <div class="recent-empty-icon">
            <i class="pi pi-folder-open"></i>
          </div>
          <p>Noch keine Workspaces geoeffnet</p>
          <p class="hint">Oeffne einen Ordner und doppelklicke eine .wsp Datei</p>
        </div>
      </div>
    </div>

    <!-- Directory selected -->
    <div v-else-if="selectedFile.isDirectory" class="empty-state">
      <i class="pi pi-folder"></i>
      <p>{{ selectedFile.name }}</p>
      <p class="hint">Folder selected</p>
    </div>

    <!-- Loading -->
    <div v-else-if="loading" class="loading-state">
      <i class="pi pi-spin pi-spinner"></i>
      <span>Loading preview...</span>
    </div>

    <!-- Error -->
    <Message v-else-if="error" severity="error" :closable="false">
      {{ error }}
    </Message>

    <!-- C-OCL Constraint File Preview -->
    <div v-else-if="isCoclFile && coclPreviewInfo" class="preview-content">
      <Card>
        <template #title>
          <div class="preview-header">
            <i class="pi pi-check-square"></i>
            <span>{{ coclPreviewInfo.name }}</span>
          </div>
        </template>
        <template #subtitle>
          {{ selectedFile.name }}
        </template>
        <template #content>
          <div class="preview-details">
            <div class="detail-row">
              <span class="detail-label">Version:</span>
              <span class="detail-value">{{ coclPreviewInfo.version }}</span>
            </div>
            <div class="detail-row" v-if="coclPreviewInfo.description">
              <span class="detail-label">Description:</span>
              <span class="detail-value">{{ coclPreviewInfo.description }}</span>
            </div>
            <div class="detail-row">
              <span class="detail-label">Constraints:</span>
              <span class="detail-value">{{ coclPreviewInfo.constraintCount }}</span>
            </div>
            <div class="detail-row" v-if="coclPreviewInfo.targetNsURIs.length > 0">
              <span class="detail-label">Target Models:</span>
              <span class="detail-value path">{{ coclPreviewInfo.targetNsURIs.join(', ') }}</span>
            </div>
            <div class="detail-row">
              <span class="detail-label">Path:</span>
              <span class="detail-value path">{{ selectedFile.path }}</span>
            </div>
          </div>
        </template>
        <template #footer>
          <Button
            label="Load in Editor"
            icon="pi pi-check-square"
            @click="handleLoadCocl"
          />
        </template>
      </Card>

      <!-- XMI Preview -->
      <div class="xmi-preview">
        <div class="preview-label">Preview</div>
        <pre class="xmi-content">{{ fileContent?.substring(0, 1000) }}{{ fileContent && fileContent.length > 1000 ? '...' : '' }}</pre>
      </div>
    </div>

    <!-- Non-workspace file (checked after loading to allow content inspection) -->
    <div v-else-if="!isWorkspaceFile && !isXmiFile && !isCoclFile" class="empty-state">
      <i class="pi pi-file"></i>
      <p>{{ selectedFile.name }}</p>
      <p class="hint">Not a workspace file</p>
    </div>

    <!-- XMI Instance Data Preview (uses XmiViewer component) -->
    <div v-else-if="isXmiFile && !isWorkspaceFile && fileContent" class="xmi-file-preview">
      <component
        v-if="XmiViewer"
        :is="XmiViewer"
        :content="fileContent"
        :file-name="selectedFile.name"
      />
      <div v-else class="xmi-fallback-preview">
        <div class="preview-label">{{ selectedFile.name }}</div>
        <pre class="xmi-content">{{ fileContent.substring(0, 2000) }}{{ fileContent.length > 2000 ? '\n...' : '' }}</pre>
      </div>
    </div>

    <!-- Workspace preview -->
    <div v-else-if="previewInfo" class="preview-content">
      <Card>
        <template #title>
          <div class="preview-header">
            <i class="pi pi-box"></i>
            <span>{{ previewInfo.name }}</span>
          </div>
        </template>
        <template #subtitle>
          {{ selectedFile.name }}
        </template>
        <template #content>
          <div class="preview-details">
            <div class="detail-row">
              <span class="detail-label">Root Element:</span>
              <span class="detail-value">{{ previewInfo.rootElement }}</span>
            </div>
            <div class="detail-row">
              <span class="detail-label">Elements:</span>
              <span class="detail-value">~{{ previewInfo.elementCount }}</span>
            </div>
            <div class="detail-row">
              <span class="detail-label">Path:</span>
              <span class="detail-value path">{{ selectedFile.path }}</span>
            </div>
          </div>
        </template>
        <template #footer>
          <Button
            label="Open Workspace"
            icon="pi pi-external-link"
            @click="handleOpenWorkspace"
          />
        </template>
      </Card>

      <!-- XMI Preview -->
      <div class="xmi-preview">
        <div class="preview-label">Preview</div>
        <pre class="xmi-content">{{ fileContent?.substring(0, 1000) }}{{ fileContent && fileContent.length > 1000 ? '...' : '' }}</pre>
      </div>
    </div>
  </div>
</template>

<style scoped>
.workspace-preview {
  display: flex;
  flex-direction: column;
  height: 100%;
  padding: 1rem;
  background: var(--surface-ground);
  overflow: auto;
}

.empty-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  height: 100%;
  text-align: center;
  color: var(--text-color-secondary);
}

.empty-state i {
  font-size: 4rem;
  margin-bottom: 1rem;
  opacity: 0.3;
}

.empty-state p {
  margin: 0.25rem 0;
}

.empty-state .hint {
  font-size: 0.875rem;
  opacity: 0.7;
}

.loading-state {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 0.5rem;
  height: 100%;
  color: var(--text-color-secondary);
}

.preview-content {
  display: flex;
  flex-direction: column;
  gap: 1rem;
}

.preview-header {
  display: flex;
  align-items: center;
  gap: 0.5rem;
}

.preview-header i {
  color: var(--primary-color);
}

.preview-details {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
}

.detail-row {
  display: flex;
  gap: 0.5rem;
}

.detail-label {
  font-weight: 500;
  color: var(--text-color-secondary);
  min-width: 100px;
}

.detail-value {
  color: var(--text-color);
}

.detail-value.path {
  font-family: monospace;
  font-size: 0.875rem;
  word-break: break-all;
}

.xmi-preview {
  background: var(--surface-card);
  border-radius: var(--border-radius);
  border: 1px solid var(--surface-border);
  overflow: hidden;
}

.preview-label {
  padding: 0.5rem 1rem;
  font-size: 0.75rem;
  font-weight: 600;
  text-transform: uppercase;
  color: var(--text-color-secondary);
  background: var(--surface-100);
  border-bottom: 1px solid var(--surface-border);
}

.xmi-content {
  margin: 0;
  padding: 1rem;
  font-family: monospace;
  font-size: 0.75rem;
  line-height: 1.5;
  white-space: pre-wrap;
  word-break: break-all;
  max-height: 300px;
  overflow: auto;
  color: var(--text-color-secondary);
}

/* XMI Instance File Preview container */
.xmi-file-preview {
  display: flex;
  flex-direction: column;
  height: 100%;
}
/* Recent Workspaces Panel */
.recent-panel {
  display: flex;
  align-items: flex-start;
  justify-content: center;
  height: 100%;
  padding-top: 10%;
}

.recent-section {
  width: 100%;
  max-width: 380px;
  background: var(--surface-card, var(--surface-ground));
  border: 1px solid var(--surface-border);
  border-radius: 10px;
  padding: 1.25rem;
}

.recent-header {
  display: flex;
  align-items: center;
  gap: 6px;
  margin-bottom: 0.75rem;
  padding-bottom: 0.6rem;
  border-bottom: 1px solid var(--surface-border);
}

.recent-header-icon {
  font-size: 0.8rem;
  color: var(--primary-color);
}

.recent-title {
  font-size: 0.78rem;
  font-weight: 600;
  letter-spacing: 0.02em;
  color: var(--text-color);
  flex: 1;
}

.recent-clear {
  background: none;
  border: none;
  color: var(--text-color-secondary);
  cursor: pointer;
  font-size: 0.65rem;
  padding: 3px 5px;
  border-radius: 4px;
  opacity: 0;
  transition: all 0.15s;
}

.recent-section:hover .recent-clear {
  opacity: 0.35;
}

.recent-clear:hover {
  opacity: 1 !important;
  background: var(--surface-hover);
  color: var(--red-400);
}

.recent-item {
  display: flex;
  align-items: center;
  gap: 0.65rem;
  padding: 0.5rem 0.55rem;
  border-radius: 7px;
  cursor: pointer;
  transition: all 0.15s;
  margin-bottom: 2px;
}

.recent-item:hover {
  background: color-mix(in srgb, var(--primary-color) 8%, transparent);
}

.recent-item-badge {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 32px;
  height: 32px;
  border-radius: 7px;
  background: color-mix(in srgb, var(--primary-color) 12%, transparent);
  color: var(--primary-color);
  font-size: 0.85rem;
  flex-shrink: 0;
}

.recent-item-info {
  display: flex;
  flex-direction: column;
  gap: 2px;
  flex: 1;
  min-width: 0;
}

.recent-item-name {
  font-size: 0.85rem;
  font-weight: 600;
  color: var(--text-color);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.recent-item-path {
  display: flex;
  align-items: center;
  gap: 3px;
  font-size: 0.7rem;
  color: var(--text-color-secondary);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.recent-item-path i {
  font-size: 0.6rem;
  opacity: 0.6;
}

.recent-item-remove {
  background: none;
  border: none;
  color: var(--text-color-secondary);
  cursor: pointer;
  font-size: 0.6rem;
  padding: 4px;
  border-radius: 4px;
  opacity: 0;
  transition: all 0.15s;
}

.recent-item:hover .recent-item-remove {
  opacity: 0.35;
}

.recent-item-remove:hover {
  opacity: 1 !important;
  background: var(--surface-hover);
  color: var(--red-400);
}

.recent-empty {
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: 1.5rem 1rem;
  color: var(--text-color-secondary);
  text-align: center;
}

.recent-empty-icon {
  width: 48px;
  height: 48px;
  border-radius: 12px;
  background: color-mix(in srgb, var(--primary-color) 8%, transparent);
  display: flex;
  align-items: center;
  justify-content: center;
  margin-bottom: 0.75rem;
}

.recent-empty-icon i {
  font-size: 1.3rem;
  color: var(--primary-color);
  opacity: 0.5;
}

.recent-empty p {
  margin: 0;
  font-size: 0.82rem;
}

.recent-empty .hint {
  font-size: 0.72rem;
  opacity: 0.5;
  margin-top: 0.2rem;
}
</style>
