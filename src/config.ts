/**
 * Universal Context Engine - Configuration
 *
 * Loads and validates UCE configuration from various sources:
 * - .ucerc.json
 * - uce.config.js
 * - uce.config.mjs
 * - package.json "uce" field
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
 * UCE configuration schema
 */
export interface UCEConfig {
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
    /** Generate UCE.md (universal context file) */
    uceMd?: boolean;
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

  /** State persistence configuration (v2.5+) */
  state?: {
    /** Enable state persistence */
    enabled?: boolean;
    /** State file path (default: .uce/state.json.gz) */
    path?: string;
    /** Auto-export state on index completion */
    autoExport?: boolean;
  };

  /** Q&A engine configuration (v2.6+) */
  qa?: {
    /** LLM provider (anthropic or openai) */
    provider?: 'anthropic' | 'openai';
    /** Model to use */
    model?: string;
    /** API key for provider */
    apiKey?: string;
    /** Maximum tokens for context */
    maxContextTokens?: number;
    /** Maximum tokens for response */
    maxResponseTokens?: number;
    /** Temperature for generation (0-1) */
    temperature?: number;
  };

  /** Analytics configuration (v3.0+) */
  analytics?: {
    /** Enable code analytics */
    enabled?: boolean;
    /** Enable complexity analysis */
    complexity?: boolean;
    /** Enable code smells detection */
    codeSmells?: boolean;
    /** Enable pattern detection */
    patterns?: boolean;
    /** Complexity thresholds */
    thresholds?: {
      /** Long method line count */
      longMethodLines?: number;
      /** Long parameter list count */
      longParameterCount?: number;
      /** God class method count */
      godClassMethods?: number;
      /** Deep nesting level */
      deepNestingLevel?: number;
      /** Complexity low threshold */
      complexityLow?: number;
      /** Complexity medium threshold */
      complexityMedium?: number;
      /** Complexity high threshold */
      complexityHigh?: number;
    };
  };

  /** Personality & Auto-Context configuration (v3.6+) */
  personality?: {
    /** Enable auto-context personality (default: true) */
    enabled?: boolean;
    /** Custom persona name */
    name?: string;
    /** Custom instructions (overrides default) */
    instructions?: string;
  };

  /** Library documentation configuration (v4.0+) */
  libraryDocs?: {
    /** Enable library docs feature */
    enabled?: boolean;
    /** Prefer local extraction over cache */
    preferLocal?: boolean;
    /** Cache TTL in milliseconds (default: 7 days) */
    cacheTTL?: number;
    /** Auto cleanup expired cache entries */
    autoCleanup?: boolean;
  };

  /** Sequential thinking configuration (v4.0+) */
  thinking?: {
    /** Enable sequential thinking feature */
    enabled?: boolean;
    /** Maximum number of thoughts per session */
    maxThoughts?: number;
    /** Allow thought revision */
    allowRevision?: boolean;
    /** Allow branching for alternative exploration */
    allowBranching?: boolean;
    /** Maximum branches to explore */
    maxBranches?: number;
  };

  /** Knowledge graph configuration (v4.0+) */
  graph?: {
    /** Enable query cache */
    enableCache?: boolean;
    /** Cache TTL in milliseconds (default: 5 minutes) */
    cacheTTLMs?: number;
    /** Enable cycle detection */
    enableCycleDetection?: boolean;
    /** Enable symbol-level dependencies */
    enableSymbolTracking?: boolean;
  };

  /** Persistent memory configuration (v4.0+) */
  memory?: {
    /** Enable persistent memory */
    enabled?: boolean;
    /** Session retention in days (default: 30) */
    sessionRetentionDays?: number;
    /** Auto-summarize sessions */
    autoSummarize?: boolean;
    /** Maximum sessions to retain */
    maxSessions?: number;
  };

  /** Context sharing configuration (v4.0+) */
  sharing?: {
    /** Enable context sharing features */
    enabled?: boolean;
    /** Default export components */
    defaultExportComponents?: ('index' | 'graph' | 'docs' | 'memory')[];
    /** Privacy settings */
    privacy?: {
      /** Patterns to exclude from export */
      excludePatterns?: string[];
      /** Anonymize symbol names in export */
      anonymizeSymbols?: boolean;
      /** Exclude session memory from export */
      excludeMemory?: boolean;
    };
  };
}

