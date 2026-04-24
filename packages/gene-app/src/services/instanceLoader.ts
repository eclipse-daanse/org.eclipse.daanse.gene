/**
 * Instance Loader Service
 *
 * Handles loading of XMI instance files.
 * Parses XMI errors and reports them to the Problems service.
 */

import { getGlobalEditorConfig } from '@/services/useEditorConfig'

export interface InstanceLoaderOptions {
  /** File system service */
  fileSystem: any
  /** Instance tree composables for loading XMI */
  instanceTreeComposables: {
    loadInstancesFromXMI: (content: string, path: string) => Promise<void>
    useSharedInstanceTree: () => any
  }
  /** Problems service for error reporting */
  problemsService: {
    addIssue: (issue: any) => void
    addIssues: (issues: any[]) => void
    clearIssuesForFile: (filePath: string) => void
  }
  /** Layout state service (optional, to show panel on errors) */
  layoutStateService?: {
    useLayoutState: () => {
      setPanelAreaVisible: (visible: boolean) => void
    }
  }
}

export interface LoadInstancesResult {
  loaded: string[]
  failed: Array<{ path: string; errors: XMIParseError[] }>
}

export interface XMIParseError {
  message: string
  line?: number
  column?: number
}

/**
 * Helper to get feature value from EObject
 */
function getFeatureValue(obj: any, featureName: string): any {
  if (obj[featureName] !== undefined) return obj[featureName]
  if (typeof obj.eGet === 'function') {
    const eClass = obj.eClass()
    const feature = eClass?.getEStructuralFeature(featureName)
    if (feature) return obj.eGet(feature)
  }
  return undefined
}

/**
 * Parse XMI error message to extract line/column information
 *
 * Typical format: "[Line X, Col Y] message"
 */
export function parseXMIError(errorMsg: string): XMIParseError[] {
  const errors: XMIParseError[] = []
  const lines = errorMsg.split('\n')

  for (const line of lines) {
    const trimmed = line.trim()
    if (!trimmed) continue

    // Parse line/col info: [Line X, Col Y]
    const lineColMatch = trimmed.match(/\[Line\s*(\d+),?\s*Col\s*(\d+)\]\s*(.*)/i)
    if (lineColMatch) {
      errors.push({
        message: lineColMatch[3] || trimmed,
        line: parseInt(lineColMatch[1], 10),
        column: parseInt(lineColMatch[2], 10)
      })
    } else {
      // No line/col info, add as general error
      errors.push({ message: trimmed })
    }
  }

  return errors
}

/**
 * Report XMI parse errors to the Problems service
 */
export function reportXMIErrors(
  filePath: string,
  errors: XMIParseError[],
  problemsService: InstanceLoaderOptions['problemsService']
): void {
  const fileName = filePath.split('/').pop() || filePath

  const issues = errors.map(error => ({
    severity: 'error' as const,
    message: error.message,
    source: 'xmi-parser' as const,
    objectLabel: fileName,
    eClassName: 'XMI Parser',
    filePath,
    line: error.line,
    column: error.column
  }))

  problemsService.addIssues(issues)
}

/**
 * Load all instances from EditorConfig
 */
