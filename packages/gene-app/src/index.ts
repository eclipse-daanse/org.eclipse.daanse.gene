/**
 * GenE Application Module
 *
 * TSM module that creates and mounts the Vue application.
 * Shared libraries (vue, primevue, emfts) are registered by main.ts before plugins load.
 */

import { createApp } from 'tsm:vue'
import type { App } from 'vue'
import type { ModuleContext } from '@eclipse-daanse/tsm'

import AppComponent from './App.vue'
import appRouter from '@/router'

// PrimeVue config (from TSM shared library)
import { PrimeVue, Aura, Tooltip } from 'tsm:primevue'
import { useSharedEditorConfig } from '@/services/useEditorConfig'
export type { EditorConfigService } from '@/services/useEditorConfig'
import appCommandsEcore from '../model/app-commands.ecore?raw'

// Vue app instance
let app: App | null = null

/**
 * TSM lifecycle: activate
 * Creates and mounts the Vue application
 */
export async function activate(context: ModuleContext): Promise<void> {
  context.log.info('Activating GenE Application...')

  // Get TSM system from services (registered by main.ts)
  const tsm = context.services.getRequired('tsm.system')

  // Create Vue app
  app = createApp(AppComponent)

  // Provide TSM to all components
  app.provide('tsm', tsm)

  // Configure PrimeVue
  app.use(PrimeVue, {
    theme: {
      preset: Aura,
      options: {
        darkModeSelector: '.dark-theme'
      }
    }
  })

  app.directive('tooltip', Tooltip)
  app.use(appRouter)

  // Mount app
  app.mount('#app')

  // Register app instance as service
  context.services.register('app.instance', app)

  // Create shared EditorConfig instance and register as TSM service
  const editorConfig = useSharedEditorConfig()
  context.services.register('gene.editor.config', editorConfig)
  context.log.info('EditorConfig service ready')

  // Register app commands (will be available after ui-actions activates)
  setTimeout(() => {
    const commandRegistry = context.services.get<any>('gene.command.registry')
    const keybindingService = context.services.get<any>('gene.keybindings')
    if (commandRegistry) {
      const cmds = commandRegistry.registerCommandsFromEcore(appCommandsEcore, 'gene-app')
      if (keybindingService) keybindingService.registerFromCommands(cmds)

      commandRegistry.registerHandler('app.openCommandPalette', async () => {
        // Dispatch custom event that App.vue listens for
        document.dispatchEvent(new CustomEvent('gene:openCommandPalette'))
      })
      commandRegistry.registerHandler('app.toggleFullscreen', async () => {
        if (document.fullscreenElement) {
          document.exitFullscreen()
        } else {
          document.documentElement.requestFullscreen()
        }
      })
      context.log.info('App commands registered')
    }
  }, 100)

  context.log.info('GenE Application mounted')
}

/**
 * TSM lifecycle: deactivate
 * Unmounts and destroys the Vue application
 */
export async function deactivate(context: ModuleContext): Promise<void> {
  context.log.info('Deactivating GenE Application...')

  if (app) {
    app.unmount()
    app = null
  }

  context.services.unregister('app.instance')

  context.log.info('GenE Application unmounted')
}
