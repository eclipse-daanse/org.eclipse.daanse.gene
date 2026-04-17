
/**
 * Plugin Configuration
 *
 * Define plugins to be loaded via Module Federation.
 * Each plugin needs a running remote server (npm run preview in the plugin package).
 */

import type { PluginManifest } from 'gene-core'

/**
 * Registered plugins
 * Add new plugins here to have them loaded automatically
 */
export const plugins: PluginManifest[] = [
  {
    id: 'storage-indexeddb',
    name: 'IndexedDB Storage',
    version: '0.0.1',
    description: 'Browser-local storage using IndexedDB',
    remoteEntry: 'http://localhost:5001/assets/remoteEntry.js',
    exposes: {
      './adapter': {
        type: 'adapter',
        description: 'IndexedDB storage adapter'
      }
    }
  },
  // Add more plugins here:
  // {
  //   id: 'storage-git',
  //   name: 'Git Storage',
  //   version: '0.0.1',
  //   remoteEntry: 'http://localhost:5002/assets/remoteEntry.js',
  //   exposes: {
  //     './adapter': { type: 'adapter' }
  //   }
  // },
]

/**
 * Plugin loading mode
 */
export const config = {
  /**
   * Enable dynamic plugin loading via Module Federation
   * DEPRECATED: Use TSM plugin system instead (see src/tsm/repositories.config.ts)
   *
   * Set to false to use TSM or static imports
   */
  useDynamicPlugins: false,

  /**
   * Timeout for loading remote plugins (ms)
   */
  loadTimeout: 10000,

  /**
   * Continue loading other plugins if one fails
   */
  continueOnError: true
}
