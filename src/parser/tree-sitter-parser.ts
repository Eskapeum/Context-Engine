/**
 * Universal Context Engine - Tree-sitter Parser
 *
 * AST-based parsing using tree-sitter for accurate symbol extraction.
 * Falls back to regex for unsupported languages.
 *
 * @module parser/tree-sitter-parser
 */

import * as path from 'path';
import * as fs from 'fs';
import type {
  Symbol,
  Import,
  Export,
  CallReference,
  SemanticChunk,
  ParseResult,
  LanguageConfig,
} from './types.js';
import { getLanguageByExtension } from './types.js';

// Use dynamic import for tree-sitter to handle ESM/CJS issues
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let Parser: any = null;
let parserInstance: any = null;
const loadedLanguages: Map<string, any> = new Map();
let initialized = false;

/**
 * Initialize tree-sitter parser with timeout protection
 */
export async function initializeParser(): Promise<void> {
  if (initialized) return;

  let timeoutId: ReturnType<typeof setTimeout> | undefined;

  try {
    const TreeSitter = await import('web-tree-sitter');
    Parser = TreeSitter.default || TreeSitter;

    // Add timeout to prevent hanging on slow networks (v3.6.2 fix)
    // Parser.init() downloads WASM files which can hang indefinitely
    const INIT_TIMEOUT_MS = 10000; // 10 seconds

    const timeoutPromise = new Promise((_, reject) => {
      timeoutId = setTimeout(() => reject(new Error('Tree-sitter init timeout')), INIT_TIMEOUT_MS);
    });

    try {
      await Promise.race([Parser.init(), timeoutPromise]);
    } finally {
      if (timeoutId) clearTimeout(timeoutId);
    }

    parserInstance = new Parser();
    initialized = true;
  } catch (error) {
    // Tree-sitter not available or timed out, will use regex fallback
    // Log for debugging but don't fail - regex parsing works fine
    if (process.env.DEBUG) {
      console.warn('Tree-sitter initialization failed, using regex fallback:', error);
    }
    if (timeoutId) clearTimeout(timeoutId);
    Parser = null;
    parserInstance = null;
    initialized = true;
  }
}

/**
 * Get or load a tree-sitter language
 */
async function getLanguage(languageId: string): Promise<any> {
  if (!Parser) return null;
  if (loadedLanguages.has(languageId)) {
    return loadedLanguages.get(languageId)!;
  }

  try {
    const wasmPath = await findWasmPath(languageId);
    if (wasmPath && fs.existsSync(wasmPath)) {
      const language = await Parser.Language.load(wasmPath);
      loadedLanguages.set(languageId, language);
      return language;
    }
  } catch {
    // Language not available
  }

  return null;
}

/**
 * Find WASM file path for a language
 */
async function findWasmPath(languageId: string): Promise<string | null> {
  const grammarMap: Record<string, string> = {
    typescript: 'tree-sitter-typescript.wasm',
    javascript: 'tree-sitter-javascript.wasm',
    python: 'tree-sitter-python.wasm',
    rust: 'tree-sitter-rust.wasm',
    go: 'tree-sitter-go.wasm',
    java: 'tree-sitter-java.wasm',
    csharp: 'tree-sitter-c_sharp.wasm',
    cpp: 'tree-sitter-cpp.wasm',
    c: 'tree-sitter-c.wasm',
    ruby: 'tree-sitter-ruby.wasm',
    php: 'tree-sitter-php.wasm',
  };

  const wasmFile = grammarMap[languageId];
  if (!wasmFile) return null;

  const searchPaths = [
    path.join(process.cwd(), 'node_modules', 'tree-sitter-wasms', 'out', wasmFile),
    path.join(__dirname, '..', '..', 'node_modules', 'tree-sitter-wasms', 'out', wasmFile),
  ];

  for (const searchPath of searchPaths) {
    if (fs.existsSync(searchPath)) {
      return searchPath;
    }
  }

  return null;
}

// ============================================================================
// REGEX PATTERNS FOR FALLBACK PARSING
// ============================================================================

