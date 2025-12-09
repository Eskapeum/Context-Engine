/**
 * Universal Context Engine - BM25 Sparse Retrieval
 *
 * Implements BM25 (Best Matching 25) algorithm for sparse text retrieval.
 * Used in combination with dense vector search for hybrid retrieval.
 *
 * @module retrieval/bm25
 */

// ============================================================================
// TYPES
// ============================================================================

export interface BM25Config {
  /** Term frequency saturation parameter (default: 1.2) */
  k1?: number;
  /** Document length normalization (default: 0.75) */
  b?: number;
  /** Minimum document frequency for a term to be indexed */
  minDF?: number;
  /** Maximum document frequency ratio (terms appearing in >90% of docs are ignored) */
  maxDFRatio?: number;
}

export interface BM25Document {
  id: string;
  content: string;
  metadata?: Record<string, unknown>;
}

export interface BM25SearchResult {
  id: string;
  score: number;
  document: BM25Document;
}

// ============================================================================
// BM25 INDEX
// ============================================================================

/**
 * BM25 sparse retrieval index
 *
 * @example
 * ```ts
 * const bm25 = new BM25Index();
 * bm25.addDocuments([
 *   { id: '1', content: 'function foo() { return bar; }' },
 *   { id: '2', content: 'class Foo extends Bar { }' },
 * ]);
 * const results = bm25.search('foo bar', 10);
 * ```
 */
export class BM25Index {
  private config: Required<BM25Config>;
  private documents: Map<string, BM25Document> = new Map();
  private termFrequencies: Map<string, Map<string, number>> = new Map(); // term -> docId -> count
  private documentLengths: Map<string, number> = new Map();
  private avgDocLength = 0;
  private idf: Map<string, number> = new Map();

  constructor(config?: BM25Config) {
    this.config = {
      k1: config?.k1 ?? 1.2,
      b: config?.b ?? 0.75,
      minDF: config?.minDF ?? 1,
      maxDFRatio: config?.maxDFRatio ?? 0.9,
    };
  }

  /**
   * Add documents to the index
   */
  addDocuments(documents: BM25Document[]): void {
    for (const doc of documents) {
      this.addDocument(doc);
    }
    this.computeIDF();
  }

  /**
   * Add a single document
   */
  addDocument(doc: BM25Document): void {
    if (this.documents.has(doc.id)) {
      this.removeDocument(doc.id);
    }

    this.documents.set(doc.id, doc);
    const tokens = this.tokenize(doc.content);
    this.documentLengths.set(doc.id, tokens.length);

    // Count term frequencies
    const termCounts = new Map<string, number>();
    for (const token of tokens) {
      termCounts.set(token, (termCounts.get(token) || 0) + 1);
    }

    // Update global term frequencies
    for (const [term, count] of termCounts) {
      if (!this.termFrequencies.has(term)) {
        this.termFrequencies.set(term, new Map());
      }
      this.termFrequencies.get(term)!.set(doc.id, count);
    }

    // Update average document length
    this.updateAvgDocLength();
  }

  /**
   * Remove a document from the index
   */
  removeDocument(docId: string): boolean {
    if (!this.documents.has(docId)) return false;

    this.documents.delete(docId);
    this.documentLengths.delete(docId);

    // Remove from term frequencies
    for (const [_term, docs] of this.termFrequencies) {
      docs.delete(docId);
    }

    // Clean up empty terms
    for (const [term, docs] of this.termFrequencies) {
      if (docs.size === 0) {
        this.termFrequencies.delete(term);
      }
    }

    this.updateAvgDocLength();
    this.computeIDF();
    return true;
  }

