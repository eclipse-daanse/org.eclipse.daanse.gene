/**
 * IndexedDBAdapter - Browser-local storage using IndexedDB
 *
 * Stores files and folders in the browser's IndexedDB.
 * Suitable for offline-first applications and local workspaces.
 */

import { openDB, type DBSchema, type IDBPDatabase } from 'idb';
import {
  BaseStorageAdapter,
  type ConnectionOptions,
  type Repository,
  type LocalRepository,
  type File,
  type Folder,
  type FileState,
  StorageFactory,
  RepositoryState,
  getFileState
} from 'storage-core';

/**
 * IndexedDB schema for storage
 */
interface StorageDBSchema extends DBSchema {
  files: {
    key: string; // path
    value: {
      path: string;
      name: string;
      content: string;
      hash: string;
      mimeType?: string;
      size: number;
      parentPath: string;
      isFolder: boolean;
      updatedAt: number;
    };
    indexes: {
      'by-parent': string;
    };
  };
  metadata: {
    key: string;
    value: {
      key: string;
      value: unknown;
    };
  };
}

/**
 * IndexedDB storage adapter
 */
export class IndexedDBAdapter extends BaseStorageAdapter {
  readonly type = 'indexeddb';
  readonly displayName = 'Browser Local Storage';

  private databases: Map<string, IDBPDatabase<StorageDBSchema>> = new Map();

  /**
   * Check if this adapter can handle the repository
   */
  canHandle(repository: Repository): boolean {
    // Check if it's a LocalRepository by checking for databaseName property
    return 'databaseName' in repository;
  }

  /**
   * Connect to IndexedDB
   */
  async connect(repository: Repository, options?: ConnectionOptions): Promise<void> {
    const localRepo = repository as LocalRepository;
    const dbName = localRepo.databaseName || 'gene-workspace';

    try {
      repository.state = RepositoryState.CONNECTING;

      const db = await openDB<StorageDBSchema>(dbName, 1, {
        upgrade(db) {
          // Files store
          const fileStore = db.createObjectStore('files', { keyPath: 'path' });
          fileStore.createIndex('by-parent', 'parentPath');

          // Metadata store
          db.createObjectStore('metadata', { keyPath: 'key' });
        }
      });

      this.databases.set(repository.uri, db);

      // Initialize root folder if not exists
      await this.ensureRootFolder(repository);

      // Load existing files from root
      await this.list(repository, repository.root!);

      repository.state = RepositoryState.CONNECTED;
      repository.errorMessage = '';
    } catch (error) {
      repository.state = RepositoryState.ERROR;
      repository.errorMessage = error instanceof Error ? error.message : 'Unknown error';
      throw error;
    }
  }

  /**
   * Disconnect from IndexedDB
   */
  async disconnect(repository: Repository): Promise<void> {
    const db = this.databases.get(repository.uri);
    if (db) {
      db.close();
      this.databases.delete(repository.uri);
    }
    repository.state = RepositoryState.DISCONNECTED;
  }

  /**
   * Ensure root folder exists
   */
  private async ensureRootFolder(repository: Repository): Promise<void> {
    const db = this.getDB(repository);
    const rootPath = '/';

    const existing = await db.get('files', rootPath);
    if (!existing) {
      await db.put('files', {
        path: rootPath,
        name: '',
        content: '',
        hash: '',
        parentPath: '',
        isFolder: true,
        size: 0,
        updatedAt: Date.now()
      });
    }

    // Create root folder model if not exists
    if (!repository.root) {
      const factory = StorageFactory.eINSTANCE;
      const root = factory.createFolder();
      root.name = '';
      root.path = '/';
      repository.root = root;
    }
  }

  /**
   * List files and folders in a directory (recursively)
   */
  async list(repository: Repository, folder: Folder): Promise<void> {
    const db = this.getDB(repository);
    const factory = StorageFactory.eINSTANCE;

    const entries = await db.getAllFromIndex('files', 'by-parent', folder.path);

    // Clear existing children
    folder.children.length = 0;

    for (const entry of entries) {
      if (entry.isFolder) {
        const childFolder = factory.createFolder();
        childFolder.name = entry.name;
        childFolder.path = entry.path;
        childFolder.parent = folder;
        folder.children.push(childFolder);
        // Recursively load subfolders
        await this.list(repository, childFolder);
      } else {
        const file = factory.createFile();
        file.name = entry.name;
        file.path = entry.path;
        file.hash = entry.hash;
        file.mimeType = entry.mimeType || '';
        file.size = entry.size;
        file.state = getFileState('LOADED');
        file.parent = folder;
        folder.children.push(file);
      }
    }
  }

  /**
   * Read file content
   */
  async read(repository: Repository, file: File): Promise<string> {
    const db = this.getDB(repository);
    const entry = await db.get('files', file.path);

    if (!entry) {
      throw new Error(`File not found: ${file.path}`);
    }

    if (entry.isFolder) {
      throw new Error(`Cannot read folder as file: ${file.path}`);
    }

    file.content = entry.content;
    file.state = getFileState('LOADED');

    return entry.content;
  }

