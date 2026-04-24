/**
 * Panel Drag & Drop Composable
 *
 * Provides drag and drop functionality for moving panels between sidebars.
 */

import { ref } from 'tsm:vue'
import { useLayoutState } from './useLayoutState'
import type { PanelLocation } from '../types'

// Shared drag state
const draggedPanelId = ref<string | null>(null)
const draggedFromLocation = ref<PanelLocation | null>(null)
const dropTargetLocation = ref<PanelLocation | null>(null)

/**
 * Panel drag & drop composable
 */
export function usePanelDragDrop() {
  const layout = useLayoutState()

  /**
   * Start dragging a panel
   */
  function startDrag(event: DragEvent, panelId: string, fromLocation: PanelLocation) {
    draggedPanelId.value = panelId
    draggedFromLocation.value = fromLocation

    // Set drag data
    if (event.dataTransfer) {
      event.dataTransfer.effectAllowed = 'move'
      event.dataTransfer.setData('text/plain', panelId)
      event.dataTransfer.setData('application/x-panel-id', panelId)
      event.dataTransfer.setData('application/x-panel-location', fromLocation)
    }

    console.log(`[DragDrop] Started dragging panel: ${panelId} from ${fromLocation}`)
  }

  /**
   * Handle drag over a drop zone
   */
  function handleDragOver(event: DragEvent, targetLocation: PanelLocation) {
    // Only allow drop if dragging a panel and not dropping on same location
    if (draggedPanelId.value && draggedFromLocation.value !== targetLocation) {
      event.preventDefault()
      dropTargetLocation.value = targetLocation

      if (event.dataTransfer) {
        event.dataTransfer.dropEffect = 'move'
      }
    }
  }

  /**
   * Handle drag enter on a drop zone
   */
  function handleDragEnter(event: DragEvent, targetLocation: PanelLocation) {
    if (draggedPanelId.value && draggedFromLocation.value !== targetLocation) {
      event.preventDefault()
      dropTargetLocation.value = targetLocation
    }
  }

  /**
   * Handle drag leave from a drop zone
   */
  function handleDragLeave(event: DragEvent, targetLocation: PanelLocation) {
    // Only clear if actually leaving the drop zone (not entering a child)
    const relatedTarget = event.relatedTarget as HTMLElement
    const currentTarget = event.currentTarget as HTMLElement

    if (!currentTarget.contains(relatedTarget)) {
      if (dropTargetLocation.value === targetLocation) {
        dropTargetLocation.value = null
      }
    }
  }

  /**
   * Handle drop on a drop zone
   */
  function handleDrop(event: DragEvent, targetLocation: PanelLocation) {
    event.preventDefault()

    const panelId = draggedPanelId.value || event.dataTransfer?.getData('application/x-panel-id')

    if (panelId && draggedFromLocation.value !== targetLocation) {
      console.log(`[DragDrop] Dropping panel ${panelId} to ${targetLocation}`)
      layout.movePanel(panelId, targetLocation)
    }

    // Reset drag state
    endDrag()
  }

  /**
   * End dragging (cleanup)
   */
  function endDrag() {
    draggedPanelId.value = null
    draggedFromLocation.value = null
    dropTargetLocation.value = null
  }

  /**
   * Check if currently dragging
   */
  function isDragging() {
    return draggedPanelId.value !== null
  }

  /**
   * Check if a location is a valid drop target
   */
  function isDropTarget(location: PanelLocation) {
    return dropTargetLocation.value === location
  }

  /**
   * Check if can drop on location
   */
  function canDropOn(location: PanelLocation) {
    return draggedPanelId.value !== null && draggedFromLocation.value !== location
  }

  return {
    // State
    draggedPanelId,
    draggedFromLocation,
    dropTargetLocation,

    // Methods
    startDrag,
    handleDragOver,
    handleDragEnter,
    handleDragLeave,
    handleDrop,
    endDrag,
    isDragging,
    isDropTarget,
    canDropOn
  }
}

/**
 * Keyboard shortcuts for panel movement
 */
