/**
 * Universal Context Engine - Parser Module
 *
 * Exports all parser types and utilities.
 *
 * @module parser
 */

export * from './types.js';
export { TreeSitterParser, initializeParser } from './tree-sitter-parser.js';
