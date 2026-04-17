/**
 * TSM Shared Modules Configuration
 *
 * Defines which modules are shared between plugins.
 * Imports of these modules are rewritten to URLs so the browser caches them.
 */

// Shared modules - these are loaded once and shared via browser ES module cache
export const sharedModules = [
  'storage-core',
  'storage-model',
] as const

// Map module names to their plugin URLs
export const sharedModulePaths: Record<string, string> = {
  'storage-core': '/plugins/@storage/core/index.js',
  'storage-model': '/plugins/@storage/model/index.js',
}

// For dev mode - map to source files (Vite transforms them)
export const sharedModulePathsDev: Record<string, string> = {
  'storage-core': '/packages/storage/core/src/index.ts',
  'storage-model': '/packages/storage/model/src/generated/storage/index.ts',
}

/**
 * Get Rollup external config for shared modules
 */
export function getExternals(): string[] {
  return [...sharedModules]
}

/**
 * Get Rollup output.paths config for production builds
 */
export function getOutputPaths(): Record<string, string> {
  return { ...sharedModulePaths }
}
