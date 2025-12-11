/**
 * Universal Context Engine (UCE) - Q&A Engine
 * @module qa/qa-engine
 *
 * AI-powered question answering with automatic context retrieval.
 * Supports Anthropic Claude and OpenAI models.
 *
 * Architecture: Uses hybrid retrieval to find relevant code chunks,
 * then sends them with the question to an LLM for intelligent answering.
 */

import Anthropic from '@anthropic-ai/sdk';
import { logger } from '../utils/logger.js';

// =============================================================================
// Types
// =============================================================================

/**
 * Supported LLM providers
 */
export type QAProvider = 'anthropic' | 'openai' | 'custom';

/**
 * Q&A engine configuration
 */
export interface QAOptions {
  /** LLM provider (anthropic, openai, or custom) */
  provider: QAProvider;
  /** API key for provider */
  apiKey?: string;
  /** Model to use */
  model?: string;
  /** Maximum tokens for context */
  maxContextTokens?: number;
  /** Maximum tokens for response */
  maxResponseTokens?: number;
  /** Include source files in response */
  includeSources?: boolean;
  /** Temperature for generation (0-1) */
  temperature?: number;
}

/**
 * Individual source chunk in Q&A result
 */
export interface QASource {
  /** File path */
  file: string;
  /** Start line number */
  startLine: number;
  /** End line number */
  endLine: number;
  /** Code content */
  content: string;
  /** Relevance score (0-1) */
  relevanceScore: number;
}

/**
 * Q&A result with answer and sources
 */
export interface QAResult {
  /** Generated answer */
  answer: string;
  /** Relevant code chunks used */
  sources: QASource[];
  /** Token usage statistics */
  usage: {
    contextTokens: number;
    responseTokens: number;
    totalTokens: number;
  };
  /** Confidence in answer */
  confidence: 'high' | 'medium' | 'low';
  /** Model used */
  model: string;
}

// =============================================================================
// Q&A Engine
// =============================================================================

/**
 * AI-powered question answering engine
 *
 * Usage:
 * ```typescript
 * const qaEngine = new QAEngine({
 *   provider: 'anthropic',
 *   apiKey: process.env.ANTHROPIC_API_KEY,
 * });
 *
 * const result = await qaEngine.ask('How does authentication work?', context);
 * console.log(result.answer);
 * ```
 */
export class QAEngine {
  private options: Required<QAOptions>;
  private anthropicClient?: Anthropic;

  constructor(options: QAOptions) {
    this.options = {
      provider: options.provider,
      apiKey: options.apiKey || this.getDefaultApiKey(options.provider),
      model: options.model || this.getDefaultModel(options.provider),
      maxContextTokens: options.maxContextTokens || 4000,
      maxResponseTokens: options.maxResponseTokens || 2000,
      includeSources: options.includeSources ?? true,
      temperature: options.temperature ?? 0.3,
    };

    // Initialize provider client
    if (this.options.provider === 'anthropic') {
      if (!this.options.apiKey) {
        throw new Error(
          'Anthropic API key required. Set ANTHROPIC_API_KEY environment variable or pass apiKey option.'
        );
      }
      this.anthropicClient = new Anthropic({ apiKey: this.options.apiKey });
    }
  }

  /**
   * Ask a question about the codebase with automatic context
   *
   * @param query - Question to ask
   * @param context - Retrieved context string
   * @returns Answer with sources and metadata
   */
  async ask(query: string, context: string): Promise<QAResult> {
    logger.info('Asking question', { query, provider: this.options.provider });

    const startTime = performance.now();

    try {
      const prompt = this.generatePrompt(query, context);

      let answer: string;
      let usage: { contextTokens: number; responseTokens: number; totalTokens: number };

      if (this.options.provider === 'anthropic') {
        const result = await this.askAnthropic(query, prompt);
        answer = result.answer;
        usage = result.usage;
      } else if (this.options.provider === 'openai') {
        const result = await this.askOpenAI(query, prompt);
        answer = result.answer;
        usage = result.usage;
      } else {
        throw new Error(`Unsupported provider: ${this.options.provider}`);
      }

      // Parse sources from context (if included)
      const sources: QASource[] = this.extractSources(context);

      // Determine confidence based on answer characteristics
      const confidence = this.determineConfidence(answer, sources.length);

      const duration = performance.now() - startTime;
      logger.info('Question answered', {
        duration: `${duration.toFixed(0)}ms`,
        confidence,
        sources: sources.length,
      });

      return {
        answer,
        sources,
        usage,
        confidence,
        model: this.options.model,
      };
    } catch (error) {
      logger.error('Failed to answer question', { error });
      throw error;
    }
  }

