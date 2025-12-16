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
  ASTNode,
  ASTNodeType,
  ChunkConstraints,
} from './types.js';
import { getLanguageByExtension, DEFAULT_CHUNK_CONSTRAINTS } from './types.js';

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

  // ============================================================================
  // cAST CHUNKING ALGORITHM (v4.0+)
  // ============================================================================

  /**
   * Generate chunks using cAST (AST-based structural chunking) algorithm
   *
   * Algorithm:
   * 1. Build AST hierarchy from symbols with non-whitespace sizes
   * 2. Recursively break large nodes at semantic boundaries
   * 3. Greedily merge small siblings while respecting size limits
   * 4. Measure by non-whitespace characters (not lines/tokens)
   */
  generateChunksCAST(
    content: string,
    symbols: Symbol[],
    imports: Import[],
    langConfig: LanguageConfig,
    filePath: string,
    constraints: ChunkConstraints = DEFAULT_CHUNK_CONSTRAINTS
  ): SemanticChunk[] {
    const chunks: SemanticChunk[] = [];
    const lines = content.split('\n');

    // Build AST hierarchy
    const astNodes = this.buildASTHierarchy(content, symbols, lines);

    // Recursively break large nodes
    const brokenNodes = this.recursivelyBreakNodes(astNodes, content, lines, constraints);

    // Greedily merge small siblings
    const mergedNodes = this.greedyMergeSiblings(brokenNodes, content, lines, constraints);

    // Convert nodes to chunks
    for (const node of mergedNodes) {
      const nodeContent = content.substring(node.startByte, node.endByte);
      const nodeSymbols = this.getSymbolsInRange(symbols, node.startLine, node.endLine);

      chunks.push({
        id: `${filePath}:${node.name || node.type}:${node.startLine}`,
        content: nodeContent,
        type: this.nodeTypeToChunkType(node.type),
        filePath,
        startLine: node.startLine,
        endLine: node.endLine,
        primarySymbol: node.name,
        symbols: nodeSymbols.map((s) => s.name),
        imports: this.getContextualImports(imports, nodeContent),
        tokenCount: Math.ceil(nodeContent.length / 4), // Legacy compatibility
        nonWhitespaceSize: node.nonWhitespaceSize,
        metadata: {
          language: langConfig.id,
          filePath,
          symbolKinds: nodeSymbols.map((s) => s.kind),
          hasExports: nodeSymbols.some((s) => s.exported),
          parentChain: node.metadata.parent ? [node.metadata.parent] : undefined,
          contextualImports: this.getContextualImports(imports, nodeContent),
          logicalBlockType: this.detectLogicalBlockType(nodeContent),
        },
      });
    }

    return chunks;
  }

  /**
   * Build AST hierarchy from symbols with non-whitespace sizes
   */
  private buildASTHierarchy(content: string, symbols: Symbol[], lines: string[]): ASTNode[] {
    const nodes: ASTNode[] = [];

    // Sort symbols by line number
    const sortedSymbols = [...symbols].sort((a, b) => a.line - b.line);

    for (const symbol of sortedSymbols) {
      // Calculate byte positions
      const startByte = this.lineColumnToByte(content, symbol.line, symbol.column);
      const endByte = this.lineColumnToByte(content, symbol.endLine, symbol.endColumn || lines[symbol.endLine - 1]?.length || 0);

      // Include leading comments
      const { adjustedStart, leadingComments } = this.findLeadingComments(
        content,
        lines,
        symbol.line,
        startByte
      );

      const nodeContent = content.substring(adjustedStart, endByte);

      nodes.push({
        type: this.symbolKindToNodeType(symbol.kind),
        name: symbol.name,
        startByte: adjustedStart,
        endByte,
        startLine: symbol.line - (startByte - adjustedStart > 0 ? this.countNewlines(content.substring(adjustedStart, startByte)) : 0),
        endLine: symbol.endLine,
        nonWhitespaceSize: this.countNonWhitespace(nodeContent),
        children: [],
        metadata: {
          leadingComments: leadingComments.length > 0 ? leadingComments : undefined,
          parent: symbol.parent,
          exported: symbol.exported,
          visibility: symbol.visibility,
          decorators: symbol.decorators,
        },
      });
    }

    // Build parent-child relationships
    return this.buildHierarchy(nodes);
  }

  /**
   * Recursively break large nodes at semantic boundaries
   */
  private recursivelyBreakNodes(
    nodes: ASTNode[],
    content: string,
    lines: string[],
    constraints: ChunkConstraints
  ): ASTNode[] {
    const result: ASTNode[] = [];

    for (const node of nodes) {
      if (node.nonWhitespaceSize <= constraints.maxNonWhitespaceChars) {
        // Node is small enough, keep as is (but process children)
        if (node.children.length > 0) {
          node.children = this.recursivelyBreakNodes(node.children, content, lines, constraints);
        }
        result.push(node);
      } else {
        // Node is too large, break at semantic boundaries
        const brokenNodes = this.breakNodeAtBoundaries(node, content, lines, constraints);
        result.push(...brokenNodes);
      }
    }

    return result;
  }

  /**
   * Break a large node at semantic boundaries
   */
  private breakNodeAtBoundaries(
    node: ASTNode,
    content: string,
    lines: string[],
    constraints: ChunkConstraints
  ): ASTNode[] {
    const nodeContent = content.substring(node.startByte, node.endByte);

    // Find semantic boundary patterns
    const boundaries = this.findSemanticBoundaries(nodeContent, node.type);

    if (boundaries.length === 0) {
      // No semantic boundaries, split by size
      return this.splitBySize(node, content, lines, constraints);
    }

    // Split at boundaries
    const chunks: ASTNode[] = [];
    let currentStart = 0;
    let partIndex = 0;

    for (const boundary of boundaries) {
      if (boundary > currentStart) {
        const partContent = nodeContent.substring(currentStart, boundary);
        const partNonWS = this.countNonWhitespace(partContent);

        if (partNonWS >= constraints.minNonWhitespaceChars) {
          const partLines = partContent.split('\n').length;
          chunks.push({
            type: node.type,
            name: node.name ? `${node.name}:part${partIndex}` : undefined,
            startByte: node.startByte + currentStart,
            endByte: node.startByte + boundary,
            startLine: node.startLine + this.countNewlines(nodeContent.substring(0, currentStart)),
            endLine: node.startLine + this.countNewlines(nodeContent.substring(0, currentStart)) + partLines - 1,
            nonWhitespaceSize: partNonWS,
            children: [],
            metadata: {
              ...node.metadata,
              parent: node.name || node.metadata.parent,
            },
          });
          partIndex++;
        }
      }
      currentStart = boundary;
    }

    // Handle remaining content
    if (currentStart < nodeContent.length) {
      const partContent = nodeContent.substring(currentStart);
      const partNonWS = this.countNonWhitespace(partContent);

      if (partNonWS >= constraints.minNonWhitespaceChars) {
        chunks.push({
          type: node.type,
          name: node.name ? `${node.name}:part${partIndex}` : undefined,
          startByte: node.startByte + currentStart,
          endByte: node.endByte,
          startLine: node.startLine + this.countNewlines(nodeContent.substring(0, currentStart)),
          endLine: node.endLine,
          nonWhitespaceSize: partNonWS,
          children: [],
          metadata: {
            ...node.metadata,
            parent: node.name || node.metadata.parent,
          },
        });
      }
    }

    // Recursively break chunks that are still too large
    const finalChunks: ASTNode[] = [];
    for (const chunk of chunks) {
      if (chunk.nonWhitespaceSize > constraints.maxNonWhitespaceChars) {
        finalChunks.push(...this.splitBySize(chunk, content, lines, constraints));
      } else {
        finalChunks.push(chunk);
      }
    }

    return finalChunks;
  }

  /**
   * Split a node by size when no semantic boundaries are found
   */
  private splitBySize(
    node: ASTNode,
    content: string,
    _lines: string[],
    constraints: ChunkConstraints
  ): ASTNode[] {
    const nodeContent = content.substring(node.startByte, node.endByte);
    const nodeLines = nodeContent.split('\n');
    const chunks: ASTNode[] = [];

    // Calculate lines per chunk based on target size
    const avgNonWSPerLine = node.nonWhitespaceSize / nodeLines.length;
    const linesPerChunk = Math.max(1, Math.floor(constraints.targetSize / avgNonWSPerLine));

    for (let i = 0; i < nodeLines.length; i += linesPerChunk) {
      const chunkLines = nodeLines.slice(i, Math.min(i + linesPerChunk, nodeLines.length));
      const chunkContent = chunkLines.join('\n');
      const chunkNonWS = this.countNonWhitespace(chunkContent);

      if (chunkNonWS >= constraints.minNonWhitespaceChars) {
        const startLineOffset = this.countNewlines(nodeContent.substring(0, nodeLines.slice(0, i).join('\n').length + (i > 0 ? 1 : 0)));

        chunks.push({
          type: node.type,
          name: node.name ? `${node.name}:part${Math.floor(i / linesPerChunk)}` : undefined,
          startByte: node.startByte + nodeLines.slice(0, i).join('\n').length + (i > 0 ? 1 : 0),
          endByte: node.startByte + nodeLines.slice(0, i + chunkLines.length).join('\n').length + (i > 0 ? 1 : 0),
          startLine: node.startLine + startLineOffset,
          endLine: node.startLine + startLineOffset + chunkLines.length - 1,
          nonWhitespaceSize: chunkNonWS,
          children: [],
          metadata: {
            ...node.metadata,
            parent: node.name || node.metadata.parent,
          },
        });
      }
    }

    return chunks;
  }

  /**
   * Greedily merge small siblings while respecting size limits
   */
  private greedyMergeSiblings(
    nodes: ASTNode[],
    content: string,
    _lines: string[],
    constraints: ChunkConstraints
  ): ASTNode[] {
    if (nodes.length <= 1) return nodes;

    const result: ASTNode[] = [];
    let currentGroup: ASTNode[] = [];
    let currentSize = 0;

    for (const node of nodes) {
      const canMerge =
        currentGroup.length > 0 &&
        currentSize + node.nonWhitespaceSize <= constraints.targetSize &&
        this.areAdjacentNodes(currentGroup[currentGroup.length - 1], node, content);

      if (canMerge) {
        currentGroup.push(node);
        currentSize += node.nonWhitespaceSize;
      } else {
        // Flush current group
        if (currentGroup.length > 0) {
          result.push(this.mergeNodes(currentGroup, content));
        }
        currentGroup = [node];
        currentSize = node.nonWhitespaceSize;
      }
    }

    // Flush remaining group
    if (currentGroup.length > 0) {
      result.push(this.mergeNodes(currentGroup, content));
    }

    return result;
  }

  /**
   * Merge multiple nodes into one
   */
  private mergeNodes(nodes: ASTNode[], content: string): ASTNode {
    if (nodes.length === 1) return nodes[0];

    const first = nodes[0];
    const last = nodes[nodes.length - 1];
    const mergedContent = content.substring(first.startByte, last.endByte);

    return {
      type: 'block' as ASTNodeType,
      name: nodes.map((n) => n.name).filter(Boolean).join('+') || undefined,
      startByte: first.startByte,
      endByte: last.endByte,
      startLine: first.startLine,
      endLine: last.endLine,
      nonWhitespaceSize: this.countNonWhitespace(mergedContent),
      children: nodes.flatMap((n) => n.children),
      metadata: {
        leadingComments: first.metadata.leadingComments,
        parent: first.metadata.parent,
        exported: nodes.some((n) => n.metadata.exported),
      },
    };
  }

  // ============================================================================
  // cAST HELPER METHODS
  // ============================================================================

  /**
   * Count non-whitespace characters in a string
   */
  private countNonWhitespace(text: string): number {
    return text.replace(/\s/g, '').length;
  }

  /**
   * Count newlines in a string
   */
  private countNewlines(text: string): number {
    return (text.match(/\n/g) || []).length;
  }

  /**
   * Convert line/column to byte offset
   */
  private lineColumnToByte(content: string, line: number, column: number): number {
    const lines = content.split('\n');
    let byte = 0;

    for (let i = 0; i < line - 1 && i < lines.length; i++) {
      byte += lines[i].length + 1; // +1 for newline
    }

    byte += Math.min(column, lines[line - 1]?.length || 0);
    return byte;
  }

  /**
   * Find leading comments for a symbol
   */
  private findLeadingComments(
    _content: string,
    lines: string[],
    symbolLine: number,
    symbolByte: number
  ): { adjustedStart: number; leadingComments: string[] } {
    const comments: string[] = [];
    let adjustedLine = symbolLine - 1; // 0-indexed

    // Look back for comments (up to 20 lines)
    const lookBackLimit = Math.min(20, adjustedLine);
    for (let i = adjustedLine - 1; i >= adjustedLine - lookBackLimit && i >= 0; i--) {
      const line = lines[i]?.trim() || '';
      if (
        line.startsWith('//') ||
        line.startsWith('/*') ||
        line.startsWith('*') ||
        line.startsWith('#') ||
        line.startsWith('"""') ||
        line.startsWith("'''") ||
        line === ''
      ) {
        if (line !== '') {
          comments.unshift(line);
        }
        adjustedLine = i;
      } else {
        break;
      }
    }

    // Calculate adjusted byte position
    let adjustedByte = symbolByte;
    for (let i = symbolLine - 2; i >= adjustedLine; i--) {
      adjustedByte -= (lines[i]?.length || 0) + 1;
    }

    return {
      adjustedStart: Math.max(0, adjustedByte),
      leadingComments: comments,
    };
  }

  /**
   * Convert symbol kind to AST node type
   */
  private symbolKindToNodeType(kind: Symbol['kind']): ASTNodeType {
    const mapping: Record<Symbol['kind'], ASTNodeType> = {
      function: 'function',
      method: 'method',
      class: 'class',
      interface: 'interface',
      type: 'type',
      enum: 'enum',
      constant: 'statement',
      variable: 'statement',
      property: 'statement',
      module: 'module',
      namespace: 'namespace',
    };
    return mapping[kind] || 'block';
  }

  /**
   * Convert AST node type to chunk type
   */
  private nodeTypeToChunkType(type: ASTNodeType): SemanticChunk['type'] {
    switch (type) {
      case 'class':
      case 'interface':
        return 'class';
      case 'function':
      case 'method':
        return 'function';
      case 'module':
      case 'namespace':
        return 'module';
      case 'comment_block':
        return 'comment';
      default:
        return 'mixed';
    }
  }

  /**
   * Build parent-child hierarchy from flat node list
   */
  private buildHierarchy(nodes: ASTNode[]): ASTNode[] {
    const topLevel: ASTNode[] = [];
    const nodeMap = new Map<string, ASTNode>();

    // First pass: map nodes by name
    for (const node of nodes) {
      if (node.name) {
        nodeMap.set(node.name, node);
      }
    }

    // Second pass: build hierarchy
    for (const node of nodes) {
      if (node.metadata.parent && nodeMap.has(node.metadata.parent)) {
        const parent = nodeMap.get(node.metadata.parent)!;
        parent.children.push(node);
      } else {
        topLevel.push(node);
      }
    }

    return topLevel;
  }

  /**
   * Find semantic boundaries in code content
   */
  private findSemanticBoundaries(content: string, _nodeType: ASTNodeType): number[] {
    const boundaries: number[] = [];
    const lines = content.split('\n');
    let currentPos = 0;

    // Look for method/function boundaries, blank lines between blocks, etc.
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const trimmed = line.trim();

      // Method/function definitions
      if (
        /^(?:(?:public|private|protected|static|async)\s+)*(?:function|def|fn|func|method)\s/.test(trimmed) ||
        /^(?:(?:public|private|protected|static|async)\s+)*\w+\s*\([^)]*\)\s*[:{]/.test(trimmed)
      ) {
        if (currentPos > 0) {
          boundaries.push(currentPos);
        }
      }

      // Blank lines followed by non-blank (potential block separator)
      if (trimmed === '' && i > 0 && i < lines.length - 1) {
        const prevLine = lines[i - 1]?.trim() || '';
        const nextLine = lines[i + 1]?.trim() || '';
        if (prevLine !== '' && nextLine !== '' && !nextLine.startsWith('//') && !nextLine.startsWith('#')) {
          boundaries.push(currentPos + line.length + 1);
        }
      }

      currentPos += line.length + 1; // +1 for newline
    }

    return [...new Set(boundaries)].sort((a, b) => a - b);
  }

  /**
   * Check if two nodes are adjacent (no significant gap)
   */
  private areAdjacentNodes(a: ASTNode, b: ASTNode, content: string): boolean {
    if (a.endLine + 2 >= b.startLine) return true;

    // Check if gap is only whitespace/comments
    const gap = content.substring(a.endByte, b.startByte);
    const nonWS = this.countNonWhitespace(gap.replace(/\/\/.*|\/\*[\s\S]*?\*\/|#.*/g, ''));
    return nonWS < 10;
  }

  /**
   * Get symbols within a line range
   */
  private getSymbolsInRange(symbols: Symbol[], startLine: number, endLine: number): Symbol[] {
    return symbols.filter((s) => s.line >= startLine && s.line <= endLine);
  }

  /**
   * Get imports that are actually used in the content
   */
  private getContextualImports(imports: Import[], content: string): string[] {
    return imports
      .filter((imp) => {
        // Check if any imported name is used in the content
        return imp.names.some((n) => {
          const name = n.alias || n.name;
          return new RegExp(`\\b${name}\\b`).test(content);
        });
      })
      .map((imp) => imp.source);
  }

  /**
   * Detect logical block type from content
   */
  private detectLogicalBlockType(content: string): string | undefined {
    const trimmed = content.trim();

    if (/^(?:if|else\s+if)\s*\(/.test(trimmed)) return 'conditional';
    if (/^(?:for|while|do)\s*[\(\{]/.test(trimmed)) return 'loop';
    if (/^try\s*\{/.test(trimmed)) return 'try-catch';
    if (/^switch\s*\(/.test(trimmed)) return 'switch';
    if (/^(?:async\s+)?function/.test(trimmed)) return 'function';
    if (/^class\s/.test(trimmed)) return 'class';

    return undefined;
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
