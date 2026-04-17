/**
 * Plugin system types for Module Federation
 */

/**
 * Plugin contribution type
 */
export type PluginContributionType =
  | 'adapter'     // Storage adapter
  | 'view'        // UI view component
  | 'editor'      // Property editor
  | 'service'     // Generic service
  | 'component';  // Vue component

/**
 * Plugin expose configuration
 */
export interface PluginExpose {
  /** Contribution type */
  type: PluginContributionType;
  /** Extension point token (for adapter/service) */
  extensionPoint?: string;
  /** Description */
  description?: string;
}

/**
 * Plugin manifest
 *
 * Each plugin has a manifest.json that describes its capabilities
 */
export interface PluginManifest {
  /** Unique plugin identifier */
  id: string;
  /** Human-readable name */
  name: string;
  /** Version string */
  version: string;
  /** Description */
  description?: string;
  /** URL to the remoteEntry.js file */
  remoteEntry: string;
  /** Exposed modules */
  exposes: Record<string, PluginExpose>;
  /** Required plugins (dependencies) */
  dependencies?: string[];
  /** Plugin author */
  author?: string;
  /** License */
  license?: string;
}

/**
 * Loaded plugin info
 */
export interface LoadedPlugin {
  /** Plugin manifest */
  manifest: PluginManifest;
  /** Remote module container */
  container: unknown;
  /** Loaded modules */
  modules: Map<string, unknown>;
  /** Load timestamp */
  loadedAt: Date;
}

/**
 * Plugin loader options
 */
export interface PluginLoaderOptions {
  /** Base URL for relative remote entries */
  baseUrl?: string;
  /** Timeout for loading remotes (ms) */
  timeout?: number;
  /** Whether to auto-register contributions */
  autoRegister?: boolean;
}

/**
 * Plugin load event
 */
export interface PluginLoadEvent {
  /** Plugin manifest */
  manifest: PluginManifest;
  /** Event type */
  type: 'loading' | 'loaded' | 'error' | 'unloaded';
  /** Error if type is 'error' */
  error?: Error;
}

/**
 * Plugin load listener
 */
export interface PluginLoadListener {
  onPluginLoad?: (event: PluginLoadEvent) => void;
}
