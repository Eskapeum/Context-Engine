/**
 * Universal Context Engine - Embedding Providers
 *
 * Supports multiple embedding providers:
 * - Voyage Code-3 (best for code)
 * - OpenAI text-embedding-3-small
 * - Local fallback (TF-IDF based)
 *
 * @module embeddings/providers
 */

import type { Embedding, EmbeddingProvider, EmbeddingProviderConfig } from './types.js';

// ============================================================================
// VOYAGE CODE PROVIDER
// ============================================================================

/**
 * Voyage AI embedding provider (optimized for code)
 */
export class VoyageEmbeddingProvider implements EmbeddingProvider {
  name = 'voyage';
  dimensions = 1024;
  model = 'voyage-code-3';

  private apiKey: string;
  private batchSize: number;

  constructor(config: EmbeddingProviderConfig) {
    if (!config.apiKey) {
      throw new Error('Voyage API key is required');
    }
    this.apiKey = config.apiKey;
    this.model = config.model || 'voyage-code-3';
    this.batchSize = config.batchSize || 128;

    // Set dimensions based on model
    if (this.model === 'voyage-code-3') {
      this.dimensions = 1024;
    } else if (this.model === 'voyage-3') {
      this.dimensions = 1024;
    }
  }

  async embed(text: string): Promise<Embedding> {
    const embeddings = await this.embedBatch([text]);
    return embeddings[0];
  }

  async embedBatch(texts: string[]): Promise<Embedding[]> {
    const results: Embedding[] = [];

    // Process in batches
    for (let i = 0; i < texts.length; i += this.batchSize) {
      const batch = texts.slice(i, i + this.batchSize);

      const response = await fetch('https://api.voyageai.com/v1/embeddings', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${this.apiKey}`,
        },
        body: JSON.stringify({
          model: this.model,
          input: batch,
          input_type: 'document',
        }),
      });

      if (!response.ok) {
        const error = await response.text();
        throw new Error(`Voyage API error: ${error}`);
      }

      const data = (await response.json()) as {
        data: Array<{ embedding: number[] }>;
      };

      for (const item of data.data) {
        results.push({
          values: item.embedding,
          dimensions: item.embedding.length,
          model: this.model,
        });
      }
    }

    return results;
  }
}

// ============================================================================
// OPENAI PROVIDER
// ============================================================================

/**
 * OpenAI embedding provider
 */
export class OpenAIEmbeddingProvider implements EmbeddingProvider {
  name = 'openai';
  dimensions = 1536;
  model = 'text-embedding-3-small';

  private apiKey: string;
  private batchSize: number;

  constructor(config: EmbeddingProviderConfig) {
    if (!config.apiKey) {
      throw new Error('OpenAI API key is required');
    }
    this.apiKey = config.apiKey;
    this.model = config.model || 'text-embedding-3-small';
    this.batchSize = config.batchSize || 100;

    // Set dimensions based on model
    if (this.model === 'text-embedding-3-small') {
      this.dimensions = 1536;
    } else if (this.model === 'text-embedding-3-large') {
      this.dimensions = 3072;
    } else if (this.model === 'text-embedding-ada-002') {
      this.dimensions = 1536;
    }
  }

  async embed(text: string): Promise<Embedding> {
    const embeddings = await this.embedBatch([text]);
    return embeddings[0];
  }

  async embedBatch(texts: string[]): Promise<Embedding[]> {
    const results: Embedding[] = [];

    // Process in batches
    for (let i = 0; i < texts.length; i += this.batchSize) {
      const batch = texts.slice(i, i + this.batchSize);

      const response = await fetch('https://api.openai.com/v1/embeddings', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${this.apiKey}`,
        },
        body: JSON.stringify({
          model: this.model,
          input: batch,
        }),
      });

      if (!response.ok) {
        const error = await response.text();
        throw new Error(`OpenAI API error: ${error}`);
      }

      const data = (await response.json()) as {
        data: Array<{ embedding: number[] }>;
      };

      for (const item of data.data) {
        results.push({
          values: item.embedding,
          dimensions: item.embedding.length,
          model: this.model,
        });
      }
    }

    return results;
  }
}

// ============================================================================
// LOCAL PROVIDER (TF-IDF BASED)
// ============================================================================

/**
 * Local embedding provider using TF-IDF
 * No external API calls, works offline
 */
