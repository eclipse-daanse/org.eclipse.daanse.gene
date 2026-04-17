/**
 * EventDispatcher - Matches events to EventActionMappings and triggers actions
 */

import { injectable, singleton, inject } from '@eclipse-daanse/tsm'
import type { ActionContext, EventContext } from './types'
import type { ActionRegistryImpl } from './ActionRegistry'
import type { ActionManagerImpl } from './ActionManager'

@injectable()
@singleton()
export class EventDispatcherImpl {
  private mappings: any[] = []  // EventActionMapping EMF instances
  private debounceTimers = new Map<string, ReturnType<typeof setTimeout>>()
  private registry: ActionRegistryImpl
  private manager: ActionManagerImpl

  constructor(
    @inject('gene.action.registry') registry: ActionRegistryImpl,
    @inject('gene.action.manager') manager: ActionManagerImpl
  ) {
    this.registry = registry
    this.manager = manager
  }

  /** Load event-action mappings (from EditorConfig) */
  loadMappings(mappings: any[]): void {
    this.mappings = mappings || []
    console.log(`[EventDispatcher] Loaded ${this.mappings.length} event-action mappings`)
  }

  /** Clear all mappings (on workspace close) */
  clearMappings(): void {
    // Cancel pending debounced executions
    for (const timer of this.debounceTimers.values()) {
      clearTimeout(timer)
    }
    this.debounceTimers.clear()
    this.mappings = []
  }

  /** Dispatch an event — find matching mappings and execute actions */
  async dispatch(eventContext: EventContext): Promise<void> {
    const matching = this.findMatchingMappings(eventContext)
    if (matching.length === 0) return

    for (const mapping of matching) {
      const debounceMs = mapping.debounceMs || 0

      if (debounceMs > 0) {
        const key = mapping.name || mapping.actionRefs?.join(',') || 'default'
        // Cancel previous debounced execution
        const existing = this.debounceTimers.get(key)
        if (existing) clearTimeout(existing)

        this.debounceTimers.set(key, setTimeout(() => {
          this.debounceTimers.delete(key)
          this.executeMappingActions(mapping, eventContext)
        }, debounceMs))
      } else {
        await this.executeMappingActions(mapping, eventContext)
      }
    }
  }

  /** Dispatch a lifecycle event */
  async dispatchLifecycle(eventType: string, data?: Record<string, unknown>): Promise<void> {
    await this.dispatch({
      type: 'lifecycle',
      eventData: { eventType, ...data },
      timestamp: new Date()
    })
  }

  /** Dispatch a domain change event */
  async dispatchDomain(changeType: string, sourceObject: any, featureName?: string): Promise<void> {
    await this.dispatch({
      type: 'domain',
      eventData: { changeType, featureName },
      sourceObject,
      timestamp: new Date()
    })
  }

  /** Dispatch a custom plugin event */
  async dispatchCustom(eventId: string, sourceModuleId?: string, data?: Record<string, unknown>): Promise<void> {
    await this.dispatch({
      type: 'custom',
      eventData: { eventId, sourceModuleId, ...data },
      timestamp: new Date()
    })
  }

  private findMatchingMappings(eventContext: EventContext): any[] {
    return this.mappings.filter(mapping => {
      if (mapping.enabled === false) return false
      const eventSpec = mapping.event
      if (!eventSpec) return false

      const specType = eventSpec.eClass?.()?.getName?.()

      switch (eventContext.type) {
        case 'lifecycle':
          if (specType !== 'LifecycleEvent') return false
          return eventSpec.eventType === eventContext.eventData.eventType

        case 'domain':
          if (specType !== 'DomainEvent') return false
          if (eventSpec.changeType && eventSpec.changeType !== eventContext.eventData.changeType) return false
          if (eventSpec.featureName && eventSpec.featureName !== eventContext.eventData.featureName) return false
          if (eventSpec.targetTypeUri && eventContext.sourceObject) {
            const objClass = eventContext.sourceObject.eClass()
            const objUri = `${objClass.getEPackage()?.getNsURI()}#//${objClass.getName()}`
            if (eventSpec.targetScope === 'TYPE_ONLY') {
              if (objUri !== eventSpec.targetTypeUri) return false
            } else {
              // TYPE_AND_SUBTYPES check
              if (objUri !== eventSpec.targetTypeUri) {
                const supers = objClass.getEAllSuperTypes?.() || []
                const match = supers.some((s: any) => {
                  const sUri = `${s.getEPackage()?.getNsURI()}#//${s.getName()}`
                  return sUri === eventSpec.targetTypeUri
                })
                if (!match) return false
              }
            }
          }
          return true

        case 'custom':
          if (specType !== 'CustomEvent') return false
          if (eventSpec.eventId !== eventContext.eventData.eventId) return false
          if (eventSpec.sourceModuleId && eventSpec.sourceModuleId !== eventContext.eventData.sourceModuleId) return false
          return true

        default:
          return false
      }
    }).sort((a: any, b: any) => (a.order ?? 0) - (b.order ?? 0))
  }

  private async executeMappingActions(mapping: any, eventContext: EventContext): Promise<void> {
    const actionRefs: string[] = mapping.actionRefs || []
    if (actionRefs.length === 0) return

    const context: ActionContext = {
      selectedObject: eventContext.sourceObject || null,
      selectedObjects: eventContext.sourceObject ? [eventContext.sourceObject] : [],
      perspectiveId: (eventContext.eventData.perspectiveId as string) || '',
      timestamp: eventContext.timestamp
    }

    // Build parameter overrides
    const params: Record<string, unknown> = {}
    if (mapping.parameterOverrides) {
      for (const override of mapping.parameterOverrides) {
        params[override.parameterName] = override.valueExpression
        // TODO: evaluate OCL expressions prefixed with 'ocl:'
      }
    }

    const executeMode = mapping.executeMode || 'ALL'

    switch (executeMode) {
      case 'SEQUENTIAL':
        for (const actionId of actionRefs) {
          const result = await this.manager.execute(actionId, context, params)
          if (result.status === 'ERROR') {
            console.error(`[EventDispatcher] Sequential execution aborted at ${actionId}`)
            break
          }
        }
        break

      case 'FIRST_MATCH':
        for (const actionId of actionRefs) {
          if (this.manager.canExecute(actionId, context)) {
            await this.manager.execute(actionId, context, params)
            break
          }
        }
        break

      case 'ALL':
      default:
        await Promise.all(
          actionRefs.map(actionId => this.manager.execute(actionId, context, params))
        )
        break
    }
  }
}
