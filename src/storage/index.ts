/**
 * Universal Context Engine (UCE) - Storage Module
 * @module storage
 *
 * Index persistence layer with pluggable backends.
 */

// Store interface
export {
  type IndexStore,
  type IndexStoreOptions,
  DEFAULT_INDEX_DIR,
  INDEX_FILE,
  INDEX_FILE_GZ,
  META_FILE,
  CURRENT_INDEX_VERSION,
} from './store.js';

// JSON implementation (MVP)
export { JsonIndexStore, createJsonStore } from './json-store.js';
