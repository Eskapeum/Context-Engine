/**
 * Universal Context Memory - Configuration
 *
 * Loads and validates UCM configuration from various sources:
 * - .ucmrc.json
 * - ucm.config.js
 * - ucm.config.mjs
 * - package.json "ucm" field
 *
 * @module config
 */

import * as fs from 'fs';
import * as path from 'path';
import { pathToFileURL } from 'url';

// ============================================================================
// TYPES
// ============================================================================

/**
 * UCM configuration schema
 */
export interface UCMConfig {
  /** Project name override */
  projectName?: string;

  /** Patterns to ignore (in addition to .gitignore) */
  ignore?: string[];

  /** Priority files for context generation */
  priorityFiles?: string[];

  /** Maximum tokens for context output */
  maxTokens?: number;

  /** Enable/disable embeddings */
  enableEmbeddings?: boolean;

  /** Embedding provider configuration */
  embeddings?: {
    provider?: 'openai' | 'local' | 'transformers';
    model?: string;
    apiKey?: string;
    dimensions?: number;
  };

  /** Output configuration */
  output?: {
    /** Generate CONTEXT.md */
    contextMd?: boolean;
    /** Generate CLAUDE.md */
    claudeMd?: boolean;
    /** Generate .cursorrules */
    cursorRules?: boolean;
    /** Generate .github/copilot-instructions.md */
    copilotInstructions?: boolean;
    /** Custom output directory */
    directory?: string;
  };

  /** Watch mode configuration */
  watch?: {
    /** Debounce delay in ms */
    debounceMs?: number;
    /** Additional patterns to ignore */
    ignore?: string[];
  };

  /** Parser configuration */
  parser?: {
    /** Maximum file size to parse (bytes) */
    maxFileSize?: number;
    /** Languages to include (empty = all) */
    languages?: string[];
    /** Skip parsing these extensions */
    skipExtensions?: string[];
  };

  /** Chunking configuration */
  chunking?: {
    /** Target tokens per chunk */
    targetTokens?: number;
    /** Maximum tokens per chunk */
    maxTokens?: number;
    /** Minimum tokens per chunk */
    minTokens?: number;
    /** Overlap between chunks (tokens) */
    overlap?: number;
  };

  /** MCP server configuration */
  mcp?: {
    /** Enable watch mode in MCP server */
    watchMode?: boolean;
    /** Default max tokens for retrieval */
    defaultMaxTokens?: number;
  };
}

/**
 * Default configuration values
 */
export const DEFAULT_CONFIG: Required<UCMConfig> = {
  projectName: '',
  ignore: [],
  priorityFiles: [],
  maxTokens: 50000,
  enableEmbeddings: false,
  embeddings: {
    provider: 'local',
    model: 'all-MiniLM-L6-v2',
    dimensions: 384,
  },
  output: {
    contextMd: true,
    claudeMd: true,
    cursorRules: true,
    copilotInstructions: true,
    directory: '.',
  },
  watch: {
    debounceMs: 500,
    ignore: [],
  },
  parser: {
    maxFileSize: 1024 * 1024, // 1MB
    languages: [],
    skipExtensions: ['.min.js', '.bundle.js', '.map'],
  },
  chunking: {
    targetTokens: 500,
    maxTokens: 1000,
    minTokens: 50,
    overlap: 50,
  },
  mcp: {
    watchMode: false,
    defaultMaxTokens: 8000,
  },
};

// ============================================================================
// CONFIG LOADER
// ============================================================================

/**
 * Configuration file names to search for (in order of priority)
 */
const CONFIG_FILES = [
  '.ucmrc.json',
  '.ucmrc',
  'ucm.config.js',
  'ucm.config.mjs',
  'ucm.config.cjs',
];

/**
 * Load UCM configuration from project root
 *
 * @param projectRoot - Project root directory
 * @returns Merged configuration with defaults
 */
export async function loadConfig(projectRoot: string): Promise<UCMConfig> {
  const resolvedRoot = path.resolve(projectRoot);

  // Try each config file
  for (const configFile of CONFIG_FILES) {
    const configPath = path.join(resolvedRoot, configFile);

    if (fs.existsSync(configPath)) {
      try {
        const config = await loadConfigFile(configPath);
        return mergeConfig(config);
      } catch (error) {
        console.warn(`Warning: Failed to load ${configFile}: ${error}`);
      }
    }
  }

  // Try package.json "ucm" field
  const packageJsonPath = path.join(resolvedRoot, 'package.json');
  if (fs.existsSync(packageJsonPath)) {
    try {
      const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf-8'));
      if (packageJson.ucm) {
        return mergeConfig(packageJson.ucm);
      }
    } catch {
      // Ignore package.json errors
    }
  }

  // Return defaults if no config found
  return { ...DEFAULT_CONFIG };
}

