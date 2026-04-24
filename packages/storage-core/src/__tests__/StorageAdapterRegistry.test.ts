import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  StorageAdapterRegistry,
  type StorageAdapter,
  type RegistryObserver
} from '../index';

/**
 * Mock adapter for testing
 */
class MockAdapter implements StorageAdapter {
  readonly type: string;
  readonly displayName: string;

  constructor(type: string, displayName: string = 'Mock Adapter') {
    this.type = type;
    this.displayName = displayName;
  }

  canHandle = vi.fn().mockReturnValue(false);
  connect = vi.fn().mockResolvedValue(undefined);
  disconnect = vi.fn().mockResolvedValue(undefined);
  list = vi.fn().mockResolvedValue(undefined);
  read = vi.fn().mockResolvedValue('content');
  write = vi.fn().mockResolvedValue(undefined);
  delete = vi.fn().mockResolvedValue(undefined);
  createFolder = vi.fn().mockResolvedValue({});
  createFile = vi.fn().mockResolvedValue({});
  sync = vi.fn().mockResolvedValue({ success: true, created: [], updated: [], deleted: [], errors: [] });
  exists = vi.fn().mockResolvedValue(true);
}

describe('StorageAdapterRegistry', () => {
  let registry: StorageAdapterRegistry;

  beforeEach(() => {
    registry = new StorageAdapterRegistry();
  });

  describe('register', () => {
    it('should register an adapter', () => {
      const adapter = new MockAdapter('test');
      registry.register(adapter);

      expect(registry.hasAdapter('test')).toBe(true);
      expect(registry.getAdapter('test')).toBe(adapter);
    });

    it('should replace existing adapter with same type', () => {
      const adapter1 = new MockAdapter('test', 'First');
      const adapter2 = new MockAdapter('test', 'Second');

      registry.register(adapter1);
      registry.register(adapter2);

      expect(registry.getAdapter('test')).toBe(adapter2);
      expect(registry.getRegisteredTypes()).toHaveLength(1);
    });

    it('should register multiple adapters with different types', () => {
      const adapter1 = new MockAdapter('type1');
      const adapter2 = new MockAdapter('type2');

      registry.register(adapter1);
      registry.register(adapter2);

      expect(registry.getRegisteredTypes()).toHaveLength(2);
      expect(registry.getAdapter('type1')).toBe(adapter1);
      expect(registry.getAdapter('type2')).toBe(adapter2);
    });
  });

  describe('unregister', () => {
    it('should unregister an adapter', () => {
      const adapter = new MockAdapter('test');
      registry.register(adapter);

      const result = registry.unregister('test');

      expect(result).toBe(true);
      expect(registry.hasAdapter('test')).toBe(false);
    });

    it('should return false when unregistering non-existent adapter', () => {
      const result = registry.unregister('non-existent');
      expect(result).toBe(false);
    });
  });

  describe('getAdapter', () => {
    it('should return undefined for non-existent type', () => {
      expect(registry.getAdapter('non-existent')).toBeUndefined();
    });
  });

  describe('getAdapterFor', () => {
    it('should return adapter that can handle repository', () => {
      const adapter1 = new MockAdapter('type1');
      const adapter2 = new MockAdapter('type2');
      adapter2.canHandle.mockReturnValue(true);

      registry.register(adapter1);
      registry.register(adapter2);

      const mockRepo = { uri: 'test://repo' } as any;
      const result = registry.getAdapterFor(mockRepo);

      expect(result).toBe(adapter2);
      expect(adapter1.canHandle).toHaveBeenCalledWith(mockRepo);
      expect(adapter2.canHandle).toHaveBeenCalledWith(mockRepo);
    });

    it('should return undefined when no adapter can handle repository', () => {
      const adapter = new MockAdapter('test');
      adapter.canHandle.mockReturnValue(false);
      registry.register(adapter);

      const mockRepo = { uri: 'test://repo' } as any;
      const result = registry.getAdapterFor(mockRepo);

      expect(result).toBeUndefined();
    });
  });

  describe('getAllAdapters', () => {
    it('should return all registered adapters', () => {
      const adapter1 = new MockAdapter('type1');
      const adapter2 = new MockAdapter('type2');

      registry.register(adapter1);
      registry.register(adapter2);

      const adapters = registry.getAllAdapters();

      expect(adapters).toHaveLength(2);
      expect(adapters).toContain(adapter1);
      expect(adapters).toContain(adapter2);
    });

    it('should return empty array when no adapters registered', () => {
      expect(registry.getAllAdapters()).toHaveLength(0);
    });
  });

  describe('observers', () => {
    it('should notify observer on register', () => {
      const observer: RegistryObserver = {
        onAdapterRegistered: vi.fn(),
        onAdapterUnregistered: vi.fn()
      };
      registry.addObserver(observer);

      const adapter = new MockAdapter('test');
      registry.register(adapter);

      expect(observer.onAdapterRegistered).toHaveBeenCalledWith('test', adapter);
    });

    it('should notify observer on unregister', () => {
      const observer: RegistryObserver = {
        onAdapterRegistered: vi.fn(),
        onAdapterUnregistered: vi.fn()
      };

      const adapter = new MockAdapter('test');
      registry.register(adapter);

      registry.addObserver(observer);
      registry.unregister('test');

      expect(observer.onAdapterUnregistered).toHaveBeenCalledWith('test');
    });

    it('should not notify removed observer', () => {
      const observer: RegistryObserver = {
        onAdapterRegistered: vi.fn(),
        onAdapterUnregistered: vi.fn()
      };

      registry.addObserver(observer);
      registry.removeObserver(observer);

      const adapter = new MockAdapter('test');
      registry.register(adapter);

      expect(observer.onAdapterRegistered).not.toHaveBeenCalled();
    });

    it('should notify multiple observers', () => {
      const observer1: RegistryObserver = {
        onAdapterRegistered: vi.fn(),
        onAdapterUnregistered: vi.fn()
      };
      const observer2: RegistryObserver = {
        onAdapterRegistered: vi.fn(),
        onAdapterUnregistered: vi.fn()
      };

      registry.addObserver(observer1);
      registry.addObserver(observer2);

      const adapter = new MockAdapter('test');
      registry.register(adapter);

      expect(observer1.onAdapterRegistered).toHaveBeenCalled();
      expect(observer2.onAdapterRegistered).toHaveBeenCalled();
    });
  });
});
