/**
 * Perspective Registry
 *
 * Manages perspective registrations and switching.
 */

import { injectable, singleton, inject } from '@eclipse-daanse/tsm'
import { reactive, computed, readonly } from 'tsm:vue'
import type {
  PerspectiveDefinition,
  PerspectiveRegistry,
  PerspectiveContext,
  PanelRegistry,
  ActivityRegistry
} from './types'

export interface PerspectiveState {
  /** Currently active perspective ID */
  currentPerspectiveId: string | null
  /** Current workspace (if any) */
  workspace: any | null
  /** Workspace file path */
  workspacePath: string | null
  /** Loading state */
  loading: boolean
  /** Error message */
  error: string | null
}

export interface PerspectiveManager {
  /** Registry for perspectives */
  registry: PerspectiveRegistry
  /** Current state */
  state: PerspectiveState
  /** Current perspective definition */
  currentPerspective: PerspectiveDefinition | undefined
  /** Switch to a perspective */
  switchTo: (perspectiveId: string) => Promise<void>
  /** Set current perspective ID without layout setup (for external layout management) */
  setCurrentPerspectiveId: (perspectiveId: string) => void
  /** Open a workspace and optionally switch perspective */
  openWorkspace: (workspace: any, path: string, perspectiveId?: string) => void
  /** Set workspace state without switching perspective or triggering layout setup */
  setWorkspace: (workspace: any, path: string) => void
  /** Close current workspace */
  closeWorkspace: () => void
  /** Check if a perspective can be activated */
  canActivate: (perspectiveId: string) => boolean
  /** Set the layout state (for late binding) */
  setLayoutState: (layoutState: any) => void
}

@injectable()
@singleton()
export class PerspectiveManagerImpl implements PerspectiveManager {
  private perspectives = reactive(new Map<string, PerspectiveDefinition>())
  private _state = reactive<PerspectiveState>({
    currentPerspectiveId: null,
    workspace: null,
    workspacePath: null,
    loading: false,
    error: null
  })
  private _currentPerspective = computed(() => {
    if (!this._state.currentPerspectiveId) return undefined
    return this.perspectives.get(this._state.currentPerspectiveId)
  })

  private panelRegistry: PanelRegistry
  private activityRegistry: ActivityRegistry
  private layoutState: any = null

  constructor(
    @inject('gene.registry.panels') panelRegistry: PanelRegistry,
    @inject('gene.registry.activities') activityRegistry: ActivityRegistry
  ) {
    this.panelRegistry = panelRegistry
    this.activityRegistry = activityRegistry
  }

  setLayoutState(layoutState: any): void {
    this.layoutState = layoutState
  }

  get registry(): PerspectiveRegistry {
    const self = this
    return {
      register(perspective: PerspectiveDefinition): void {
        console.log(`[PerspectiveRegistry] Registering perspective: ${perspective.id}`)
        self.perspectives.set(perspective.id, perspective)
      },
      unregister(id: string): void {
        console.log(`[PerspectiveRegistry] Unregistering perspective: ${id}`)
        self.perspectives.delete(id)
        if (self._state.currentPerspectiveId === id) {
          const available = this.getAvailableWithoutWorkspace()
          if (available.length > 0) {
            self._state.currentPerspectiveId = available[0]!.id
          } else {
            self._state.currentPerspectiveId = null
          }
        }
      },
      get(id: string): PerspectiveDefinition | undefined {
        return self.perspectives.get(id)
      },
      getAll(): PerspectiveDefinition[] {
        return Array.from(self.perspectives.values())
          .sort((a, b) => (a.order ?? Infinity) - (b.order ?? Infinity))
      },
      getAvailableWithoutWorkspace(): PerspectiveDefinition[] {
        return Array.from(self.perspectives.values())
          .filter(p => !p.requiresWorkspace)
          .sort((a, b) => (a.order ?? Infinity) - (b.order ?? Infinity))
      }
    }
  }

  get state(): PerspectiveState {
    return readonly(this._state) as PerspectiveState
  }

  get currentPerspective(): PerspectiveDefinition | undefined {
    return this._currentPerspective.value
  }

  canActivate(perspectiveId: string): boolean {
    const perspective = this.perspectives.get(perspectiveId)
    if (!perspective) return false
    if (perspective.requiresWorkspace && !this._state.workspace) return false
    return true
  }

  setCurrentPerspectiveId(perspectiveId: string): void {
    const perspective = this.perspectives.get(perspectiveId)
    if (!perspective) {
      console.warn(`[PerspectiveManager] Perspective not found: ${perspectiveId}`)
      return
    }
    this._state.currentPerspectiveId = perspectiveId
    console.log(`[PerspectiveManager] Set perspective ID to: ${perspectiveId}`)
  }

