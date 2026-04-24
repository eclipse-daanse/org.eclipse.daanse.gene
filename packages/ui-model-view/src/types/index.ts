/**
 * Model View Types
 *
 * Types for the Model View system that provides configurable views
 * into EMF model hierarchies.
 */

import type { Resource, EClass } from '@emfts/core'

/**
 * Filter configuration for a single resource/model level
 */
export interface ClassFilter {
  /** Classes to hide (blacklist approach) */
  hiddenClasses?: string[]
  /** Classes to show (whitelist approach - if set, only these are visible) */
  visibleClasses?: string[]
}

/**
 * Model View configuration
 *
 * Defines what part of the model hierarchy is visible and how it's filtered.
 */
export interface ModelView {
  /** Unique identifier */
  id: string

  /** Display name */
  name: string

  /** URI pattern of the focus resource (the "instance" being edited) */
  focusUri: string

  /** Number of meta-levels visible above the focus (0 = focus only) */
  depth: number

  /** Filters per resource URI */
  filters: Record<string, ClassFilter>
}

/**
 * A level in the model hierarchy
 */
export interface ModelLevel {
  /** The resource at this level */
  resource: Resource

  /** The URI of this resource */
  uri: string

  /** The level number (0 = top/ecore, higher = more concrete) */
  level: number

  /** Whether this is the focus level (being edited) */
  isFocus: boolean

  /** Whether this level is readonly (context only) */
  isReadonly: boolean

  /** The metamodel resource (one level up) */
  metamodel: Resource | null
}

/**
 * Perspective configuration
 *
 * Combines a Model View with UI layout settings.
 */
export interface Perspective {
  /** Unique identifier */
  id: string

  /** Display name */
  name: string

  /** Icon class (PrimeVue/PrimeIcons) */
  icon: string

  /** The view configuration */
  view: ModelView

  /** Optional UI layout settings */
  layout?: PerspectiveLayout
}

/**
 * UI Layout settings for a perspective
 */
export interface PerspectiveLayout {
  /** Panel sizes (percentages) */
  panelSizes?: number[]

  /** Which panels are visible */
  visiblePanels?: string[]

  /** Tree expanded by default */
  treeExpanded?: boolean
}

/**
 * Tree node for the model view tree
 */
export interface ModelTreeNode {
  /** Unique key */
  key: string

  /** Display label */
  label: string

  /** Icon class */
  icon: string

  /** The EObject data */
  data: any

  /** The EClass of this node */
  eClass: EClass

  /** Which level this node belongs to */
  level: ModelLevel

  /** Whether this node is filtered out */
  filtered?: boolean

  /** Child nodes */
  children?: ModelTreeNode[]

  /** Is this a leaf node */
  leaf?: boolean

  /** Is this node selectable */
  selectable?: boolean
}

/**
 * Default perspectives shipped with the system
 */
export const DEFAULT_PERSPECTIVES: Perspective[] = [
  {
    id: 'metamodeler',
    name: 'Metamodeler',
    icon: 'pi pi-sitemap',
    view: {
      id: 'metamodeler-view',
      name: 'Metamodeler View',
      focusUri: '*.ecore',
      depth: 1,
      filters: {
        'http://www.eclipse.org/emf/2002/Ecore': {
          hiddenClasses: ['EAnnotation', 'EGenericType', 'ETypeParameter', 'EStringToStringMapEntry']
        }
      }
    }
  },
  {
    id: 'instance-editor',
    name: 'Instance Editor',
    icon: 'pi pi-database',
    view: {
      id: 'instance-view',
      name: 'Instance View',
      focusUri: '*.xmi',
      depth: 1,
      filters: {}
    }
  },
  {
    id: 'full-stack',
    name: 'Full Stack',
    icon: 'pi pi-eye',
    view: {
      id: 'full-view',
      name: 'Full Stack View',
      focusUri: '*.xmi',
      depth: 99,
      filters: {}
    }
  },
  {
    id: 'data-entry',
    name: 'Data Entry',
    icon: 'pi pi-pencil',
    view: {
      id: 'data-view',
      name: 'Data Entry View',
      focusUri: '*.xmi',
      depth: 0,
      filters: {}
    }
  }
]
