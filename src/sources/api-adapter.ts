/**
 * Universal Context Engine - API Source Adapter
 * @module sources/api-adapter
 *
 * Adapter for indexing code from HTTP/REST APIs.
 * Useful for indexing remote repositories, documentation sites, etc.
 */

import type {
  SourceAdapter,
  SourceFile,
  SourceMetadata,
  SourceCapabilities,
} from './source-adapter.js';

// ============================================================================
// API Adapter
// ============================================================================

export interface APIAdapterOptions {
  /** API base URL */
  baseUrl: string;
  /** API authentication headers */
  headers?: Record<string, string>;
  /** Custom name for this source */
  name?: string;
  /** Endpoints configuration */
  endpoints: {
    /** Endpoint to list all files */
    list: string;
    /** Endpoint to fetch a single file (use {id} placeholder) */
    fetch: string;
    /** Optional: Endpoint to detect changes */
    changes?: string;
  };
  /** Transform response data */
  transformers?: {
    /** Transform list response to SourceFile[] */
    list?: (data: unknown) => SourceFile[];
    /** Transform fetch response to SourceFile */
    fetch?: (data: unknown) => SourceFile;
    /** Transform changes response */
    changes?: (data: unknown) => { added: string[]; modified: string[]; removed: string[] };
  };
}

/**
 * API source adapter
 *
 * Fetches code from HTTP APIs with customizable endpoints.
 *
 * Usage:
 * ```typescript
 * const adapter = new APIAdapter({
 *   baseUrl: 'https://api.github.com/repos/owner/repo',
 *   headers: { Authorization: 'token ghp_xxx' },
 *   endpoints: {
 *     list: '/contents',
 *     fetch: '/contents/{id}',
 *   },
 * });
 * await adapter.initialize();
 * const files = await adapter.listFiles();
 * ```
 */
export class APIAdapter implements SourceAdapter {
  readonly metadata: SourceMetadata;
  readonly capabilities: SourceCapabilities;

  private options: APIAdapterOptions;

  constructor(options: APIAdapterOptions) {
    this.options = options;

    this.metadata = {
      id: `api:${options.baseUrl}`,
      type: 'api',
      name: options.name || new URL(options.baseUrl).hostname,
      description: `API source: ${options.baseUrl}`,
    };

    this.capabilities = {
      supportsChangeDetection: !!options.endpoints.changes,
      supportsWatch: false, // APIs typically don't support websockets
      supportsListing: true,
      supportsFetch: true,
      supportsBatchFetch: false, // Could be implemented if API supports it
    };
  }

  async initialize(): Promise<void> {
    // Validate base URL
    try {
      new URL(this.options.baseUrl);
    } catch {
      throw new Error(`Invalid base URL: ${this.options.baseUrl}`);
    }
  }

  async listFiles(): Promise<SourceFile[]> {
    const url = `${this.options.baseUrl}${this.options.endpoints.list}`;
    const response = await this.fetch(url);

    if (this.options.transformers?.list) {
      return this.options.transformers.list(response);
    }

    // Default transformation (assumes response is array of file objects)
    return this.defaultListTransform(response);
  }

  async fetchFile(id: string): Promise<SourceFile> {
    const url = `${this.options.baseUrl}${this.options.endpoints.fetch.replace('{id}', id)}`;
    const response = await this.fetch(url);

    if (this.options.transformers?.fetch) {
      return this.options.transformers.fetch(response);
    }

    // Default transformation
    return this.defaultFetchTransform(response, id);
  }

  async detectChanges(lastSync: Date): Promise<{
    added: string[];
    modified: string[];
    removed: string[];
  }> {
    if (!this.options.endpoints.changes) {
      throw new Error('Change detection not supported by this API');
    }

    const url = `${this.options.baseUrl}${this.options.endpoints.changes}?since=${lastSync.toISOString()}`;
    const response = await this.fetch(url);

    if (this.options.transformers?.changes) {
      return this.options.transformers.changes(response);
    }

    // Default transformation
    return {
      added: [],
      modified: [],
      removed: [],
    };
  }

  async dispose(): Promise<void> {
    // No cleanup needed for API adapter
  }

  // ============================================================================
  // Private Methods
  // ============================================================================

  private async fetch(url: string): Promise<unknown> {
    const response = await globalThis.fetch(url, {
      headers: {
        'Content-Type': 'application/json',
        ...this.options.headers,
      },
    });

    if (!response.ok) {
      throw new Error(`API request failed: ${response.status} ${response.statusText}`);
    }

    return response.json();
  }

  private defaultListTransform(data: unknown): SourceFile[] {
    if (!Array.isArray(data)) {
      throw new Error('Expected array response from list endpoint');
    }

    return data.map((item: any) => ({
      id: item.id || item.path || item.name,
      path: item.path || item.name,
      content: item.content || '',
      language: item.language || this.detectLanguage(item.path || item.name),
      metadata: {
        lastModified: item.lastModified || item.updated_at || new Date().toISOString(),
        size: item.size || 0,
        hash: item.hash || item.sha,
      },
    }));
  }

  private defaultFetchTransform(data: unknown, id: string): SourceFile {
    const item = data as any;

    // Handle GitHub API format (base64 encoded content)
    let content = item.content || '';
    if (item.encoding === 'base64') {
      content = Buffer.from(content, 'base64').toString('utf-8');
    }

    return {
      id,
      path: item.path || id,
      content,
      language: item.language || this.detectLanguage(item.path || id),
      metadata: {
        lastModified: item.lastModified || item.updated_at || new Date().toISOString(),
        size: item.size || content.length,
        hash: item.hash || item.sha,
      },
    };
  }

  private detectLanguage(filePath: string): string {
    const ext = filePath.split('.').pop()?.toLowerCase();
    const languageMap: Record<string, string> = {
      ts: 'typescript',
      tsx: 'tsx',
      js: 'javascript',
      jsx: 'jsx',
      py: 'python',
      java: 'java',
      go: 'go',
      rs: 'rust',
      rb: 'ruby',
      php: 'php',
      swift: 'swift',
      kt: 'kotlin',
      md: 'markdown',
    };

    return ext && languageMap[ext] ? languageMap[ext] : 'unknown';
  }
}

/**
 * Create a new API adapter
 */
export function createAPIAdapter(options: APIAdapterOptions): APIAdapter {
  return new APIAdapter(options);
}

// ============================================================================
// Preset Adapters
// ============================================================================

/**
 * Create GitHub repository adapter
 */
export function createGitHubAdapter(options: {
  owner: string;
  repo: string;
  branch?: string;
  token?: string;
}): APIAdapter {
  const branch = options.branch || 'main';

  return new APIAdapter({
    baseUrl: `https://api.github.com/repos/${options.owner}/${options.repo}`,
    headers: options.token
      ? {
          Authorization: `token ${options.token}`,
          Accept: 'application/vnd.github.v3+json',
        }
      : {
          Accept: 'application/vnd.github.v3+json',
        },
    name: `${options.owner}/${options.repo}`,
    endpoints: {
      list: `/git/trees/${branch}?recursive=1`,
      fetch: '/contents/{id}',
    },
    transformers: {
      list: (data: any) => {
        const tree = data.tree || [];
        return tree
          .filter((item: any) => item.type === 'blob')
          .map((item: any) => ({
            id: item.path,
            path: item.path,
            content: '', // Content loaded separately
            metadata: {
              size: item.size,
              hash: item.sha,
            },
          }));
      },
    },
  });
}
