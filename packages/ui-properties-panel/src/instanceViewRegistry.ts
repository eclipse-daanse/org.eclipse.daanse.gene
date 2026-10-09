/**
 * Instance View Registry
 *
 * Extension point for class-specific views in the properties panel. A plugin
 * registers a view with a matcher; when the selected object matches, the panel
 * renders the view above the generic property sections.
 *
 * Views receive the props `eObject`, `version` (model change counter, read it
 * to re-render after edits) and `navigate(obj)` (select another object).
 */

import { shallowReactive, markRaw } from 'tsm:vue'
import type { Component } from 'tsm:vue'
import type { EObject } from '@emfts/core'

export interface InstanceViewContribution {
  /** Unique id; registering the same id again replaces the entry */
  id: string
  /** True when the view applies to the given object */
  matches: (eObject: EObject) => boolean
  component: Component
  /** Higher wins when several views match (default 0) */
  priority?: number
}

export interface InstanceViewRegistry {
  register(contribution: InstanceViewContribution): () => void
  unregister(id: string): void
  /** All matching views, highest priority first */
  findViews(eObject: EObject): InstanceViewContribution[]
}

const entries = shallowReactive<InstanceViewContribution[]>([])

function unregister(id: string): void {
  const index = entries.findIndex(e => e.id === id)
  if (index >= 0) entries.splice(index, 1)
}

function register(contribution: InstanceViewContribution): () => void {
  unregister(contribution.id)
  entries.push({ ...contribution, component: markRaw(contribution.component) })
  return () => unregister(contribution.id)
}

function findViews(eObject: EObject): InstanceViewContribution[] {
  return entries
    .filter(e => {
      try {
        return e.matches(eObject)
      } catch {
        return false
      }
    })
    .sort((a, b) => (b.priority ?? 0) - (a.priority ?? 0))
}

export const instanceViewRegistry: InstanceViewRegistry = { register, unregister, findViews }
