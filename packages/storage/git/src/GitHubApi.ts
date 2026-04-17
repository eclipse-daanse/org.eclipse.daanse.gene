/**
 * GitHubApi - Low-level GitHub REST API client
 *
 * Simple fetch-based client for GitHub API operations.
 */

export interface GitHubOptions {
  token?: string;
  baseUrl?: string; // For GitHub Enterprise
}

export interface GitHubBranch {
  name: string;
  commit: {
    sha: string;
  };
  protected: boolean;
}

export interface GitHubCommit {
  sha: string;
  commit: {
    message: string;
    author: {
      name: string;
      date: string;
    };
  };
}

export interface GitHubTreeItem {
  path: string;
  mode: string;
  type: 'blob' | 'tree';
  sha: string;
  size?: number;
}

export interface GitHubTree {
  sha: string;
  tree: GitHubTreeItem[];
  truncated: boolean;
}

export interface GitHubBlob {
  sha: string;
  content: string;
  encoding: 'base64' | 'utf-8';
  size: number;
}

export interface GitHubFileContent {
  name: string;
  path: string;
  sha: string;
  size: number;
  content?: string;
  encoding?: string;
  type: 'file' | 'dir';
}

export interface CreateBlobResponse {
  sha: string;
}

export interface CreateTreeResponse {
  sha: string;
}

export interface CreateCommitResponse {
  sha: string;
}

export interface UpdateRefResponse {
  ref: string;
  object: {
    sha: string;
  };
}

/**
 * GitHub REST API client
 */
export class GitHubApi {
  private owner: string;
  private repo: string;
  private token?: string;
  private baseUrl: string;

  constructor(owner: string, repo: string, options: GitHubOptions = {}) {
    this.owner = owner;
    this.repo = repo;
    this.token = options.token;
    this.baseUrl = options.baseUrl || 'https://api.github.com';
  }

  /**
   * Set authentication token
   */
  setToken(token: string): void {
    this.token = token;
  }

  /**
   * Make authenticated API request
   */
  private async request<T>(
    method: string,
    path: string,
    body?: unknown
  ): Promise<T> {
    const url = `${this.baseUrl}${path}`;
    const headers: Record<string, string> = {
      'Accept': 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28'
    };

    if (this.token) {
      headers['Authorization'] = `Bearer ${this.token}`;
    }

    if (body) {
      headers['Content-Type'] = 'application/json';
    }

    const response = await fetch(url, {
      method,
      headers,
      body: body ? JSON.stringify(body) : undefined
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({}));
      throw new Error(`GitHub API error: ${response.status} ${response.statusText} - ${error.message || ''}`);
    }

    return response.json();
  }

  // ==================== Branches ====================

  /**
   * List branches
   */
  async listBranches(): Promise<GitHubBranch[]> {
    return this.request('GET', `/repos/${this.owner}/${this.repo}/branches`);
  }

  /**
   * Get default branch
   */
  async getDefaultBranch(): Promise<string> {
    const repo = await this.request<{ default_branch: string }>(
      'GET',
      `/repos/${this.owner}/${this.repo}`
    );
    return repo.default_branch;
  }

  /**
   * Get branch info
   */
  async getBranch(branch: string): Promise<GitHubBranch> {
    return this.request('GET', `/repos/${this.owner}/${this.repo}/branches/${branch}`);
  }

  // ==================== Commits ====================

  /**
   * List commits on a branch
   */
  async listCommits(branch: string, perPage: number = 30): Promise<GitHubCommit[]> {
    return this.request(
      'GET',
      `/repos/${this.owner}/${this.repo}/commits?sha=${branch}&per_page=${perPage}`
    );
  }

  /**
   * Get commit info
   */
  async getCommit(sha: string): Promise<GitHubCommit> {
    return this.request('GET', `/repos/${this.owner}/${this.repo}/commits/${sha}`);
  }

  // ==================== Trees ====================

  /**
   * Get tree (directory listing)
   */
  async getTree(sha: string, recursive: boolean = true): Promise<GitHubTree> {
    const params = recursive ? '?recursive=1' : '';
    return this.request('GET', `/repos/${this.owner}/${this.repo}/git/trees/${sha}${params}`);
  }

  // ==================== Blobs (File Content) ====================

  /**
   * Get blob (file content)
   */
  async getBlob(sha: string): Promise<GitHubBlob> {
    return this.request('GET', `/repos/${this.owner}/${this.repo}/git/blobs/${sha}`);
  }

  /**
   * Create blob
   */
  async createBlob(content: string, encoding: 'base64' | 'utf-8' = 'base64'): Promise<CreateBlobResponse> {
    return this.request('POST', `/repos/${this.owner}/${this.repo}/git/blobs`, {
      content,
      encoding
    });
  }

  // ==================== File Operations ====================

  /**
   * Get file content (high-level)
   */
  async getContent(path: string, ref?: string): Promise<GitHubFileContent | GitHubFileContent[]> {
    const params = ref ? `?ref=${ref}` : '';
    return this.request('GET', `/repos/${this.owner}/${this.repo}/contents/${path}${params}`);
  }

  /**
   * Create or update file (high-level)
   */
  async createOrUpdateFile(
    path: string,
    message: string,
    content: string,
    branch: string,
    sha?: string // Required for update
  ): Promise<{ content: GitHubFileContent; commit: GitHubCommit }> {
    return this.request('PUT', `/repos/${this.owner}/${this.repo}/contents/${path}`, {
      message,
      content: btoa(content), // Base64 encode
      branch,
      ...(sha ? { sha } : {})
    });
  }

  /**
   * Delete file
   */
  async deleteFile(
    path: string,
    message: string,
    sha: string,
    branch: string
  ): Promise<{ commit: GitHubCommit }> {
    return this.request('DELETE', `/repos/${this.owner}/${this.repo}/contents/${path}`, {
      message,
      sha,
      branch
    });
  }

  // ==================== Git Data API (Low-level) ====================

  /**
   * Create tree
   */
  async createTree(
    tree: Array<{
      path: string;
      mode: '100644' | '100755' | '040000' | '160000' | '120000';
      type: 'blob' | 'tree' | 'commit';
      sha?: string;
      content?: string;
    }>,
    baseTree?: string
  ): Promise<CreateTreeResponse> {
    return this.request('POST', `/repos/${this.owner}/${this.repo}/git/trees`, {
      tree,
      ...(baseTree ? { base_tree: baseTree } : {})
    });
  }

  /**
   * Create commit
   */
  async createCommit(
    message: string,
    tree: string,
    parents: string[]
  ): Promise<CreateCommitResponse> {
    return this.request('POST', `/repos/${this.owner}/${this.repo}/git/commits`, {
      message,
      tree,
      parents
    });
  }

  /**
   * Update reference (branch head)
   */
  async updateRef(
    ref: string,
    sha: string,
    force: boolean = false
  ): Promise<UpdateRefResponse> {
    return this.request('PATCH', `/repos/${this.owner}/${this.repo}/git/refs/${ref}`, {
      sha,
      force
    });
  }
}
