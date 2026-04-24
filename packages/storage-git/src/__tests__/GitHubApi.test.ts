import { describe, it, expect, beforeEach, vi, type Mock } from 'vitest';
import { GitHubApi } from '../GitHubApi';

// Mock fetch globally
const mockFetch = vi.fn() as Mock;
globalThis.fetch = mockFetch;

describe('GitHubApi', () => {
  let api: GitHubApi;

  beforeEach(() => {
    vi.clearAllMocks();
    api = new GitHubApi('owner', 'repo', { token: 'test-token' });
  });

  const mockResponse = (data: unknown, ok = true, status = 200) => {
    mockFetch.mockResolvedValueOnce({
      ok,
      status,
      statusText: ok ? 'OK' : 'Error',
      json: () => Promise.resolve(data)
    });
  };

  describe('constructor', () => {
    it('should use default base URL', () => {
      const defaultApi = new GitHubApi('owner', 'repo');
      mockResponse({ default_branch: 'main' });

      defaultApi.getDefaultBranch();

      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('https://api.github.com'),
        expect.any(Object)
      );
    });

    it('should use custom base URL', () => {
      const customApi = new GitHubApi('owner', 'repo', {
        baseUrl: 'https://gitea.example.com/api/v1'
      });
      mockResponse({ default_branch: 'main' });

      customApi.getDefaultBranch();

      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('https://gitea.example.com/api/v1'),
        expect.any(Object)
      );
    });
  });

  describe('authentication', () => {
    it('should include auth header when token is set', async () => {
      mockResponse({ default_branch: 'main' });

      await api.getDefaultBranch();

      expect(mockFetch).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          headers: expect.objectContaining({
            'Authorization': 'Bearer test-token'
          })
        })
      );
    });

    it('should allow setting token after construction', async () => {
      const noTokenApi = new GitHubApi('owner', 'repo');
      noTokenApi.setToken('new-token');
      mockResponse({ default_branch: 'main' });

      await noTokenApi.getDefaultBranch();

      expect(mockFetch).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          headers: expect.objectContaining({
            'Authorization': 'Bearer new-token'
          })
        })
      );
    });
  });

  describe('branches', () => {
    it('should list branches', async () => {
      const branches = [
        { name: 'main', commit: { sha: 'abc123' }, protected: false },
        { name: 'develop', commit: { sha: 'def456' }, protected: false }
      ];
      mockResponse(branches);

      const result = await api.listBranches();

      expect(result).toEqual(branches);
      expect(mockFetch).toHaveBeenCalledWith(
        'https://api.github.com/repos/owner/repo/branches',
        expect.any(Object)
      );
    });

    it('should get default branch', async () => {
      mockResponse({ default_branch: 'main' });

      const result = await api.getDefaultBranch();

      expect(result).toBe('main');
    });

    it('should get branch info', async () => {
      const branch = { name: 'main', commit: { sha: 'abc123' }, protected: true };
      mockResponse(branch);

      const result = await api.getBranch('main');

      expect(result).toEqual(branch);
      expect(mockFetch).toHaveBeenCalledWith(
        'https://api.github.com/repos/owner/repo/branches/main',
        expect.any(Object)
      );
    });
  });

  describe('commits', () => {
    it('should list commits', async () => {
      const commits = [
        { sha: 'abc123', commit: { message: 'First', author: { name: 'User', date: '2024-01-01' } } }
      ];
      mockResponse(commits);

      const result = await api.listCommits('main');

      expect(result).toEqual(commits);
      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('sha=main'),
        expect.any(Object)
      );
    });

    it('should get commit info', async () => {
      const commit = { sha: 'abc123', commit: { message: 'Test', author: { name: 'User', date: '2024-01-01' } } };
      mockResponse(commit);

      const result = await api.getCommit('abc123');

      expect(result).toEqual(commit);
    });
  });

  describe('trees', () => {
    it('should get tree recursively', async () => {
      const tree = {
        sha: 'tree123',
        tree: [
          { path: 'file.txt', mode: '100644', type: 'blob', sha: 'blob1', size: 100 },
          { path: 'dir', mode: '040000', type: 'tree', sha: 'tree2' }
        ],
        truncated: false
      };
      mockResponse(tree);

      const result = await api.getTree('tree123', true);

      expect(result).toEqual(tree);
      expect(mockFetch).toHaveBeenCalledWith(
        'https://api.github.com/repos/owner/repo/git/trees/tree123?recursive=1',
        expect.any(Object)
      );
    });

    it('should get tree non-recursively', async () => {
      const tree = { sha: 'tree123', tree: [], truncated: false };
      mockResponse(tree);

      await api.getTree('tree123', false);

      expect(mockFetch).toHaveBeenCalledWith(
        'https://api.github.com/repos/owner/repo/git/trees/tree123',
        expect.any(Object)
      );
    });
  });

  describe('blobs', () => {
    it('should get blob content', async () => {
      const blob = {
        sha: 'blob123',
        content: btoa('Hello World'),
        encoding: 'base64',
        size: 11
      };
      mockResponse(blob);

      const result = await api.getBlob('blob123');

      expect(result).toEqual(blob);
    });

    it('should create blob', async () => {
      mockResponse({ sha: 'newblob123' });

      const result = await api.createBlob('SGVsbG8gV29ybGQ=', 'base64');

      expect(result.sha).toBe('newblob123');
      expect(mockFetch).toHaveBeenCalledWith(
        'https://api.github.com/repos/owner/repo/git/blobs',
        expect.objectContaining({
          method: 'POST',
          body: expect.stringContaining('"encoding":"base64"')
        })
      );
    });
  });

  describe('file operations', () => {
    it('should get file content', async () => {
      const content = {
        name: 'test.txt',
        path: 'test.txt',
        sha: 'abc123',
        size: 100,
        type: 'file'
      };
      mockResponse(content);

      const result = await api.getContent('test.txt');

      expect(result).toEqual(content);
    });

    it('should create or update file', async () => {
      mockResponse({
        content: { name: 'test.txt', path: 'test.txt', sha: 'new123' },
        commit: { sha: 'commit123' }
      });

      const result = await api.createOrUpdateFile(
        'test.txt',
        'Create file',
        'Hello',
        'main'
      );

      expect(result.content.sha).toBe('new123');
      expect(mockFetch).toHaveBeenCalledWith(
        'https://api.github.com/repos/owner/repo/contents/test.txt',
        expect.objectContaining({
          method: 'PUT'
        })
      );
    });

    it('should delete file', async () => {
      mockResponse({ commit: { sha: 'commit123' } });

      await api.deleteFile('test.txt', 'Delete file', 'oldsha', 'main');

      expect(mockFetch).toHaveBeenCalledWith(
        'https://api.github.com/repos/owner/repo/contents/test.txt',
        expect.objectContaining({
          method: 'DELETE'
        })
      );
    });
  });

  describe('git data API', () => {
    it('should create tree', async () => {
      mockResponse({ sha: 'newtree123' });

      const result = await api.createTree([
        { path: 'test.txt', mode: '100644', type: 'blob', sha: 'blob123' }
      ], 'basetree123');

      expect(result.sha).toBe('newtree123');
    });

    it('should create commit', async () => {
      mockResponse({ sha: 'newcommit123' });

      const result = await api.createCommit('Test commit', 'tree123', ['parent123']);

      expect(result.sha).toBe('newcommit123');
    });

    it('should update ref', async () => {
      mockResponse({ ref: 'refs/heads/main', object: { sha: 'newsha' } });

      const result = await api.updateRef('heads/main', 'newsha');

      expect(result.object.sha).toBe('newsha');
    });
  });

  describe('error handling', () => {
    it('should throw on API error', async () => {
      mockResponse({ message: 'Not Found' }, false, 404);

      await expect(api.getDefaultBranch()).rejects.toThrow('GitHub API error: 404');
    });

    it('should include error message from response', async () => {
      mockResponse({ message: 'Rate limit exceeded' }, false, 403);

      await expect(api.getDefaultBranch()).rejects.toThrow('Rate limit exceeded');
    });
  });
});
