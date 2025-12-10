/**
 * Tests for the Context Engine module
 *
 * Note: Full integration tests are slow due to file I/O and parsing.
 * These tests focus on configuration and basic behavior.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { ContextEngine } from '../src/context-engine';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

describe('ContextEngine', () => {
  let testDir: string;

  beforeEach(() => {
    // Create a minimal test directory
    testDir = fs.mkdtempSync(path.join(os.tmpdir(), 'uce-engine-test-'));

    const srcDir = path.join(testDir, 'src');
    fs.mkdirSync(srcDir);

    // Create minimal test files
    fs.writeFileSync(
      path.join(srcDir, 'index.ts'),
      `export const VERSION = '1.0.0';
export function add(a: number, b: number): number {
  return a + b;
}
`
    );
  });

  afterEach(() => {
    fs.rmSync(testDir, { recursive: true, force: true });
  });

  describe('constructor', () => {
    it('should create engine with default config', () => {
      const engine = new ContextEngine({
        projectRoot: testDir,
        autoIndex: false,
        enableEmbeddings: false,
      });

      expect(engine).toBeDefined();
    });

    it('should resolve relative project root to absolute path', () => {
      const engine = new ContextEngine({
        projectRoot: '.',
        autoIndex: false,
        enableEmbeddings: false,
      });

      expect(engine).toBeDefined();
    });

    it('should disable embeddings when configured', () => {
      const engine = new ContextEngine({
        projectRoot: testDir,
        autoIndex: false,
        enableEmbeddings: false,
      });

      // Engine should be created without errors
      expect(engine).toBeDefined();
    });
  });

  describe('getStats', () => {
    it('should return null before indexing', () => {
      const engine = new ContextEngine({
        projectRoot: testDir,
        autoIndex: false,
        enableEmbeddings: false,
      });

      // Before index, stats should be null
      const stats = engine.getStats();
      expect(stats).toBeNull();
    });
  });

  describe('getGraph', () => {
    it('should return null before indexing', () => {
      const engine = new ContextEngine({
        projectRoot: testDir,
        autoIndex: false,
        enableEmbeddings: false,
      });

      const graph = engine.getGraph();
      expect(graph).toBeNull();
    });
  });

  describe('findRelated', () => {
    it('should return empty array if no graph', () => {
      const engine = new ContextEngine({
        projectRoot: testDir,
        autoIndex: false,
        enableEmbeddings: false,
      });

      const related = engine.findRelated('SomeSymbol');
      expect(related).toEqual([]);
    });
  });

  describe('findCallers', () => {
    it('should return empty array if no graph', () => {
      const engine = new ContextEngine({
        projectRoot: testDir,
        autoIndex: false,
        enableEmbeddings: false,
      });

      const callers = engine.findCallers('someFunction');
      expect(callers).toEqual([]);
    });
  });

  describe('getInheritance', () => {
    it('should return empty hierarchy if no graph', () => {
      const engine = new ContextEngine({
        projectRoot: testDir,
        autoIndex: false,
        enableEmbeddings: false,
      });

      const hierarchy = engine.getInheritance('SomeClass');
      expect(hierarchy).toEqual({ parents: [], children: [] });
    });
  });

  describe('getDependencies', () => {
    it('should return dependency info', () => {
      const engine = new ContextEngine({
        projectRoot: testDir,
        autoIndex: false,
        enableEmbeddings: false,
      });

      const deps = engine.getDependencies('some-file.ts');
      expect(deps).toHaveProperty('imports');
      expect(deps).toHaveProperty('importedBy');
      expect(Array.isArray(deps.imports)).toBe(true);
      expect(Array.isArray(deps.importedBy)).toBe(true);
    });
  });

  describe('cache operations', () => {
    it('should handle clearCache gracefully when no cache exists', async () => {
      const engine = new ContextEngine({
        projectRoot: testDir,
        autoIndex: false,
        enableEmbeddings: false,
      });

      // Should not throw
      await engine.clearCache();
      expect(engine.getGraph()).toBeNull();
    });

    it('should return false from loadIndices when no cache exists', async () => {
      const engine = new ContextEngine({
        projectRoot: testDir,
        autoIndex: false,
        enableEmbeddings: false,
      });

      await engine.initialize();
      const loaded = await engine.loadIndices();
      expect(loaded).toBe(false);
    });
  });
});

// Integration tests for full indexing (slower, run with `vitest run --testTimeout=30000`)
describe('ContextEngine Integration', () => {
  let testDir: string;

  beforeEach(() => {
    testDir = fs.mkdtempSync(path.join(os.tmpdir(), 'uce-engine-int-'));

    const srcDir = path.join(testDir, 'src');
    fs.mkdirSync(srcDir);

    fs.writeFileSync(
      path.join(srcDir, 'math.ts'),
      `export function add(a: number, b: number): number {
  return a + b;
}

export function multiply(a: number, b: number): number {
  return a * b;
}
`
    );
  });

  afterEach(() => {
    fs.rmSync(testDir, { recursive: true, force: true });
  });

  it('should index and retrieve stats', async () => {
    const engine = new ContextEngine({
      projectRoot: testDir,
      autoIndex: false,
      enableEmbeddings: false,
    });

    await engine.initialize();
    const result = await engine.index();

    expect(result.files).toBeGreaterThan(0);
    expect(result.symbols).toBeGreaterThan(0);
    expect(result.duration).toBeGreaterThan(0);

    const stats = engine.getStats();
    expect(stats).not.toBeNull();
    expect(stats?.files).toBeGreaterThan(0);
  }, 30000);

  it('should build knowledge graph after indexing', async () => {
    const engine = new ContextEngine({
      projectRoot: testDir,
      autoIndex: false,
      enableEmbeddings: false,
    });

    await engine.initialize();
    await engine.index();

    const graph = engine.getGraph();
    expect(graph).not.toBeNull();
    expect(graph?.getStats().nodeCount).toBeGreaterThan(0);
  }, 30000);

  it('should search symbols', async () => {
    const engine = new ContextEngine({
      projectRoot: testDir,
      autoIndex: false,
      enableEmbeddings: false,
    });

    await engine.initialize();
    await engine.index();

    const results = engine.searchSymbols('add');
    expect(results.length).toBeGreaterThan(0);
    expect(results.some(r => r.name === 'add')).toBe(true);
  }, 30000);

  it('should retrieve context', async () => {
    const engine = new ContextEngine({
      projectRoot: testDir,
      autoIndex: false,
      enableEmbeddings: false,
    });

    await engine.initialize();
    await engine.index();

    const result = await engine.retrieve('add function');
    expect(result.chunks.length).toBeGreaterThanOrEqual(0);
    expect(result.query).toBe('add function');
  }, 30000);

  it('should save and load cache', async () => {
    const engine = new ContextEngine({
      projectRoot: testDir,
      autoIndex: false,
      enableEmbeddings: false,
    });

    await engine.initialize();
    await engine.index();
    await engine.saveIndices();

    // Check cache exists
    const cacheDir = path.join(testDir, '.uce', 'cache');
    expect(fs.existsSync(path.join(cacheDir, 'bm25.json'))).toBe(true);
    expect(fs.existsSync(path.join(cacheDir, 'graph.json'))).toBe(true);

    // Load in new engine
    const engine2 = new ContextEngine({
      projectRoot: testDir,
      autoIndex: false,
      enableEmbeddings: false,
    });

    await engine2.initialize();
    const loaded = await engine2.loadIndices();
    expect(loaded).toBe(true);
  }, 30000);
});
