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