  /**
   * Generate prompt for the LLM
   */
  generatePrompt(query: string, context: string): string {
    return `You are an expert code analyst helping developers understand their codebase.

# Context

The following code snippets are from the project:

${context}

# Question

${query}

# Instructions

- Answer the question based ONLY on the provided code context
- Be specific and reference file names and line numbers when relevant
- If the context doesn't contain enough information, say so clearly
- Provide code examples from the context when helpful
- Be concise but thorough

# Answer`;
  }

  // =============================================================================
  // Private Methods - Provider Implementations
  // =============================================================================

  /**
   * Ask question using Anthropic Claude
   */
  private async askAnthropic(
    _query: string,
    prompt: string
  ): Promise<{ answer: string; usage: { contextTokens: number; responseTokens: number; totalTokens: number } }> {
    if (!this.anthropicClient) {
      throw new Error('Anthropic client not initialized');
    }

    const response = await this.anthropicClient.messages.create({
      model: this.options.model,
      max_tokens: this.options.maxResponseTokens,
      temperature: this.options.temperature,
      messages: [
        {
          role: 'user',
          content: prompt,
        },
      ],
    });

    const answer = response.content[0].type === 'text' ? response.content[0].text : '';

    return {
      answer,
      usage: {
        contextTokens: response.usage.input_tokens,
        responseTokens: response.usage.output_tokens,
        totalTokens: response.usage.input_tokens + response.usage.output_tokens,
      },
    };
  }

  /**
   * Ask question using OpenAI
   */
  private async askOpenAI(
    _query: string,
    _prompt: string
  ): Promise<{ answer: string; usage: { contextTokens: number; responseTokens: number; totalTokens: number } }> {
    // OpenAI implementation to be added
    throw new Error('OpenAI provider not yet implemented. Use provider: "anthropic" instead.');
  }

  /**
   * Extract source information from context string
   */
  private extractSources(context: string): QASource[] {
    const sources: QASource[] = [];

    // Parse context format: // File: path:startLine-endLine
    const fileRegex = /\/\/ File: (.+):(\d+)-(\d+)\n([\s\S]+?)(?=\/\/ File:|$)/g;
    let match;

    while ((match = fileRegex.exec(context)) !== null) {
      sources.push({
        file: match[1],
        startLine: parseInt(match[2], 10),
        endLine: parseInt(match[3], 10),
        content: match[4].trim(),
        relevanceScore: 0.8, // Default score, could be extracted from context metadata
      });
    }

    return sources;
  }

  /**
   * Determine confidence level based on answer characteristics
   */
  private determineConfidence(answer: string, sourceCount: number): 'high' | 'medium' | 'low' {
    // High confidence: Multiple sources and no uncertainty phrases
    const uncertaintyPhrases = [
      "i don't have",
      "not enough information",
      "unclear",
      "cannot determine",
      "doesn't appear",
    ];

    const hasUncertainty = uncertaintyPhrases.some((phrase) =>
      answer.toLowerCase().includes(phrase)
    );

    if (hasUncertainty) return 'low';
    if (sourceCount >= 3) return 'high';
    if (sourceCount >= 1) return 'medium';
    return 'low';
  }

  /**
   * Get default API key from environment
   */
  private getDefaultApiKey(provider: QAProvider): string {
    if (provider === 'anthropic') {
      return process.env.ANTHROPIC_API_KEY || '';
    }
    if (provider === 'openai') {
      return process.env.OPENAI_API_KEY || '';
    }
    return '';
  }

  /**
   * Get default model for provider
   */
  private getDefaultModel(provider: QAProvider): string {
    if (provider === 'anthropic') {
      return 'claude-3-5-sonnet-20241022';
    }
    if (provider === 'openai') {
      return 'gpt-4-turbo-preview';
    }
    return 'unknown';
  }
}

// =============================================================================
// Factory Function
// =============================================================================

/**
 * Create a new Q&A engine
 */
export function createQAEngine(options: QAOptions): QAEngine {
  return new QAEngine(options);
}
