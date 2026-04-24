import { describe, it, expect, beforeEach, vi, type Mock } from 'vitest';
import { GitAdapter } from '../GitAdapter';
import {
  StorageFactory,
  RepositoryState,
  GitProvider,
  type GitRepository,
  getFileState
} from 'storage-core';

// Mock fetch globally
const mockFetch = vi.fn() as Mock;
globalThis.fetch = mockFetch;

describe('GitAdapter', () => {
  let adapter: GitAdapter;
  let factory: typeof StorageFactory.eINSTANCE;
  let repository: GitRepository;

  beforeEach(() => {
    vi.clearAllMocks();
    adapter = new GitAdapter();
    factory = StorageFactory.eINSTANCE;

    repository = factory.createGitRepository();
    repository.name = 'Test Repo';
    repository.uri = 'github://owner/repo';
    repository.owner = 'testowner';
    repository.repo = 'testrepo';
    repository.provider = GitProvider.GITHUB;
  });

  const mockResponse = (data: unknown, ok = true, status = 200) => {
    mockFetch.mockResolvedValueOnce({
      ok,
      status,
      statusText: ok ? 'OK' : 'Error',
      json: () => Promise.resolve(data)
    });
  };

  const setupConnectedRepo = async () => {
    // Order of API calls in connect():
    // 1. listBranches()
    // 2. getDefaultBranch()
    // 3. getTree()

    // Mock branches list
    mockResponse([
      { name: 'main', commit: { sha: 'abc123' }, protected: false }
    ]);
    // Mock default branch
    mockResponse({ default_branch: 'main' });
    // Mock tree
    mockResponse({
      sha: 'tree123',
      tree: [
        { path: 'file.txt', mode: '100644', type: 'blob', sha: 'blob1', size: 100 },
        { path: 'folder', mode: '040000', type: 'tree', sha: 'tree2' },
        { path: 'folder/nested.txt', mode: '100644', type: 'blob', sha: 'blob2', size: 50 }
      ],
      truncated: false
    });

    await adapter.connect(repository, { token: 'test-token' });
  };

  describe('canHandle', () => {
    it('should return true for GitRepository', () => {
      expect(adapter.canHandle(repository)).toBe(true);
    });

    it('should return false for LocalRepository', () => {
      const localRepo = factory.createLocalRepository();
      expect(adapter.canHandle(localRepo)).toBe(false);
    });
  });

  describe('connect', () => {
    it('should connect to GitHub repository', async () => {
      await setupConnectedRepo();

      expect(repository.state).toBe(RepositoryState.CONNECTED);
      expect(repository.currentBranch).toBeDefined();
      expect(repository.currentBranch?.name).toBe('main');
      expect(repository.root).toBeDefined();
    });

    it('should load branches on connect', async () => {
      await setupConnectedRepo();

      expect(repository.branches.length).toBe(1);
    });

    it('should build file tree on connect', async () => {
      await setupConnectedRepo();

      const root = repository.root!;
      expect(root.children.length).toBe(2); // file.txt and folder

      // Check folder has nested file
      let folder: any;
      for (const child of root.children) {
        if ((child as any).name === 'folder') {
          folder = child;
          break;
        }
      }
      expect(folder).toBeDefined();
      expect(folder.children.length).toBe(1);
    });

    it('should set error state on connection failure', async () => {
      mockResponse({ message: 'Not Found' }, false, 404);

      try {
        await adapter.connect(repository, { token: 'test-token' });
      } catch {
        expect(repository.state).toBe(RepositoryState.ERROR);
        expect(repository.errorMessage).toBeDefined();
      }
    });
  });

  describe('disconnect', () => {
    it('should disconnect from repository', async () => {
      await setupConnectedRepo();

      await adapter.disconnect(repository);

      expect(repository.state).toBe(RepositoryState.DISCONNECTED);
    });
  });

  describe('read', () => {
    it('should read file content', async () => {
      await setupConnectedRepo();

      // Mock blob response
      mockResponse({
        sha: 'blob1',
        content: btoa('Hello World'),
        encoding: 'base64',
        size: 11
      });

      // Find file in tree
      let file: any;
      for (const child of repository.root!.children) {
        if ((child as any).name === 'file.txt') {
          file = child;
          break;
        }
      }

      const content = await adapter.read(repository, file);

      expect(content).toBe('Hello World');
      expect(file.content).toBe('Hello World');
      expect(file.state).toBe(getFileState('LOADED'));
    });
  });

  describe('write', () => {
    it('should stage file for write', async () => {
      await setupConnectedRepo();

      let file: any;
      for (const child of repository.root!.children) {
        if ((child as any).name === 'file.txt') {
          file = child;
          break;
        }
      }

      await adapter.write(repository, file, 'Updated content');

      expect(file.content).toBe('Updated content');
      expect(file.state).toBe(getFileState('MODIFIED'));
    });
  });

  describe('createFile', () => {
    it('should create a new file', async () => {
      await setupConnectedRepo();

      const root = repository.root!;
      const file = await adapter.createFile(repository, root, 'new.txt', 'New content');

      expect(file.name).toBe('new.txt');
      expect(file.path).toBe('/new.txt');
      expect(file.content).toBe('New content');
      expect(file.state).toBe(getFileState('NEW'));
    });
  });

  describe('createFolder', () => {
    it('should create a new folder', async () => {
      await setupConnectedRepo();

      const root = repository.root!;
      const folder = await adapter.createFolder(repository, root, 'newdir');

      expect(folder.name).toBe('newdir');
      expect(folder.path).toBe('/newdir');
    });
  });

  describe('delete', () => {
    it('should mark file as deleted', async () => {
      await setupConnectedRepo();

      let file: any;
      for (const child of repository.root!.children) {
        if ((child as any).name === 'file.txt') {
          file = child;
          break;
        }
      }

      await adapter.delete(repository, file);

      expect(file.state).toBe(getFileState('DELETED'));
    });
  });

  describe('sync', () => {
    it('should sync changes to remote', async () => {
      await setupConnectedRepo();

      // Create a file to sync
      const root = repository.root!;
      await adapter.createFile(repository, root, 'sync-test.txt', 'Sync content');

      // Mock blob creation
      mockResponse({ sha: 'newblob123' });
      // Mock tree creation
      mockResponse({ sha: 'newtree123' });
      // Mock commit creation
      mockResponse({ sha: 'newcommit123' });
      // Mock ref update
      mockResponse({ ref: 'refs/heads/main', object: { sha: 'newcommit123' } });

      const result = await adapter.sync(repository);

      expect(result.success).toBe(true);
      expect(result.created).toHaveLength(1);
      expect(repository.currentBranch?.sha).toBe('newcommit123');
    });

    it('should return success with empty changes', async () => {
      await setupConnectedRepo();

      const result = await adapter.sync(repository);

      expect(result.success).toBe(true);
      expect(result.created).toHaveLength(0);
      expect(result.updated).toHaveLength(0);
      expect(result.deleted).toHaveLength(0);
    });

    it('should handle sync errors', async () => {
      await setupConnectedRepo();

      // Create a file to sync
      const root = repository.root!;
      await adapter.createFile(repository, root, 'fail.txt', 'Content');

      // Mock blob creation failure
      mockResponse({ message: 'Server error' }, false, 500);

      const result = await adapter.sync(repository);

      expect(result.success).toBe(false);
      expect(result.errors).toHaveLength(1);
      expect(repository.state).toBe(RepositoryState.ERROR);
    });
  });

  describe('exists', () => {
    it('should return true for existing repository', async () => {
      mockResponse({ default_branch: 'main' });

      const exists = await adapter.exists(repository);

      expect(exists).toBe(true);
    });

    it('should return false for non-existing repository', async () => {
      mockResponse({ message: 'Not Found' }, false, 404);

      const exists = await adapter.exists(repository);

      expect(exists).toBe(false);
    });
  });

  describe('Gitea support', () => {
    it('should use custom base URL for Gitea', async () => {
      repository.provider = GitProvider.GITEA;
      repository.baseUrl = 'https://gitea.example.com';

      // Order: listBranches, getDefaultBranch, getTree
      mockResponse([{ name: 'main', commit: { sha: 'abc' }, protected: false }]);
      mockResponse({ default_branch: 'main' });
      mockResponse({ sha: 'tree', tree: [], truncated: false });

      await adapter.connect(repository, { token: 'token' });

      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('https://gitea.example.com/api/v1'),
        expect.any(Object)
      );
    });
  });
});
