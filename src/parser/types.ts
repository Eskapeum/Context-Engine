/**
 * Universal Context Memory - Parser Types
 *
 * Core types for AST-based parsing and semantic analysis.
 *
 * @module parser/types
 */

// ============================================================================
// SYMBOL TYPES
// ============================================================================

/**
 * Kinds of code symbols we extract
 */
export type SymbolKind =
  | 'function'
  | 'method'
  | 'class'
  | 'interface'
  | 'type'
  | 'enum'
  | 'constant'
  | 'variable'
  | 'property'
  | 'module'
  | 'namespace';

/**
 * Visibility/access modifiers
 */
export type Visibility = 'public' | 'private' | 'protected' | 'internal' | 'default';

/**
 * Represents a code symbol with full metadata
 */
export interface Symbol {
  /** Symbol identifier */
  name: string;
  /** Kind of symbol */
  kind: SymbolKind;
  /** Line number (1-indexed) */
  line: number;
  /** Column number (0-indexed) */
  column: number;
  /** End line */
  endLine: number;
  /** End column */
  endColumn: number;
  /** Whether exported/public */
  exported: boolean;
  /** Visibility modifier */
  visibility: Visibility;
  /** Whether async (functions/methods) */
  async?: boolean;
  /** Whether static (methods/properties) */
  static?: boolean;
  /** Whether abstract */
  abstract?: boolean;
  /** Parameters with types */
  parameters?: Parameter[];
  /** Return type annotation */
  returnType?: string;
  /** Type annotation (for variables/properties) */
  type?: string;
  /** Generic type parameters */
  generics?: string[];
  /** Parent symbol name (for nested symbols) */
  parent?: string;
  /** Extends/implements */
  extends?: string[];
  /** Implements interfaces */
  implements?: string[];
  /** JSDoc/docstring */
  documentation?: string;
  /** Decorators/attributes */
  decorators?: string[];
  /** Raw signature for display */
  signature?: string;
  /** Byte offset in file */
  startByte?: number;
  /** End byte offset */
  endByte?: number;
}

/**
 * Function/method parameter
 */
export interface Parameter {
  /** Parameter name */
  name: string;
  /** Type annotation */
  type?: string;
  /** Default value expression */
  defaultValue?: string;
  /** Whether optional */
  optional?: boolean;
  /** Whether rest parameter */
  rest?: boolean;
}

// ============================================================================
// IMPORT/EXPORT TYPES
// ============================================================================

/**
 * Import statement representation
 */
export interface Import {
  /** Source module/path */
  source: string;
  /** Import kind */
  kind: 'named' | 'default' | 'namespace' | 'side-effect' | 'type';
  /** Imported names */
  names: ImportedName[];
  /** Line number */
  line: number;
  /** Whether type-only import */
  isTypeOnly?: boolean;
  /** Whether dynamic import */
  isDynamic?: boolean;
}

/**
 * Individual imported name
 */
export interface ImportedName {
  /** Original name in source */
  name: string;
  /** Alias if renamed */
  alias?: string;
  /** Whether type-only */
  isType?: boolean;
}

/**
 * Export statement representation
 */
export interface Export {
  /** Exported name */
  name: string;
  /** Export kind */
  kind: 'named' | 'default' | 're-export' | 'namespace';
  /** Source (for re-exports) */
  source?: string;
  /** Original name (if renamed) */
  originalName?: string;
  /** Line number */
  line: number;
  /** Whether type-only export */
  isTypeOnly?: boolean;
}

// ============================================================================
// CALL GRAPH TYPES
// ============================================================================

/**
 * Function/method call reference
 */
export interface CallReference {
  /** Called function/method name */
  callee: string;
  /** Caller function/method (if within one) */
  caller?: string;
  /** Line number */
  line: number;
  /** Column */
  column: number;
  /** Whether method call (has receiver) */
  isMethodCall?: boolean;
  /** Receiver expression (for method calls) */
  receiver?: string;
  /** Number of arguments */
  argumentCount?: number;
}

/**
 * Type reference in code
 */
export interface TypeReference {
  /** Referenced type name */
  name: string;
  /** Context where referenced */
  context: 'extends' | 'implements' | 'parameter' | 'return' | 'variable' | 'property' | 'generic';
  /** Line number */
  line: number;
  /** Referencing symbol (if any) */
  referencedBy?: string;
}

// ============================================================================
// CHUNK TYPES
// ============================================================================

/**
 * Semantic code chunk for embedding
 */
export interface SemanticChunk {
  /** Unique chunk ID */
  id: string;
  /** Chunk content */
  content: string;
  /** Chunk type */
  type: 'function' | 'class' | 'module' | 'comment' | 'mixed';
  /** Source file path */
  filePath: string;
  /** Start line */
  startLine: number;
  /** End line */
  endLine: number;
  /** Primary symbol in chunk (if any) */
  primarySymbol?: string;
  /** All symbols in chunk */
  symbols: string[];
  /** Imports relevant to chunk */
  imports: string[];
  /** Token count estimate */
  tokenCount: number;
  /** Metadata for retrieval */
  metadata: ChunkMetadata;
}

