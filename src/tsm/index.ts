/**
 * TSM Integration for Gene
 *
 * Integrates TSM (TypeScript Module System) for dynamic plugin discovery
 * and ES module loading with lifecycle management.
 */

import {
  PluginRegistry,
  ModuleLoader,
  DependencyResolver,
  DefaultServiceRegistry,
  type ModuleManifest,
  type PluginRepository,
  type DiscoveredModule,
  type ServiceRegistry,
  type ModuleLogger
} from '@eclipse-daanse/tsm'

export interface TsmPluginSystemOptions {
  /** Plugin repositories to register */
  repositories?: PluginRepository[]
  /** Auto-discover plugins on init */
  autoDiscover?: boolean
  /** Logger for debug output */
  logger?: Console
}

/**
 * TSM Plugin System for Gene
 *
 * Provides:
 * - Plugin discovery from remote repositories
 * - Dependency resolution with semver support
 * - Module lifecycle management (activate/deactivate)
 * - Service registry for dependency injection
 */
export class TsmPluginSystem {
  private registry: PluginRegistry
  private loader: ModuleLoader
  private resolver: DependencyResolver
  private services: ServiceRegistry
  private logger: Console
  private initialized = false

  constructor(options: TsmPluginSystemOptions = {}) {
    this.logger = options.logger ?? console
    this.services = new DefaultServiceRegistry()

    const registryLogger: ModuleLogger = {
      debug: (msg: string, ...args: unknown[]) => this.logger.debug('[TSM Registry]', msg, ...args),
      info: (msg: string, ...args: unknown[]) => this.logger.info('[TSM Registry]', msg, ...args),
      warn: (msg: string, ...args: unknown[]) => this.logger.warn('[TSM Registry]', msg, ...args),
      error: (msg: string, ...args: unknown[]) => this.logger.error('[TSM Registry]', msg, ...args)
    }

    const loaderLogger: ModuleLogger = {
      debug: (msg: string, ...args: unknown[]) => this.logger.debug('[TSM Loader]', msg, ...args),
      info: (msg: string, ...args: unknown[]) => this.logger.info('[TSM Loader]', msg, ...args),
      warn: (msg: string, ...args: unknown[]) => this.logger.warn('[TSM Loader]', msg, ...args),
      error: (msg: string, ...args: unknown[]) => this.logger.error('[TSM Loader]', msg, ...args)
    }

    this.registry = new PluginRegistry({
      logger: registryLogger
    })

    this.loader = new ModuleLoader({
      serviceRegistry: this.services,
      logger: loaderLogger
    })

    this.resolver = new DependencyResolver()

    // Register default repositories
    if (options.repositories) {
      for (const repo of options.repositories) {
        this.registry.addRepository(repo)
      }
    }
  }

  /**
   * Initialize the plugin system
   */
  async init(autoDiscover = true): Promise<void> {
    if (this.initialized) return

    this.logger.info('[TSM] Initializing plugin system...')

    if (autoDiscover) {
      await this.discoverPlugins()
    }

    this.initialized = true
    this.logger.info('[TSM] Plugin system initialized')
  }

  /**
   * Add a plugin repository
   */
  addRepository(repo: PluginRepository): void {
    this.registry.addRepository(repo)
  }

  /**
   * Discover all plugins from registered repositories
   */
  async discoverPlugins(): Promise<DiscoveredModule[]> {
    this.logger.info('[TSM] Discovering plugins...')
    const discovered = await this.registry.discoverAll()
    this.logger.info(`[TSM] Discovered ${discovered.length} plugins`)
    return discovered
  }

  /**
   * Get all discovered plugin manifests
   */
  getManifests(): ModuleManifest[] {
    return this.registry.getManifests()
  }

  /**
   * Resolve dependencies and get load order
   */
  resolveDependencies(manifests: ModuleManifest[]): ModuleManifest[] {
    const result = this.resolver.resolve(manifests)

    if (result.versionConflicts.length > 0) {
      for (const conflict of result.versionConflicts) {
        this.logger.warn(`[TSM] Version conflict for ${conflict.moduleId}:`, conflict)
      }
    }

    if (result.missing.length > 0) {
      for (const missing of result.missing) {
        this.logger.error(`[TSM] Missing dependency: ${missing.missingDep} required by ${missing.moduleId}`)
      }
    }

    return result.loadOrder
  }

  /**
   * Load a single plugin by manifest
   */
  async loadPlugin(manifest: ModuleManifest): Promise<void> {
    this.logger.info(`[TSM] Loading plugin: ${manifest.id} v${manifest.version}`)
    await this.loader.loadModule(manifest)
  }

  /**
   * Load multiple plugins in dependency order
   */
  async loadPlugins(manifests: ModuleManifest[]): Promise<void> {
    const loadOrder = this.resolveDependencies(manifests)

    this.logger.info(`[TSM] Loading ${loadOrder.length} plugins in order:`,
      loadOrder.map(m => m.id).join(' -> '))

    // Register all manifests first so dependencies can be resolved
    this.loader.register(loadOrder)

    // Load in dependency order
    for (const manifest of loadOrder) {
      await this.loadPlugin(manifest)
    }

    this.logger.info(`[TSM] All plugins loaded`)
  }

