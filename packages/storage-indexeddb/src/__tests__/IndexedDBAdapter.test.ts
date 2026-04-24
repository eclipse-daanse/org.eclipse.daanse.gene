import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import 'fake-indexeddb/auto';
import { IndexedDBAdapter } from '../IndexedDBAdapter';
import {
  StorageFactory,
  RepositoryState,
  type LocalRepository,
  type Folder,
  getFileState
} from 'storage-core';

describe('IndexedDBAdapter', () => {
  let adapter: IndexedDBAdapter;
  let factory: typeof StorageFactory.eINSTANCE;
  let repository: LocalRepository;

  beforeEach(() => {
    adapter = new IndexedDBAdapter();
    factory = StorageFactory.eINSTANCE;

    repository = factory.createLocalRepository();
    repository.name = 'Test Repo';
    repository.uri = 'local://test-' + Date.now();
    repository.databaseName = 'test-db-' + Date.now();
  });

  afterEach(async () => {
    try {
      await adapter.disconnect(repository);
    } catch {
      // Ignore disconnect errors
    }
  });

  describe('canHandle', () => {
    it('should return true for LocalRepository', () => {
      expect(adapter.canHandle(repository)).toBe(true);
    });

    it('should return false for non-LocalRepository', () => {
      const gitRepo = factory.createGitRepository();
      expect(adapter.canHandle(gitRepo)).toBe(false);
    });
  });

  describe('connect', () => {
    it('should connect to IndexedDB', async () => {
      await adapter.connect(repository);

      expect(repository.state).toBe(RepositoryState.CONNECTED);
      expect(repository.root).toBeDefined();
      expect(repository.root?.path).toBe('/');
    });

    it('should set error state on connection failure', async () => {
      // Mock openDB to throw
      const originalIndexedDB = globalThis.indexedDB;
      (globalThis as any).indexedDB = {
        open: () => {
          throw new Error('Database error');
        }
      };

      try {
        await adapter.connect(repository);
      } catch {
        expect(repository.state).toBe(RepositoryState.ERROR);
        expect(repository.errorMessage).toBeDefined();
      } finally {
        globalThis.indexedDB = originalIndexedDB;
      }
    });
  });

  describe('disconnect', () => {
    it('should disconnect from IndexedDB', async () => {
      await adapter.connect(repository);
      await adapter.disconnect(repository);

      expect(repository.state).toBe(RepositoryState.DISCONNECTED);
    });
  });

  describe('file operations', () => {
    beforeEach(async () => {
      await adapter.connect(repository);
    });

    describe('createFile', () => {
      it('should create a file', async () => {
        const root = repository.root!;
        const file = await adapter.createFile(repository, root, 'test.txt', 'Hello World');

        expect(file.name).toBe('test.txt');
        expect(file.path).toBe('/test.txt');
        expect(file.content).toBe('Hello World');
        expect(file.state).toBe(getFileState('LOADED'));
        expect(root.children.length).toBe(1);
      });

      it('should throw when creating duplicate file', async () => {
        const root = repository.root!;
        await adapter.createFile(repository, root, 'test.txt', 'Content');

        await expect(
          adapter.createFile(repository, root, 'test.txt', 'Other')
        ).rejects.toThrow('File already exists');
      });
    });

    describe('createFolder', () => {
      it('should create a folder', async () => {
        const root = repository.root!;
        const folder = await adapter.createFolder(repository, root, 'subdir');

        expect(folder.name).toBe('subdir');
        expect(folder.path).toBe('/subdir');
        expect(root.children.length).toBe(1);
      });

      it('should throw when creating duplicate folder', async () => {
        const root = repository.root!;
        await adapter.createFolder(repository, root, 'subdir');

        await expect(
          adapter.createFolder(repository, root, 'subdir')
        ).rejects.toThrow('Folder already exists');
      });
    });

    describe('read', () => {
      it('should read file content', async () => {
        const root = repository.root!;
        const file = await adapter.createFile(repository, root, 'test.txt', 'Hello World');

        // Clear content to simulate unloaded state
        file.content = '';

        const content = await adapter.read(repository, file);

        expect(content).toBe('Hello World');
        expect(file.content).toBe('Hello World');
      });

      it('should throw when reading non-existent file', async () => {
        const file = factory.createFile();
        file.path = '/non-existent.txt';

        await expect(adapter.read(repository, file)).rejects.toThrow('File not found');
      });
    });

    describe('write', () => {
      it('should write file content', async () => {
        const root = repository.root!;
        const file = await adapter.createFile(repository, root, 'test.txt', 'Initial');

        await adapter.write(repository, file, 'Updated Content');

        expect(file.content).toBe('Updated Content');

        // Read back to verify persistence
        file.content = '';
        const content = await adapter.read(repository, file);
        expect(content).toBe('Updated Content');
      });

      it('should update hash on write', async () => {
        const root = repository.root!;
        const file = await adapter.createFile(repository, root, 'test.txt', 'Initial');
        const initialHash = file.hash;

        await adapter.write(repository, file, 'Different Content');

        expect(file.hash).not.toBe(initialHash);
      });
    });

    describe('delete', () => {
      it('should delete a file', async () => {
        const root = repository.root!;
        const file = await adapter.createFile(repository, root, 'test.txt', 'Content');

        await adapter.delete(repository, file);

        expect(root.children.length).toBe(0);
      });

      it('should delete a folder with contents', async () => {
        const root = repository.root!;
        const folder = await adapter.createFolder(repository, root, 'subdir');
        await adapter.createFile(repository, folder, 'nested.txt', 'Content');

        await adapter.delete(repository, folder);

        expect(root.children.length).toBe(0);
      });
    });

    describe('list', () => {
      it('should list files in folder', async () => {
        const root = repository.root!;
        await adapter.createFile(repository, root, 'file1.txt', 'Content 1');
        await adapter.createFile(repository, root, 'file2.txt', 'Content 2');
        await adapter.createFolder(repository, root, 'subdir');

        // Clear children to simulate fresh load
        root.children.length = 0;

        await adapter.list(repository, root);

        expect(root.children.length).toBe(3);
      });
    });
  });

  describe('nested folder operations', () => {
    beforeEach(async () => {
      await adapter.connect(repository);
    });

    it('should handle nested folder creation', async () => {
      const root = repository.root!;
      const folder1 = await adapter.createFolder(repository, root, 'level1');
      const folder2 = await adapter.createFolder(repository, folder1, 'level2');
      const file = await adapter.createFile(repository, folder2, 'deep.txt', 'Deep content');

      expect(file.path).toBe('/level1/level2/deep.txt');
    });

    it('should read nested file', async () => {
      const root = repository.root!;
      const folder = await adapter.createFolder(repository, root, 'nested');
      await adapter.createFile(repository, folder, 'file.txt', 'Nested content');

      // Create new file reference
      const fileRef = factory.createFile();
      fileRef.path = '/nested/file.txt';

      const content = await adapter.read(repository, fileRef);
      expect(content).toBe('Nested content');
    });
  });

  describe('exists', () => {
    it('should return true for existing database', async () => {
      await adapter.connect(repository);

      const exists = await adapter.exists(repository);
      expect(exists).toBe(true);
    });
  });

  describe('sync', () => {
    it('should return success with empty changes (no-op for IndexedDB)', async () => {
      await adapter.connect(repository);

      const result = await adapter.sync(repository);

      expect(result.success).toBe(true);
      expect(result.created).toHaveLength(0);
      expect(result.updated).toHaveLength(0);
      expect(result.deleted).toHaveLength(0);
      expect(result.errors).toHaveLength(0);
    });
  });
});
