/**
 * gene-tsm-devtools
 *
 * TSM DevTools - Browser console tools for module management
 * Loaded as a TSM module, installs console commands on window.tsm
 */

import type { ModuleContext, ModuleManifest, LoadedModule, PluginRepository } from '@eclipse-daanse/tsm'

/**
 * DevTools interface exposed on window.tsm
 */
export interface TsmDevTools {
  // Module commands
  modules(): void
  manifest(moduleId: string): ModuleManifest | undefined
  state(moduleId: string): LoadedModule | undefined
  load(moduleId: string): Promise<void>
  unload(moduleId: string): Promise<boolean>
  reload(moduleId: string): Promise<void>

  // Discovery & Resolution
  discover(): Promise<void>
  available(): void
  resolve(): void
  loadAll(): Promise<void>

  // Load queue
  add(moduleId: string): void
  remove(moduleId: string): void
  queue(): void
  clearQueue(): void
  loadQueue(): Promise<void>

  // Repository commands
  repos(): void
  addRepo(repo: PluginRepository): void
  removeRepo(repoId: string): void

  // Service commands
  services(): void
  service(serviceId: string): unknown

  // Help
  help(): void

  // Raw access to TSM system
  raw: TsmSystem
}

/**
 * TSM System interface (subset needed by DevTools)
 */
interface TsmSystem {
  getRegistry(): PluginRegistryLike
  getLoader(): ModuleLoaderLike
  getServiceRegistry(): ServiceRegistryLike
  getResolver(): DependencyResolverLike
  getLoadedModuleIds(): string[]
  loadPlugin(manifest: ModuleManifest): Promise<void>
  loadPlugins(manifests: ModuleManifest[]): Promise<void>
  unloadPlugin(moduleId: string): Promise<boolean>
  discoverPlugins(): Promise<unknown[]>
  addRepository(repo: PluginRepository): void
  resolveDependencies(manifests: ModuleManifest[]): ModuleManifest[]
}

interface DependencyResolverLike {
  resolve(manifests: ModuleManifest[]): DependencyResolution
}

interface DependencyResolution {
  loadOrder: ModuleManifest[]
  circular: string[][]
  missing: Array<{ moduleId: string; missingDep: string }>
  versionConflicts: Array<{ moduleId: string; availableVersion: string }>
}

interface PluginRegistryLike {
  getManifests(): ModuleManifest[]
  getRepositories(): PluginRepository[]
}

interface ModuleLoaderLike {
  getModule(moduleId: string): LoadedModule | undefined
}

interface ServiceRegistryLike {
  getServiceIds(): string[]
  getBindingInfo(id: string): { scope: string; providedBy?: string } | undefined
  get(id: string): unknown
}

// Store devtools instance for cleanup
let devtools: TsmDevTools | null = null

// Load queue - modules selected for loading
const loadQueue = new Set<string>()

/**
 * Create TSM DevTools instance
 */
