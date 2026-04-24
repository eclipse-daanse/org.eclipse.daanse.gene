/**
 * useWorkspace - Composable for workspace state management
 *
 * Provides reactive access to the workspace and its repositories.
 */

import { ref, shallowRef, computed, type Ref, type ShallowRef, onMounted } from 'tsm:vue';
import {
  StorageFactory,
  type Workspace,
  type Repository,
  type LocalRepository,
  type GitRepository,
  type Folder,
  type File,
  type FileSystemEntry,
  StorageAdapterRegistry,
  type StorageAdapter,
  type ConnectionOptions,
  RepositoryState
} from 'storage-core';

// Module-level storage registry reference (set by activate)
let _storageRegistry: StorageAdapterRegistry | null = null

/**
 * Set the storage adapter registry (called from module activate)
 */
export function setStorageRegistry(registry: StorageAdapterRegistry): void {
  _storageRegistry = registry
}

// Workspace persistence key
const WORKSPACE_STORAGE_KEY = 'gene-workspace-config';

interface PersistedRepository {
  type: 'local' | 'git';
  name: string;
  uri: string;
  // LocalRepository fields
  databaseName?: string;
  // GitRepository fields
  provider?: string;
  owner?: string;
  repo?: string;
  branch?: string;
}

interface PersistedWorkspace {
  name: string;
  repositories: PersistedRepository[];
}

/**
 * Workspace state
 */
export interface WorkspaceState {
  workspace: Workspace;
  selectedEntry: FileSystemEntry | null;
  expandedFolders: Set<string>;
  loading: boolean;
  error: string | null;
}

/**
 * Create a new workspace composable instance
 */
