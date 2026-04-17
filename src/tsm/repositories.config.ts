/**
 * TSM Plugin Repository Configuration
 *
 * Define plugin repositories for TSM-based plugin discovery.
 * Each repository should serve an index.json listing available modules.
 */

import type { PluginRepository } from '@eclipse-daanse/tsm'

/**
 * Plugin repositories
 *
 * Repository Structure:
 * ```
 * https://plugins.example.com/
 * ├── index.json           # { "modules": ["module-a", "module-b"] }
 * ├── module-a/
 * │   ├── manifest.json    # ModuleManifest
 * │   └── module.js        # ES module entry point
 * └── module-b/
 *     ├── manifest.json
 *     └── module.js
 * ```
 */
export const repositories: PluginRepository[] = [
  // Local development server (served by gene's vite dev server)
  {
    id: 'local',
    name: 'Local Plugins',
    url: '/plugins',
    enabled: true,
    priority: 10
  }
]

/**
 * TSM Plugin system configuration
 */
export const tsmConfig = {
  /**
   * Enable TSM plugin system
   */
  enabled: true,

  /**
   * Auto-discover plugins on app start
   */
  autoDiscover: true,

  /**
   * Auto-load all discovered plugins (false = manual loading)
   */
  autoLoad: false,

  /**
   * Continue loading if a plugin fails
   */
  continueOnError: true
}

/**
 * Modules to load at startup
 * Dependencies are resolved automatically
 */
export const startupModules = [
  'storage-indexeddb',  // Browser storage adapter
  'storage-git',        // Git storage adapter
  'storage-model-atlas', // Model Atlas remote storage adapter
  'gene-app',           // Main application
  'ui-layout',          // VS Code-like layout system
  'ui-actions',         // Action system (registry, executors, events)
  'ui-perspectives',    // Perspective management (file-explorer vs model-editor)
  'ui-file-explorer',   // Local file system browser
  'ui-model-browser',   // EPackage/EClass browser
  'ui-instance-tree',   // EMF instance tree editor
  'ui-properties-panel', // Properties panel for editing instances
  'ui-problems-panel',  // OCL validation problems panel
  'ui-workspace',       // Workspace UI (workspace.xmi management)
  'instance-builder',   // EMF instance editor components
  'tsm-devtools',       // Browser console DevTools
  'ui-model-view',      // Model View system (unified editor)
  'metamodeler',        // Ecore metamodel editor
  'transformation',     // Model transformation mapping editor
  'cocl-editor',        // C-OCL constraint editor
  //'dmn-editor',         // DMN Decision Table Editor
  'atlas-browser',       // Model Atlas Browser
  'data-generator'       // Data generator for test data (must load after atlas-browser)
]
