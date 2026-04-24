/**
 * GitAdapter - Git-based storage adapter (GitHub, Gitea, etc.)
 *
 * Stores files in a Git repository via REST API.
 * Supports GitHub and Gitea (self-hosted).
 */

import {
  BaseStorageAdapter,
  type ConnectionOptions,
  type SyncResult,
  type Repository,
  type GitRepository,
  type File,
  type Folder,
  type Branch,
  type Commit,
  StorageFactory,
  RepositoryState,
  GitProvider,
  getFileState,
  getGitProvider
} from 'storage-core';

import { GitHubApi, type GitHubTreeItem } from './GitHubApi';

/**
 * Git connection options
 */
export interface GitConnectionOptions extends ConnectionOptions {
  token: string;
}

/**
 * Pending file change for sync
 */
interface PendingChange {
  type: 'create' | 'update' | 'delete';
  file: File;
  content?: string;
}

/**
 * Git storage adapter
 */
export class GitAdapter extends BaseStorageAdapter {
  readonly type = 'git';
  readonly displayName = 'Git Repository';

  private apis: Map<string, GitHubApi> = new Map();
  private pendingChanges: Map<string, PendingChange[]> = new Map();

  /**
   * Check if this adapter can handle the repository
   */
  canHandle(repository: Repository): boolean {
    return 'provider' in repository && 'owner' in repository && 'repo' in repository;
  }

  /**
   * Connect to Git repository
   */
  async connect(repository: Repository, options?: GitConnectionOptions): Promise<void> {
    const gitRepo = repository as GitRepository;

    try {
      repository.state = RepositoryState.CONNECTING;

      // Create API client based on provider
      const api = this.createApi(gitRepo, options?.token);
      this.apis.set(repository.uri, api);

      // Get branches
      await this.loadBranches(gitRepo, api);

      // Get default branch if not set
      if (!gitRepo.currentBranch && gitRepo.branches.length > 0) {
        const defaultBranchName = await api.getDefaultBranch();
        for (const branch of gitRepo.branches) {
          if (branch.name === defaultBranchName) {
            gitRepo.currentBranch = branch;
            break;
          }
        }
      }

      // Load file tree
      if (gitRepo.currentBranch) {
        await this.loadTree(gitRepo, api);
      }

      repository.state = RepositoryState.CONNECTED;
      repository.errorMessage = '';
    } catch (error) {
      repository.state = RepositoryState.ERROR;
      repository.errorMessage = error instanceof Error ? error.message : 'Unknown error';
      throw error;
    }
  }

  /**
   * Create API client for provider
   */
  private createApi(repo: GitRepository, token?: string): GitHubApi {
    const providerValue = repo.provider;
    const isGitea = providerValue === GitProvider.GITEA;

    const options: { token?: string; baseUrl?: string } = {};
    if (token) options.token = token;
    if (isGitea && repo.baseUrl) {
      options.baseUrl = repo.baseUrl + '/api/v1';
    }

    return new GitHubApi(repo.owner, repo.repo, options);
  }

  /**
   * Load branches from API
   */
  private async loadBranches(repo: GitRepository, api: GitHubApi): Promise<void> {
    const factory = StorageFactory.eINSTANCE;
    const branches = await api.listBranches();

    repo.branches.length = 0;

    for (const b of branches) {
      const branch = factory.createBranch();
      branch.name = b.name;
      branch.sha = b.commit.sha;
      branch.isDefault = false; // Will be set later
      repo.branches.push(branch);
    }
  }