export function useWorkspace() {
  const factory = StorageFactory.eINSTANCE;
  const registry = _storageRegistry!;

  // Reactive state
  const workspace: ShallowRef<Workspace> = shallowRef(factory.createWorkspace());
  const selectedEntry: Ref<FileSystemEntry | null> = ref(null);
  const expandedFolders: Ref<Set<string>> = ref(new Set());
  const loading: Ref<boolean> = ref(false);
  const error: Ref<string | null> = ref(null);
  const initialized: Ref<boolean> = ref(false);

  // Trigger for re-rendering tree
  const updateTrigger: Ref<number> = ref(0);

  /**
   * Save workspace configuration to localStorage
   */
  function saveWorkspaceConfig() {
    const config: PersistedWorkspace = {
      name: workspace.value.name || 'Default Workspace',
      repositories: workspace.value.repositories.map(repo => {
        if ('databaseName' in repo) {
          const localRepo = repo as LocalRepository;
          return {
            type: 'local' as const,
            name: repo.name,
            uri: repo.uri,
            databaseName: localRepo.databaseName
          };
        } else {
          const gitRepo = repo as GitRepository;
          return {
            type: 'git' as const,
            name: repo.name,
            uri: repo.uri,
            provider: gitRepo.provider,
            owner: gitRepo.owner,
            repo: gitRepo.repo,
            branch: gitRepo.branch
          };
        }
      })
    };
    localStorage.setItem(WORKSPACE_STORAGE_KEY, JSON.stringify(config));
  }

  /**
   * Load workspace configuration from localStorage
   */
  async function loadWorkspaceConfig(): Promise<void> {
    const stored = localStorage.getItem(WORKSPACE_STORAGE_KEY);
    if (!stored) return;

    try {
      const config: PersistedWorkspace = JSON.parse(stored);
      workspace.value.name = config.name;

      for (const repoConfig of config.repositories) {
        let repo: Repository;

        if (repoConfig.type === 'local') {
          const localRepo = factory.createLocalRepository();
          localRepo.name = repoConfig.name;
          localRepo.uri = repoConfig.uri;
          localRepo.databaseName = repoConfig.databaseName || '';
          repo = localRepo;
        } else {
          const gitRepo = factory.createGitRepository();
          gitRepo.name = repoConfig.name;
          gitRepo.uri = repoConfig.uri;
          gitRepo.provider = repoConfig.provider || 'github';
          gitRepo.owner = repoConfig.owner || '';
          gitRepo.repo = repoConfig.repo || '';
          gitRepo.branch = repoConfig.branch || 'main';
          repo = gitRepo;
        }

        workspace.value.repositories.push(repo);

        // Try to connect (ignore errors for now)
        try {
          await connectRepository(repo);
        } catch (e) {
          console.warn(`Failed to connect to ${repo.name}:`, e);
        }
      }

      if (workspace.value.repositories.length > 0) {
        workspace.value.activeRepository = workspace.value.repositories[0];
      }

      triggerUpdate();
    } catch (e) {
      console.error('Failed to load workspace config:', e);
    }
  }

  /**
   * Initialize workspace (load from storage)
   */
  async function initialize(): Promise<void> {
    if (initialized.value) return;
    initialized.value = true;
    loading.value = true;
    try {
      await loadWorkspaceConfig();
    } finally {
      loading.value = false;
    }
  }

  /**
   * Force UI update
   */
  function triggerUpdate() {
    updateTrigger.value++;
  }

  /**
   * Computed: All repositories
   */
  const repositories = computed(() => {
    updateTrigger.value; // Dependency for reactivity
    return workspace.value.repositories || [];
  });

  /**
   * Computed: Active repository
   */
  const activeRepository = computed(() => {
    updateTrigger.value;
    return workspace.value.activeRepository;
  });

  /**
   * Initialize workspace with a name
   */
  function initWorkspace(name: string) {
    const ws = factory.createWorkspace();
    ws.name = name;
    workspace.value = ws;
    triggerUpdate();
  }

  /**
   * Add a repository to the workspace
   */
  async function addRepository(repository: Repository): Promise<void> {
    workspace.value.repositories.push(repository);
    if (!workspace.value.activeRepository) {
      workspace.value.activeRepository = repository;
    }
    saveWorkspaceConfig();
    triggerUpdate();
  }

  /**
   * Remove a repository from the workspace
   */
  async function removeRepository(repository: Repository): Promise<void> {
    const adapter = registry.getAdapterFor(repository);
    if (adapter && repository.state === RepositoryState.CONNECTED) {
      await adapter.disconnect(repository);
    }

    const index = workspace.value.repositories.indexOf(repository);
    if (index >= 0) {
      workspace.value.repositories.splice(index, 1);
    }

    if (workspace.value.activeRepository === repository) {
      workspace.value.activeRepository = workspace.value.repositories[0] || undefined;
    }
    saveWorkspaceConfig();
    triggerUpdate();
  }

  /**
   * Connect to a repository
   */
  async function connectRepository(
    repository: Repository,
    options?: ConnectionOptions
  ): Promise<void> {
    const adapter = registry.getAdapterFor(repository);
    if (!adapter) {
      throw new Error(`No adapter found for repository: ${repository.uri}`);
    }

    loading.value = true;
    error.value = null;

    try {
      await adapter.connect(repository, options);
      triggerUpdate();
    } catch (e) {
      error.value = e instanceof Error ? e.message : 'Connection failed';
      throw e;
    } finally {
      loading.value = false;
    }
  }

  /**
   * Disconnect from a repository
   */
  async function disconnectRepository(repository: Repository): Promise<void> {
    const adapter = registry.getAdapterFor(repository);
    if (adapter) {
      await adapter.disconnect(repository);
      triggerUpdate();
    }
  }

  /**
   * Set active repository
   */
  function setActiveRepository(repository: Repository | undefined) {
    workspace.value.activeRepository = repository;
    triggerUpdate();
  }

  /**
   * Select a file system entry
   */
  function selectEntry(entry: FileSystemEntry | null) {
    selectedEntry.value = entry;
  }

  /**
   * Toggle folder expansion
   */
  function toggleFolder(folder: Folder) {
    const path = folder.path;
    if (expandedFolders.value.has(path)) {
      expandedFolders.value.delete(path);
    } else {
      expandedFolders.value.add(path);
    }
    triggerUpdate();
  }

  /**
   * Expand a folder
   */
  function expandFolder(folder: Folder) {
    expandedFolders.value.add(folder.path);
    triggerUpdate();
  }

  /**
   * Collapse a folder
   */
  function collapseFolder(folder: Folder) {
    expandedFolders.value.delete(folder.path);
    triggerUpdate();
  }

  /**
   * Check if folder is expanded
   */
  function isFolderExpanded(folder: Folder): boolean {
    return expandedFolders.value.has(folder.path);
  }

  /**
   * Load file content
   */
  async function loadFile(repository: Repository, file: File): Promise<string> {
    const adapter = registry.getAdapterFor(repository);
    if (!adapter) {
      throw new Error(`No adapter found for repository: ${repository.uri}`);
    }

    loading.value = true;
    try {
      const content = await adapter.read(repository, file);
      triggerUpdate();
      return content;
    } finally {
      loading.value = false;
    }
  }

  /**
   * Save file content
   */
  async function saveFile(
    repository: Repository,
    file: File,
    content: string
  ): Promise<void> {
    const adapter = registry.getAdapterFor(repository);
    if (!adapter) {
      throw new Error(`No adapter found for repository: ${repository.uri}`);
    }

    loading.value = true;
    try {
      await adapter.write(repository, file, content);
      triggerUpdate();
    } finally {
      loading.value = false;
    }
  }

  /**
   * Create a new file
   */
  async function createFile(
    repository: Repository,
    parent: Folder,
    name: string,
    content: string = ''
  ): Promise<File> {
    const adapter = registry.getAdapterFor(repository);
    if (!adapter) {
      throw new Error(`No adapter found for repository: ${repository.uri}`);
    }

    loading.value = true;
    try {
      const file = await adapter.createFile(repository, parent, name, content);
      triggerUpdate();
      return file;
    } finally {
      loading.value = false;
    }
  }

  /**
   * Create a new folder
   */
  async function createFolder(
    repository: Repository,
    parent: Folder,
    name: string
  ): Promise<Folder> {
    const adapter = registry.getAdapterFor(repository);
    if (!adapter) {
      throw new Error(`No adapter found for repository: ${repository.uri}`);
    }

    loading.value = true;
    try {
      const folder = await adapter.createFolder(repository, parent, name);
      expandFolder(folder);
      triggerUpdate();
      return folder;
    } finally {
      loading.value = false;
    }
  }

  /**
   * Delete a file or folder
   */
  async function deleteEntry(
    repository: Repository,
    entry: FileSystemEntry
  ): Promise<void> {
    const adapter = registry.getAdapterFor(repository);
    if (!adapter) {
      throw new Error(`No adapter found for repository: ${repository.uri}`);
    }

    loading.value = true;
    try {
      await adapter.delete(repository, entry as File | Folder);
      if (selectedEntry.value === entry) {
        selectedEntry.value = null;
      }
      triggerUpdate();
    } finally {
      loading.value = false;
    }
  }

  /**
   * Sync repository (for Git)
   */
  async function syncRepository(repository: Repository) {
    const adapter = registry.getAdapterFor(repository);
    if (!adapter) {
      throw new Error(`No adapter found for repository: ${repository.uri}`);
    }

    loading.value = true;
    try {
      const result = await adapter.sync(repository);
      triggerUpdate();
      return result;
    } finally {
      loading.value = false;
    }
  }

  /**
   * Create and add a local (IndexedDB) repository
   */
  async function addLocalRepository(name: string): Promise<Repository> {
    const repo = factory.createLocalRepository();
    repo.name = name;
    repo.uri = `indexeddb://${name}`;
    repo.databaseName = `gene-repo-${name.toLowerCase().replace(/\s+/g, '-')}`;

    await addRepository(repo);
    await connectRepository(repo);
    return repo;
  }

  /**
   * Create and add a Git repository
   */
  async function addGitRepository(
    name: string,
    provider: 'github' | 'gitea',
    owner: string,
    repoName: string,
    token?: string,
    branch?: string
  ): Promise<Repository> {
    const repo = factory.createGitRepository();
    repo.name = name;
    repo.uri = `git://${provider}/${owner}/${repoName}`;
    repo.provider = provider;
    repo.owner = owner;
    repo.repo = repoName;
    if (branch) repo.branch = branch;

    await addRepository(repo);
    await connectRepository(repo, token ? { token } : undefined);
    return repo;
  }

  /**
   * Read file content
   */
  async function readFile(repository: Repository, file: File): Promise<string> {
    return loadFile(repository, file);
  }

  return {
    // State
    workspace,
    repositories,
    activeRepository,
    selectedEntry,
    expandedFolders,
    loading,
    error,
    updateTrigger,

    // Workspace management
    initialize,
    initWorkspace,
    addRepository,
    removeRepository,
    setActiveRepository,
    addLocalRepository,
    addGitRepository,

    // Repository connection
    connectRepository,
    disconnectRepository,
    syncRepository,

    // Selection
    selectEntry,

    // Folder navigation
    toggleFolder,
    expandFolder,
    collapseFolder,
    isFolderExpanded,

    // File operations
    loadFile,
    saveFile,
    readFile,
    createFile,
    createFolder,
    deleteEntry,

    // Utils
    triggerUpdate
  };
}

/**
 * Shared workspace instance (singleton pattern for global state)
 */
let sharedWorkspace: ReturnType<typeof useWorkspace> | null = null;
let initPromise: Promise<void> | null = null;

export function useSharedWorkspace() {
  if (!sharedWorkspace) {
    sharedWorkspace = useWorkspace();
    // Auto-initialize on first use
    initPromise = sharedWorkspace.initialize();
  }
  return sharedWorkspace;
}

/**
 * Wait for workspace initialization to complete
 */
export async function waitForWorkspaceInit(): Promise<void> {
  if (initPromise) {
    await initPromise;
  }
}
