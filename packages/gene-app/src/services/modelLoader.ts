/**
 * Model Loader Service
 *
 * Handles loading of Ecore models (.ecore files) from the file system.
 * Registers loaded packages with the Problems service for OCL validation.
 */

import { getGlobalEditorConfig } from '@/services/useEditorConfig'

export interface ModelLoaderOptions {
  /** File system service */
  fileSystem: any
  /** Model browser composables for loading .ecore files */
  modelBrowserComposables: {
    loadEcoreFile: (content: string, path: string) => Promise<any>
  }
  /** Problems service for OCL registration */
  problemsService: {
    registerPackage: (pkg: any) => Promise<void>
  }
}

export interface LoadModelsResult {
  loaded: string[]
  failed: Array<{ path: string; error: string }>
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
 * Load all models from EditorConfig
 *
 * Reads model sources from EditorConfig and loads each .ecore file,
 * registering the packages with the Problems service.
 */
export async function loadModelsFromEditorConfig(
  workspaceEntry: { sourceId: string; path: string },
  options: ModelLoaderOptions
): Promise<LoadModelsResult> {
  const result: LoadModelsResult = { loaded: [], failed: [] }

  const editorConfig = getGlobalEditorConfig()
  if (!editorConfig) {
    console.log('[ModelLoader] EditorConfig not available, skipping model loading')
    return result
  }

  const modelSources = editorConfig.modelSources.value
  if (!modelSources || modelSources.length === 0) {
    console.log('[ModelLoader] No model sources in EditorConfig')
    return result
  }

  console.log('[ModelLoader] Loading', modelSources.length, 'model(s) from EditorConfig')

  const { fileSystem, modelBrowserComposables, problemsService } = options
  const sourceId = workspaceEntry.sourceId

  if (!sourceId) {
    console.warn('[ModelLoader] No source ID on workspace entry')
    return result
  }

  for (const source of modelSources) {
    const location = getFeatureValue(source, 'location')
    const enabled = getFeatureValue(source, 'enabled')

    if (!location || enabled === false) {
      console.log('[ModelLoader] Skipping disabled or invalid model source:', location)
      continue
    }

    try {
      console.log('[ModelLoader] Loading model from:', location)

      // Find the file entry by path
      const fileEntry = fileSystem.getFileByPath(sourceId, location)
      if (!fileEntry) {
        console.warn('[ModelLoader] File not found:', location)
        result.failed.push({ path: location, error: 'File not found' })
        continue
      }

      // Read the file content
      const content = await fileSystem.readTextFile(fileEntry)

      // Load the ecore file
      const packageInfo = await modelBrowserComposables.loadEcoreFile(content, location)
      if (packageInfo) {
        console.log('[ModelLoader] Model loaded:', packageInfo.name)

        // Register package with Problems service for constraint validation
        if (packageInfo.ePackage) {
          await problemsService.registerPackage(packageInfo.ePackage)
          console.log('[ModelLoader] Package registered with Problems service:', packageInfo.name)
        }

        result.loaded.push(location)
      }
    } catch (e: any) {
      console.error('[ModelLoader] Failed to load model:', location, e)
      result.failed.push({ path: location, error: e.message || String(e) })
    }
  }

  return result
}

/**
 * Load a single model file
 */
export async function loadModelFile(
  entry: { name: string; path: string },
  content: string,
  options: Pick<ModelLoaderOptions, 'modelBrowserComposables' | 'problemsService'>
): Promise<{ success: boolean; packageInfo?: any; error?: string }> {
  try {
    const packageInfo = await options.modelBrowserComposables.loadEcoreFile(content, entry.path)
    if (packageInfo) {
      console.log('[ModelLoader] Model loaded successfully:', packageInfo.name, packageInfo.nsURI)

      // Register package with Problems service
      if (packageInfo.ePackage) {
        await options.problemsService.registerPackage(packageInfo.ePackage)
        console.log('[ModelLoader] Package registered with Problems service:', packageInfo.name)
      }

      // Add to EditorConfig for persistence
      const editorConfig = getGlobalEditorConfig()
      if (editorConfig) {
        editorConfig.addModelSource(entry.path, packageInfo.name, {
          registerPackages: true,
          enabled: true
        })
        console.log('[ModelLoader] Model source added to EditorConfig:', entry.path)
      }

      return { success: true, packageInfo }
    } else {
      return { success: false, error: 'Failed to load model - no package info returned' }
    }
  } catch (e: any) {
    console.error('[ModelLoader] Failed to load model:', e)
    return { success: false, error: e.message || String(e) }
  }
}
