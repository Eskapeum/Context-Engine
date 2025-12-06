/**
 * Tests for the Knowledge Graph module
 */

import { describe, it, expect, beforeEach } from 'vitest';
import {
  KnowledgeGraph,
  GraphBuilder,
  buildKnowledgeGraph,
} from '../src/graph/index';
import type { ParseResult, Symbol, Import, Export, CallReference } from '../src/parser/types';

describe('KnowledgeGraph', () => {
  let graph: KnowledgeGraph;

  beforeEach(() => {
    graph = new KnowledgeGraph();
  });

  describe('addNode / getNode', () => {
    it('should add and retrieve a node', () => {
      graph.addNode({ id: 'test1', type: 'class', name: 'TestClass' });

      const node = graph.getNode('test1');
      expect(node).toBeDefined();
      expect(node?.name).toBe('TestClass');
      expect(node?.type).toBe('class');
    });

    it('should overwrite existing node with same id', () => {
      graph.addNode({ id: 'test1', type: 'class', name: 'OldName' });
      graph.addNode({ id: 'test1', type: 'class', name: 'NewName' });

      const node = graph.getNode('test1');
      expect(node?.name).toBe('NewName');
    });
  });

  describe('addEdge / getEdge', () => {
    it('should add and retrieve an edge', () => {
      graph.addNode({ id: 'a', type: 'class', name: 'ClassA' });
      graph.addNode({ id: 'b', type: 'class', name: 'ClassB' });

      const edgeId = graph.addEdge({ source: 'a', target: 'b', type: 'extends' });

      const edge = graph.getEdge(edgeId);
      expect(edge).toBeDefined();
      expect(edge?.source).toBe('a');
      expect(edge?.target).toBe('b');
      expect(edge?.type).toBe('extends');
    });

    it('should auto-generate edge id if not provided', () => {
      const edgeId = graph.addEdge({ source: 'a', target: 'b', type: 'calls' });
      expect(edgeId).toMatch(/^e\d+$/);
    });

    it('should use provided edge id', () => {
      const edgeId = graph.addEdge({ id: 'custom-edge', source: 'a', target: 'b', type: 'calls' });
      expect(edgeId).toBe('custom-edge');
    });
  });

  describe('findNodes', () => {
    beforeEach(() => {
      graph.addNode({ id: '1', type: 'class', name: 'UserService', filePath: 'src/user.ts', exported: true });
      graph.addNode({ id: '2', type: 'function', name: 'getUser', filePath: 'src/user.ts', exported: false });
      graph.addNode({ id: '3', type: 'class', name: 'AuthService', filePath: 'src/auth.ts', exported: true });
    });

    it('should find nodes by type', () => {
      const classes = graph.findNodes({ type: 'class' });
      expect(classes).toHaveLength(2);
      expect(classes.map(n => n.name)).toContain('UserService');
      expect(classes.map(n => n.name)).toContain('AuthService');
    });

    it('should find nodes by file path', () => {
      const userNodes = graph.findNodes({ filePath: 'src/user.ts' });
      expect(userNodes).toHaveLength(2);
    });

    it('should find nodes by name (string)', () => {
      const nodes = graph.findNodes({ name: 'Service' });
      expect(nodes).toHaveLength(2);
    });

    it('should find nodes by name (regex)', () => {
      const nodes = graph.findNodes({ name: /^User/ });
      expect(nodes).toHaveLength(1);
      expect(nodes[0].name).toBe('UserService');
    });

    it('should find exported nodes', () => {
      const exported = graph.findNodes({ exported: true });
      expect(exported).toHaveLength(2);
    });
  });

  describe('findRelated', () => {
    beforeEach(() => {
      // Create a simple graph:
      // ClassA -> ClassB -> ClassC
      // ClassA -> ClassD
      graph.addNode({ id: 'a', type: 'class', name: 'ClassA' });
      graph.addNode({ id: 'b', type: 'class', name: 'ClassB' });
      graph.addNode({ id: 'c', type: 'class', name: 'ClassC' });
      graph.addNode({ id: 'd', type: 'class', name: 'ClassD' });

      graph.addEdge({ source: 'a', target: 'b', type: 'extends' });
      graph.addEdge({ source: 'b', target: 'c', type: 'extends' });
      graph.addEdge({ source: 'a', target: 'd', type: 'implements' });
    });

    it('should find directly related nodes', () => {
      const result = graph.findRelated('a', { maxDepth: 1 });

      expect(result.nodes).toHaveLength(3); // a, b, d
      expect(result.nodes.map(n => n.id)).toContain('b');
      expect(result.nodes.map(n => n.id)).toContain('d');
    });

    it('should respect maxDepth', () => {
      const depth1 = graph.findRelated('a', { maxDepth: 1 });
      const depth2 = graph.findRelated('a', { maxDepth: 2 });

      expect(depth1.nodes.map(n => n.id)).not.toContain('c');
      expect(depth2.nodes.map(n => n.id)).toContain('c');
    });

    it('should filter by edge types', () => {
      const result = graph.findRelated('a', { edgeTypes: ['extends'] });

      expect(result.nodes.map(n => n.id)).toContain('b');
      expect(result.nodes.map(n => n.id)).not.toContain('d');
    });

    it('should handle direction option', () => {
      const outgoing = graph.findRelated('a', { direction: 'outgoing', maxDepth: 1 });
      const incoming = graph.findRelated('b', { direction: 'incoming', maxDepth: 1 });

      expect(outgoing.nodes.map(n => n.id)).toContain('b');
      expect(incoming.nodes.map(n => n.id)).toContain('a');
    });
  });

  describe('findPath', () => {
    beforeEach(() => {
      graph.addNode({ id: 'a', type: 'class', name: 'A' });
      graph.addNode({ id: 'b', type: 'class', name: 'B' });
      graph.addNode({ id: 'c', type: 'class', name: 'C' });
      graph.addNode({ id: 'd', type: 'class', name: 'D' });

      graph.addEdge({ source: 'a', target: 'b', type: 'calls' });
      graph.addEdge({ source: 'b', target: 'c', type: 'calls' });
      graph.addEdge({ source: 'c', target: 'd', type: 'calls' });
    });

    it('should find shortest path between nodes', () => {
      const path = graph.findPath('a', 'd');
      expect(path).toEqual(['a', 'b', 'c', 'd']);
    });

    it('should return null if no path exists', () => {
      graph.addNode({ id: 'isolated', type: 'class', name: 'Isolated' });
      const path = graph.findPath('a', 'isolated');
      expect(path).toBeNull();
    });

    it('should respect maxDepth', () => {
      const path = graph.findPath('a', 'd', { maxDepth: 2 });
      expect(path).toBeNull();
    });
  });

  describe('getCallers / getCallees', () => {
    beforeEach(() => {
      graph.addNode({ id: 'main', type: 'function', name: 'main' });
      graph.addNode({ id: 'helper', type: 'function', name: 'helper' });
      graph.addNode({ id: 'util', type: 'function', name: 'util' });

      graph.addEdge({ source: 'main', target: 'helper', type: 'calls' });
      graph.addEdge({ source: 'helper', target: 'util', type: 'calls' });
    });

    it('should get callers of a function', () => {
      const callers = graph.getCallers('helper');
      expect(callers).toHaveLength(1);
      expect(callers[0].name).toBe('main');
    });

    it('should get callees of a function', () => {
      const callees = graph.getCallees('main');
      expect(callees).toHaveLength(1);
      expect(callees[0].name).toBe('helper');
    });

    it('should return empty array if no callers', () => {
      const callers = graph.getCallers('main');
      expect(callers).toHaveLength(0);
    });
  });

  describe('getInheritanceChain', () => {
    beforeEach(() => {
      // Animal -> Mammal -> Dog
      graph.addNode({ id: 'animal', type: 'class', name: 'Animal' });
      graph.addNode({ id: 'mammal', type: 'class', name: 'Mammal' });
      graph.addNode({ id: 'dog', type: 'class', name: 'Dog' });

      graph.addEdge({ source: 'dog', target: 'mammal', type: 'extends' });
      graph.addEdge({ source: 'mammal', target: 'animal', type: 'extends' });
    });

    it('should get parent chain (up)', () => {
      const chain = graph.getInheritanceChain('dog', 'up');
      expect(chain.map(n => n.name)).toEqual(['Mammal', 'Animal']);
    });

    it('should get child chain (down)', () => {
      const chain = graph.getInheritanceChain('animal', 'down');
      expect(chain.map(n => n.name)).toEqual(['Mammal', 'Dog']);
    });
  });

  describe('removeNode', () => {
    it('should remove node and its edges', () => {
      graph.addNode({ id: 'a', type: 'class', name: 'A' });
      graph.addNode({ id: 'b', type: 'class', name: 'B' });
      graph.addEdge({ source: 'a', target: 'b', type: 'calls' });

      const removed = graph.removeNode('a');

      expect(removed).toBe(true);
      expect(graph.getNode('a')).toBeUndefined();
      expect(graph.getStats().edgeCount).toBe(0);
    });

    it('should return false for non-existent node', () => {
      const removed = graph.removeNode('nonexistent');
      expect(removed).toBe(false);
    });
  });

  describe('getAllNodes / getAllEdges', () => {
    it('should return all nodes', () => {
      graph.addNode({ id: 'a', type: 'class', name: 'A' });
      graph.addNode({ id: 'b', type: 'class', name: 'B' });

      const nodes = graph.getAllNodes();
      expect(nodes).toHaveLength(2);
    });

    it('should return all edges', () => {
      graph.addNode({ id: 'a', type: 'class', name: 'A' });
      graph.addNode({ id: 'b', type: 'class', name: 'B' });
      graph.addEdge({ source: 'a', target: 'b', type: 'calls' });
      graph.addEdge({ source: 'b', target: 'a', type: 'calls' });

      const edges = graph.getAllEdges();
      expect(edges).toHaveLength(2);
    });
  });

  describe('getStats', () => {
    it('should return correct statistics', () => {
      graph.addNode({ id: '1', type: 'class', name: 'Class1' });
      graph.addNode({ id: '2', type: 'class', name: 'Class2' });
      graph.addNode({ id: '3', type: 'function', name: 'func1' });
      graph.addEdge({ source: '1', target: '2', type: 'extends' });
      graph.addEdge({ source: '3', target: '1', type: 'calls' });

      const stats = graph.getStats();

      expect(stats.nodeCount).toBe(3);
      expect(stats.edgeCount).toBe(2);
      expect(stats.nodesByType['class']).toBe(2);
      expect(stats.nodesByType['function']).toBe(1);
      expect(stats.edgesByType['extends']).toBe(1);
      expect(stats.edgesByType['calls']).toBe(1);
    });
  });

  describe('toJSON / fromJSON', () => {
    it('should serialize and deserialize graph', () => {
      graph.addNode({ id: 'a', type: 'class', name: 'ClassA', documentation: 'A test class' });
      graph.addNode({ id: 'b', type: 'function', name: 'funcB' });
      graph.addEdge({ source: 'a', target: 'b', type: 'contains' });

      const json = graph.toJSON();
      const restored = KnowledgeGraph.fromJSON(json);

      expect(restored.getNode('a')?.name).toBe('ClassA');
      expect(restored.getNode('a')?.documentation).toBe('A test class');
      expect(restored.getNode('b')?.name).toBe('funcB');
      expect(restored.getStats().edgeCount).toBe(1);
    });
  });

  describe('clear', () => {
    it('should clear all nodes and edges', () => {
      graph.addNode({ id: 'a', type: 'class', name: 'A' });
      graph.addNode({ id: 'b', type: 'class', name: 'B' });
      graph.addEdge({ source: 'a', target: 'b', type: 'calls' });

      graph.clear();

      expect(graph.getStats().nodeCount).toBe(0);
      expect(graph.getStats().edgeCount).toBe(0);
    });
  });
});