  async switchTo(perspectiveId: string): Promise<void> {
    const perspective = this.perspectives.get(perspectiveId)
    if (!perspective) {
      console.warn(`[PerspectiveManager] Perspective not found: ${perspectiveId}`)
      return
    }

    if (!this.canActivate(perspectiveId)) {
      console.warn(`[PerspectiveManager] Cannot activate ${perspectiveId} - requires workspace`)
      return
    }

    const previousPerspective = this._currentPerspective.value

    // Deactivate previous perspective
    if (previousPerspective?.onDeactivate) {
      try {
        await previousPerspective.onDeactivate(this.createContext())
      } catch (e) {
        console.error(`[PerspectiveManager] Error deactivating ${previousPerspective.id}:`, e)
      }
    }

    // Update state
    this._state.currentPerspectiveId = perspectiveId

    // Setup layout for new perspective
    this.setupPerspectiveLayout(perspective)

    // Activate new perspective
    if (perspective.onActivate) {
      try {
        await perspective.onActivate(this.createContext())
      } catch (e) {
        console.error(`[PerspectiveManager] Error activating ${perspectiveId}:`, e)
      }
    }

    console.log(`[PerspectiveManager] Switched to perspective: ${perspectiveId}`)
  }

  setWorkspace(workspace: any, path: string): void {
    this._state.workspace = workspace
    this._state.workspacePath = path
    this._state.error = null
    console.log(`[PerspectiveManager] Set workspace: ${path}`)
  }

  openWorkspace(workspace: any, path: string, perspectiveId?: string): void {
    this.setWorkspace(workspace, path)

    if (perspectiveId) {
      this.switchTo(perspectiveId)
    } else {
      const workspacePerspectives = Array.from(this.perspectives.values())
        .filter(p => p.requiresWorkspace)
      if (workspacePerspectives.length > 0) {
        this.switchTo(workspacePerspectives[0]!.id)
      }
    }
  }

  closeWorkspace(): void {
    this._state.workspace = null
    this._state.workspacePath = null
    this._state.error = null

    console.log('[PerspectiveManager] Closed workspace')

    const available = this.registry.getAvailableWithoutWorkspace()
    if (available.length > 0) {
      this.switchTo(available[0]!.id)
    }
  }

  private createContext(): PerspectiveContext {
    return {
      workspace: this._state.workspace,
      layout: this.layoutState,
      panelRegistry: this.panelRegistry,
      activityRegistry: this.activityRegistry
    }
  }

  private setupPerspectiveLayout(perspective: PerspectiveDefinition): void {
    if (!this.layoutState) {
      console.warn('[PerspectiveManager] No layout state available')
      return
    }

    // Clear existing layout
    this.layoutState.clearAll()

    // Get panels for this perspective
    const availablePanels = this.panelRegistry.getForPerspective(perspective.id)

    const { defaultLayout, defaultVisibility } = perspective

    // Register left panels
    if (defaultLayout.left) {
      for (const panelId of defaultLayout.left) {
        const panel = availablePanels.find(p => p.id === panelId)
        if (panel) {
          this.layoutState.registerPanel({
            id: panel.id,
            title: panel.title,
            icon: panel.icon,
            component: panel.component,
            location: 'primary'
          })
        }
      }
    }

    // Register right panels
    if (defaultLayout.right) {
      for (const panelId of defaultLayout.right) {
        const panel = availablePanels.find(p => p.id === panelId)
        if (panel) {
          this.layoutState.registerPanel({
            id: panel.id,
            title: panel.title,
            icon: panel.icon,
            component: panel.component,
            location: 'secondary'
          })
        }
      }
    }

    // Register bottom panels
    if (defaultLayout.bottom) {
      for (const panelId of defaultLayout.bottom) {
        const panel = availablePanels.find(p => p.id === panelId)
        if (panel) {
          this.layoutState.registerPanelTab({
            id: panel.id,
            title: panel.title,
            icon: panel.icon,
            component: panel.component
          })
        }
      }
    }

    // Register center/editor panels
    if (defaultLayout.center) {
      for (const panelId of defaultLayout.center) {
        const panel = availablePanels.find(p => p.id === panelId)
        if (panel) {
          this.layoutState.openEditor({
            id: panel.id,
            title: panel.title,
            icon: panel.icon,
            component: panel.component,
            closable: panel.closable ?? false
          })
        }
      }
    }

    // Register activities for this perspective
    const activities = this.activityRegistry.getForPerspective(perspective.id)
    for (const activity of activities) {
      this.layoutState.registerActivity({
        id: activity.id,
        icon: activity.icon,
        label: activity.label,
        tooltip: activity.tooltip,
        panel: activity.panelId
      })
    }

    // Apply visibility settings
    if (defaultVisibility) {
      this.layoutState.setPrimarySidebarVisible(defaultVisibility.left ?? true)
      this.layoutState.setSecondarySidebarVisible(defaultVisibility.right ?? false)
      this.layoutState.setPanelAreaVisible(defaultVisibility.bottom ?? false)
    }
  }
}