function createTsmDevTools(tsm: TsmSystem): TsmDevTools {
  const registry = tsm.getRegistry()
  const loader = tsm.getLoader()
  const serviceRegistry = tsm.getServiceRegistry()

  const tools: TsmDevTools = {
    // ========== Module Commands ==========

    modules() {
      const ids = tsm.getLoadedModuleIds()
      if (ids.length === 0) {
        console.log('%c No modules loaded', 'color: gray')
        return
      }

      console.log('%c Loaded Modules:', 'font-weight: bold; font-size: 14px')
      console.log('')

      for (const id of ids) {
        const loaded = loader.getModule(id)
        if (loaded) {
          const stateColor = loaded.state === 'active' ? 'green' :
                            loaded.state === 'error' ? 'red' : 'orange'
          console.log(
            `  %c${id}%c v${loaded.manifest.version} %c[${loaded.state}]`,
            'color: cyan; font-weight: bold',
            'color: gray',
            `color: ${stateColor}`
          )
        }
      }
      console.log('')
      console.log(`%c Total: ${ids.length} module(s)`, 'color: gray')
    },

    manifest(moduleId: string) {
      const manifests = registry.getManifests()
      const manifest = manifests.find(m => m.id === moduleId)
      if (manifest) {
        console.log('%c Manifest for ' + moduleId + ':', 'font-weight: bold')
        console.log(manifest)
        return manifest
      } else {
        console.log('%c Module not found: ' + moduleId, 'color: red')
        return undefined
      }
    },

    state(moduleId: string) {
      const loaded = loader.getModule(moduleId)
      if (loaded) {
        console.log('%c State for ' + moduleId + ':', 'font-weight: bold')
        console.table({
          id: loaded.manifest.id,
          version: loaded.manifest.version,
          state: loaded.state,
          loadedAt: loaded.loadedAt.toISOString(),
          exports: Array.from(loaded.exports.keys()),
          error: loaded.error?.message || null
        })
        return loaded
      } else {
        console.log('%c Module not loaded: ' + moduleId, 'color: red')
        return undefined
      }
    },

    async load(moduleId: string) {
      console.log('%c Loading ' + moduleId + '...', 'color: cyan')
      try {
        const manifests = registry.getManifests()
        const manifest = manifests.find(m => m.id === moduleId)
        if (!manifest) {
          console.log('%c Module not found in registry. Run tsm.discover() first.', 'color: red')
          return
        }
        await tsm.loadPlugin(manifest)
        console.log('%c ✓ Loaded ' + moduleId, 'color: green')
      } catch (error) {
        console.log('%c ✗ Failed to load ' + moduleId, 'color: red')
        console.error(error)
      }
    },

    async unload(moduleId: string) {
      console.log('%c Unloading ' + moduleId + '...', 'color: orange')
      try {
        const result = await tsm.unloadPlugin(moduleId)
        if (result) {
          console.log('%c ✓ Unloaded ' + moduleId, 'color: green')
        } else {
          console.log('%c Module was not loaded: ' + moduleId, 'color: gray')
        }
        return result
      } catch (error) {
        console.log('%c ✗ Failed to unload ' + moduleId, 'color: red')
        console.error(error)
        return false
      }
    },

    async reload(moduleId: string) {
      console.log('%c Reloading ' + moduleId + '...', 'color: cyan')
      await this.unload(moduleId)
      await this.load(moduleId)
    },

    // ========== Discovery ==========

    async discover() {
      console.log('%c Discovering modules...', 'color: cyan')
      try {
        const discovered = await tsm.discoverPlugins()
        console.log('%c ✓ Discovered ' + discovered.length + ' module(s)', 'color: green')
        this.available()
      } catch (error) {
        console.log('%c ✗ Discovery failed', 'color: red')
        console.error(error)
      }
    },

    available() {
      const manifests = registry.getManifests()
      const loadedIds = new Set(tsm.getLoadedModuleIds())

      if (manifests.length === 0) {
        console.log('%c No modules discovered. Run tsm.discover() first.', 'color: gray')
        return
      }

      console.log('%c Available Modules:', 'font-weight: bold; font-size: 14px')
      console.log('')

      for (const m of manifests) {
        const loaded = loadedIds.has(m.id)
        const status = loaded ? '[loaded]' : '[available]'
        const statusColor = loaded ? 'green' : 'gray'
        console.log(
          `  %c${m.id}%c v${m.version} %c${status}`,
          'color: cyan; font-weight: bold',
          'color: gray',
          `color: ${statusColor}`
        )
        if (m.description) {
          console.log(`    %c${m.description}`, 'color: gray; font-style: italic')
        }
      }
      console.log('')
    },

    resolve() {
      const manifests = registry.getManifests()
      if (manifests.length === 0) {
        console.log('%c No modules discovered. Run tsm.discover() first.', 'color: gray')
        return
      }

      const resolver = tsm.getResolver()
      const result = resolver.resolve(manifests)

      console.log('%c Dependency Resolution:', 'font-weight: bold; font-size: 14px')
      console.log('')

      // Show load order
      console.log('%c Load Order:', 'color: cyan; font-weight: bold')
      result.loadOrder.forEach((m, i) => {
        const deps = m.dependencies?.length
          ? ` (requires: ${m.dependencies.map(d => typeof d === 'string' ? d : d.id).join(', ')})`
          : ''
        console.log(`  ${i + 1}. %c${m.id}%c v${m.version}${deps}`, 'color: white; font-weight: bold', 'color: gray')
      })
      console.log('')

      // Show issues
      if (result.circular.length > 0) {
        console.log('%c ⚠ Circular Dependencies:', 'color: orange; font-weight: bold')
        for (const cycle of result.circular) {
          console.log(`    ${cycle.join(' → ')} → ${cycle[0]}`)
        }
        console.log('')
      }

      if (result.missing.length > 0) {
        console.log('%c ✗ Missing Dependencies:', 'color: red; font-weight: bold')
        for (const m of result.missing) {
          console.log(`    ${m.moduleId} requires: ${m.missingDep}`)
        }
        console.log('')
      }

      if (result.versionConflicts.length > 0) {
        console.log('%c ⚠ Version Conflicts:', 'color: orange; font-weight: bold')
        for (const c of result.versionConflicts) {
          console.log(`    ${c.moduleId}: available ${c.availableVersion}`)
        }
        console.log('')
      }

      if (result.circular.length === 0 && result.missing.length === 0) {
        console.log('%c ✓ All dependencies resolved successfully', 'color: green')
      }
    },

    async loadAll() {
      const manifests = registry.getManifests()
      if (manifests.length === 0) {
        console.log('%c No modules discovered. Run tsm.discover() first.', 'color: gray')
        return
      }

      console.log('%c Loading all modules in dependency order...', 'color: cyan')
      try {
        await tsm.loadPlugins(manifests)
        console.log('%c ✓ All modules loaded', 'color: green')
        this.modules()
      } catch (error) {
        console.log('%c ✗ Failed to load all modules', 'color: red')
        console.error(error)
      }
    },

    // ========== Load Queue ==========

    add(moduleId: string) {
      const manifests = registry.getManifests()
      const manifest = manifests.find(m => m.id === moduleId)
      if (!manifest) {
        console.log('%c Module not found: ' + moduleId + '. Run tsm.discover() first.', 'color: red')
        return
      }
      if (loadQueue.has(moduleId)) {
        console.log('%c Module already in queue: ' + moduleId, 'color: gray')
        return
      }
      loadQueue.add(moduleId)
      console.log('%c + Added to queue: ' + moduleId, 'color: green')
      console.log(`%c   Queue: [${Array.from(loadQueue).join(', ')}]`, 'color: gray')
    },

    remove(moduleId: string) {
      if (!loadQueue.has(moduleId)) {
        console.log('%c Module not in queue: ' + moduleId, 'color: gray')
        return
      }
      loadQueue.delete(moduleId)
      console.log('%c - Removed from queue: ' + moduleId, 'color: orange')
      console.log(`%c   Queue: [${Array.from(loadQueue).join(', ') || 'empty'}]`, 'color: gray')
    },

    queue() {
      if (loadQueue.size === 0) {
        console.log('%c Load queue is empty. Use tsm.add("moduleId") to add modules.', 'color: gray')
        return
      }

      console.log('%c Load Queue:', 'font-weight: bold; font-size: 14px')
      console.log('')

      const manifests = registry.getManifests()
      for (const id of loadQueue) {
        const manifest = manifests.find(m => m.id === id)
        if (manifest) {
          console.log(
            `  %c${id}%c v${manifest.version}`,
            'color: cyan; font-weight: bold',
            'color: gray'
          )
        } else {
          console.log(
            `  %c${id}%c (not found!)`,
            'color: red; font-weight: bold',
            'color: red'
          )
        }
      }
      console.log('')
      console.log(`%c Total: ${loadQueue.size} module(s)`, 'color: gray')
    },

    clearQueue() {
      const count = loadQueue.size
      loadQueue.clear()
      console.log('%c Queue cleared (' + count + ' modules removed)', 'color: orange')
    },

    async loadQueue() {
      if (loadQueue.size === 0) {
        console.log('%c Load queue is empty. Use tsm.add("moduleId") to add modules.', 'color: gray')
        return
      }

      const manifests = registry.getManifests()
      const toLoad = manifests.filter(m => loadQueue.has(m.id))

      if (toLoad.length === 0) {
        console.log('%c No valid modules in queue', 'color: red')
        return
      }

      console.log('%c Loading ' + toLoad.length + ' module(s) from queue...', 'color: cyan')
      try {
        await tsm.loadPlugins(toLoad)
        console.log('%c ✓ Queue loaded successfully', 'color: green')
        loadQueue.clear()
        this.modules()
      } catch (error) {
        console.log('%c ✗ Failed to load queue', 'color: red')
        console.error(error)
      }
    },

    // ========== Repository Commands ==========

    repos() {
      const repos = registry.getRepositories()
      if (repos.length === 0) {
        console.log('%c No repositories configured', 'color: gray')
        return
      }

      console.log('%c Repositories:', 'font-weight: bold; font-size: 14px')
      console.log('')

      for (const repo of repos) {
        const enabledStr = repo.enabled !== false ? 'enabled' : 'disabled'
        const color = repo.enabled !== false ? 'green' : 'gray'
        console.log(
          `  %c${repo.id}%c - ${repo.name} %c[${enabledStr}]`,
          'color: cyan; font-weight: bold',
          'color: white',
          `color: ${color}`
        )
        console.log(`    %c${repo.url}`, 'color: gray')
      }
      console.log('')
    },

    addRepo(repo: PluginRepository) {
      console.log('%c Adding repository: ' + repo.id, 'color: cyan')
      tsm.addRepository(repo)
      console.log('%c ✓ Repository added. Run tsm.discover() to fetch modules.', 'color: green')
    },

    removeRepo(repoId: string) {
      console.log('%c Removing repository: ' + repoId, 'color: orange')
      // Note: PluginRegistry has removeRepository
      const reg = registry as { removeRepository?: (id: string) => boolean }
      if (reg.removeRepository) {
        const removed = reg.removeRepository(repoId)
        if (removed) {
          console.log('%c ✓ Repository removed', 'color: green')
        } else {
          console.log('%c Repository not found: ' + repoId, 'color: gray')
        }
      } else {
        console.log('%c ⚠ removeRepository not available', 'color: orange')
      }
    },

    // ========== Service Commands ==========

    services() {
      const ids = serviceRegistry.getServiceIds()
      if (ids.length === 0) {
        console.log('%c No services registered', 'color: gray')
        return
      }

      console.log('%c Registered Services:', 'font-weight: bold; font-size: 14px')
      console.log('')

      for (const id of ids) {
        const info = serviceRegistry.getBindingInfo(id)
        const scope = info?.scope || 'singleton'
        console.log(
          `  %c${id}%c [${scope}]`,
          'color: magenta; font-weight: bold',
          'color: gray'
        )
      }
      console.log('')
      console.log(`%c Total: ${ids.length} service(s)`, 'color: gray')
    },

    service(serviceId: string) {
      const svc = serviceRegistry.get(serviceId)
      if (svc) {
        console.log('%c Service ' + serviceId + ':', 'font-weight: bold')
        console.log(svc)
        return svc
      } else {
        console.log('%c Service not found: ' + serviceId, 'color: red')
        return undefined
      }
    },

    // ========== Help ==========

    help() {
      console.log(`
%c TSM DevTools - Browser Console Commands %c

%cModule Commands:%c
  tsm.modules()         List all loaded modules
  tsm.manifest('id')    Show module manifest
  tsm.state('id')       Show module state details
  tsm.load('id')        Load a module by ID
  tsm.unload('id')      Unload a module
  tsm.reload('id')      Reload a module (unload + load)

%cDiscovery & Loading:%c
  tsm.discover()        Discover modules from all repos
  tsm.available()       List all discovered modules
  tsm.resolve()         Show dependency resolution & load order
  tsm.loadAll()         Load all modules in dependency order

%cLoad Queue:%c
  tsm.add('id')         Add module to load queue
  tsm.remove('id')      Remove module from queue
  tsm.queue()           Show current queue
  tsm.clearQueue()      Clear the queue
  tsm.loadQueue()       Load all queued modules

%cRepositories:%c
  tsm.repos()           List configured repositories
  tsm.addRepo({...})    Add a new repository
  tsm.removeRepo('id')  Remove a repository

%cServices:%c
  tsm.services()        List all registered services
  tsm.service('id')     Get a service by ID

%cRaw Access:%c
  tsm.raw               Access the TsmPluginSystem directly

`,
        'background: #1a1a2e; color: #00ff88; font-size: 16px; padding: 10px;',
        '',
        'color: cyan; font-weight: bold', '',
        'color: cyan; font-weight: bold', '',
        'color: cyan; font-weight: bold', '',
        'color: cyan; font-weight: bold', '',
        'color: cyan; font-weight: bold', '',
        'color: cyan; font-weight: bold', ''
      )
    },

    // Raw access
    raw: tsm
  }

  return tools
}