interface RegexPatterns {
  function: RegExp;
  class: RegExp;
  interface?: RegExp;
  type?: RegExp;
  constant: RegExp;
  import: RegExp;
}

const LANGUAGE_PATTERNS: Record<string, RegexPatterns> = {
  typescript: {
    function: /^(?:export\s+)?(?:async\s+)?function\s+(\w+)\s*(?:<[^>]*>)?\s*\(([^)]*)\)(?:\s*:\s*([^{]+))?/gm,
    class: /^(?:export\s+)?(?:abstract\s+)?class\s+(\w+)(?:\s+extends\s+(\w+))?(?:\s+implements\s+([^{]+))?/gm,
    interface: /^(?:export\s+)?interface\s+(\w+)(?:\s+extends\s+([^{]+))?/gm,
    type: /^(?:export\s+)?type\s+(\w+)(?:<[^>]*>)?\s*=/gm,
    constant: /^(?:export\s+)?(?:const|let|var)\s+(\w+)(?:\s*:\s*([^=]+))?\s*=/gm,
    import: /^import\s+(?:(?:type\s+)?(?:(\w+)(?:,\s*)?)?(?:\{([^}]+)\})?(?:\*\s+as\s+(\w+))?)\s+from\s+['"]([^'"]+)['"]/gm,
  },
  javascript: {
    function: /^(?:export\s+)?(?:async\s+)?function\s+(\w+)\s*\(([^)]*)\)/gm,
    class: /^(?:export\s+)?class\s+(\w+)(?:\s+extends\s+(\w+))?/gm,
    constant: /^(?:export\s+)?(?:const|let|var)\s+(\w+)\s*=/gm,
    import: /^import\s+(?:(\w+)(?:,\s*)?)?(?:\{([^}]+)\})?(?:\*\s+as\s+(\w+))?\s+from\s+['"]([^'"]+)['"]/gm,
  },
  python: {
    function: /^(?:async\s+)?def\s+(\w+)\s*\(([^)]*)\)(?:\s*->\s*([^:]+))?:/gm,
    class: /^class\s+(\w+)(?:\(([^)]+)\))?:/gm,
    constant: /^([A-Z][A-Z0-9_]*)\s*(?::\s*[^=]+)?\s*=/gm,
    import: /^(?:from\s+(\S+)\s+import\s+([^#\n]+)|import\s+(\S+)(?:\s+as\s+(\w+))?)/gm,
  },
  rust: {
    function: /^(?:pub\s+)?(?:async\s+)?fn\s+(\w+)(?:<[^>]*>)?\s*\(([^)]*)\)(?:\s*->\s*([^{]+))?/gm,
    class: /^(?:pub\s+)?struct\s+(\w+)(?:<[^>]*>)?/gm,
    interface: /^(?:pub\s+)?trait\s+(\w+)(?:<[^>]*>)?/gm,
    type: /^(?:pub\s+)?type\s+(\w+)(?:<[^>]*>)?\s*=/gm,
    constant: /^(?:pub\s+)?(?:const|static)\s+(\w+)\s*:/gm,
    import: /^use\s+([^;]+);/gm,
  },
  go: {
    function: /^func\s+(?:\([^)]+\)\s+)?(\w+)\s*\(([^)]*)\)(?:\s*\(?([^{]+)\)?)?/gm,
    class: /^type\s+(\w+)\s+struct\s*\{/gm,
    interface: /^type\s+(\w+)\s+interface\s*\{/gm,
    type: /^type\s+(\w+)\s+(?!struct|interface)/gm,
    constant: /^(?:const|var)\s+(\w+)\s*/gm,
    import: /^import\s+(?:\(\s*([^)]+)\s*\)|"([^"]+)")/gm,
  },
};

// ============================================================================
// TREE-SITTER PARSER CLASS
// ============================================================================

/**
 * Tree-sitter based code parser with regex fallback
 */
