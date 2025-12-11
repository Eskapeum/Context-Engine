/**
 * Universal Context Engine - Sources Module
 * @module sources
 *
 * Multi-source indexing with pluggable adapters.
 */

// Core interfaces
export type {
  SourceAdapter,
  SourceFile,
  SourceMetadata,
  SourceCapabilities,
  SourceType,
} from './source-adapter.js';

export { SourceAdapterRegistry, createRegistry } from './source-adapter.js';

// Filesystem adapter
export {
  FilesystemAdapter,
  createFilesystemAdapter,
  type FilesystemAdapterOptions,
} from './filesystem-adapter.js';

// API adapter
export {
  APIAdapter,
  createAPIAdapter,
  createGitHubAdapter,
  type APIAdapterOptions,
} from './api-adapter.js';

// Memory adapter
export {
  MemoryAdapter,
  createMemoryAdapter,
  type MemoryAdapterOptions,
} from './memory-adapter.js';