/**
 * Chunk metadata for search/retrieval
 */
export interface ChunkMetadata {
  /** Language */
  language: string;
  /** File path */
  filePath: string;
  /** Parent class/module */
  parent?: string;
  /** Symbol kinds in chunk */
  symbolKinds: SymbolKind[];
  /** Whether exported/public */
  hasExports: boolean;
  /** Complexity estimate */
  complexity?: number;
  /** Whether this is a partial chunk of a larger symbol */
  isPartial?: boolean;
  /** Part index when symbol is split into multiple chunks */
  partIndex?: number;
}

// ============================================================================
// PARSE RESULT TYPES
// ============================================================================

/**
 * Complete parse result for a file
 */
export interface ParseResult {
  /** File path */
  filePath: string;
  /** Detected language */
  language: string;
  /** Parse success */
  success: boolean;
  /** Parse errors (if any) */
  errors?: ParseError[];
  /** Extracted symbols */
  symbols: Symbol[];
  /** Import statements */
  imports: Import[];
  /** Export statements */
  exports: Export[];
  /** Function calls */
  calls: CallReference[];
  /** Type references */
  typeReferences: TypeReference[];
  /** Semantic chunks */
  chunks: SemanticChunk[];
  /** File-level documentation */
  fileDocumentation?: string;
  /** Parse duration (ms) */
  parseTime: number;
}

/**
 * Parse error information
 */
export interface ParseError {
  /** Error message */
  message: string;
  /** Line number */
  line: number;
  /** Column */
  column: number;
  /** Error type */
  type: 'syntax' | 'semantic' | 'warning';
}

// ============================================================================
// LANGUAGE SUPPORT
// ============================================================================

/**
 * Supported languages
 */
export type SupportedLanguage =
  | 'typescript'
  | 'javascript'
  | 'python'
  | 'rust'
  | 'go'
  | 'java'
  | 'csharp'
  | 'cpp'
  | 'c'
  | 'ruby'
  | 'php'
  | 'swift'
  | 'kotlin'
  | 'scala'
  | 'lua'
  | 'bash'
  | 'json'
  | 'yaml'
  | 'markdown'
  | 'html'
  | 'css';

/**
 * Language configuration
 */
export interface LanguageConfig {
  /** Language identifier */
  id: SupportedLanguage;
  /** Display name */
  name: string;
  /** File extensions */
  extensions: string[];
  /** Tree-sitter grammar name */
  treeSitterGrammar?: string;
  /** Whether tree-sitter is available */
  hasTreeSitter: boolean;
  /** Comment patterns */
  comments: {
    line?: string;
    blockStart?: string;
    blockEnd?: string;
    docStart?: string;
  };
}

/**
 * Registry of language configurations
 */
