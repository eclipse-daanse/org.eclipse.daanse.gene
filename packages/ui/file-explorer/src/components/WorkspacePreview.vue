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
import { XmiViewer, useFileViewerRegistry, registerXmiViewer } from 'ui-xmi-viewer'

const fileSystem = useSharedFileSystem()

// TSM for service access
const tsm = inject<any>('tsm')

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

// Register XMI viewer on first use
registerXmiViewer()

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

</script>

<template>
  <div class="workspace-preview">
    <!-- No selection -->
    <div v-if="!selectedFile" class="empty-state">
      <i class="pi pi-file"></i>
      <p>Select a file to preview</p>
      <p class="hint">Select a .wsp file to open as workspace</p>
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
      <XmiViewer
        :content="fileContent"
        :file-name="selectedFile.name"
      />
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
</style>