export class LocalEmbeddingProvider implements EmbeddingProvider {
  name = 'local';
  dimensions = 512;
  model = 'tfidf-512';

  private vocabulary: Map<string, number> = new Map();
  private idf: Map<string, number> = new Map();
  private documentCount = 0;

  constructor(_config?: EmbeddingProviderConfig) {
    this.dimensions = 512;
    this.model = 'tfidf-512';
  }

  async embed(text: string): Promise<Embedding> {
    const tokens = this.tokenize(text);
    const tf = this.computeTF(tokens);
    const vector = this.computeTFIDF(tf);

    return {
      values: vector,
      dimensions: this.dimensions,
      model: this.model,
    };
  }

  async embedBatch(texts: string[]): Promise<Embedding[]> {
    // First pass: build vocabulary and IDF
    this.buildVocabulary(texts);

    // Second pass: compute embeddings
    return texts.map((text) => {
      const tokens = this.tokenize(text);
      const tf = this.computeTF(tokens);
      const vector = this.computeTFIDF(tf);

      return {
        values: vector,
        dimensions: this.dimensions,
        model: this.model,
      };
    });
  }

  private tokenize(text: string): string[] {
    // Simple tokenization: lowercase, split on non-alphanumeric
    return text
      .toLowerCase()
      .replace(/[^a-z0-9_]+/g, ' ')
      .split(/\s+/)
      .filter((t) => t.length > 1 && t.length < 50);
  }

  private buildVocabulary(documents: string[]): void {
    const docFreq: Map<string, number> = new Map();

    for (const doc of documents) {
      const tokens = new Set(this.tokenize(doc));
      for (const token of tokens) {
        docFreq.set(token, (docFreq.get(token) || 0) + 1);
      }
    }

    this.documentCount = documents.length;

    // Select top tokens by document frequency
    const sortedTokens = Array.from(docFreq.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, this.dimensions);

    this.vocabulary.clear();
    this.idf.clear();

    sortedTokens.forEach(([token, freq], idx) => {
      this.vocabulary.set(token, idx);
      this.idf.set(token, Math.log(this.documentCount / (freq + 1)));
    });
  }

  private computeTF(tokens: string[]): Map<string, number> {
    const tf: Map<string, number> = new Map();
    for (const token of tokens) {
      tf.set(token, (tf.get(token) || 0) + 1);
    }

    // Normalize by document length
    const maxFreq = Math.max(...tf.values(), 1);
    for (const [token, freq] of tf) {
      tf.set(token, freq / maxFreq);
    }

    return tf;
  }

  private computeTFIDF(tf: Map<string, number>): number[] {
    const vector = new Array(this.dimensions).fill(0);

    for (const [token, freq] of tf) {
      const idx = this.vocabulary.get(token);
      if (idx !== undefined) {
        const idfScore = this.idf.get(token) || 1;
        vector[idx] = freq * idfScore;
      }
    }

    // L2 normalize
    const norm = Math.sqrt(vector.reduce((sum, v) => sum + v * v, 0));
    if (norm > 0) {
      for (let i = 0; i < vector.length; i++) {
        vector[i] /= norm;
      }
    }

    return vector;
  }
}

// ============================================================================
// FACTORY
// ============================================================================

/**
 * Create an embedding provider based on configuration
 */
export function createEmbeddingProvider(config: EmbeddingProviderConfig): EmbeddingProvider {
  switch (config.type) {
    case 'voyage':
      return new VoyageEmbeddingProvider(config);
    case 'openai':
      return new OpenAIEmbeddingProvider(config);
    case 'local':
    default:
      return new LocalEmbeddingProvider(config);
  }
}

/**
 * Auto-detect and create the best available provider
 */
export function createAutoProvider(): EmbeddingProvider {
  // Try Voyage first (best for code)
  if (process.env.VOYAGE_API_KEY) {
    return new VoyageEmbeddingProvider({
      type: 'voyage',
      apiKey: process.env.VOYAGE_API_KEY,
    });
  }

  // Fall back to OpenAI
  if (process.env.OPENAI_API_KEY) {
    return new OpenAIEmbeddingProvider({
      type: 'openai',
      apiKey: process.env.OPENAI_API_KEY,
    });
  }

  // Use local provider as last resort
  return new LocalEmbeddingProvider({ type: 'local' });
}