export const LANGUAGE_REGISTRY: Record<SupportedLanguage, LanguageConfig> = {
  typescript: {
    id: 'typescript',
    name: 'TypeScript',
    extensions: ['.ts', '.tsx', '.mts', '.cts'],
    treeSitterGrammar: 'tree-sitter-typescript',
    hasTreeSitter: true,
    comments: { line: '//', blockStart: '/*', blockEnd: '*/', docStart: '/**' },
  },
  javascript: {
    id: 'javascript',
    name: 'JavaScript',
    extensions: ['.js', '.jsx', '.mjs', '.cjs'],
    treeSitterGrammar: 'tree-sitter-javascript',
    hasTreeSitter: true,
    comments: { line: '//', blockStart: '/*', blockEnd: '*/', docStart: '/**' },
  },
  python: {
    id: 'python',
    name: 'Python',
    extensions: ['.py', '.pyi', '.pyw'],
    treeSitterGrammar: 'tree-sitter-python',
    hasTreeSitter: true,
    comments: { line: '#', blockStart: '"""', blockEnd: '"""', docStart: '"""' },
  },
  rust: {
    id: 'rust',
    name: 'Rust',
    extensions: ['.rs'],
    treeSitterGrammar: 'tree-sitter-rust',
    hasTreeSitter: true,
    comments: { line: '//', blockStart: '/*', blockEnd: '*/', docStart: '///' },
  },
  go: {
    id: 'go',
    name: 'Go',
    extensions: ['.go'],
    treeSitterGrammar: 'tree-sitter-go',
    hasTreeSitter: true,
    comments: { line: '//', blockStart: '/*', blockEnd: '*/' },
  },
  java: {
    id: 'java',
    name: 'Java',
    extensions: ['.java'],
    treeSitterGrammar: 'tree-sitter-java',
    hasTreeSitter: true,
    comments: { line: '//', blockStart: '/*', blockEnd: '*/', docStart: '/**' },
  },
  csharp: {
    id: 'csharp',
    name: 'C#',
    extensions: ['.cs'],
    treeSitterGrammar: 'tree-sitter-c-sharp',
    hasTreeSitter: true,
    comments: { line: '//', blockStart: '/*', blockEnd: '*/', docStart: '///' },
  },
  cpp: {
    id: 'cpp',
    name: 'C++',
    extensions: ['.cpp', '.cc', '.cxx', '.hpp', '.hxx', '.h'],
    treeSitterGrammar: 'tree-sitter-cpp',
    hasTreeSitter: true,
    comments: { line: '//', blockStart: '/*', blockEnd: '*/', docStart: '/**' },
  },
  c: {
    id: 'c',
    name: 'C',
    extensions: ['.c'],
    treeSitterGrammar: 'tree-sitter-c',
    hasTreeSitter: true,
    comments: { line: '//', blockStart: '/*', blockEnd: '*/' },
  },
  ruby: {
    id: 'ruby',
    name: 'Ruby',
    extensions: ['.rb', '.rake', '.gemspec'],
    treeSitterGrammar: 'tree-sitter-ruby',
    hasTreeSitter: true,
    comments: { line: '#', blockStart: '=begin', blockEnd: '=end' },
  },
  php: {
    id: 'php',
    name: 'PHP',
    extensions: ['.php'],
    treeSitterGrammar: 'tree-sitter-php',
    hasTreeSitter: true,
    comments: { line: '//', blockStart: '/*', blockEnd: '*/', docStart: '/**' },
  },
  swift: {
    id: 'swift',
    name: 'Swift',
    extensions: ['.swift'],
    treeSitterGrammar: 'tree-sitter-swift',
    hasTreeSitter: true,
    comments: { line: '//', blockStart: '/*', blockEnd: '*/', docStart: '///' },
  },
  kotlin: {
    id: 'kotlin',
    name: 'Kotlin',
    extensions: ['.kt', '.kts'],
    treeSitterGrammar: 'tree-sitter-kotlin',
    hasTreeSitter: true,
    comments: { line: '//', blockStart: '/*', blockEnd: '*/', docStart: '/**' },
  },
  scala: {
    id: 'scala',
    name: 'Scala',
    extensions: ['.scala', '.sc'],
    treeSitterGrammar: 'tree-sitter-scala',
    hasTreeSitter: true,
    comments: { line: '//', blockStart: '/*', blockEnd: '*/', docStart: '/**' },
  },
  lua: {
    id: 'lua',
    name: 'Lua',
    extensions: ['.lua'],
    treeSitterGrammar: 'tree-sitter-lua',
    hasTreeSitter: true,
    comments: { line: '--', blockStart: '--[[', blockEnd: ']]' },
  },
  bash: {
    id: 'bash',
    name: 'Bash',
    extensions: ['.sh', '.bash', '.zsh'],
    treeSitterGrammar: 'tree-sitter-bash',
    hasTreeSitter: true,
    comments: { line: '#' },
  },
  json: {
    id: 'json',
    name: 'JSON',
    extensions: ['.json', '.jsonc'],
    treeSitterGrammar: 'tree-sitter-json',
    hasTreeSitter: true,
    comments: {},
  },
  yaml: {
    id: 'yaml',
    name: 'YAML',
    extensions: ['.yaml', '.yml'],
    treeSitterGrammar: 'tree-sitter-yaml',
    hasTreeSitter: true,
    comments: { line: '#' },
  },
  markdown: {
    id: 'markdown',
    name: 'Markdown',
    extensions: ['.md', '.markdown'],
    treeSitterGrammar: 'tree-sitter-markdown',
    hasTreeSitter: true,
    comments: {},
  },
  html: {
    id: 'html',
    name: 'HTML',
    extensions: ['.html', '.htm'],
    treeSitterGrammar: 'tree-sitter-html',
    hasTreeSitter: true,
    comments: { blockStart: '<!--', blockEnd: '-->' },
  },
  css: {
    id: 'css',
    name: 'CSS',
    extensions: ['.css', '.scss', '.sass', '.less'],
    treeSitterGrammar: 'tree-sitter-css',
    hasTreeSitter: true,
    comments: { blockStart: '/*', blockEnd: '*/' },
  },
};

/**
 * Get language config by file extension
 */
export function getLanguageByExtension(extension: string): LanguageConfig | undefined {
  const ext = extension.startsWith('.') ? extension : `.${extension}`;
  for (const config of Object.values(LANGUAGE_REGISTRY)) {
    if (config.extensions.includes(ext)) {
      return config;
    }
  }
  return undefined;
}

/**
 * Get language config by ID
 */
export function getLanguageById(id: string): LanguageConfig | undefined {
  return LANGUAGE_REGISTRY[id as SupportedLanguage];
}