/**
 * Default configuration values
 */
export const DEFAULT_CONFIG: Required<UCEConfig> = {
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
    uceMd: true,
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
  state: {
    enabled: false,
    path: '.uce/state.json.gz',
    autoExport: true,
  },
  qa: {
    provider: 'anthropic',
    model: 'claude-3-5-sonnet-20241022',
    maxContextTokens: 4000,
    maxResponseTokens: 2000,
    temperature: 0.3,
  },
  analytics: {
    enabled: true,
    complexity: true,
    codeSmells: true,
    patterns: true,
    thresholds: {
      longMethodLines: 50,
      longParameterCount: 5,
      godClassMethods: 20,
      deepNestingLevel: 4,
      complexityLow: 5,
      complexityMedium: 10,
      complexityHigh: 20,
    },
  },
  personality: {
    enabled: true, // Enabled by default as per user preference
    name: 'UCE Childhood Friend',
  },
  libraryDocs: {
    enabled: true,
    preferLocal: true,
    cacheTTL: 7 * 24 * 60 * 60 * 1000, // 7 days
    autoCleanup: true,
  },
  thinking: {
    enabled: true,
    maxThoughts: 10,
    allowRevision: true,
    allowBranching: false,
    maxBranches: 3,
  },
  graph: {
    enableCache: true,
    cacheTTLMs: 5 * 60 * 1000, // 5 minutes
    enableCycleDetection: true,
    enableSymbolTracking: true,
  },
  memory: {
    enabled: false, // Disabled by default until fully implemented
    sessionRetentionDays: 30,
    autoSummarize: true,
    maxSessions: 100,
  },
  sharing: {
    enabled: true,
    defaultExportComponents: ['index', 'graph', 'docs'],
    privacy: {
      excludePatterns: ['**/.env*', '**/secrets/**', '**/*.key'],
      anonymizeSymbols: false,
      excludeMemory: true,
    },
  },
};

// ============================================================================
// CONFIG LOADER
// ============================================================================

/**
 * Configuration file names to search for (in order of priority)
 */
const CONFIG_FILES = [
  '.ucerc.json',
  '.ucerc',
  'uce.config.js',
  'uce.config.mjs',
  'uce.config.cjs',
];

/**
 * Load UCE configuration from project root
 *
 * @param projectRoot - Project root directory
 * @returns Merged configuration with defaults
 */
export async function loadConfig(projectRoot: string): Promise<UCEConfig> {
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

  // Try package.json "uce" field
  const packageJsonPath = path.join(resolvedRoot, 'package.json');
  if (fs.existsSync(packageJsonPath)) {
    try {
      const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf-8'));
      if (packageJson.uce) {
        return mergeConfig(packageJson.uce);
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
async function loadConfigFile(configPath: string): Promise<UCEConfig> {
  const ext = path.extname(configPath);

  if (ext === '.json' || configPath.endsWith('.ucerc')) {
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
function mergeConfig(userConfig: Partial<UCEConfig>): UCEConfig {
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
    personality: {
      ...DEFAULT_CONFIG.personality,
      ...userConfig.personality,
    },
    libraryDocs: {
      ...DEFAULT_CONFIG.libraryDocs,
      ...userConfig.libraryDocs,
    },
    thinking: {
      ...DEFAULT_CONFIG.thinking,
      ...userConfig.thinking,
    },
    graph: {
      ...DEFAULT_CONFIG.graph,
      ...userConfig.graph,
    },
    memory: {
      ...DEFAULT_CONFIG.memory,
      ...userConfig.memory,
    },
    sharing: {
      ...DEFAULT_CONFIG.sharing,
      ...userConfig.sharing,
      privacy: {
        ...DEFAULT_CONFIG.sharing.privacy,
        ...userConfig.sharing?.privacy,
      },
    },
  };
}

/**
 * Validate configuration
 */
export function validateConfig(config: UCEConfig): { valid: boolean; errors: string[] } {
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
          uceMd: true,
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
 * UCE Configuration
 * @type {import('universal-context-engine').UCEConfig}
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
    uceMd: true,
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