/**
 * Load a specific config file
 */
async function loadConfigFile(configPath: string): Promise<UCMConfig> {
  const ext = path.extname(configPath);

  if (ext === '.json' || configPath.endsWith('.ucmrc')) {
    // JSON config
    const content = fs.readFileSync(configPath, 'utf-8');
    return JSON.parse(content);
  }

  if (ext === '.js' || ext === '.mjs' || ext === '.cjs') {
    // JavaScript config - use dynamic import
    const fileUrl = pathToFileURL(configPath).href;
    const module = await import(fileUrl);
    return module.default || module;
  }

  throw new Error(`Unsupported config file format: ${ext}`);
}

/**
 * Merge user config with defaults
 */
function mergeConfig(userConfig: Partial<UCMConfig>): UCMConfig {
  return {
    projectName: userConfig.projectName ?? DEFAULT_CONFIG.projectName,
    ignore: [...DEFAULT_CONFIG.ignore, ...(userConfig.ignore || [])],
    priorityFiles: userConfig.priorityFiles ?? DEFAULT_CONFIG.priorityFiles,
    maxTokens: userConfig.maxTokens ?? DEFAULT_CONFIG.maxTokens,
    enableEmbeddings: userConfig.enableEmbeddings ?? DEFAULT_CONFIG.enableEmbeddings,
    embeddings: {
      ...DEFAULT_CONFIG.embeddings,
      ...userConfig.embeddings,
    },
    output: {
      ...DEFAULT_CONFIG.output,
      ...userConfig.output,
    },
    watch: {
      ...DEFAULT_CONFIG.watch,
      ...userConfig.watch,
    },
    parser: {
      ...DEFAULT_CONFIG.parser,
      ...userConfig.parser,
    },
    chunking: {
      ...DEFAULT_CONFIG.chunking,
      ...userConfig.chunking,
    },
    mcp: {
      ...DEFAULT_CONFIG.mcp,
      ...userConfig.mcp,
    },
  };
}

/**
 * Validate configuration
 */
export function validateConfig(config: UCMConfig): { valid: boolean; errors: string[] } {
  const errors: string[] = [];

  if (config.maxTokens !== undefined && config.maxTokens < 1000) {
    errors.push('maxTokens must be at least 1000');
  }

  if (config.chunking?.targetTokens !== undefined && config.chunking.targetTokens < 50) {
    errors.push('chunking.targetTokens must be at least 50');
  }

  if (config.chunking?.maxTokens !== undefined && config.chunking.minTokens !== undefined) {
    if (config.chunking.maxTokens < config.chunking.minTokens) {
      errors.push('chunking.maxTokens must be greater than chunking.minTokens');
    }
  }

  if (config.watch?.debounceMs !== undefined && config.watch.debounceMs < 100) {
    errors.push('watch.debounceMs must be at least 100');
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}

/**
 * Generate a default config file
 */
export function generateDefaultConfig(format: 'json' | 'js' = 'json'): string {
  if (format === 'json') {
    return JSON.stringify(
      {
        projectName: '',
        ignore: ['**/dist/**', '**/build/**', '**/*.min.js'],
        priorityFiles: ['README.md', 'package.json'],
        maxTokens: 50000,
        enableEmbeddings: false,
        output: {
          contextMd: true,
          claudeMd: true,
          cursorRules: true,
          copilotInstructions: true,
        },
        watch: {
          debounceMs: 500,
        },
        chunking: {
          targetTokens: 500,
          maxTokens: 1000,
        },
      },
      null,
      2
    );
  }

  return `/**
 * UCM Configuration
 * @type {import('universal-context-memory').UCMConfig}
 */
export default {
  // Project name override
  projectName: '',

  // Additional patterns to ignore (adds to .gitignore)
  ignore: [
    '**/dist/**',
    '**/build/**',
    '**/*.min.js',
  ],

  // Priority files for context generation
  priorityFiles: [
    'README.md',
    'package.json',
  ],

  // Maximum tokens for context output
  maxTokens: 50000,

  // Enable semantic embeddings (requires API key or local model)
  enableEmbeddings: false,

  // Output configuration
  output: {
    contextMd: true,
    claudeMd: true,
    cursorRules: true,
    copilotInstructions: true,
  },

  // Watch mode configuration
  watch: {
    debounceMs: 500,
  },

  // Chunking configuration
  chunking: {
    targetTokens: 500,
    maxTokens: 1000,
  },
};
`;
}

export default {
  loadConfig,
  validateConfig,
  generateDefaultConfig,
  DEFAULT_CONFIG,
};
