/**
 * ActionRegistry - Central registry for action definitions
 */

import { injectable, singleton } from '@eclipse-daanse/tsm'
import type { EObject, EClass } from '@emfts/core'
import type { RegisteredAction, ActionContext } from './types'

@injectable()
@singleton()
export class ActionRegistryImpl {
  private actions = new Map<string, RegisteredAction>()
  private byClass = new Map<string, Set<string>>()
  private byPerspective = new Map<string, Set<string>>()
  private listeners = new Set<() => void>()

  register(action: RegisteredAction): void {
    const id = action.definition.actionId
    if (!id) {
      console.warn('[ActionRegistry] Action has no actionId, skipping')
      return
    }

    this.actions.set(id, action)
    this.indexAction(action)
    console.log(`[ActionRegistry] Registered action: ${id} (${action.source})`)
    this.notifyChange()
  }

  unregister(actionId: string): void {
    const action = this.actions.get(actionId)
    if (action) {
      this.actions.delete(actionId)
      this.removeFromIndex(actionId)
      console.log(`[ActionRegistry] Unregistered action: ${actionId}`)
      this.notifyChange()
    }
  }

  unregisterBySource(source: 'plugin' | 'workspace', moduleId?: string): void {
    const toRemove: string[] = []
    for (const [id, action] of this.actions) {
      if (action.source === source && (!moduleId || action.moduleId === moduleId)) {
        toRemove.push(id)
      }
    }
    for (const id of toRemove) {
      this.unregister(id)
    }
  }

  getAction(actionId: string): RegisteredAction | undefined {
    return this.actions.get(actionId)
  }

  getActionsForObject(obj: EObject, perspectiveId: string): RegisteredAction[] {
    const result: RegisteredAction[] = []
    for (const action of this.actions.values()) {
      if (!this.matchesAction(action, obj, perspectiveId)) continue
      result.push(action)
    }
    return result.sort((a, b) => (a.definition.order ?? 0) - (b.definition.order ?? 0))
  }

  getActionsForPerspective(perspectiveId: string): RegisteredAction[] {
    const result: RegisteredAction[] = []
    for (const action of this.actions.values()) {
      const def = action.definition
      if (def.actionScope === 'OBJECT') continue // only EDITOR or BOTH
      if (!this.matchesPerspective(def, perspectiveId)) continue
      if (def.enabled === false) continue
      result.push(action)
    }
    return result.sort((a, b) => (a.definition.order ?? 0) - (b.definition.order ?? 0))
  }

  getAllActions(): RegisteredAction[] {
    return Array.from(this.actions.values())
  }

  onChange(listener: () => void): () => void {
    this.listeners.add(listener)
    return () => this.listeners.delete(listener)
  }

  private matchesAction(action: RegisteredAction, obj: EObject, perspectiveId: string): boolean {
    const def = action.definition
    if (def.enabled === false) return false
    if (def.actionScope === 'EDITOR') return false // editor-only, not object context

    // Check perspective
    if (!this.matchesPerspective(def, perspectiveId)) return false

    // Check target type
    if (def.targetTypeUri) {
      const eClass = obj.eClass()
      const objTypeUri = this.getTypeUri(eClass)
      if (def.targetScope === 'TYPE_ONLY') {
        if (objTypeUri !== def.targetTypeUri) return false
      } else {
        // TYPE_AND_SUBTYPES — check if obj's class matches or is subtype
        if (!this.isTypeOrSubtype(eClass, def.targetTypeUri)) return false
      }
    }

    return true
  }

  private matchesPerspective(def: any, perspectiveId: string): boolean {
    const ids = def.perspectiveIds
    if (!ids || ids.length === 0) return true // empty = all perspectives
    return ids.includes(perspectiveId)
  }

  private getTypeUri(eClass: EClass): string {
    const pkg = eClass.getEPackage()
    const nsURI = pkg?.getNsURI() || 'unknown'
    return `${nsURI}#//${eClass.getName()}`
  }

  private isTypeOrSubtype(eClass: EClass, targetTypeUri: string): boolean {
    // Check exact match
    if (this.getTypeUri(eClass) === targetTypeUri) return true
    // Check supertypes
    const supers = eClass.getEAllSuperTypes?.() || []
    for (const s of supers) {
      if (this.getTypeUri(s) === targetTypeUri) return true
    }
    return false
  }

  private indexAction(action: RegisteredAction): void {
    const def = action.definition
    const id = def.actionId

    if (def.targetTypeUri) {
      if (!this.byClass.has(def.targetTypeUri)) {
        this.byClass.set(def.targetTypeUri, new Set())
      }
      this.byClass.get(def.targetTypeUri)!.add(id)
    }

    const perspectiveIds = def.perspectiveIds || []
    for (const pid of perspectiveIds) {
      if (!this.byPerspective.has(pid)) {
        this.byPerspective.set(pid, new Set())
      }
      this.byPerspective.get(pid)!.add(id)
    }
  }

  private removeFromIndex(actionId: string): void {
    for (const set of this.byClass.values()) set.delete(actionId)
    for (const set of this.byPerspective.values()) set.delete(actionId)
  }

  private notifyChange(): void {
    for (const listener of this.listeners) {
      try { listener() } catch (e) { console.error('[ActionRegistry] Listener error:', e) }
    }
  }
}