/**
 * TSM lifecycle: activate
 * Gets TSM system from service registry and installs DevTools on window.tsm
 */
export async function activate(context: ModuleContext): Promise<void> {
  context.log.info('Activating TSM DevTools...')

  // Get the TSM system from service registry
  const tsm = context.services.get<TsmSystem>('tsm.system')
  if (!tsm) {
    context.log.error('TSM system not found in service registry. Register it as "tsm.system" before loading devtools.')
    return
  }

  // Create and install DevTools
  devtools = createTsmDevTools(tsm)

  // Install on window
  if (typeof window !== 'undefined') {
    (window as unknown as { tsm: TsmDevTools }).tsm = devtools
    console.log(
      '%c TSM DevTools installed! Type %ctsm.help()%c for commands.',
      'color: #00ff88',
      'color: cyan; font-weight: bold',
      'color: #00ff88'
    )
  }

  // Register devtools as service
  context.services.register('tsm.devtools', devtools)

  context.log.info('TSM DevTools activated')
}

/**
 * TSM lifecycle: deactivate
 */
export async function deactivate(context: ModuleContext): Promise<void> {
  context.log.info('Deactivating TSM DevTools...')

  // Remove from window
  if (typeof window !== 'undefined' && devtools) {
    delete (window as unknown as { tsm?: TsmDevTools }).tsm
  }

  // Unregister service
  context.services.unregister('tsm.devtools')

  devtools = null
  context.log.info('TSM DevTools deactivated')
}