export class TreeSitterParser {
  /**
   * Parse a file and extract all information
   */
  async parse(filePath: string, content: string): Promise<ParseResult> {
    const startTime = performance.now();
    const extension = path.extname(filePath);
    const langConfig = getLanguageByExtension(extension);
    const debug = process.env.DEBUG === '1';

    if (!langConfig) {
      return this.createEmptyResult(filePath, 'unknown', startTime);
    }

    // Initialize parser if needed
    if (debug) console.log(`[PARSE] Initializing parser for ${filePath}...`);
    await initializeParser();
    if (debug) console.log(`[PARSE] Parser initialized. Parser=${!!Parser}, instance=${!!parserInstance}`);

    // Try tree-sitter first
    if (Parser && parserInstance) {
      if (debug) console.log(`[PARSE] Loading tree-sitter language for ${langConfig.id}...`);
      const language = await getLanguage(langConfig.id);
      if (language) {
        try {
          parserInstance.setLanguage(language);
          const tree = parserInstance.parse(content);
          return this.extractFromTree(filePath, content, tree, langConfig, startTime);
        } catch {
          // Fall through to regex
        }
      }
    }

    // Fallback to regex-based parsing
    if (debug) console.log(`[PARSE] Using regex fallback for ${filePath}...`);
    const result = this.parseWithRegex(filePath, content, langConfig, startTime);
    if (debug) console.log(`[PARSE] Regex parsing complete for ${filePath}`);
    return result;
  }

  /**
   * Extract information from tree-sitter AST
   */
  private extractFromTree(
    filePath: string,
    content: string,
    tree: any,
    langConfig: LanguageConfig,
    startTime: number
  ): ParseResult {
    const symbols: Symbol[] = [];
    const imports: Import[] = [];
    const exports: Export[] = [];
    const calls: CallReference[] = [];
    const chunks: SemanticChunk[] = [];

    // Walk the tree
    this.walkTree(tree.rootNode, content, langConfig.id, { symbols, imports, exports, calls });

    // Generate chunks
    chunks.push(...this.generateChunks(content, symbols, imports, langConfig, filePath));

    return {
      filePath,
      language: langConfig.id,
      success: true,
      symbols,
      imports,
      exports,
      calls,
      typeReferences: [],
      chunks,
      parseTime: performance.now() - startTime,
    };
  }

  /**
   * Walk the AST tree and extract information
   */
  private walkTree(
    node: any,
    content: string,
    languageId: string,
    context: {
      symbols: Symbol[];
      imports: Import[];
      exports: Export[];
      calls: CallReference[];
      currentParent?: string;
    }
  ): void {
    const nodeType = node.type;

    // Extract based on node type
    if (nodeType.includes('function') && node.childForFieldName?.('name')) {
      const nameNode = node.childForFieldName('name');
      if (nameNode) {
        const symbol = this.createSymbol(node, nameNode, 'function', content, context.currentParent);
        if (symbol) context.symbols.push(symbol);
      }
    }

    if (nodeType.includes('class') && node.childForFieldName?.('name')) {
      const nameNode = node.childForFieldName('name');
      if (nameNode) {
        const symbol = this.createSymbol(node, nameNode, 'class', content);
        if (symbol) context.symbols.push(symbol);
      }
    }

    if (nodeType === 'import_statement' || nodeType === 'import_from_statement') {
      const imp = this.extractImport(node, content, languageId);
      if (imp) context.imports.push(imp);
    }

    // Recurse
    for (let i = 0; i < node.childCount; i++) {
      const child = node.child(i);
      if (child) {
        let newParent = context.currentParent;
        if (nodeType.includes('class') || nodeType.includes('struct')) {
          const nameNode = node.childForFieldName?.('name');
          if (nameNode) newParent = nameNode.text;
        }
        this.walkTree(child, content, languageId, { ...context, currentParent: newParent });
      }
    }
  }

