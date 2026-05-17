/**
 * Problems Panel Module
 *
 * Provides a unified problems panel for Gene.
 * Displays validation issues, parser errors, and warnings in a bottom panel.
 */

import type { ModuleContext } from '@eclipse-daanse/tsm'
import { markRaw } from 'tsm:vue'
import type { PanelRegistry } from 'ui-perspectives'
import validationCommandsEcore from '../model/validation-commands.ecore?raw'

// Re-export types
export * from './types'

// Re-export composables (new names)
export { useProblemsService, useSharedProblemsService } from './composables'
export { setEventBus } from './composables/useProblemsService'

// Re-export composables (legacy aliases)
export { useOclService, useSharedOclService } from './composables'

// Re-export C-OCL loader
export {
  loadCoclFromString,
  unloadCocl,
  getLoadedConstraintSets,
  getConstraintsByRole,
  getConstraintsForClass,
  getReferenceFilterConstraint,
  getDerivedConstraint,
  constraintSetAppliesTo,
  clearAllConstraintSets,
  useCoclLoader,
  type CoclSeverity,
  type CoclRole,
  type CoclConstraint,
  type CoclConstraintSet
} from './composables'

// Re-export components (new names)
export { ProblemsPanel } from './components'

// Re-export components (legacy aliases)
export { OclPanel } from './components'

// Import for registration
import { ProblemsPanel } from './components'
import { useProblemsService, useSharedProblemsService, loadCoclFromString } from './composables'
import { setEventBus } from './composables/useProblemsService'

/**
 * TSM lifecycle: activate
 * Registers Problems panel services
 */
export async function activate(context: ModuleContext): Promise<void> {
  context.log.info('Activating Problems Panel module...')


  // Wire up event bus from TSM
  const eventBus = context.services.get<any>('gene.eventbus')
  if (eventBus) {
    setEventBus(eventBus)
  }

  // Register components as service (new ID)
  context.services.register('ui.problems-panel.component', ProblemsPanel)

  // Register shared problems service instance as DI service
  const sharedService = useSharedProblemsService()
  context.services.register('gene.problems', sharedService)

  // Register composables as service (new ID)
  context.services.register('ui.problems-panel.service', {
    useProblemsService,
    useSharedProblemsService,
    loadCoclFromString
  })

  // Legacy service IDs for backwards compatibility
  context.services.register('ui.ocl-panel.component', ProblemsPanel)
  context.services.register('ui.ocl-panel.service', {
    useOclService: useProblemsService,
    useSharedOclService: useSharedProblemsService
  })

  // Register with panel registry
  const panelRegistry = context.services.get<PanelRegistry>('ui.registry.panels')
  if (panelRegistry) {
    panelRegistry.register({
      id: 'ocl-problems',
      title: 'Problems',
      icon: 'pi pi-exclamation-triangle',
      component: markRaw(ProblemsPanel),
      perspectives: ['model-editor'],
      defaultLocation: 'bottom',
      defaultOrder: 0
    })
    context.log.info('Problems panel registered')
  }

  // Register commands from ecore
  const commandRegistry = context.services.get<any>('gene.command.registry')
  const keybindingSvc = context.services.get<any>('gene.keybindings')
  if (commandRegistry) {
    const cmds = commandRegistry.registerCommandsFromEcore(validationCommandsEcore, 'ui-problems-panel')
    if (keybindingSvc) keybindingSvc.registerFromCommands(cmds)

    commandRegistry.registerHandler('validation.clearProblems', async () => {
      const problems = context.services.get<any>('gene.problems')
      if (problems?.clearAll) problems.clearAll()
    })
    commandRegistry.registerHandler('validation.showProblems', async () => {
      const ls = context.services.get<any>('gene.layout.state')
      if (ls) {
        if (!ls.state?.visibility?.panelArea) ls.togglePanelArea?.()
        ls.selectPanelTab?.('ocl-problems')
      }
    })
    context.log.info('Validation commands registered')
  }

  context.log.info('Problems Panel module activated')
}

/**
 * TSM lifecycle: deactivate
 * Unregisters services
 */
export async function deactivate(context: ModuleContext): Promise<void> {
  context.log.info('Deactivating Problems Panel module...')

  context.services.unregister('ui.problems-panel.component')
  context.services.unregister('ui.problems-panel.service')
  context.services.unregister('ui.ocl-panel.component')
  context.services.unregister('ui.ocl-panel.service')

  context.log.info('Problems Panel module deactivated')
}
