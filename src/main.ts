/**
 * GenE Bootstrap
 *
 * Minimal entry point that initializes TSM and loads all modules.
 * The Vue application is loaded as a TSM module (gene-app).
 */

import { getTsmPluginSystem, type TsmPluginSystem } from './tsm'
import { repositories, tsmConfig, startupModules } from './tsm/repositories.config'
import { initTsmRuntime, injectable, singleton, inject as tsmInject } from '@eclipse-daanse/tsm'
import type { ModuleContext } from '@eclipse-daanse/tsm'

// Import shared libraries for TSM registration
import * as Vue from 'vue'
import * as VueRouter from 'vue-router'
import * as emfts from '@emfts/core'
import * as emftsVueRegistry from '@emfts/vue-registry'
import * as emftsCodecJsonSchema from '@emfts/codec.jsonschema'

// Import PrimeVue config and directives
import PrimeVue from 'primevue/config'
import Tooltip from 'primevue/tooltip'
import Aura from '@primevue/themes/aura'
import 'primeicons/primeicons.css'

// Import PrimeVue components
import Tree from 'primevue/tree'
import Button from 'primevue/button'
import Dialog from 'primevue/dialog'
import ContextMenu from 'primevue/contextmenu'
import Dropdown from 'primevue/dropdown'
import InputText from 'primevue/inputtext'
import Textarea from 'primevue/textarea'
import Checkbox from 'primevue/checkbox'
import InputNumber from 'primevue/inputnumber'
import Calendar from 'primevue/calendar'
import DataTable from 'primevue/datatable'
import Column from 'primevue/column'
import Menu from 'primevue/menu'
import Breadcrumb from 'primevue/breadcrumb'
import Card from 'primevue/card'
import Fieldset from 'primevue/fieldset'
import Message from 'primevue/message'
import Tag from 'primevue/tag'
import Splitter from 'primevue/splitter'
import SplitterPanel from 'primevue/splitterpanel'
import Tabs from 'primevue/tabs'
import TabList from 'primevue/tablist'
import Tab from 'primevue/tab'
import TabPanels from 'primevue/tabpanels'
import TabPanel from 'primevue/tabpanel'
import Select from 'primevue/select'
import Panel from 'primevue/panel'
import ToggleSwitch from 'primevue/toggleswitch'
import Toolbar from 'primevue/toolbar'
import IconField from 'primevue/iconfield'
import InputIcon from 'primevue/inputicon'
import ProgressBar from 'primevue/progressbar'
import ProgressSpinner from 'primevue/progressspinner'

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
    tsmRuntime.register('vue', Vue, '3.5.0')
    tsmRuntime.register('vue-router', VueRouter, '4.5.0')
    tsmRuntime.register('primevue', {
      // Config and directives
      default: PrimeVue,
      PrimeVue, Tooltip, Aura,
      // Components
      Tree, Button, Dialog, ContextMenu, Dropdown, InputText, Textarea,
      Checkbox, InputNumber, Calendar, DataTable, Column, Menu, Breadcrumb,
      Card, Fieldset, Message, Tag, Splitter, SplitterPanel, Tabs, TabList,
      Tab, TabPanels, TabPanel, Select, Panel, ToggleSwitch, Toolbar,
      IconField, InputIcon, ProgressBar, ProgressSpinner
    }, '4.3.0')
    tsmRuntime.register('@emfts/core', emfts, '1.0.0')
    tsmRuntime.register('@emfts/vue-registry', emftsVueRegistry, '0.1.0')
    tsmRuntime.register('@eclipse-daanse/tsm', { injectable, singleton, inject: tsmInject }, '1.0.0')
    tsmRuntime.register('@emfts/codec.jsonschema', emftsCodecJsonSchema, '1.0.0')
    console.log('[main] Registered shared libraries: vue, vue-router, primevue, @emfts/core, @emfts/vue-registry, @eclipse-daanse/tsm')

    // 3. Create TSM plugin system for module loading
    tsm = getTsmPluginSystem({ repositories })

    // 4. Register TSM system as a service so plugins can access it
    tsm.registerService('tsm.system', tsm)

    // 5. Listen for module events
    tsm.onModuleEvent({
      onModuleEvent: (event) => {
        console.log(`TSM: ${event.moduleId} - ${event.type}`)
        if (event.error) console.error(event.error)
      }
    })

    // 6. Initialize and discover plugins
    await tsm.init(tsmConfig.autoDiscover)

    // 7. Load startup modules (with dependencies)
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