  /**
   * Load file tree from current branch
   */
  private async loadTree(repo: GitRepository, api: GitHubApi): Promise<void> {
    const factory = StorageFactory.eINSTANCE;

    if (!repo.currentBranch?.sha) {
      throw new Error('No branch selected');
    }

    const tree = await api.getTree(repo.currentBranch.sha, true);

    // Create root folder
    const root = factory.createFolder();
    root.name = '';
    root.path = '/';
    repo.root = root;

    // Build folder structure
    const folders = new Map<string, Folder>();
    folders.set('/', root);

    // First pass: create all folders
    for (const item of tree.tree) {
      if (item.type === 'tree') {
        const folder = factory.createFolder();
        folder.name = this.getFileName(item.path);
        folder.path = '/' + item.path;
        folders.set(folder.path, folder);
      }
    }

    // Second pass: build hierarchy and add files
    for (const item of tree.tree) {
      const parentPath = this.getParentPath('/' + item.path);
      const parent = folders.get(parentPath) || root;

      if (item.type === 'tree') {
        const folder = folders.get('/' + item.path)!;
        parent.children.push(folder);
      } else if (item.type === 'blob') {
        const file = factory.createFile();
        file.name = this.getFileName(item.path);
        file.path = '/' + item.path;
        file.hash = item.sha;
        file.size = item.size || 0;
        file.state = getFileState('UNLOADED');
        file.mimeType = this.guessMimeType(file.name);
        parent.children.push(file);
      }
    }
  }

  /**
   * Disconnect from Git repository
   */
  async disconnect(repository: Repository): Promise<void> {
    this.apis.delete(repository.uri);
    this.pendingChanges.delete(repository.uri);
    repository.state = RepositoryState.DISCONNECTED;
  }

  /**
   * List files in a folder (already loaded from tree)
   */
  async list(repository: Repository, folder: Folder): Promise<void> {
    // Files are already loaded from tree
    // This could be used for lazy loading if needed
  }

  /**
   * Read file content
   */
  async read(repository: Repository, file: File): Promise<string> {
    const api = this.getApi(repository);

    if (!file.hash) {
      throw new Error(`File has no hash: ${file.path}`);
    }

    const blob = await api.getBlob(file.hash);

    // Decode base64 content
    const content = blob.encoding === 'base64'
      ? atob(blob.content)
      : blob.content;

    file.content = content;
    file.state = getFileState('LOADED');

    return content;
  }

  /**
   * Write file content (stages for sync)
   */
  async write(repository: Repository, file: File, content: string): Promise<void> {
    file.content = content;
    file.state = getFileState('MODIFIED');

    // Stage change for sync
    this.stageChange(repository.uri, {
      type: file.hash ? 'update' : 'create',
      file,
      content
    });
  }

