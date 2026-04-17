/**
 * StorageAdapterRegistry - Central registry for storage adapters
 *
 * Manages registration and lookup of storage backend adapters.
 */

import { injectable, singleton } from '@eclipse-daanse/tsm'
import type { Repository } from 'storage-model';
import type { StorageAdapter } from './StorageAdapter';

/**
 * Observer interface for registry changes
 */
export interface RegistryObserver {
  onAdapterRegistered(type: string, adapter: StorageAdapter): void;
  onAdapterUnregistered(type: string): void;
}

/**
 * StorageAdapterRegistry - Injectable singleton registry for storage adapters
 */
@injectable()
@singleton()
export class StorageAdapterRegistry {
  private adapters: Map<string, StorageAdapter> = new Map();
  private observers: Set<RegistryObserver> = new Set();

  /**
   * Register an adapter for a given type
   */
  register(adapter: StorageAdapter): void {
    if (this.adapters.has(adapter.type)) {
      console.warn(`Adapter for type '${adapter.type}' already registered, replacing...`);
    }
    this.adapters.set(adapter.type, adapter);
    this.notifyRegistered(adapter.type, adapter);
  }

  /**
   * Unregister an adapter by type
   */
  unregister(type: string): boolean {
    const result = this.adapters.delete(type);
    if (result) {
      this.notifyUnregistered(type);
    }
    return result;
  }

  /**
   * Get adapter by type identifier
   */
  getAdapter(type: string): StorageAdapter | undefined {
    return this.adapters.get(type);
  }

  /**
   * Get adapter that can handle the given repository
   */
  getAdapterFor(repository: Repository): StorageAdapter | undefined {
    for (const adapter of this.adapters.values()) {
      if (adapter.canHandle(repository)) {
        return adapter;
      }
    }
    return undefined;
  }

  /**
   * Get all registered adapter types
   */
  getRegisteredTypes(): string[] {
    return Array.from(this.adapters.keys());
  }

  /**
   * Get all registered adapters
   */
  getAllAdapters(): StorageAdapter[] {
    return Array.from(this.adapters.values());
  }

  /**
   * Check if an adapter is registered for a type
   */
  hasAdapter(type: string): boolean {
    return this.adapters.has(type);
  }

  /**
   * Add an observer for registry changes
   */
  addObserver(observer: RegistryObserver): void {
    this.observers.add(observer);
  }

  /**
   * Remove an observer
   */
  removeObserver(observer: RegistryObserver): void {
    this.observers.delete(observer);
  }

  private notifyRegistered(type: string, adapter: StorageAdapter): void {
    for (const observer of this.observers) {
      observer.onAdapterRegistered(type, adapter);
    }
  }

  private notifyUnregistered(type: string): void {
    for (const observer of this.observers) {
      observer.onAdapterUnregistered(type);
    }
  }
}
