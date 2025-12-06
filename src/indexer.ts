/**
 * Universal Context Memory - Indexer
 *
 * Indexes codebases to extract symbols, dependencies, and structure.
 * Supports 10+ programming languages with pattern-based extraction.
 *
 * @module indexer
 */

import * as fs from 'fs';
import * as path from 'path';
import { glob } from 'glob';
import ignoreModule from 'ignore';

const ignore = (ignoreModule as any).default || ignoreModule;
type IgnoreInstance = ReturnType<typeof ignore>;

// ============================================================================
// TYPES
// ============================================================================

/**
 * Represents a code symbol (function, class, interface, etc.)
 */
export interface CodeSymbol {
  /** Symbol name */
  name: string;
  /** Kind of symbol */
  kind: 'function' | 'class' | 'interface' | 'type' | 'constant' | 'method' | 'property' | 'enum';
  /** Line number in file */
  line: number;
  /** Whether exported */
  exported: boolean;
  /** Whether async (for functions) */
  async?: boolean;
  /** Parameter names (for functions/methods) */
  params?: string[];
  /** Return type */
  returnType?: string;
  /** Docstring/JSDoc comment */
  docstring?: string;
  /** Parent symbol (for methods/properties) */
  parent?: string;
}

/**
 * Represents an import statement
 */
export interface FileImport {
  /** Import source path */
  source: string;
  /** Named imports */
  names: string[];
  /** Whether it's a default import */
  isDefault: boolean;
  /** Whether it's a namespace import */
  isNamespace: boolean;
}

/**
 * Represents a dependency edge between files
 */
export interface DependencyEdge {
  /** Source file */
  from: string;
  /** Target file */
  to: string;
  /** Import names */
  imports: string[];
}

/**
 * Index for a single file
 */
export interface FileIndex {
  /** Relative path from project root */
  path: string;
  /** File extension */
  extension: string;
  /** Detected language */
  language: string;
  /** Last modified timestamp */
  lastModified: number;
  /** File size in bytes */
  size: number;
  /** Extracted symbols */
  symbols: CodeSymbol[];
  /** Import statements */
  imports: FileImport[];
  /** First line of file (often module docstring) */
  description?: string;
}

/**
 * Complete project index
 */
export interface ProjectIndex {
  /** UCM version that created this index */
  ucmVersion: string;
  /** Project name (from package.json or directory) */
  projectName: string;
  /** Project root directory */
  projectRoot: string;
  /** When the index was created */
  indexedAt: string;
  /** Total files indexed */
  totalFiles: number;
  /** Total symbols extracted */
  totalSymbols: number;
  /** File indexes by relative path */
  files: Record<string, FileIndex>;
  /** Dependency graph edges */
  dependencies: DependencyEdge[];
  /** Entry points (main files) */
  entryPoints: string[];
  /** Summary by language */
  languageStats: Record<string, { files: number; symbols: number }>;
}

/**
 * Indexer configuration
 */
export interface IndexerConfig {
  /** Project root directory */
  projectRoot: string;
  /** Additional patterns to ignore */
  ignorePatterns?: string[];
  /** Maximum file size to index (in bytes) */
  maxFileSize?: number;
  /** Whether to extract docstrings */
  extractDocstrings?: boolean;
  /** Whether to follow symlinks */
  followSymlinks?: boolean;
}

// ============================================================================
// LANGUAGE PATTERNS
// ============================================================================

interface LanguageConfig {
  extensions: string[];
  patterns: {
    function: RegExp;
    class: RegExp;
    interface?: RegExp;
    type?: RegExp;
    constant?: RegExp;
    import: RegExp;
    docstring?: RegExp;
  };
}

