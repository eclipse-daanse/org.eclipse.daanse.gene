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
import { PrimeVue, Aura, Tooltip, Button } from 'tsm:primevue'
import { useSharedEditorConfig } from '@/services/useEditorConfig'
export type { EditorConfigService } from '@/services/useEditorConfig'
import appCommandsEcore from '../model/app-commands.ecore?raw'

/*
 * Die Dateiansichten. Als Komponenten exportiert — der Loader liest die
 * `@component()`-Erklaerung aus dem Namensraum des Moduls und meldet sie unter
 * `gene.editor.art` an. Deshalb steht hier nichts weiter als der Export.
 */
export * from './editors'

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

  /*
   * Das CSS des Buttons anstossen.
   *
   * PrimeVue laedt das Stylesheet einer Komponente beim ersten Mount. Bei allen
   * anderen geschieht das auch — Eingabefeld, Auswahl, Baum, Dialog stehen in
   * der Liste der geladenen Stile, der Button nicht. Ohne sein CSS ist er ein
   * nacktes `<button>`: `display: block` statt `inline-flex`, also kleben Icon
   * und Beschriftung aneinander, und die Farben des Themes fehlen.
   *
   * Ein zweiter Aufruf kostet nichts, PrimeVue laedt jedes Stylesheet einmal.
   */
  ;(Button as { extends?: { style?: { loadStyle?: () => void } } })?.extends?.style?.loadStyle?.()

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

  /*
   * Register the app commands once the action system is there. It is a plugin
   * that loads after this one; a fixed delay lost the race whenever it took
   * longer, and then Ctrl+Shift+P went to the browser instead of the palette.
   */
  void Promise.all([
    context.services.whenAvailable<any>('gene.command.registry'),
    context.services.whenAvailable<any>('gene.keybindings'),
  ]).then(([commandRegistry, keybindingService]) => {
    const cmds = commandRegistry.registerCommandsFromEcore(appCommandsEcore, 'gene-app')
    keybindingService.registerFromCommands(cmds)

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
  })

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