export function usePanelKeyboardShortcuts() {
  const layout = useLayoutState()

  /**
   * Move active panel left (to primary sidebar)
   */
  function moveActivePanelLeft() {
    // Try to move from secondary first
    const activeSecondary = layout.activeSecondaryPanel.value
    if (activeSecondary) {
      layout.movePanel(activeSecondary.id, 'primary')
      console.log(`[Keyboard] Moved ${activeSecondary.id} to primary`)
      return
    }

    // Try to move from editor
    const activeEditor = layout.activeEditorTab.value
    if (activeEditor) {
      layout.movePanel(activeEditor.id, 'primary')
      console.log(`[Keyboard] Moved ${activeEditor.id} to primary`)
      return
    }

    // Try to move from bottom
    const activeBottom = layout.activePanelTab.value
    if (activeBottom) {
      layout.movePanel(activeBottom.id, 'primary')
      console.log(`[Keyboard] Moved ${activeBottom.id} to primary`)
    }
  }

  /**
   * Move active panel right (to secondary sidebar)
   */
  function moveActivePanelRight() {
    // Try to move from primary first
    const activePrimary = layout.activePrimaryPanel.value
    if (activePrimary) {
      layout.movePanel(activePrimary.id, 'secondary')
      layout.setSecondarySidebarVisible(true)
      console.log(`[Keyboard] Moved ${activePrimary.id} to secondary`)
      return
    }

    // Try to move from editor
    const activeEditor = layout.activeEditorTab.value
    if (activeEditor) {
      layout.movePanel(activeEditor.id, 'secondary')
      layout.setSecondarySidebarVisible(true)
      console.log(`[Keyboard] Moved ${activeEditor.id} to secondary`)
      return
    }

    // Try to move from bottom
    const activeBottom = layout.activePanelTab.value
    if (activeBottom) {
      layout.movePanel(activeBottom.id, 'secondary')
      layout.setSecondarySidebarVisible(true)
      console.log(`[Keyboard] Moved ${activeBottom.id} to secondary`)
    }
  }

  /**
   * Move active panel up (to editor area)
   */
  function moveActivePanelUp() {
    // Try to move from bottom
    const activeBottom = layout.activePanelTab.value
    if (activeBottom) {
      layout.movePanel(activeBottom.id, 'editor')
      console.log(`[Keyboard] Moved ${activeBottom.id} to editor`)
      return
    }

    // Try to move from primary
    const activePrimary = layout.activePrimaryPanel.value
    if (activePrimary) {
      layout.movePanel(activePrimary.id, 'editor')
      console.log(`[Keyboard] Moved ${activePrimary.id} to editor`)
      return
    }

    // Try to move from secondary
    const activeSecondary = layout.activeSecondaryPanel.value
    if (activeSecondary) {
      layout.movePanel(activeSecondary.id, 'editor')
      console.log(`[Keyboard] Moved ${activeSecondary.id} to editor`)
    }
  }

  /**
   * Move active panel down (to bottom panel area)
   */
  function moveActivePanelDown() {
    // Try to move from editor
    const activeEditor = layout.activeEditorTab.value
    if (activeEditor) {
      layout.movePanel(activeEditor.id, 'bottom')
      layout.setPanelAreaVisible(true)
      console.log(`[Keyboard] Moved ${activeEditor.id} to bottom`)
      return
    }

    // Try to move from primary
    const activePrimary = layout.activePrimaryPanel.value
    if (activePrimary) {
      layout.movePanel(activePrimary.id, 'bottom')
      layout.setPanelAreaVisible(true)
      console.log(`[Keyboard] Moved ${activePrimary.id} to bottom`)
      return
    }

    // Try to move from secondary
    const activeSecondary = layout.activeSecondaryPanel.value
    if (activeSecondary) {
      layout.movePanel(activeSecondary.id, 'bottom')
      layout.setPanelAreaVisible(true)
      console.log(`[Keyboard] Moved ${activeSecondary.id} to bottom`)
    }
  }

  /**
   * Swap primary and secondary sidebars
   */
  function swapSidebars() {
    layout.swapLocations('primary', 'secondary')
    console.log('[Keyboard] Swapped sidebars')
  }

  /**
   * Handle keyboard event
   * @returns true if event was handled
   */
  function handleKeyDown(event: KeyboardEvent): boolean {
    // Alt+Shift+Arrow for moving panels
    if (event.altKey && event.shiftKey) {
      switch (event.key) {
        case 'ArrowLeft':
          event.preventDefault()
          moveActivePanelLeft()
          return true
        case 'ArrowRight':
          event.preventDefault()
          moveActivePanelRight()
          return true
        case 'ArrowUp':
          event.preventDefault()
          moveActivePanelUp()
          return true
        case 'ArrowDown':
          event.preventDefault()
          moveActivePanelDown()
          return true
      }
    }

    // Alt+Shift+S to swap sidebars
    if (event.altKey && event.shiftKey && event.key.toLowerCase() === 's') {
      event.preventDefault()
      swapSidebars()
      return true
    }

    return false
  }

  /**
   * Install global keyboard handler
   */
  function installKeyboardHandler() {
    const handler = (event: KeyboardEvent) => handleKeyDown(event)
    window.addEventListener('keydown', handler)

    // Return cleanup function
    return () => {
      window.removeEventListener('keydown', handler)
    }
  }

  return {
    moveActivePanelLeft,
    moveActivePanelRight,
    moveActivePanelUp,
    moveActivePanelDown,
    swapSidebars,
    handleKeyDown,
    installKeyboardHandler
  }
}
