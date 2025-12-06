/**
 * Tests for retrieval module
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { BM25Index, BudgetOptimizer, reciprocalRankFusion, weightedRRF } from '../src/retrieval/index.js';

describe('BM25Index', () => {
  let bm25: BM25Index;

  beforeEach(() => {
    bm25 = new BM25Index();
  });

  describe('addDocuments', () => {
    it('should add documents and update size', () => {
      bm25.addDocuments([
        { id: '1', content: 'hello world' },
        { id: '2', content: 'hello there' },
      ]);

      expect(bm25.size).toBe(2);
      expect(bm25.vocabularySize).toBeGreaterThan(0);
    });

    it('should handle code content with camelCase', () => {
      bm25.addDocuments([
        { id: '1', content: 'function getUserById(userId) { return user; }' },
      ]);

      // Should tokenize camelCase
      const results = bm25.search('user', 10);
      expect(results.length).toBeGreaterThan(0);
    });
  });

  describe('search', () => {
    beforeEach(() => {
      bm25.addDocuments([
        { id: '1', content: 'function authenticate(user, password) { return validate(user); }' },
        { id: '2', content: 'class UserService { getUser(id) { return db.find(id); } }' },
        { id: '3', content: 'const AUTH_TOKEN = process.env.TOKEN;' },
        { id: '4', content: 'function processPayment(amount, card) { return payment.process(); }' },
      ]);
    });

    it('should return relevant results', () => {
      const results = bm25.search('authenticate user', 2);

      expect(results.length).toBeGreaterThan(0);
      expect(results[0].id).toBe('1'); // Most relevant
    });

    it('should respect limit parameter', () => {
      const results = bm25.search('user', 2);
      expect(results.length).toBeLessThanOrEqual(2);
    });

    it('should return empty for no matches', () => {
      const results = bm25.search('xyznomatch', 10);
      expect(results.length).toBe(0);
    });

    it('should score results by relevance', () => {
      const results = bm25.search('user', 10);

      // Results should be sorted by score descending
      for (let i = 1; i < results.length; i++) {
        expect(results[i - 1].score).toBeGreaterThanOrEqual(results[i].score);
      }
    });
  });

  describe('removeDocument', () => {
    it('should remove document and update index', () => {
      bm25.addDocuments([
        { id: '1', content: 'hello world' },
        { id: '2', content: 'hello there' },
      ]);

      expect(bm25.size).toBe(2);

      bm25.removeDocument('1');

      expect(bm25.size).toBe(1);
    });
  });

  describe('serialization', () => {
    it('should serialize and deserialize correctly', () => {
      bm25.addDocuments([
        { id: '1', content: 'hello world' },
        { id: '2', content: 'hello there' },
      ]);

      const json = bm25.toJSON();
      const restored = BM25Index.fromJSON(json);

      expect(restored.size).toBe(2);

      const results = restored.search('hello', 10);
      expect(results.length).toBe(2);
    });
  });
});

describe('BudgetOptimizer', () => {
  let optimizer: BudgetOptimizer;

  beforeEach(() => {
    optimizer = new BudgetOptimizer({
      maxTokens: 1000,
      systemReserve: 100,
      responseReserve: 200,
    });
  });

  describe('optimize', () => {
    it('should select chunks within budget', () => {
      const chunks = [
        { id: '1', content: 'a'.repeat(100), tokenCount: 25, score: 0.9, filePath: 'a.ts', startLine: 1, endLine: 10, symbols: ['foo'] },
        { id: '2', content: 'b'.repeat(100), tokenCount: 25, score: 0.8, filePath: 'b.ts', startLine: 1, endLine: 10, symbols: ['bar'] },
        { id: '3', content: 'c'.repeat(100), tokenCount: 25, score: 0.7, filePath: 'c.ts', startLine: 1, endLine: 10, symbols: ['baz'] },
      ];

      const result = optimizer.optimize(chunks);

      expect(result.selectedCount).toBeGreaterThan(0);
      expect(result.totalTokens).toBeLessThanOrEqual(700); // 1000 - 100 - 200
    });

    it('should respect minimum score threshold', () => {
      const chunks = [
        { id: '1', content: 'a', tokenCount: 10, score: 0.5, filePath: 'a.ts', startLine: 1, endLine: 1, symbols: [] },
        { id: '2', content: 'b', tokenCount: 10, score: 0.05, filePath: 'b.ts', startLine: 1, endLine: 1, symbols: [] }, // Below default threshold
      ];

      const result = optimizer.optimize(chunks);

      expect(result.chunks.every(c => c.score >= 0.1)).toBe(true);
    });

    it('should prefer diversity across files', () => {
      const chunks = [
        { id: '1', content: 'a', tokenCount: 50, score: 0.9, filePath: 'a.ts', startLine: 1, endLine: 10, symbols: [] },
        { id: '2', content: 'b', tokenCount: 50, score: 0.88, filePath: 'a.ts', startLine: 11, endLine: 20, symbols: [] },
        { id: '3', content: 'c', tokenCount: 50, score: 0.85, filePath: 'b.ts', startLine: 1, endLine: 10, symbols: [] },
      ];

      const result = optimizer.optimize(chunks);

      // Should include chunks from multiple files due to diversity weighting
      expect(result.filesCovered.length).toBeGreaterThan(1);
    });
  });

  describe('optimizeWithPriority', () => {
    it('should prioritize specified files', () => {
      const chunks = [
        { id: '1', content: 'a', tokenCount: 100, score: 0.9, filePath: 'regular.ts', startLine: 1, endLine: 10, symbols: [] },
        { id: '2', content: 'b', tokenCount: 100, score: 0.5, filePath: 'priority.ts', startLine: 1, endLine: 10, symbols: [] },
      ];

      const result = optimizer.optimizeWithPriority(chunks, ['priority.ts']);

      // Priority file should be included even with lower score
      expect(result.filesCovered).toContain('priority.ts');
    });
  });

  describe('formatContext', () => {
    it('should format chunks as readable context', () => {
      const result = {
        chunks: [
          { id: '1', content: 'const x = 1;', tokenCount: 10, score: 0.9, filePath: 'a.ts', startLine: 1, endLine: 1, symbols: ['x'] },
          { id: '2', content: 'const y = 2;', tokenCount: 10, score: 0.8, filePath: 'a.ts', startLine: 2, endLine: 2, symbols: ['y'] },
        ],
        totalTokens: 20,
        remainingTokens: 680,
        consideredCount: 2,
        selectedCount: 2,
        filesCovered: ['a.ts'],
        avgScore: 0.85,
      };

      const formatted = optimizer.formatContext(result);

      expect(formatted).toContain('a.ts');
      expect(formatted).toContain('const x = 1;');
      expect(formatted).toContain('const y = 2;');
    });
  });
});

describe('Reciprocal Rank Fusion', () => {
  describe('reciprocalRankFusion', () => {
    it('should combine rankings with RRF', () => {
      const ranking1 = [
        { id: 'a', score: 0.9 },
        { id: 'b', score: 0.8 },
        { id: 'c', score: 0.7 },
      ];

      const ranking2 = [
        { id: 'b', score: 0.95 },
        { id: 'a', score: 0.85 },
        { id: 'd', score: 0.75 },
      ];

      const fused = reciprocalRankFusion([ranking1, ranking2]);

      // 'a' and 'b' should have highest fused scores (appear in both)
      const scores = Array.from(fused.entries()).sort((a, b) => b[1] - a[1]);

      expect(scores[0][0]).toBe('a'); // Rank 1 + Rank 2
      expect(scores[1][0]).toBe('b'); // Rank 2 + Rank 1
    });
  });

  describe('weightedRRF', () => {
    it('should apply weights to rankings', () => {
      const ranking1 = [{ id: 'a', score: 0.9 }];
      const ranking2 = [{ id: 'b', score: 0.9 }];

      const fused = weightedRRF([
        { results: ranking1, weight: 0.8 },
        { results: ranking2, weight: 0.2 },
      ]);

      // 'a' should have higher fused score due to higher weight
      expect(fused.get('a')!).toBeGreaterThan(fused.get('b')!);
    });
  });
});
