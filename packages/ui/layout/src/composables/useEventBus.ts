/**
 * Event Bus Service
 *
 * Provides a typed event bus for cross-component communication.
 * Registered as TSM DI singleton service.
 */

import { injectable, singleton } from '@eclipse-daanse/tsm'

/**
 * Known event types for type safety
 */
export interface EventBusEvents {
  'save-instances-request': void
  'metamodel-dirty-change': boolean
  'open-search-dialog': void
  'show-problems': void
  // Add more events as needed
}

type EventCallback<T> = T extends void ? () => void : (payload: T) => void

export interface EventBus {
  on<K extends keyof EventBusEvents>(event: K, callback: EventCallback<EventBusEvents[K]>): void
  off<K extends keyof EventBusEvents>(event: K, callback: EventCallback<EventBusEvents[K]>): void
  emit<K extends keyof EventBusEvents>(event: K, ...args: EventBusEvents[K] extends void ? [] : [EventBusEvents[K]]): void
}

@injectable()
@singleton()
export class EventBusService implements EventBus {
  private listeners = new Map<string, Set<Function>>()

  on<K extends keyof EventBusEvents>(event: K, callback: EventCallback<EventBusEvents[K]>) {
    if (!this.listeners.has(event)) {
      this.listeners.set(event, new Set())
    }
    this.listeners.get(event)!.add(callback)
  }

  off<K extends keyof EventBusEvents>(event: K, callback: EventCallback<EventBusEvents[K]>) {
    this.listeners.get(event)?.delete(callback)
  }

  emit<K extends keyof EventBusEvents>(event: K, ...args: EventBusEvents[K] extends void ? [] : [EventBusEvents[K]]) {
    const eventListeners = this.listeners.get(event)
    if (eventListeners) {
      for (const callback of eventListeners) {
        callback(...args)
      }
    }
  }
}

// Module-level reference (set by activate)
let _eventBusInstance: EventBus | null = null

/**
 * Set the EventBus instance (called from module activate)
 */
export function setEventBusInstance(bus: EventBus): void {
  _eventBusInstance = bus
}

/**
 * EventBus composable — returns the DI singleton
 */
export function useEventBus(): EventBus {
  if (!_eventBusInstance) {
    throw new Error('[EventBus] Not initialized. Ensure ui-layout module is activated.')
  }
  return _eventBusInstance
}
