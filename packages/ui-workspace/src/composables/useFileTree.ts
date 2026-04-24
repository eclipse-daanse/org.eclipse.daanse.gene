/**
 * useFileTree - Composable for file tree transformation
 *
 * Transforms EMF FileSystemEntry hierarchy to PrimeVue Tree format.
 */

import { computed, type Ref } from 'tsm:vue';
import type {
  Repository,
  Folder,
  File,
  FileSystemEntry,
  FileState
} from 'storage-core';
import { getFileState } from 'storage-core';

/**
 * PrimeVue TreeNode interface
 */
export interface TreeNode {
  key: string;
  label: string;
  icon: string;
  data: {
    type: 'repository' | 'folder' | 'file';
    entry: Repository | FileSystemEntry;
    repository?: Repository;
  };
  children?: TreeNode[];
  leaf?: boolean;
  selectable?: boolean;
  styleClass?: string;
}

/**
 * File icons based on extension
 */
const FILE_ICONS: Record<string, string> = {
  // Code files
  'ts': 'pi pi-file',
  'js': 'pi pi-file',
  'vue': 'pi pi-file',
  'tsx': 'pi pi-file',
  'jsx': 'pi pi-file',
  'json': 'pi pi-file',
  'html': 'pi pi-file',
  'css': 'pi pi-file',
  'scss': 'pi pi-file',

  // EMF files
  'ecore': 'pi pi-sitemap',
  'xmi': 'pi pi-database',
  'genconfig': 'pi pi-cog',

  // Documents
  'md': 'pi pi-file',
  'txt': 'pi pi-file',
  'pdf': 'pi pi-file-pdf',

  // Default
  'default': 'pi pi-file'
};

/**
 * Get icon for file based on extension
 */
function getFileIcon(filename: string): string {
  const ext = filename.split('.').pop()?.toLowerCase() || '';
  return FILE_ICONS[ext] || FILE_ICONS['default'];
}

/**
 * Get style class based on file state
 */
function getFileStateClass(state: FileState): string {
  const stateValue = typeof state === 'number' ? state : state;

  switch (stateValue) {
    case getFileState('NEW'):
      return 'file-state-new';
    case getFileState('MODIFIED'):
      return 'file-state-modified';
    case getFileState('DELETED'):
      return 'file-state-deleted';
    default:
      return '';
  }
}

/**
 * Transform FileSystemEntry to TreeNode
 */
function entryToTreeNode(
  entry: FileSystemEntry,
  repository: Repository,
  expandedFolders: Set<string>
): TreeNode {
  const isFolder = 'children' in entry;

  if (isFolder) {
    const folder = entry as Folder;
    const isExpanded = expandedFolders.has(folder.path);

    return {
      key: `${repository.uri}:${folder.path}`,
      label: folder.name || '/',
      icon: isExpanded ? 'pi pi-folder-open' : 'pi pi-folder',
      data: {
        type: 'folder',
        entry: folder,
        repository
      },
      children: folder.children.map(child =>
        entryToTreeNode(child, repository, expandedFolders)
      ),
      leaf: false
    };
  } else {
    const file = entry as File;
    return {
      key: `${repository.uri}:${file.path}`,
      label: file.name,
      icon: getFileIcon(file.name),
      data: {
        type: 'file',
        entry: file,
        repository
      },
      leaf: true,
      styleClass: getFileStateClass(file.state)
    };
  }
}

/**
 * Transform Repository to TreeNode
 */
function repositoryToTreeNode(
  repository: Repository,
  expandedFolders: Set<string>
): TreeNode {
  const children: TreeNode[] = [];

  if (repository.root) {
    // Add root folder's children directly under repository
    for (const child of repository.root.children) {
      children.push(entryToTreeNode(child, repository, expandedFolders));
    }
  }

  // Determine icon based on repository type
  let icon = 'pi pi-database';
  if ('provider' in repository) {
    icon = 'pi pi-github';
  } else if ('databaseName' in repository) {
    icon = 'pi pi-desktop';
  }

  return {
    key: repository.uri,
    label: repository.name,
    icon,
    data: {
      type: 'repository',
      entry: repository as any,
      repository
    },
    children,
    leaf: false
  };
}

/**
 * useFileTree composable
 */
export function useFileTree(
  repositories: Ref<Repository[]>,
  expandedFolders: Ref<Set<string>>,
  updateTrigger: Ref<number>
) {
  /**
   * Computed tree nodes from repositories
   */
  const treeNodes = computed<TreeNode[]>(() => {
    // Depend on update trigger for reactivity
    updateTrigger.value;

    return repositories.value.map(repo =>
      repositoryToTreeNode(repo, expandedFolders.value)
    );
  });

  /**
   * Find TreeNode by key
   */
  function findNodeByKey(key: string): TreeNode | null {
    function search(nodes: TreeNode[]): TreeNode | null {
      for (const node of nodes) {
        if (node.key === key) return node;
        if (node.children) {
          const found = search(node.children);
          if (found) return found;
        }
      }
      return null;
    }
    return search(treeNodes.value);
  }

  /**
   * Get expanded keys set from expandedFolders
   */
  const expandedKeys = computed(() => {
    updateTrigger.value;
    const keys: Record<string, boolean> = {};

    // Expand all repositories by default
    for (const repo of repositories.value) {
      keys[repo.uri] = true;
    }

    // Add expanded folders
    for (const path of expandedFolders.value) {
      // Find the repository that contains this path
      for (const repo of repositories.value) {
        keys[`${repo.uri}:${path}`] = true;
      }
    }

    return keys;
  });

  return {
    treeNodes,
    expandedKeys,
    findNodeByKey
  };
}