  /**
   * Load all discovered plugins
   */
  async loadAllDiscovered(): Promise<void> {
    const manifests = this.getManifests()
    await this.loadPlugins(manifests)
  }

  /**
   * Load specific modules by ID (with dependency resolution)
   */
  async loadModules(moduleIds: string[]): Promise<void> {
    const allManifests = this.getManifests()
    const manifestMap = new Map(allManifests.map(m => [m.id, m]))

    // Collect requested manifests and their dependencies
    const toLoad: ModuleManifest[] = []
    const visited = new Set<string>()

    const collectWithDeps = (id: string) => {
      if (visited.has(id)) return
      visited.add(id)

      const manifest = manifestMap.get(id)
      if (!manifest) {
        this.logger.warn(`[TSM] Module not found: ${id}`)
        return
      }

      // First collect dependencies
      if (manifest.dependencies) {
        for (const dep of manifest.dependencies) {
          // Dependency can be string or { id, versionRange }
          const depId = typeof dep === 'string' ? dep : dep.id
          collectWithDeps(depId)
        }
      }

      toLoad.push(manifest)
    }

    for (const id of moduleIds) {
      collectWithDeps(id)
    }

    if (toLoad.length > 0) {
      await this.loadPlugins(toLoad)
    }
  }

  /**
   * Unload a plugin
   */
  async unloadPlugin(moduleId: string): Promise<boolean> {
    this.logger.info(`[TSM] Unloading plugin: ${moduleId}`)
    return await this.loader.unloadModule(moduleId)
  }

  /**
   * Get a service from the registry
   */
  getService<T>(serviceId: string): T | undefined {
    return this.services.get<T>(serviceId)
  }

  /**
   * Register a service
   */
  registerService<T>(serviceId: string, service: T): void {
    this.services.register(serviceId, service)
  }

  /**
   * Get loaded module IDs
   */
  getLoadedModuleIds(): string[] {
    return this.loader.getLoadedModuleIds()
  }

  /**
   * Check if a module is loaded
   */
  isLoaded(moduleId: string): boolean {
    return this.loader.isLoaded(moduleId)
  }

  /**
   * Synchronously require a loaded module's exports
   * Used by the tsm: import transform plugin
   *
   * @param moduleId - The module ID to require
   * @param namespace - Optional namespace (e.g., 'vue' for 'tsm:gene-app/vue')
   * @throws Error if module is not loaded
   *
   * @example
   * // Direct module import
   * const mod = tsm.require('my-module')
   *
   * // Namespaced library import
   * const { ref, computed } = tsm.require('gene-app', 'vue')
   */
  require<T = unknown>(moduleId: string, namespace?: string): T {
    const module = this.loader.getModule(moduleId)
    if (!module) {
      throw new Error(`[TSM] Module '${moduleId}' is not loaded. Make sure it's listed in dependencies.`)
    }
    if (!module.container) {
      throw new Error(`[TSM] Module '${moduleId}' has no exports container.`)
    }

    const container = module.container as Record<string, unknown>

    // If namespace provided, return that specific export
    if (namespace) {
      const lib = container[namespace]
      if (!lib) {
        throw new Error(`[TSM] Module '${moduleId}' has no namespace '${namespace}'. Available: ${Object.keys(container).join(', ')}`)
      }
      return lib as T
    }

    // Return the full module
    return container as T
  }

  /**
   * Get the underlying components for advanced usage
   */
  getRegistry(): PluginRegistry {
    return this.registry
  }

  getLoader(): ModuleLoader {
    return this.loader
  }

  getResolver(): DependencyResolver {
    return this.resolver
  }

  getServiceRegistry(): ServiceRegistry {
    return this.services
  }

  /**
   * Add event listeners
   */
  onModuleEvent(listener: Parameters<typeof this.loader.addEventListener>[0]): void {
    this.loader.addEventListener(listener)
  }

  onRegistryEvent(listener: Parameters<typeof this.registry.addEventListener>[0]): void {
    this.registry.addEventListener(listener)
  }
}

// Singleton instance
let instance: TsmPluginSystem | null = null

/**
 * Get or create the TSM plugin system instance
 */
export function getTsmPluginSystem(options?: TsmPluginSystemOptions): TsmPluginSystem {
  if (!instance) {
    instance = new TsmPluginSystem(options)
  }
  return instance
}

/**
 * Reset the singleton (for testing)
 */
export function resetTsmPluginSystem(): void {
  instance = null
}

// Re-export types from TSM
export type {
  ModuleManifest,
  PluginRepository,
  DiscoveredModule,
  ModuleContext,
  ServiceRegistry
} from '@eclipse-daanse/tsm'