  /**
   * Delete file (stages for sync)
   */
  async delete(repository: Repository, entry: File | Folder): Promise<void> {
    if ('children' in entry) {
      // Delete folder contents recursively
      for (const child of entry.children) {
        await this.delete(repository, child as File | Folder);
      }
    } else {
      const file = entry as File;
      file.state = getFileState('DELETED');
      this.stageChange(repository.uri, { type: 'delete', file });
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
   * Create a new folder
   */
  async createFolder(repository: Repository, parent: Folder, name: string): Promise<Folder> {
    const factory = StorageFactory.eINSTANCE;

    const path = this.joinPath(parent.path, name);

    const folder = factory.createFolder();
    folder.name = name;
    folder.path = path;
    folder.parent = parent;
    parent.children.push(folder);

    // Git doesn't track empty folders - folder is created implicitly when files are added
    return folder;
  }

  /**
   * Create a new file
   */
  async createFile(repository: Repository, parent: Folder, name: string, content: string = ''): Promise<File> {
    const factory = StorageFactory.eINSTANCE;

    const path = this.joinPath(parent.path, name);

    const file = factory.createFile();
    file.name = name;
    file.path = path;
    file.content = content;
    file.mimeType = this.guessMimeType(name);
    file.size = new Blob([content]).size;
    file.state = getFileState('NEW');
    file.parent = parent;
    parent.children.push(file);

    // Stage for sync
    this.stageChange(repository.uri, { type: 'create', file, content });

    return file;
  }

  /**
   * Sync changes to remote
   */
  async sync(repository: Repository): Promise<SyncResult> {
    const gitRepo = repository as GitRepository;
    const api = this.getApi(repository);
    const changes = this.pendingChanges.get(repository.uri) || [];

    if (changes.length === 0) {
      return { success: true, created: [], updated: [], deleted: [], errors: [] };
    }

    const result: SyncResult = {
      success: true,
      created: [],
      updated: [],
      deleted: [],
      errors: []
    };

    try {
      repository.state = RepositoryState.SYNCING;

      // Get current branch info
      if (!gitRepo.currentBranch?.sha) {
        throw new Error('No branch selected');
      }

      const branchName = gitRepo.currentBranch.name;
      const baseSha = gitRepo.currentBranch.sha;

      // Build tree changes
      const treeChanges: Array<{
        path: string;
        mode: '100644';
        type: 'blob';
        sha?: string;
        content?: string;
      }> = [];

      for (const change of changes) {
        const path = change.file.path.startsWith('/')
          ? change.file.path.slice(1)
          : change.file.path;

        if (change.type === 'delete') {
          // For delete, we omit from tree (handled by base_tree)
          treeChanges.push({
            path,
            mode: '100644',
            type: 'blob',
            sha: null as any // null sha = delete
          });
          result.deleted.push(change.file);
        } else {
          // Create blob for content
          const blob = await api.createBlob(btoa(change.content || ''), 'base64');
          treeChanges.push({
            path,
            mode: '100644',
            type: 'blob',
            sha: blob.sha
          });

          if (change.type === 'create') {
            result.created.push(change.file);
          } else {
            result.updated.push(change.file);
          }

          // Update file hash
          change.file.hash = blob.sha;
          change.file.state = getFileState('LOADED');
        }
      }

      // Create tree
      const newTree = await api.createTree(treeChanges, baseSha);

      // Create commit
      const commitMessage = this.generateCommitMessage(changes);
      const newCommit = await api.createCommit(commitMessage, newTree.sha, [baseSha]);

      // Update branch ref
      await api.updateRef(`heads/${branchName}`, newCommit.sha);

      // Update local branch SHA
      gitRepo.currentBranch.sha = newCommit.sha;

      // Clear pending changes
      this.pendingChanges.delete(repository.uri);

      repository.state = RepositoryState.CONNECTED;
    } catch (error) {
      repository.state = RepositoryState.ERROR;
      repository.errorMessage = error instanceof Error ? error.message : 'Sync failed';
      result.success = false;
      result.errors.push({
        file: changes[0]?.file,
        message: error instanceof Error ? error.message : 'Unknown error'
      });
    }

    return result;
  }

  /**
   * Check if repository exists
   */
  async exists(repository: Repository): Promise<boolean> {
    try {
      const gitRepo = repository as GitRepository;
      const api = this.createApi(gitRepo);
      await api.getDefaultBranch();
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Stage a change for sync
   */
  private stageChange(uri: string, change: PendingChange): void {
    const changes = this.pendingChanges.get(uri) || [];

    // Remove any existing change for this file
    const existingIndex = changes.findIndex(c => c.file.path === change.file.path);
    if (existingIndex >= 0) {
      changes.splice(existingIndex, 1);
    }

    changes.push(change);
    this.pendingChanges.set(uri, changes);
  }

  /**
   * Generate commit message from changes
   */
  private generateCommitMessage(changes: PendingChange[]): string {
    const created = changes.filter(c => c.type === 'create').length;
    const updated = changes.filter(c => c.type === 'update').length;
    const deleted = changes.filter(c => c.type === 'delete').length;

    const parts: string[] = [];
    if (created > 0) parts.push(`${created} file(s) created`);
    if (updated > 0) parts.push(`${updated} file(s) updated`);
    if (deleted > 0) parts.push(`${deleted} file(s) deleted`);

    return parts.join(', ') || 'Update files';
  }

  /**
   * Get API client for repository
   */
  private getApi(repository: Repository): GitHubApi {
    const api = this.apis.get(repository.uri);
    if (!api) {
      throw new Error(`Not connected to repository: ${repository.uri}`);
    }
    return api;
  }

  /**
   * Get parent path
   */
  private getParentPath(path: string): string {
    if (path === '/') return '/';
    const parts = path.split('/').filter(Boolean);
    parts.pop();
    return parts.length === 0 ? '/' : '/' + parts.join('/');
  }

  /**
   * Get file name from path
   */
  private getFileName(path: string): string {
    return path.split('/').pop() || '';
  }

  /**
   * Join path segments
   */
  private joinPath(base: string, name: string): string {
    if (base === '/') return '/' + name;
    return base + '/' + name;
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