  /**
   * Search the index
   */
  search(query: string, limit: number = 10): BM25SearchResult[] {
    const queryTokens = this.tokenize(query);
    const scores = new Map<string, number>();

    for (const token of queryTokens) {
      const idf = this.idf.get(token) || 0;
      if (idf === 0) continue;

      const docFreqs = this.termFrequencies.get(token);
      if (!docFreqs) continue;

      for (const [docId, tf] of docFreqs) {
        const docLength = this.documentLengths.get(docId) || 0;
        const score = this.computeBM25Score(tf, idf, docLength);
        scores.set(docId, (scores.get(docId) || 0) + score);
      }
    }

    // Sort by score and return top results
    const results: BM25SearchResult[] = [];
    const sortedEntries = [...scores.entries()].sort((a, b) => b[1] - a[1]);

    for (const [docId, score] of sortedEntries.slice(0, limit)) {
      const doc = this.documents.get(docId);
      if (doc) {
        results.push({ id: docId, score, document: doc });
      }
    }

    return results;
  }

  /**
   * Get document count
   */
  get size(): number {
    return this.documents.size;
  }

  /**
   * Get vocabulary size
   */
  get vocabularySize(): number {
    return this.termFrequencies.size;
  }

  /**
   * Clear the index
   */
  clear(): void {
    this.documents.clear();
    this.termFrequencies.clear();
    this.documentLengths.clear();
    this.idf.clear();
    this.avgDocLength = 0;
  }

  /**
   * Serialize index to JSON
   */
  toJSON(): string {
    return JSON.stringify({
      config: this.config,
      documents: Array.from(this.documents.entries()),
      termFrequencies: Array.from(this.termFrequencies.entries()).map(([term, docs]) => [
        term,
        Array.from(docs.entries()),
      ]),
      documentLengths: Array.from(this.documentLengths.entries()),
      avgDocLength: this.avgDocLength,
      idf: Array.from(this.idf.entries()),
    });
  }

  /**
   * Load index from JSON
   */
  static fromJSON(json: string): BM25Index {
    const data = JSON.parse(json);
    const index = new BM25Index(data.config);

    index.documents = new Map(data.documents);
    index.termFrequencies = new Map(
      data.termFrequencies.map(([term, docs]: [string, [string, number][]]) => [term, new Map(docs)])
    );
    index.documentLengths = new Map(data.documentLengths);
    index.avgDocLength = data.avgDocLength;
    // Recompute IDF to ensure consistency with current logic
    index.computeIDF();

    return index;
  }

  // ============================================================================
  // PRIVATE METHODS
  // ============================================================================

  private tokenize(text: string): string[] {
    // Code-aware tokenization
    return text
      .toLowerCase()
      .replace(/([a-z])([A-Z])/g, '$1 $2') // Split camelCase
      .replace(/[_-]/g, ' ') // Split snake_case and kebab-case
      .replace(/[^\w\s]/g, ' ') // Remove punctuation
      .split(/\s+/)
      .filter((t) => t.length >= 2 && t.length <= 50)
      .filter((t) => !/^\d+$/.test(t)); // Remove pure numbers
  }

  private computeIDF(): void {
    this.idf.clear();
    const N = this.documents.size;
    // For small document sets, don't filter by maxDF
    const maxDF = N <= 10 ? N : Math.floor(N * this.config.maxDFRatio);
    // For very small sets, don't apply minDF filtering
    const effectiveMinDF = N <= 5 ? 1 : this.config.minDF;

    for (const [term, docs] of this.termFrequencies) {
      const df = docs.size;

      // Filter by document frequency bounds (relaxed for small sets)
      if (df < effectiveMinDF || df > maxDF) continue;

      // IDF formula: log((N - df + 0.5) / (df + 0.5) + 1)
      const idf = Math.log((N - df + 0.5) / (df + 0.5) + 1);
      this.idf.set(term, idf);
    }
  }

  private computeBM25Score(tf: number, idf: number, docLength: number): number {
    const { k1, b } = this.config;
    const numerator = tf * (k1 + 1);
    const denominator = tf + k1 * (1 - b + b * (docLength / this.avgDocLength));
    return idf * (numerator / denominator);
  }

  private updateAvgDocLength(): void {
    if (this.documentLengths.size === 0) {
      this.avgDocLength = 0;
      return;
    }
    const totalLength = [...this.documentLengths.values()].reduce((a, b) => a + b, 0);
    this.avgDocLength = totalLength / this.documentLengths.size;
  }
}

export default BM25Index;