const LANGUAGE_CONFIGS: Record<string, LanguageConfig> = {
  typescript: {
    extensions: ['.ts', '.tsx', '.mts', '.cts'],
    patterns: {
      function:
        /^(?:export\s+)?(?:async\s+)?function\s+(\w+)\s*(?:<[^>]*>)?\s*\(([^)]*)\)(?:\s*:\s*([^{]+))?/gm,
      class: /^(?:export\s+)?(?:abstract\s+)?class\s+(\w+)(?:\s+extends\s+(\w+))?(?:\s+implements\s+([^{]+))?/gm,
      interface: /^(?:export\s+)?interface\s+(\w+)(?:\s+extends\s+([^{]+))?/gm,
      type: /^(?:export\s+)?type\s+(\w+)(?:<[^>]*>)?\s*=/gm,
      constant: /^(?:export\s+)?(?:const|let|var)\s+(\w+)(?:\s*:\s*([^=]+))?\s*=/gm,
      import: /^import\s+(?:(?:type\s+)?(?:(\w+)(?:,\s*)?)?(?:\{([^}]+)\})?(?:\*\s+as\s+(\w+))?)\s+from\s+['"]([^'"]+)['"]/gm,
      docstring: /\/\*\*[\s\S]*?\*\/|\/\/.*$/gm,
    },
  },
  javascript: {
    extensions: ['.js', '.jsx', '.mjs', '.cjs'],
    patterns: {
      function: /^(?:export\s+)?(?:async\s+)?function\s+(\w+)\s*\(([^)]*)\)/gm,
      class: /^(?:export\s+)?class\s+(\w+)(?:\s+extends\s+(\w+))?/gm,
      constant: /^(?:export\s+)?(?:const|let|var)\s+(\w+)\s*=/gm,
      import: /^import\s+(?:(\w+)(?:,\s*)?)?(?:\{([^}]+)\})?(?:\*\s+as\s+(\w+))?\s+from\s+['"]([^'"]+)['"]/gm,
      docstring: /\/\*\*[\s\S]*?\*\/|\/\/.*$/gm,
    },
  },
  python: {
    extensions: ['.py', '.pyi'],
    patterns: {
      function: /^(?:async\s+)?def\s+(\w+)\s*\(([^)]*)\)(?:\s*->\s*([^:]+))?:/gm,
      class: /^class\s+(\w+)(?:\(([^)]+)\))?:/gm,
      constant: /^([A-Z][A-Z0-9_]*)\s*(?::\s*[^=]+)?\s*=/gm,
      import: /^(?:from\s+(\S+)\s+import\s+([^#\n]+)|import\s+(\S+)(?:\s+as\s+(\w+))?)/gm,
      docstring: /"""[\s\S]*?"""|'''[\s\S]*?'''|#.*$/gm,
    },
  },
  rust: {
    extensions: ['.rs'],
    patterns: {
      function: /^(?:pub\s+)?(?:async\s+)?fn\s+(\w+)(?:<[^>]*>)?\s*\(([^)]*)\)(?:\s*->\s*([^{]+))?/gm,
      class: /^(?:pub\s+)?struct\s+(\w+)(?:<[^>]*>)?/gm,
      interface: /^(?:pub\s+)?trait\s+(\w+)(?:<[^>]*>)?/gm,
      type: /^(?:pub\s+)?type\s+(\w+)(?:<[^>]*>)?\s*=/gm,
      constant: /^(?:pub\s+)?(?:const|static)\s+(\w+)\s*:/gm,
      import: /^use\s+([^;]+);/gm,
      docstring: /\/\/\/.*$|\/\/!.*$/gm,
    },
  },
  go: {
    extensions: ['.go'],
    patterns: {
      function: /^func\s+(?:\([^)]+\)\s+)?(\w+)\s*\(([^)]*)\)(?:\s*\(?([^{]+)\)?)?/gm,
      class: /^type\s+(\w+)\s+struct\s*\{/gm,
      interface: /^type\s+(\w+)\s+interface\s*\{/gm,
      type: /^type\s+(\w+)\s+(?!struct|interface)/gm,
      constant: /^(?:const|var)\s+(\w+)\s*/gm,
      import: /^import\s+(?:\(\s*([^)]+)\s*\)|"([^"]+)")/gm,
      docstring: /\/\/.*$/gm,
    },
  },
  java: {
    extensions: ['.java'],
    patterns: {
      function:
        /^(?:\s*)(?:public|private|protected)?\s*(?:static)?\s*(?:final)?\s*(?:<[^>]*>\s*)?(\w+)\s+(\w+)\s*\(([^)]*)\)/gm,
      class:
        /^(?:public\s+)?(?:abstract\s+)?(?:final\s+)?class\s+(\w+)(?:<[^>]*>)?(?:\s+extends\s+(\w+))?(?:\s+implements\s+([^{]+))?/gm,
      interface: /^(?:public\s+)?interface\s+(\w+)(?:<[^>]*>)?(?:\s+extends\s+([^{]+))?/gm,
      constant: /^(?:public|private|protected)?\s*(?:static)?\s*final\s+\w+\s+([A-Z][A-Z0-9_]*)\s*=/gm,
      import: /^import\s+(?:static\s+)?([^;]+);/gm,
      docstring: /\/\*\*[\s\S]*?\*\/|\/\/.*$/gm,
    },
  },
  csharp: {
    extensions: ['.cs'],
    patterns: {
      function:
        /^(?:\s*)(?:public|private|protected|internal)?\s*(?:static)?\s*(?:async)?\s*(?:\w+(?:<[^>]*>)?)\s+(\w+)\s*\(([^)]*)\)/gm,
      class:
        /^(?:public\s+)?(?:abstract\s+)?(?:sealed\s+)?(?:partial\s+)?class\s+(\w+)(?:<[^>]*>)?(?:\s*:\s*([^{]+))?/gm,
      interface: /^(?:public\s+)?interface\s+(\w+)(?:<[^>]*>)?(?:\s*:\s*([^{]+))?/gm,
      type: /^(?:public\s+)?(?:record|enum)\s+(\w+)/gm,
      constant: /^(?:public|private|protected|internal)?\s*(?:static)?\s*(?:readonly)?\s*const\s+\w+\s+(\w+)\s*=/gm,
      import: /^using\s+(?:static\s+)?([^;]+);/gm,
      docstring: /\/\/\/.*$|\/\*\*[\s\S]*?\*\//gm,
    },
  },
  ruby: {
    extensions: ['.rb', '.rake'],
    patterns: {
      function: /^(?:\s*)def\s+(?:self\.)?(\w+)(?:\(([^)]*)\))?/gm,
      class: /^(?:\s*)class\s+(\w+)(?:\s*<\s*(\w+))?/gm,
      constant: /^(?:\s*)([A-Z][A-Z0-9_]*)\s*=/gm,
      import: /^require(?:_relative)?\s+['"]([^'"]+)['"]/gm,
      docstring: /=begin[\s\S]*?=end|#.*$/gm,
    },
  },
  php: {
    extensions: ['.php'],
    patterns: {
      function:
        /^(?:\s*)(?:public|private|protected)?\s*(?:static)?\s*function\s+(\w+)\s*\(([^)]*)\)(?:\s*:\s*([^{]+))?/gm,
      class:
        /^(?:abstract\s+)?(?:final\s+)?class\s+(\w+)(?:\s+extends\s+(\w+))?(?:\s+implements\s+([^{]+))?/gm,
      interface: /^interface\s+(\w+)(?:\s+extends\s+([^{]+))?/gm,
      constant: /^(?:public|private|protected)?\s*const\s+(\w+)\s*=/gm,
      import: /^(?:use|require(?:_once)?|include(?:_once)?)\s+([^;]+);/gm,
      docstring: /\/\*\*[\s\S]*?\*\/|\/\/.*$|#.*$/gm,
    },
  },
  swift: {
    extensions: ['.swift'],
    patterns: {
      function:
        /^(?:\s*)(?:public|private|internal|fileprivate|open)?\s*(?:static)?\s*func\s+(\w+)(?:<[^>]*>)?\s*\(([^)]*)\)(?:\s*->\s*([^{]+))?/gm,
      class:
        /^(?:public|private|internal|fileprivate|open)?\s*(?:final\s+)?class\s+(\w+)(?:<[^>]*>)?(?:\s*:\s*([^{]+))?/gm,
      interface: /^(?:public|private|internal|fileprivate|open)?\s*protocol\s+(\w+)(?:\s*:\s*([^{]+))?/gm,
      type: /^(?:public|private|internal|fileprivate|open)?\s*(?:enum|struct)\s+(\w+)/gm,
      constant: /^(?:public|private|internal|fileprivate|open)?\s*(?:static)?\s*let\s+(\w+)/gm,
      import: /^import\s+(\w+)/gm,
      docstring: /\/\/\/.*$|\/\*\*[\s\S]*?\*\//gm,
    },
  },
  kotlin: {
    extensions: ['.kt', '.kts'],
    patterns: {
      function:
        /^(?:\s*)(?:public|private|protected|internal)?\s*(?:suspend)?\s*fun\s+(?:<[^>]*>\s*)?(\w+)\s*\(([^)]*)\)(?:\s*:\s*([^{=]+))?/gm,
      class:
        /^(?:public|private|protected|internal)?\s*(?:open|abstract|sealed|data|enum)?\s*class\s+(\w+)(?:<[^>]*>)?(?:\s*:\s*([^{]+))?/gm,
      interface: /^(?:public|private|protected|internal)?\s*interface\s+(\w+)(?:<[^>]*>)?(?:\s*:\s*([^{]+))?/gm,
      type: /^(?:public|private|protected|internal)?\s*(?:object|typealias)\s+(\w+)/gm,
      constant: /^(?:public|private|protected|internal)?\s*(?:const)?\s*val\s+(\w+)/gm,
      import: /^import\s+([^\n]+)/gm,
      docstring: /\/\*\*[\s\S]*?\*\/|\/\/.*$/gm,
    },
  },
  scala: {
    extensions: ['.scala', '.sc'],
    patterns: {
      function: /^(?:\s*)(?:override\s+)?(?:private|protected)?\s*def\s+(\w+)(?:\[.*?\])?\s*(?:\(([^)]*)\))?(?:\s*:\s*([^=]+))?/gm,
      class:
        /^(?:abstract\s+)?(?:sealed\s+)?(?:final\s+)?(?:case\s+)?class\s+(\w+)(?:\[.*?\])?(?:\s*extends\s+([^{]+))?/gm,
      interface: /^trait\s+(\w+)(?:\[.*?\])?(?:\s+extends\s+([^{]+))?/gm,
      type: /^(?:type|object)\s+(\w+)/gm,
      constant: /^(?:\s*)(?:val|lazy\s+val)\s+(\w+)/gm,
      import: /^import\s+([^\n]+)/gm,
      docstring: /\/\*\*[\s\S]*?\*\/|\/\/.*$/gm,
    },
  },
  cpp: {
    extensions: ['.c', '.cpp', '.cc', '.cxx', '.h', '.hpp', '.hh', '.hxx'],
    patterns: {
      function: /^(?:\w+(?:\s*(?:\*|&))?\s+)+(\w+)\s*\(([^)]*)\)(?:\s*const)?(?:\s*override)?(?:\s*=\s*0)?/gm,
      class: /^(?:template\s*<[^>]*>\s*)?(?:class|struct)\s+(\w+)(?:\s*:\s*(?:public|private|protected)\s+(\w+))?/gm,
      type: /^(?:typedef|using)\s+(?:[^;]+\s+)?(\w+)/gm,
      constant: /^(?:const|constexpr)\s+\w+\s+(\w+)\s*=/gm,
      import: /^#include\s*[<"]([^>"]+)[>"]/gm,
      docstring: /\/\*\*[\s\S]*?\*\/|\/\/.*$/gm,
    },
  },
};

// Default files to always ignore
const DEFAULT_IGNORE = [
  'node_modules',
  '.git',
  '.hg',
  '.svn',
  'dist',
  'build',
  'out',
  'coverage',
  '.next',
  '.nuxt',
  '.cache',
  '__pycache__',
  '*.pyc',
  '.venv',
  'venv',
  '.env',
  '*.min.js',
  '*.bundle.js',
  '*.map',
  '.context',
  'package-lock.json',
  'yarn.lock',
  'pnpm-lock.yaml',
  '*.log',
];

// ============================================================================
// INDEXER CLASS
// ============================================================================

/**
 * Indexes codebases to extract symbols, dependencies, and structure.
 *
 * @example
 * ```ts
 * const indexer = new Indexer({ projectRoot: '/path/to/project' });
 * const index = await indexer.index();
 * await indexer.saveIndex(index);
 * ```
 */
export class Indexer {
  private config: IndexerConfig;
  private ig: IgnoreInstance;

  constructor(config: IndexerConfig) {
    this.config = {
      projectRoot: path.resolve(config.projectRoot),
      ignorePatterns: config.ignorePatterns || [],
      maxFileSize: config.maxFileSize || 1024 * 1024, // 1MB default
      extractDocstrings: config.extractDocstrings ?? true,
      followSymlinks: config.followSymlinks ?? false,
    };

    // Initialize ignore filter
    this.ig = ignore();
    this.ig.add(DEFAULT_IGNORE);
    this.ig.add(this.config.ignorePatterns || []);

    // Load .gitignore if exists
    const gitignorePath = path.join(this.config.projectRoot, '.gitignore');
    if (fs.existsSync(gitignorePath)) {
      const gitignore = fs.readFileSync(gitignorePath, 'utf-8');
      this.ig.add(gitignore.split('\n').filter((line) => line.trim() && !line.startsWith('#')));
    }

    // Load .contextignore if exists
    const contextIgnorePath = path.join(this.config.projectRoot, '.contextignore');
    if (fs.existsSync(contextIgnorePath)) {
      const contextIgnore = fs.readFileSync(contextIgnorePath, 'utf-8');
      this.ig.add(contextIgnore.split('\n').filter((line) => line.trim() && !line.startsWith('#')));
    }
  }

  /**
   * Index the entire project
   */
  public async index(): Promise<ProjectIndex> {
    const projectName = this.getProjectName();
    const allExtensions = Object.values(LANGUAGE_CONFIGS).flatMap((c) => c.extensions);

    // Find all files
    const patterns = allExtensions.map((ext) => `**/*${ext}`);
    const files = await glob(patterns, {
      cwd: this.config.projectRoot,
      nodir: true,
      follow: this.config.followSymlinks,
      ignore: ['**/node_modules/**', '**/.git/**'],
    });

    // Filter ignored files
    const filteredFiles = files.filter((f) => !this.ig.ignores(f));

    // Index each file
    const fileIndexes: Record<string, FileIndex> = {};
    const dependencies: DependencyEdge[] = [];
    const languageStats: Record<string, { files: number; symbols: number }> = {};

    for (const relativePath of filteredFiles) {
      const fullPath = path.join(this.config.projectRoot, relativePath);
      const fileIndex = await this.indexFile(fullPath, relativePath);

      if (fileIndex) {
        fileIndexes[relativePath] = fileIndex;

        // Update language stats
        if (!languageStats[fileIndex.language]) {
          languageStats[fileIndex.language] = { files: 0, symbols: 0 };
        }
        languageStats[fileIndex.language].files++;
        languageStats[fileIndex.language].symbols += fileIndex.symbols.length;

        // Build dependencies
        for (const imp of fileIndex.imports) {
          const resolvedPath = this.resolveImport(imp.source, relativePath);
          if (resolvedPath && fileIndexes[resolvedPath]) {
            dependencies.push({
              from: relativePath,
              to: resolvedPath,
              imports: imp.names,
            });
          }
        }
      }
    }

    // Find entry points
    const entryPoints = this.findEntryPoints(fileIndexes);

    // Calculate totals
    const totalSymbols = Object.values(fileIndexes).reduce((sum, f) => sum + f.symbols.length, 0);

    return {
      ucmVersion: '1.0.0',
      projectName,
      projectRoot: this.config.projectRoot,
      indexedAt: new Date().toISOString(),
      totalFiles: Object.keys(fileIndexes).length,
      totalSymbols,
      files: fileIndexes,
      dependencies,
      entryPoints,
      languageStats,
    };
  }

  /**
   * Index a single file
   */
  private async indexFile(fullPath: string, relativePath: string): Promise<FileIndex | null> {
    try {
      const stats = fs.statSync(fullPath);

      // Skip files that are too large
      if (stats.size > (this.config.maxFileSize || 1024 * 1024)) {
        return null;
      }

      const content = fs.readFileSync(fullPath, 'utf-8');
      const extension = path.extname(fullPath);
      const language = this.detectLanguage(extension);

      if (!language) {
        return null;
      }

      const symbols = this.extractSymbols(content, language);
      const imports = this.extractImports(content, language);
      const description = this.extractDescription(content);

      return {
        path: relativePath,
        extension,
        language,
        lastModified: stats.mtimeMs,
        size: stats.size,
        symbols,
        imports,
        description,
      };
    } catch {
      return null;
    }
  }

  /**
   * Detect language from file extension
   */
  private detectLanguage(extension: string): string | null {
    for (const [lang, config] of Object.entries(LANGUAGE_CONFIGS)) {
      if (config.extensions.includes(extension)) {
        return lang;
      }
    }
    return null;
  }

  /**
   * Extract symbols from file content
   */
  private extractSymbols(content: string, language: string): CodeSymbol[] {
    const config = LANGUAGE_CONFIGS[language];
    if (!config) return [];

    const symbols: CodeSymbol[] = [];

    // Extract functions
    if (config.patterns.function) {
      const regex = new RegExp(config.patterns.function.source, 'gm');
      let match;
      while ((match = regex.exec(content)) !== null) {
        const lineNum = content.substring(0, match.index).split('\n').length;
        const isExported = match[0].includes('export') || match[0].startsWith('pub');
        const isAsync = match[0].includes('async');

        symbols.push({
          name: match[1],
          kind: 'function',
          line: lineNum,
          exported: isExported,
          async: isAsync,
          params: match[2]
            ? match[2]
                .split(',')
                .map((p) => p.trim())
                .filter(Boolean)
            : undefined,
          returnType: match[3]?.trim(),
        });
      }
    }

    // Extract classes
    if (config.patterns.class) {
      const regex = new RegExp(config.patterns.class.source, 'gm');
      let match;
      while ((match = regex.exec(content)) !== null) {
        const lineNum = content.substring(0, match.index).split('\n').length;
        const isExported = match[0].includes('export') || match[0].startsWith('pub');

        symbols.push({
          name: match[1],
          kind: 'class',
          line: lineNum,
          exported: isExported,
        });
      }
    }

    // Extract interfaces
    if (config.patterns.interface) {
      const regex = new RegExp(config.patterns.interface.source, 'gm');
      let match;
      while ((match = regex.exec(content)) !== null) {
        const lineNum = content.substring(0, match.index).split('\n').length;
        const isExported = match[0].includes('export') || match[0].startsWith('pub');

        symbols.push({
          name: match[1],
          kind: 'interface',
          line: lineNum,
          exported: isExported,
        });
      }
    }

    // Extract types
    if (config.patterns.type) {
      const regex = new RegExp(config.patterns.type.source, 'gm');
      let match;
      while ((match = regex.exec(content)) !== null) {
        const lineNum = content.substring(0, match.index).split('\n').length;
        const isExported = match[0].includes('export') || match[0].startsWith('pub');

        symbols.push({
          name: match[1],
          kind: 'type',
          line: lineNum,
          exported: isExported,
        });
      }
    }

    // Extract constants
    if (config.patterns.constant) {
      const regex = new RegExp(config.patterns.constant.source, 'gm');
      let match;
      while ((match = regex.exec(content)) !== null) {
        const lineNum = content.substring(0, match.index).split('\n').length;
        const isExported = match[0].includes('export') || match[0].startsWith('pub');

        symbols.push({
          name: match[1],
          kind: 'constant',
          line: lineNum,
          exported: isExported,
        });
      }
    }

    return symbols;
  }

  /**
   * Extract imports from file content
   */
  private extractImports(content: string, language: string): FileImport[] {
    const config = LANGUAGE_CONFIGS[language];
    if (!config?.patterns.import) return [];

    const imports: FileImport[] = [];
    const regex = new RegExp(config.patterns.import.source, 'gm');
    let match;

    while ((match = regex.exec(content)) !== null) {
      // Different languages have different import patterns
      if (language === 'typescript' || language === 'javascript') {
        const defaultImport = match[1];
        const namedImports = match[2]
          ?.split(',')
          .map((n) => n.trim().split(' as ')[0].replace('type ', ''))
          .filter(Boolean);
        const namespaceImport = match[3];
        const source = match[4];

        imports.push({
          source,
          names: [...(defaultImport ? [defaultImport] : []), ...(namedImports || []), ...(namespaceImport ? [namespaceImport] : [])],
          isDefault: !!defaultImport && !namedImports?.length,
          isNamespace: !!namespaceImport,
        });
      } else if (language === 'python') {
        const fromModule = match[1];
        const importedNames = match[2];
        const simpleImport = match[3];

        imports.push({
          source: fromModule || simpleImport,
          names: importedNames
            ? importedNames
                .split(',')
                .map((n) => n.trim().split(' as ')[0])
                .filter(Boolean)
            : [simpleImport],
          isDefault: false,
          isNamespace: !!simpleImport && !fromModule,
        });
      } else {
        // Generic handling for other languages
        imports.push({
          source: match[1] || match[0],
          names: [],
          isDefault: false,
          isNamespace: false,
        });
      }
    }

    return imports;
  }

  /**
   * Extract description from first comment in file
   */
  private extractDescription(content: string): string | undefined {
    const lines = content.split('\n');

    // Look for JSDoc/docstring at start of file
    for (let i = 0; i < Math.min(10, lines.length); i++) {
      const line = lines[i].trim();
      if (line.startsWith('/**')) {
        // JSDoc - find closing */
        const jsdocLines: string[] = [];
        for (let j = i; j < lines.length; j++) {
          jsdocLines.push(lines[j]);
          if (lines[j].includes('*/')) break;
        }
        const jsdoc = jsdocLines.join('\n');
        const match = jsdoc.match(/\/\*\*\s*\n?\s*\*?\s*(.+?)(?:\n|\*\/)/);
        if (match) return match[1].trim();
      } else if (line.startsWith('"""') || line.startsWith("'''")) {
        // Python docstring
        const match = content.match(/^(?:"""'|''')([^]*?)(?:"""'|''')/);
        if (match) return match[1].trim().split('\n')[0];
      } else if (line.startsWith('#') && !line.startsWith('#!')) {
        return line.slice(1).trim();
      } else if (line.startsWith('//') && !line.startsWith('///')) {
        return line.slice(2).trim();
      }
    }

    return undefined;
  }

  /**
   * Resolve import path to file path
   */
  private resolveImport(importSource: string, fromFile: string): string | null {
    // Skip external packages
    if (!importSource.startsWith('.') && !importSource.startsWith('/')) {
      return null;
    }

    const fromDir = path.dirname(fromFile);
    let resolved = path.join(fromDir, importSource);

    // Try various extensions
    const extensions = ['.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs', '/index.ts', '/index.js'];
    for (const ext of extensions) {
      const withExt = resolved + ext;
      if (fs.existsSync(path.join(this.config.projectRoot, withExt))) {
        return withExt;
      }
    }

    return null;
  }

  /**
   * Find entry points (main files)
   */
  private findEntryPoints(files: Record<string, FileIndex>): string[] {
    const entryPoints: string[] = [];

    // Check package.json for main/bin
    const packageJsonPath = path.join(this.config.projectRoot, 'package.json');
    if (fs.existsSync(packageJsonPath)) {
      try {
        const pkg = JSON.parse(fs.readFileSync(packageJsonPath, 'utf-8'));
        if (pkg.main) entryPoints.push(pkg.main);
        if (pkg.bin) {
          if (typeof pkg.bin === 'string') entryPoints.push(pkg.bin);
          else Object.values(pkg.bin).forEach((b) => entryPoints.push(b as string));
        }
      } catch {
        // Ignore parse errors
      }
    }

    // Look for common entry point patterns
    const commonEntryPoints = ['src/index.ts', 'src/index.js', 'src/main.ts', 'src/main.js', 'index.ts', 'index.js', 'main.ts', 'main.js', 'app.ts', 'app.js'];

    for (const ep of commonEntryPoints) {
      if (files[ep]) {
        if (!entryPoints.includes(ep)) {
          entryPoints.push(ep);
        }
      }
    }

    return entryPoints;
  }

  /**
   * Get project name from package.json or directory
   */
  private getProjectName(): string {
    const packageJsonPath = path.join(this.config.projectRoot, 'package.json');
    if (fs.existsSync(packageJsonPath)) {
      try {
        const pkg = JSON.parse(fs.readFileSync(packageJsonPath, 'utf-8'));
        if (pkg.name) return pkg.name;
      } catch {
        // Ignore parse errors
      }
    }
    return path.basename(this.config.projectRoot);
  }

  /**
   * Save index to disk
   */
  public async saveIndex(index: ProjectIndex): Promise<void> {
    const contextDir = path.join(this.config.projectRoot, '.context');
    if (!fs.existsSync(contextDir)) {
      fs.mkdirSync(contextDir, { recursive: true });
    }

    const indexPath = path.join(contextDir, 'index.json');
    fs.writeFileSync(indexPath, JSON.stringify(index, null, 2));
  }

  /**
   * Load index from disk
   */
  public loadIndex(): ProjectIndex | null {
    const indexPath = path.join(this.config.projectRoot, '.context', 'index.json');
    if (!fs.existsSync(indexPath)) {
      return null;
    }

    try {
      return JSON.parse(fs.readFileSync(indexPath, 'utf-8'));
    } catch {
      return null;
    }
  }
}

export default Indexer;