export async function loadInstancesFromEditorConfig(
  workspaceEntry: { sourceId: string; path: string },
  options: InstanceLoaderOptions
): Promise<LoadInstancesResult> {
  const result: LoadInstancesResult = { loaded: [], failed: [] }

  const editorConfig = getGlobalEditorConfig()
  if (!editorConfig) {
    console.log('[InstanceLoader] EditorConfig not available, skipping instance loading')
    return result
  }

  const instanceSources = editorConfig.instanceSources?.value
  if (!instanceSources || instanceSources.length === 0) {
    console.log('[InstanceLoader] No instance sources in EditorConfig')
    return result
  }

  console.log('[InstanceLoader] Loading', instanceSources.length, 'instance file(s) from EditorConfig')

  const { fileSystem, instanceTreeComposables, problemsService } = options
  const sourceId = workspaceEntry.sourceId

  if (!sourceId) {
    console.warn('[InstanceLoader] No source ID on workspace entry')
    return result
  }

  // Get workspace parent path for resolving relative paths
  const workspacePath = workspaceEntry.path
  const lastSlash = workspacePath?.lastIndexOf('/')
  const workspaceParentPath = lastSlash > 0 ? workspacePath.substring(0, lastSlash) : ''

  for (const source of instanceSources) {
    const location = getFeatureValue(source, 'location') || getFeatureValue(source, 'path')
    const enabled = getFeatureValue(source, 'enabled')

    if (!location || enabled === false) {
      console.log('[InstanceLoader] Skipping disabled or invalid instance source:', location)
      continue
    }

    // Resolve relative path to absolute path
    const absolutePath = location.startsWith('/')
      ? location
      : workspaceParentPath
        ? `${workspaceParentPath}/${location}`
        : location

    // Clear previous errors for this file
    problemsService.clearIssuesForFile(location)

    try {
      console.log('[InstanceLoader] Loading instances from:', location, '-> resolved to:', absolutePath)

      // Find the file entry by path
      let fileEntry = fileSystem.getFileByPath(sourceId, absolutePath)

      // Fallback: if not found and path has directory component, try just the filename
      if (!fileEntry && absolutePath.includes('/')) {
        const filename = absolutePath.split('/').pop()
        fileEntry = fileSystem.getFileByPath(sourceId, filename!)
      }

      if (!fileEntry) {
        console.warn('[InstanceLoader] Instance file not found:', absolutePath)
        result.failed.push({
          path: location,
          errors: [{ message: `File not found: ${absolutePath}` }]
        })
        continue
      }

      // Read the file content
      const content = await fileSystem.readTextFile(fileEntry)

      // Load the XMI file into the instance tree
      await instanceTreeComposables.loadInstancesFromXMI(content, location)
      console.log('[InstanceLoader] Instances loaded from:', location)
      result.loaded.push(location)
    } catch (e: any) {
      console.error('[InstanceLoader] XMI parsing error:', location, e)

      const errorMsg = e.message || String(e)
      const errors = parseXMIError(errorMsg)

      reportXMIErrors(location, errors, problemsService)
      result.failed.push({ path: location, errors })
    }
  }

  return result
}

/**
 * Load a single instance file
 */
export async function loadInstanceFile(
  entry: { name: string; path: string },
  content: string,
  options: Pick<InstanceLoaderOptions, 'instanceTreeComposables' | 'problemsService' | 'layoutStateService'>
): Promise<{ success: boolean; errors?: XMIParseError[] }> {
  const { instanceTreeComposables, problemsService, layoutStateService } = options

  // Clear previous errors for this file
  problemsService.clearIssuesForFile(entry.path)

  try {
    console.log('[InstanceLoader] Loading instances from:', entry.name)
    await instanceTreeComposables.loadInstancesFromXMI(content, entry.path)
    console.log('[InstanceLoader] Instances loaded from:', entry.name)

    // Check instance tree state after loading
    const tree = instanceTreeComposables.useSharedInstanceTree()
    console.log('[InstanceLoader] Instance tree after load - treeNodes:', tree.treeNodes.value?.length)

    // Add to EditorConfig for persistence
    const editorConfig = getGlobalEditorConfig()
    if (editorConfig) {
      editorConfig.addInstanceSource(entry.path, entry.name, { enabled: true })
      console.log('[InstanceLoader] Instance source added to EditorConfig:', entry.path)
    }

    return { success: true }
  } catch (e: any) {
    console.error('[InstanceLoader] Failed to add instances:', e)

    const errorMsg = e.message || String(e)
    const errors = parseXMIError(errorMsg)

    reportXMIErrors(entry.path, errors, problemsService)
    console.log('[InstanceLoader] Added', errors.length, 'XMI parser error(s) to Problems panel')

    // Show the panel area to make errors visible
    if (layoutStateService) {
      const layout = layoutStateService.useLayoutState()
      layout.setPanelAreaVisible(true)
    }

    return { success: false, errors }
  }
}