describe('GraphBuilder', () => {
  describe('constructor', () => {
    it('should create with default config', () => {
      const builder = new GraphBuilder();
      expect(builder.getGraph()).toBeDefined();
    });

    it('should accept existing graph', () => {
      const existingGraph = new KnowledgeGraph();
      existingGraph.addNode({ id: 'pre-existing', type: 'class', name: 'PreExisting' });

      const builder = new GraphBuilder(existingGraph);
      expect(builder.getGraph().getNode('pre-existing')).toBeDefined();
    });

    it('should accept config object', () => {
      const builder = new GraphBuilder({ includeCallGraph: false });
      expect(builder.getGraph()).toBeDefined();
    });
  });

  describe('addFile', () => {
    it('should add symbols from parse result', () => {
      const builder = new GraphBuilder();

      const parseResult: ParseResult = {
        filePath: 'src/test.ts',
        language: 'typescript',
        success: true,
        symbols: [
          createSymbol('TestClass', 'class', 1, true),
          createSymbol('testMethod', 'method', 5, false, 'TestClass'),
        ],
        imports: [],
        exports: [],
        calls: [],
        typeReferences: [],
        chunks: [],
        parseTime: 10,
      };

      builder.addFile(parseResult);
      const graph = builder.getGraph();

      const nodes = graph.findNodes({ type: 'class' });
      expect(nodes).toHaveLength(1);
      expect(nodes[0].name).toBe('TestClass');
    });

    it('should add inheritance edges', () => {
      const builder = new GraphBuilder();

      const parseResult: ParseResult = {
        filePath: 'src/test.ts',
        language: 'typescript',
        success: true,
        symbols: [
          { ...createSymbol('Child', 'class', 1, true), extends: ['Parent'] },
        ],
        imports: [],
        exports: [],
        calls: [],
        typeReferences: [],
        chunks: [],
        parseTime: 10,
      };

      builder.addFile(parseResult);
      const graph = builder.getGraph();

      const stats = graph.getStats();
      expect(stats.edgesByType['extends']).toBe(1);
    });

    it('should add call edges when includeCallGraph is true', () => {
      const builder = new GraphBuilder({ includeCallGraph: true });

      const parseResult: ParseResult = {
        filePath: 'src/test.ts',
        language: 'typescript',
        success: true,
        symbols: [
          createSymbol('caller', 'function', 1, true),
        ],
        imports: [],
        exports: [],
        calls: [
          { callee: 'callee', caller: 'caller', line: 5, column: 0 },
        ],
        typeReferences: [],
        chunks: [],
        parseTime: 10,
      };

      builder.addFile(parseResult);
      const graph = builder.getGraph();

      const stats = graph.getStats();
      expect(stats.edgesByType['calls']).toBe(1);
    });
  });

  describe('buildFromIndex', () => {
    it('should build graph from index object', () => {
      const builder = new GraphBuilder();

      const index = {
        files: {
          'src/user.ts': {
            symbols: [createSymbol('UserService', 'class', 1, true)],
            imports: [],
            exports: [],
            metadata: { language: 'typescript' },
          },
          'src/auth.ts': {
            symbols: [createSymbol('AuthService', 'class', 1, true)],
            imports: [],
            exports: [],
            metadata: { language: 'typescript' },
          },
        },
      };

      builder.buildFromIndex(index);
      const graph = builder.getGraph();

      const classes = graph.findNodes({ type: 'class' });
      expect(classes).toHaveLength(2);
    });

    it('should build graph from index Map', () => {
      const builder = new GraphBuilder();

      const files = new Map([
        ['src/test.ts', {
          symbols: [createSymbol('TestClass', 'class', 1, true)],
          imports: [],
          exports: [],
          metadata: { language: 'typescript' },
        }],
      ]);

      builder.buildFromIndex({ files });
      const graph = builder.getGraph();

      expect(graph.findNodes({ type: 'class' })).toHaveLength(1);
    });
  });

  describe('clear', () => {
    it('should clear builder state', () => {
      const builder = new GraphBuilder();

      builder.addFile({
        filePath: 'src/test.ts',
        language: 'typescript',
        success: true,
        symbols: [createSymbol('Test', 'class', 1, true)],
        imports: [],
        exports: [],
        calls: [],
        typeReferences: [],
        chunks: [],
        parseTime: 10,
      });

      builder.clear();
      expect(builder.getGraph().getStats().nodeCount).toBe(0);
    });
  });
});

describe('buildKnowledgeGraph', () => {
  it('should build graph from multiple parse results', () => {
    const results: ParseResult[] = [
      {
        filePath: 'src/a.ts',
        language: 'typescript',
        success: true,
        symbols: [createSymbol('ClassA', 'class', 1, true)],
        imports: [],
        exports: [],
        calls: [],
        typeReferences: [],
        chunks: [],
        parseTime: 10,
      },
      {
        filePath: 'src/b.ts',
        language: 'typescript',
        success: true,
        symbols: [createSymbol('ClassB', 'class', 1, true)],
        imports: [],
        exports: [],
        calls: [],
        typeReferences: [],
        chunks: [],
        parseTime: 10,
      },
    ];

    const graph = buildKnowledgeGraph(results);

    expect(graph.findNodes({ type: 'class' })).toHaveLength(2);
  });
});

// Helper to create symbol objects
function createSymbol(
  name: string,
  kind: Symbol['kind'],
  line: number,
  exported: boolean,
  parent?: string
): Symbol {
  return {
    name,
    kind,
    line,
    column: 0,
    endLine: line + 10,
    endColumn: 0,
    exported,
    visibility: exported ? 'public' : 'private',
    parent,
  };
}