  /**
   * Write file content
   */
  async write(repository: Repository, file: File, content: string): Promise<void> {
    const db = this.getDB(repository);
    const hash = await this.hashContent(content);

    await db.put('files', {
      path: file.path,
      name: file.name,
      content: content,
      hash: hash,
      mimeType: file.mimeType || this.guessMimeType(file.name),
      size: new Blob([content]).size,
      parentPath: this.getParentPath(file.path),
      isFolder: false,
      updatedAt: Date.now()
    });

    file.content = content;
    file.hash = hash;
    file.state = getFileState('LOADED');
  }

  /**
   * Delete a file or folder
   */
  async delete(repository: Repository, entry: File | Folder): Promise<void> {
    const db = this.getDB(repository);

    if ('children' in entry) {
      // It's a folder - delete recursively
      await this.deleteRecursive(db, entry.path);
    } else {
      await db.delete('files', entry.path);
    }

    // Remove from parent
    const parent = entry.parent;
    if (parent) {
      const index = parent.children.indexOf(entry);
      if (index >= 0) {
        parent.children.splice(index, 1);
      }
    }
  }

  /**
   * Recursively delete folder contents
   */
  private async deleteRecursive(db: IDBPDatabase<StorageDBSchema>, path: string): Promise<void> {
    const children = await db.getAllFromIndex('files', 'by-parent', path);

    for (const child of children) {
      if (child.isFolder) {
        await this.deleteRecursive(db, child.path);
      }
      await db.delete('files', child.path);
    }

    await db.delete('files', path);
  }

  /**
   * Create a new folder
   */
  async createFolder(repository: Repository, parent: Folder, name: string): Promise<Folder> {
    const db = this.getDB(repository);
    const factory = StorageFactory.eINSTANCE;

    const path = this.joinPath(parent.path, name);

    // Check if already exists
    const existing = await db.get('files', path);
    if (existing) {
      throw new Error(`Folder already exists: ${path}`);
    }

    await db.put('files', {
      path: path,
      name: name,
      content: '',
      hash: '',
      parentPath: parent.path,
      isFolder: true,
      size: 0,
      updatedAt: Date.now()
    });

    const folder = factory.createFolder();
    folder.name = name;
    folder.path = path;
    folder.parent = parent;
    parent.children.push(folder);

    return folder;
  }

  /**
   * Create a new file
   */
  async createFile(repository: Repository, parent: Folder, name: string, content: string = ''): Promise<File> {
    const db = this.getDB(repository);
    const factory = StorageFactory.eINSTANCE;

    const path = this.joinPath(parent.path, name);
    const hash = await this.hashContent(content);

    // Check if already exists
    const existing = await db.get('files', path);
    if (existing) {
      throw new Error(`File already exists: ${path}`);
    }

    await db.put('files', {
      path: path,
      name: name,
      content: content,
      hash: hash,
      mimeType: this.guessMimeType(name),
      size: new Blob([content]).size,
      parentPath: parent.path,
      isFolder: false,
      updatedAt: Date.now()
    });

    const file = factory.createFile();
    file.name = name;
    file.path = path;
    file.content = content;
    file.hash = hash;
    file.mimeType = this.guessMimeType(name);
    file.size = new Blob([content]).size;
    file.state = getFileState('LOADED');
    file.parent = parent;
    parent.children.push(file);

    return file;
  }

  /**
   * Check if repository exists
   */
  async exists(repository: Repository): Promise<boolean> {
    try {
      const localRepo = repository as LocalRepository;
      const dbName = localRepo.databaseName || 'gene-workspace';

      // Try to open the database
      const databases = await indexedDB.databases();
      return databases.some(db => db.name === dbName);
    } catch {
      return false;
    }
  }

  /**
   * Get database for repository
   */
  private getDB(repository: Repository): IDBPDatabase<StorageDBSchema> {
    const db = this.databases.get(repository.uri);
    if (!db) {
      throw new Error(`Not connected to repository: ${repository.uri}`);
    }
    return db;
  }

  /**
   * Get parent path from a full path
   */
  private getParentPath(path: string): string {
    if (path === '/') return '';
    const parts = path.split('/').filter(Boolean);
    parts.pop();
    return parts.length === 0 ? '/' : '/' + parts.join('/');
  }

  /**
   * Join path segments
   */
  private joinPath(base: string, name: string): string {
    if (base === '/') return '/' + name;
    return base + '/' + name;
  }

  /**
   * Hash content using SHA-256
   */
  private async hashContent(content: string): Promise<string> {
    const encoder = new TextEncoder();
    const data = encoder.encode(content);
    const hashBuffer = await crypto.subtle.digest('SHA-256', data);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
  }

  /**
   * Guess MIME type from filename
   */
  private guessMimeType(filename: string): string {
    const ext = filename.split('.').pop()?.toLowerCase();
    const mimeTypes: Record<string, string> = {
      'ecore': 'application/xml',
      'xmi': 'application/xml',
      'xml': 'application/xml',
      'json': 'application/json',
      'ts': 'text/typescript',
      'js': 'text/javascript',
      'md': 'text/markdown',
      'txt': 'text/plain'
    };
    return mimeTypes[ext || ''] || 'application/octet-stream';
  }
}