  private createSymbol(
    node: any,
    nameNode: any,
    kind: Symbol['kind'],
    _content: string,
    parent?: string
  ): Symbol | null {
    const text = node.text || '';
    const isExported = text.includes('export') || text.startsWith('pub');
    const isAsync = text.includes('async');

    return {
      name: nameNode.text,
      kind,
      line: node.startPosition?.row + 1 || 1,
      column: node.startPosition?.column || 0,
      endLine: node.endPosition?.row + 1 || 1,
      endColumn: node.endPosition?.column || 0,
      exported: isExported,
      visibility: isExported ? 'public' : 'default',
      async: isAsync,
      parent,
    };
  }

  private extractImport(node: any, _content: string, _languageId: string): Import | null {
    const sourceNode = node.childForFieldName?.('source') || node.child?.(node.childCount - 1);
    if (!sourceNode) return null;

    const source = sourceNode.text?.replace(/['"]/g, '') || '';
    return {
      source,
      kind: 'named',
      names: [{ name: source.split('/').pop() || source }],
      line: node.startPosition?.row + 1 || 1,
    };
  }

  /**
   * Parse with regex fallback
   */
  private parseWithRegex(
    filePath: string,
    content: string,
    langConfig: LanguageConfig,
    startTime: number
  ): ParseResult {
    const debug = process.env.DEBUG === '1';
    const symbols: Symbol[] = [];
    const imports: Import[] = [];
    const chunks: SemanticChunk[] = [];

    const patterns = LANGUAGE_PATTERNS[langConfig.id];
    if (patterns) {
      // Extract functions
      if (debug) console.log(`[REGEX] Extracting functions from ${filePath}...`);
      this.extractWithRegex(content, patterns.function, 'function', symbols);

      // Extract classes
      if (debug) console.log(`[REGEX] Extracting classes...`);
      this.extractWithRegex(content, patterns.class, 'class', symbols);

      // Extract interfaces
      if (patterns.interface) {
        if (debug) console.log(`[REGEX] Extracting interfaces...`);
        this.extractWithRegex(content, patterns.interface, 'interface', symbols);
      }

      // Extract types
      if (patterns.type) {
        if (debug) console.log(`[REGEX] Extracting types...`);
        this.extractWithRegex(content, patterns.type, 'type', symbols);
      }

      // Extract constants
      if (debug) console.log(`[REGEX] Extracting constants...`);
      this.extractWithRegex(content, patterns.constant, 'constant', symbols);

      // Extract imports
      if (debug) console.log(`[REGEX] Extracting imports...`);
      this.extractImportsWithRegex(content, patterns.import, langConfig.id, imports);
    }

    // Generate chunks
    if (debug) console.log(`[REGEX] Generating ${symbols.length} chunks...`);
    chunks.push(...this.generateChunks(content, symbols, imports, langConfig, filePath));
    if (debug) console.log(`[REGEX] Generated ${chunks.length} chunks`);

    return {
      filePath,
      language: langConfig.id,
      success: true,
      symbols,
      imports,
      exports: [],
      calls: [],
      typeReferences: [],
      chunks,
      parseTime: performance.now() - startTime,
    };
  }

  private extractWithRegex(
    content: string,
    pattern: RegExp,
    kind: Symbol['kind'],
    symbols: Symbol[]
  ): void {
    const regex = new RegExp(pattern.source, 'gm');
    let match;
    while ((match = regex.exec(content)) !== null) {
      const lineNum = content.substring(0, match.index).split('\n').length;
      const isExported = match[0].includes('export') || match[0].startsWith('pub');

      symbols.push({
        name: match[1],
        kind,
        line: lineNum,
        column: 0,
        endLine: lineNum,
        endColumn: 0,
        exported: isExported,
        visibility: isExported ? 'public' : 'default',
      });
    }
  }

  private extractImportsWithRegex(
    content: string,
    pattern: RegExp,
    languageId: string,
    imports: Import[]
  ): void {
    const regex = new RegExp(pattern.source, 'gm');
    let match;
    while ((match = regex.exec(content)) !== null) {
      const lineNum = content.substring(0, match.index).split('\n').length;

      if (languageId === 'typescript' || languageId === 'javascript') {
        const source = match[4] || '';
        const names: { name: string; alias?: string }[] = [];

        if (match[1]) names.push({ name: match[1] }); // default
        if (match[2]) {
          match[2].split(',').forEach((n: string) => {
            const name = n.trim().split(' as ')[0].replace('type ', '');
            if (name) names.push({ name });
          });
        }
        if (match[3]) names.push({ name: match[3] }); // namespace

        imports.push({ source, kind: 'named', names, line: lineNum });
      } else {
        imports.push({
          source: match[1] || match[3] || '',
          kind: 'named',
          names: [],
          line: lineNum,
        });
      }
    }
  }

  /**
   * Generate semantic chunks using AST boundaries
   */
  private generateChunks(
    content: string,
    symbols: Symbol[],
    imports: Import[],
    langConfig: LanguageConfig,
    filePath: string
  ): SemanticChunk[] {
    const debug = process.env.DEBUG === '1';
    const chunks: SemanticChunk[] = [];
    const lines = content.split('\n');
    const MAX_CHUNK_TOKENS = 500; // ~2000 chars
    const MIN_CHUNK_TOKENS = 50; // ~200 chars
    const usedLines = new Set<number>();

    if (debug) console.log(`[CHUNK] Start: ${lines.length} lines, ${symbols.length} symbols`);

    // Helper: estimate tokens (4 chars per token average for code)
    const estimateTokens = (text: string) => Math.ceil(text.length / 4);

    // Helper: get content with leading comments
    const getSymbolContent = (symbol: Symbol): { content: string; startLine: number; endLine: number } => {
      let startLine = symbol.line - 1; // 0-indexed
      const endLine = symbol.endLine; // 1-indexed, inclusive

      // Look for leading comments/documentation (up to 20 lines above)
      // IMPORTANT: Use fixed lookback limit to prevent runaway loop (v3.6.2 fix)
      const lookBackLimit = Math.min(20, startLine);
      const loopEndLine = startLine - lookBackLimit; // Fixed end point - don't use startLine in loop condition!
      for (let i = startLine - 1; i >= loopEndLine; i--) {
        const line = lines[i]?.trim() || '';
        if (line.startsWith('//') || line.startsWith('/*') || line.startsWith('*') ||
            line.startsWith('#') || line.startsWith('"""') || line.startsWith("'''") ||
            line === '') {
          startLine = i;
        } else {
          break;
        }
      }

      return {
        content: lines.slice(startLine, endLine).join('\n'),
        startLine: startLine + 1, // back to 1-indexed
        endLine,
      };
    };

    // Helper: split large content into sub-chunks
    const splitLargeContent = (
      content: string,
      symbol: Symbol,
      startLine: number,
      _endLine: number
    ): SemanticChunk[] => {
      const subChunks: SemanticChunk[] = [];
      const contentLines = content.split('\n');
      const linesPerChunk = Math.ceil(contentLines.length / Math.ceil(estimateTokens(content) / MAX_CHUNK_TOKENS));

      for (let i = 0; i < contentLines.length; i += linesPerChunk) {
        const chunkLines = contentLines.slice(i, Math.min(i + linesPerChunk, contentLines.length));
        const chunkContent = chunkLines.join('\n');
        const chunkStart = startLine + i;
        const chunkEnd = startLine + i + chunkLines.length - 1;

        subChunks.push({
          id: `${filePath}:${symbol.name}:${i}`,
          content: chunkContent,
          type: symbol.kind === 'class' ? 'class' : 'function',
          filePath,
          startLine: chunkStart,
          endLine: chunkEnd,
          primarySymbol: symbol.name,
          symbols: [symbol.name],
          imports: imports.map((im) => im.source),
          tokenCount: estimateTokens(chunkContent),
          metadata: {
            language: langConfig.id,
            filePath,
            symbolKinds: [symbol.kind],
            hasExports: symbol.exported,
            isPartial: true,
            partIndex: Math.floor(i / linesPerChunk),
          },
        });
      }

      return subChunks;
    };

    // 1. Create module-level chunk for imports/exports (top of file)
    if (imports.length > 0) {
      const lastImportLine = Math.max(...imports.map((i) => i.line));
      const moduleContent = lines.slice(0, lastImportLine).join('\n');

      if (moduleContent.trim()) {
        chunks.push({
          id: `${filePath}:module`,
          content: moduleContent,
          type: 'module',
          filePath,
          startLine: 1,
          endLine: lastImportLine,
          primarySymbol: undefined,
          symbols: [],
          imports: imports.map((i) => i.source),
          tokenCount: estimateTokens(moduleContent),
          metadata: {
            language: langConfig.id,
            filePath,
            symbolKinds: [],
            hasExports: false,
          },
        });

        // Mark these lines as used
        for (let i = 0; i < lastImportLine; i++) {
          usedLines.add(i);
        }
      }
    }

    // 2. Create chunks for top-level symbols (classes, functions)
    const topLevelSymbols = symbols.filter((s) => !s.parent);

    for (const symbol of topLevelSymbols) {

      const { content: symbolContent, startLine, endLine } = getSymbolContent(symbol);
      const tokens = estimateTokens(symbolContent);

      // Skip very small chunks
      if (tokens < MIN_CHUNK_TOKENS) continue;

      // Mark lines as used
      for (let i = startLine - 1; i < endLine; i++) {
        usedLines.add(i);
      }

      // Split large symbols into sub-chunks
      if (tokens > MAX_CHUNK_TOKENS) {
        chunks.push(...splitLargeContent(symbolContent, symbol, startLine, endLine));
        continue;
      }

      // Get nested symbols (methods in class)
      const nestedSymbols = symbols.filter((s) => s.parent === symbol.name);

      chunks.push({
        id: `${filePath}:${symbol.name}`,
        content: symbolContent,
        type: symbol.kind === 'class' ? 'class' : 'function',
        filePath,
        startLine,
        endLine,
        primarySymbol: symbol.name,
        symbols: [symbol.name, ...nestedSymbols.map((s) => s.name)],
        imports: imports.map((i) => i.source),
        tokenCount: tokens,
        metadata: {
          language: langConfig.id,
          filePath,
          symbolKinds: [symbol.kind, ...nestedSymbols.map((s) => s.kind)],
          hasExports: symbol.exported,
        },
      });
    }

    // 3. Create chunks for orphaned code (not in any symbol)
    const orphanedRanges: { start: number; end: number }[] = [];
    let currentOrphanStart: number | null = null;

    for (let i = 0; i < lines.length; i++) {
      if (!usedLines.has(i)) {
        if (currentOrphanStart === null) {
          currentOrphanStart = i;
        }
      } else if (currentOrphanStart !== null) {
        orphanedRanges.push({ start: currentOrphanStart, end: i - 1 });
        currentOrphanStart = null;
      }
    }
    if (currentOrphanStart !== null) {
      orphanedRanges.push({ start: currentOrphanStart, end: lines.length - 1 });
    }

    // Create mixed chunks for significant orphaned code
    for (const range of orphanedRanges) {
      const orphanContent = lines.slice(range.start, range.end + 1).join('\n');
      const tokens = estimateTokens(orphanContent);

      // Skip trivial orphaned sections
      if (tokens < MIN_CHUNK_TOKENS || !orphanContent.trim()) continue;

      chunks.push({
        id: `${filePath}:mixed:${range.start}`,
        content: orphanContent,
        type: 'mixed',
        filePath,
        startLine: range.start + 1,
        endLine: range.end + 1,
        primarySymbol: undefined,
        symbols: [],
        imports: [],
        tokenCount: tokens,
        metadata: {
          language: langConfig.id,
          filePath,
          symbolKinds: [],
          hasExports: false,
        },
      });
    }

    return chunks;
  }

  private createEmptyResult(filePath: string, language: string, startTime: number): ParseResult {
    return {
      filePath,
      language,
      success: false,
      errors: [{ message: 'Unsupported language', line: 0, column: 0, type: 'semantic' }],
      symbols: [],
      imports: [],
      exports: [],
      calls: [],
      typeReferences: [],
      chunks: [],
      parseTime: performance.now() - startTime,
    };
  }
}

export default TreeSitterParser;
