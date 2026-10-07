/**
 * GenE Bootstrap
 *
 * Minimal entry point that initializes TSM and loads all modules.
 * The Vue application is loaded as a TSM module (gene-app).
 */

import { getTsmPluginSystem, type TsmPluginSystem } from './tsm'
import { repositories as defaultRepositories, tsmConfig, startupModules as defaultStartupModules } from './tsm/repositories.config'
import { loadAppConfig, type AppConfigData } from './services/appConfigLoader'
import * as tsmLibrary from '@eclipse-daanse/tsm'
import { initTsmRuntime } from '@eclipse-daanse/tsm'
import type { ModuleContext } from '@eclipse-daanse/tsm'

// Import shared libraries for TSM registration
import * as Vue from 'vue'
import * as VueRouter from 'vue-router'
import * as emfts from '@emfts/core'
import * as emftsVueRegistry from '@emfts/vue-registry'
import * as emftsCodecJsonSchema from '@emfts/codec.jsonschema'
import * as emftsUimodelComposer from '@emfts/uimodel-composer'
import { UimodelPackage, UimodelFactory } from '@emfts/uimodel-composer'

// Import PrimeVue config and directives
import PrimeVue from 'primevue/config'
import Tooltip from 'primevue/tooltip'
import Aura from '@primevue/themes/aura'
import 'primeicons/primeicons.css'

// The whole PrimeVue, not a selection: a component missing from a hand-kept
// list (DatePicker, for the DMN editor) only shows in the release build
import * as PrimeVueLibrary from 'primevue'

/** Versions of the shared libraries, set at build time by vite.config.ts */
declare const __SHARED_LIBRARY_VERSIONS__: Record<string, string>

// TSM instance (global for app access)
let tsm: TsmPluginSystem

/**
 * Initialize TSM and load all modules
 */
async function bootstrap(): Promise<void> {
  console.log('GenE: Starting bootstrap...')

  try {
    // 1. Initialize TSM Runtime for shared libraries (sets window.__tsm__)
    const tsmRuntime = initTsmRuntime()

    // 2. Register shared libraries with TSM Runtime (BEFORE loading plugins!)
    /*
     * Every library whole and under the version actually installed (read at
     * build time, see SHARED_LIBRARIES in vite.config.ts). Plugins declare in
     * their manifest which of them they need and in which range; TSM checks
     * that before a plugin starts, so a missing or wrong library is reported
     * by name instead of failing later as "x is not a function".
     *
     * TSM in particular has to be this one instance: the decorators write
     * metadata that the host's component runtime reads.
     */
    const versionOf = (library: string): string => {
      const version = __SHARED_LIBRARY_VERSIONS__[library]
      if (!version) throw new Error(`No version known for shared library '${library}'`)
      return version
    }
    tsmRuntime.register('vue', Vue, versionOf('vue'))
    tsmRuntime.register('vue-router', VueRouter, versionOf('vue-router'))
    tsmRuntime.register('primevue', {
      ...PrimeVueLibrary,
      // Config, directive and theme are no components; plugins take them from here too
      default: PrimeVue,
      PrimeVue,
      Tooltip,
      Aura
    }, versionOf('primevue'))
    tsmRuntime.register('@emfts/core', emfts, versionOf('@emfts/core'))
    tsmRuntime.register('@emfts/vue-registry', emftsVueRegistry, versionOf('@emfts/vue-registry'))
    tsmRuntime.register('@eclipse-daanse/tsm', tsmLibrary, versionOf('@eclipse-daanse/tsm'))
    tsmRuntime.register('@emfts/codec.jsonschema', emftsCodecJsonSchema, versionOf('@emfts/codec.jsonschema'))
    tsmRuntime.register('@emfts/uimodel-composer', emftsUimodelComposer, versionOf('@emfts/uimodel-composer'))
    console.log('[main] Registered shared libraries: vue, vue-router, primevue, @emfts/core, @emfts/vue-registry, @eclipse-daanse/tsm, @emfts/uimodel-composer')

    // 3. Load AppConfig from config.xmi (fallback to hardcoded defaults)
    const appConfig = await loadAppConfig('/config.xmi')
    const repositories = appConfig.pluginRepositories.length > 0
      ? appConfig.pluginRepositories
      : defaultRepositories
    const startupModules = appConfig.startupModules.length > 0
      ? appConfig.startupModules
      : defaultStartupModules
    console.log(`[main] AppConfig: ${repositories.length} repo(s), ${startupModules.length} module(s), ${appConfig.pluginConfigs.length} plugin config(s)`)

    // 4. Create TSM plugin system for module loading
    tsm = getTsmPluginSystem({ repositories })

    // 5. Register TSM system and AppConfig as services
    tsm.registerService('tsm.system', tsm)
    tsm.registerService('gene.app.config', appConfig)
    tsm.registerService('gene.package.registry', emfts.EPackageRegistry.INSTANCE)

    // Register the UIModel metamodel (http://uimodel/1.0) in the canonical
    // EPackageRegistry. Touching UimodelFactory.eINSTANCE wires the factory
    // to the package (setEPackage establishes the bidirectional reference).
    // Both come from @emfts/uimodel-composer, which is deduped onto the app's
    // @emfts/core instance (see vite.config.ts resolve.dedupe).
    const uimodelPackage = UimodelPackage.eINSTANCE
    void UimodelFactory.eINSTANCE
    emfts.EPackageRegistry.INSTANCE.set(uimodelPackage.getNsURI(), uimodelPackage)
    console.log(`[main] Registered UIModel package: ${uimodelPackage.getNsURI()}`)

    // 6. Listen for module events
    tsm.onModuleEvent({
      onModuleEvent: (event) => {
        console.log(`TSM: ${event.moduleId} - ${event.type}`)
        if (event.error) console.error(event.error)
      }
    })

    // 7. Initialize and discover plugins
    await tsm.init(tsmConfig.autoDiscover)

    // 8. Load startup modules (with dependencies)
    if (startupModules.length > 0) {
      await tsm.loadModules(startupModules)
    }

    // 8. Vue provide/inject bridge — make DI services available in Vue components
    const vueApp = tsm.getService<import('vue').App>('app.instance')
    if (vueApp) {
      const bridgeIds = [
        'gene.eventbus', 'gene.layout.state', 'gene.registry.panels',
        'gene.registry.activities', 'gene.registry.perspectives',
        'gene.editor.context', 'gene.editor.config', 'gene.views',
        'gene.icons.registry', 'gene.icons.classRegistry',
        'gene.atlas.upload', 'gene.filesystem',
        'gene.action.registry', 'gene.action.manager',
        'gene.problems'
      ]
      for (const id of bridgeIds) {
        const svc = tsm.getService(id)
        if (svc) {
          vueApp.provide(id, svc)
        }
      }
      console.log('[main] Vue provide/inject bridge established')
    }

    console.log('GenE: Bootstrap complete')
    console.log('TSM: Loaded modules:', tsm.getLoadedModuleIds())

  } catch (error) {
    console.error('GenE: Failed to start application:', error)

    // Show error UI
    const appElement = document.getElementById('app')
    if (appElement) {
      appElement.innerHTML = `
        <div style="padding: 2rem; text-align: center; color: #dc2626;">
          <h1>Failed to start GenE</h1>
          <p>${error}</p>
        </div>
      `
    }
  }
}

// Start the application
bootstrap()
