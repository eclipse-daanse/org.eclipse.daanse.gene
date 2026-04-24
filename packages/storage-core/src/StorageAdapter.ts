/**
 * StorageAdapter - Interface for storage backend implementations
 *
 * Each adapter handles the actual I/O operations for a specific
 * storage backend (IndexedDB, Git, etc.)
 */

import type { Repository, File, Folder } from 'storage-model';

/**
 * Connection options for repository authentication
 */
export interface ConnectionOptions {
  /** Authentication token (for Git) */
  token?: string;
  /** Additional options specific to the adapter */
  [key: string]: unknown;
}

/**
 * Result of a sync operation
 */
export interface SyncResult {
  success: boolean;
  created: File[];
  updated: File[];
  deleted: File[];
  errors: SyncError[];
}

export interface SyncError {
  file: File;
  message: string;
  code?: string;
}

/**
 * StorageAdapter interface - implemented by each storage backend
 */
export interface StorageAdapter {
  /**
   * Unique type identifier for this adapter
   * e.g., 'indexeddb', 'github', 'gitea'
   */
  readonly type: string;

  /**
   * Human-readable name for the adapter
   */
  readonly displayName: string;

  /**
   * Connect to the repository
   */
  connect(repository: Repository, options?: ConnectionOptions): Promise<void>;

  /**
   * Disconnect from the repository
   */
  disconnect(repository: Repository): Promise<void>;

  /**
   * Check if adapter can handle this repository
   */
  canHandle(repository: Repository): boolean;

  /**
   * List files and folders at a given path
   */
  list(repository: Repository, folder: Folder): Promise<void>;

  /**
   * Read file content
   */
  read(repository: Repository, file: File): Promise<string>;

  /**
   * Write file content
   */
  write(repository: Repository, file: File, content: string): Promise<void>;

  /**
   * Delete a file or folder
   */
  delete(repository: Repository, entry: File | Folder): Promise<void>;

  /**
   * Create a new folder
   */
  createFolder(repository: Repository, parent: Folder, name: string): Promise<Folder>;

  /**
   * Create a new file
   */
  createFile(repository: Repository, parent: Folder, name: string, content?: string): Promise<File>;

  /**
   * Sync local changes with remote (for Git adapters)
   */
  sync(repository: Repository): Promise<SyncResult>;

  /**
   * Check if repository exists / is accessible
   */
  exists(repository: Repository): Promise<boolean>;
}

/**
 * Base class for storage adapters with common functionality
 */
export abstract class BaseStorageAdapter implements StorageAdapter {
  abstract readonly type: string;
  abstract readonly displayName: string;

  abstract connect(repository: Repository, options?: ConnectionOptions): Promise<void>;
  abstract disconnect(repository: Repository): Promise<void>;
  abstract canHandle(repository: Repository): boolean;
  abstract list(repository: Repository, folder: Folder): Promise<void>;
  abstract read(repository: Repository, file: File): Promise<string>;
  abstract write(repository: Repository, file: File, content: string): Promise<void>;
  abstract delete(repository: Repository, entry: File | Folder): Promise<void>;
  abstract createFolder(repository: Repository, parent: Folder, name: string): Promise<Folder>;
  abstract createFile(repository: Repository, parent: Folder, name: string, content?: string): Promise<File>;
  abstract exists(repository: Repository): Promise<boolean>;

  /**
   * Default sync implementation (no-op for non-Git adapters)
   */
  async sync(repository: Repository): Promise<SyncResult> {
    return {
      success: true,
      created: [],
      updated: [],
      deleted: [],
      errors: []
    };
  }
}
