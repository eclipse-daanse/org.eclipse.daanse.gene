/**
 * UiModel Forms Module (Plan Phase 1)
 *
 * Rendert die Property-Ansicht des Instance-Editors modellgetrieben ueber
 * @emfts/uimodel-composer. Stellt bereit:
 * - Default-UIModel-Generator (buildDefaultUiModel)
 * - UimodelPropertiesView (Composer-Einstieg fuer das PropertiesPanel)
 * - Widget-Bridge: gene-Felder (PropertyField) als Composer-Widgets
 * - Feature-Flag (useUimodelPropertiesFlag)
 */

import type { ModuleContext } from '@eclipse-daanse/tsm'
import { markRaw } from 'tsm:vue'
import { componentRegistry, match, noMatch } from '@emfts/vue-registry'

import WidgetBridge from './components/WidgetBridge.vue'
import UimodelPropertiesView from './components/UimodelPropertiesView.vue'
import { buildDefaultUiModel, featureDisplayName } from './defaultUiModel'
import { useUimodelPropertiesFlag } from './featureFlag'

export { buildDefaultUiModel, featureDisplayName } from './defaultUiModel'
export { useUimodelPropertiesFlag } from './featureFlag'
export { default as UimodelPropertiesView } from './components/UimodelPropertiesView.vue'

let unregisterBridge: (() => void) | null = null

export async function activate(context: ModuleContext): Promise<void> {
  context.log.info('Activating UiModel Forms module...')

  // Widget-Bridge als Catch-all in der GLOBALEN vue-registry registrieren —
  // dieselbe Instanz, die der WidgetComposer des uimodel-composer nutzt
  // (Shared-Lib + vite-dedupe garantieren Modul-Identitaet). Niedrige
  // Prioritaet: spezifischere Registrierungen (eigene Widgets pro
  // EDataType/Feature) gewinnen automatisch.
  unregisterBridge = componentRegistry.register(
    markRaw(WidgetBridge),
    {
      type: 'custom',
      matcher: (ctx) => (ctx.feature ? match(1) : noMatch())
    }
  )

  context.services.register('ui.uimodel.forms', {
    UimodelPropertiesView: markRaw(UimodelPropertiesView),
    buildDefaultUiModel,
    featureDisplayName,
    useUimodelPropertiesFlag
  })

  context.log.info('UiModel Forms module activated')
}

export async function deactivate(context: ModuleContext): Promise<void> {
  context.log.info('Deactivating UiModel Forms module...')
  unregisterBridge?.()
  unregisterBridge = null
  context.services.unregister('ui.uimodel.forms')
  context.log.info('UiModel Forms module deactivated')
}
