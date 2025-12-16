/**
 * Local Library Documentation Extractor
 *
 * Extracts documentation from node_modules .d.ts files.
 * Parses TypeScript declarations to build API reference.
 *
 * @module library-docs/local-extractor
 */

import * as fs from 'fs';
import * as path from 'path';
import type {
  APIEntry,
  DtsParseResult,
  ExtractionOptions,
  LibraryDocResult,
  ParamDoc,
} from './types.js';

// ============================================================================
// CONSTANTS
// ============================================================================

const DEFAULT_MAX_ENTRIES = 500;

// ============================================================================
// LOCAL EXTRACTOR CLASS
// ============================================================================

/**
 * Extracts library documentation from local node_modules
 */
export class LocalExtractor {
  private nodeModulesPath: string;

  constructor(projectRoot: string) {
    this.nodeModulesPath = path.join(projectRoot, 'node_modules');
  }

  /**
   * Extract documentation for a library
   */
  async extract(library: string, options: ExtractionOptions = {}): Promise<LibraryDocResult | null> {
    // Find package in node_modules
    const packagePath = this.findPackage(library);
    if (!packagePath) {
      return null;
    }

    // Read package.json for metadata
    const packageJson = this.readPackageJson(packagePath);
    if (!packageJson) {
      return null;
    }

    // Find .d.ts files
    const dtsFiles = this.findDtsFiles(packagePath, packageJson);
    if (dtsFiles.length === 0) {
      return null;
    }

    // Parse all .d.ts files
    const allEntries: APIEntry[] = [];
    const submodules: string[] = [];
    const maxEntries = options.maxEntries || DEFAULT_MAX_ENTRIES;

    for (const dtsFile of dtsFiles) {
      if (allEntries.length >= maxEntries) break;

      const parseResult = await this.parseDtsFile(dtsFile, options);
      if (parseResult) {
        allEntries.push(...parseResult.entries);
        submodules.push(...parseResult.submodules);
      }
    }

    // Build result
    const result: LibraryDocResult = {
      library,
      version: packageJson.version || 'unknown',
      summary: this.extractSummary(packageJson, allEntries),
      apiReference: allEntries.slice(0, maxEntries),
      source: 'local',
      mainExports: this.getMainExports(allEntries),
      submodules: [...new Set(submodules)],
      dependencies: Object.keys(packageJson.dependencies || {}),
      extractedAt: new Date().toISOString(),
    };

    return result;
  }

  /**
   * Check if library exists in node_modules
   */
  hasLibrary(library: string): boolean {
    return this.findPackage(library) !== null;
  }

  /**
   * Get library version from package.json
   */
  getVersion(library: string): string | null {
    const packagePath = this.findPackage(library);
    if (!packagePath) return null;

    const packageJson = this.readPackageJson(packagePath);
    return packageJson?.version || null;
  }

  /**
   * List all available libraries in node_modules
   */
  listAvailable(): string[] {
    if (!fs.existsSync(this.nodeModulesPath)) {
      return [];
    }

    const libraries: string[] = [];
    const entries = fs.readdirSync(this.nodeModulesPath, { withFileTypes: true });

    for (const entry of entries) {
      if (!entry.isDirectory()) continue;
      if (entry.name.startsWith('.')) continue;

      if (entry.name.startsWith('@')) {
        // Scoped package
        const scopePath = path.join(this.nodeModulesPath, entry.name);
        const scopedEntries = fs.readdirSync(scopePath, { withFileTypes: true });
        for (const scopedEntry of scopedEntries) {
          if (scopedEntry.isDirectory()) {
            libraries.push(`${entry.name}/${scopedEntry.name}`);
          }
        }
      } else {
        libraries.push(entry.name);
      }
    }

    return libraries;
  }

  // ============================================================================
  // PRIVATE METHODS
  // ============================================================================

  private findPackage(library: string): string | null {
    const packagePath = path.join(this.nodeModulesPath, library);
    if (fs.existsSync(packagePath)) {
      return packagePath;
    }
    return null;
  }

  private readPackageJson(packagePath: string): Record<string, any> | null {
    const packageJsonPath = path.join(packagePath, 'package.json');
    if (!fs.existsSync(packageJsonPath)) {
      return null;
    }

    try {
      return JSON.parse(fs.readFileSync(packageJsonPath, 'utf-8'));
    } catch {
      return null;
    }
  }

  private findDtsFiles(packagePath: string, packageJson: Record<string, any>): string[] {
    const dtsFiles: string[] = [];

    // Check types field
    if (packageJson.types) {
      const typesPath = path.join(packagePath, packageJson.types);
      if (fs.existsSync(typesPath)) {
        dtsFiles.push(typesPath);
      }
    }

    // Check typings field
    if (packageJson.typings) {
      const typingsPath = path.join(packagePath, packageJson.typings);
      if (fs.existsSync(typingsPath)) {
        dtsFiles.push(typingsPath);
      }
    }

    // Check exports with types
    if (packageJson.exports) {
      this.extractExportTypes(packagePath, packageJson.exports, dtsFiles);
    }

    // Look for index.d.ts
    const indexDts = path.join(packagePath, 'index.d.ts');
    if (fs.existsSync(indexDts) && !dtsFiles.includes(indexDts)) {
      dtsFiles.push(indexDts);
    }

    // Look in dist folder
    const distDts = path.join(packagePath, 'dist', 'index.d.ts');
    if (fs.existsSync(distDts) && !dtsFiles.includes(distDts)) {
      dtsFiles.push(distDts);
    }

    return [...new Set(dtsFiles)];
  }

  private extractExportTypes(
    packagePath: string,
    exports: Record<string, any>,
    dtsFiles: string[]
  ): void {
    for (const [_key, value] of Object.entries(exports)) {
      if (typeof value === 'string' && value.endsWith('.d.ts')) {
        const typePath = path.join(packagePath, value);
        if (fs.existsSync(typePath)) {
          dtsFiles.push(typePath);
        }
      } else if (typeof value === 'object' && value !== null) {
        if (value.types) {
          const typePath = path.join(packagePath, value.types);
          if (fs.existsSync(typePath)) {
            dtsFiles.push(typePath);
          }
        }
        // Recurse for nested exports
        this.extractExportTypes(packagePath, value, dtsFiles);
      }
    }
  }

  private async parseDtsFile(
    filePath: string,
    options: ExtractionOptions
  ): Promise<DtsParseResult | null> {
    try {
      const content = fs.readFileSync(filePath, 'utf-8');
      const entries: APIEntry[] = [];
      const exports: string[] = [];
      const submodules: string[] = [];

      // Parse with regex (simple but effective for .d.ts)
      this.parseInterfaces(content, entries, options);
      this.parseTypes(content, entries, options);
      this.parseFunctions(content, entries, options);
      this.parseClasses(content, entries, options);
      this.parseConstants(content, entries, options);

      // Extract module name from path
      const moduleName = path.basename(filePath, '.d.ts');

      return {
        entries,
        moduleName,
        exports,
        submodules,
      };
    } catch (error) {
      console.warn(`Failed to parse ${filePath}: ${error}`);
      return null;
    }
  }

  private parseInterfaces(content: string, entries: APIEntry[], options: ExtractionOptions): void {
    const interfaceRegex =
      /(?:\/\*\*[\s\S]*?\*\/\s*)?(?:export\s+)?interface\s+(\w+)(?:<[^>]*>)?(?:\s+extends\s+[^{]+)?\s*\{([^}]*(?:\{[^}]*\}[^}]*)*)\}/g;

    let match;
    while ((match = interfaceRegex.exec(content)) !== null) {
      const name = match[1];

      if (!options.includePrivate && name.startsWith('_')) continue;

      // Interface body is captured in match[2] but not used currently
      const jsdoc = this.extractPrecedingJsDoc(content, match.index);

      entries.push({
        name,
        type: 'interface',
        signature: `interface ${name}`,
        description: jsdoc?.description,
        deprecated: jsdoc?.deprecated,
        since: jsdoc?.since,
        examples: jsdoc?.examples,
      });
    }
  }

  private parseTypes(content: string, entries: APIEntry[], options: ExtractionOptions): void {
    const typeRegex = /(?:\/\*\*[\s\S]*?\*\/\s*)?(?:export\s+)?type\s+(\w+)(?:<[^>]*>)?\s*=\s*([^;]+);/g;

    let match;
    while ((match = typeRegex.exec(content)) !== null) {
      const name = match[1];

      if (!options.includePrivate && name.startsWith('_')) continue;

      const typeValue = match[2].trim();
      const jsdoc = this.extractPrecedingJsDoc(content, match.index);

      entries.push({
        name,
        type: 'type',
        signature: `type ${name} = ${this.truncate(typeValue, 100)}`,
        description: jsdoc?.description,
        deprecated: jsdoc?.deprecated,
        since: jsdoc?.since,
        examples: jsdoc?.examples,
      });
    }
  }

  private parseFunctions(content: string, entries: APIEntry[], options: ExtractionOptions): void {
    const functionRegex =
      /(?:\/\*\*[\s\S]*?\*\/\s*)?(?:export\s+)?(?:declare\s+)?function\s+(\w+)(?:<[^>]*>)?\s*\(([^)]*)\)(?:\s*:\s*([^;{]+))?/g;

    let match;
    while ((match = functionRegex.exec(content)) !== null) {
      const name = match[1];

      if (!options.includePrivate && name.startsWith('_')) continue;

      const params = match[2];
      const returnType = match[3]?.trim() || 'void';
      const jsdoc = this.extractPrecedingJsDoc(content, match.index);

      entries.push({
        name,
        type: 'function',
        signature: `function ${name}(${this.truncate(params, 80)}): ${this.truncate(returnType, 50)}`,
        description: jsdoc?.description,
        params: this.parseParams(params, jsdoc?.params),
        returns: { type: returnType, description: jsdoc?.returns },
        deprecated: jsdoc?.deprecated,
        since: jsdoc?.since,
        examples: jsdoc?.examples,
      });
    }
  }

  private parseClasses(content: string, entries: APIEntry[], options: ExtractionOptions): void {
    const classRegex =
      /(?:\/\*\*[\s\S]*?\*\/\s*)?(?:export\s+)?(?:declare\s+)?(?:abstract\s+)?class\s+(\w+)(?:<[^>]*>)?(?:\s+extends\s+[^{]+)?(?:\s+implements\s+[^{]+)?\s*\{/g;

    let match;
    while ((match = classRegex.exec(content)) !== null) {
      const name = match[1];

      if (!options.includePrivate && name.startsWith('_')) continue;

      const jsdoc = this.extractPrecedingJsDoc(content, match.index);

      entries.push({
        name,
        type: 'class',
        signature: `class ${name}`,
        description: jsdoc?.description,
        deprecated: jsdoc?.deprecated,
        since: jsdoc?.since,
        examples: jsdoc?.examples,
      });
    }
  }

  private parseConstants(content: string, entries: APIEntry[], options: ExtractionOptions): void {
    const constRegex =
      /(?:\/\*\*[\s\S]*?\*\/\s*)?(?:export\s+)?(?:declare\s+)?const\s+(\w+)(?:\s*:\s*([^=;]+))?(?:\s*=\s*([^;]+))?;/g;

    let match;
    while ((match = constRegex.exec(content)) !== null) {
      const name = match[1];

      if (!options.includePrivate && name.startsWith('_')) continue;

      const typeAnnotation = match[2]?.trim();
      const jsdoc = this.extractPrecedingJsDoc(content, match.index);

      entries.push({
        name,
        type: 'constant',
        signature: `const ${name}${typeAnnotation ? `: ${this.truncate(typeAnnotation, 80)}` : ''}`,
        description: jsdoc?.description,
        deprecated: jsdoc?.deprecated,
        since: jsdoc?.since,
      });
    }
  }

  private extractPrecedingJsDoc(
    content: string,
    matchIndex: number
  ): {
    description?: string;
    params?: Record<string, string>;
    returns?: string;
    deprecated?: string;
    since?: string;
    examples?: string[];
  } | null {
    // Look backwards for JSDoc
    const before = content.substring(0, matchIndex);
    const jsdocMatch = before.match(/\/\*\*([\s\S]*?)\*\/\s*$/);

    if (!jsdocMatch) return null;

    const jsdoc = jsdocMatch[1];
    const result: {
      description?: string;
      params?: Record<string, string>;
      returns?: string;
      deprecated?: string;
      since?: string;
      examples?: string[];
    } = {};

    // Extract description (first non-tag content)
    const descMatch = jsdoc.match(/^\s*\*?\s*([^@\n][^\n]*)/m);
    if (descMatch) {
      result.description = descMatch[1].trim();
    }

    // Extract @param
    const paramMatches = jsdoc.matchAll(/@param\s+(?:\{[^}]+\}\s+)?(\w+)\s*-?\s*([^\n@]*)/g);
    for (const m of paramMatches) {
      if (!result.params) result.params = {};
      result.params[m[1]] = m[2].trim();
    }

    // Extract @returns
    const returnMatch = jsdoc.match(/@returns?\s+(?:\{[^}]+\}\s+)?([^\n@]*)/);
    if (returnMatch) {
      result.returns = returnMatch[1].trim();
    }

    // Extract @deprecated
    const deprecatedMatch = jsdoc.match(/@deprecated\s*([^\n@]*)/);
    if (deprecatedMatch) {
      result.deprecated = deprecatedMatch[1].trim() || 'Deprecated';
    }

    // Extract @since
    const sinceMatch = jsdoc.match(/@since\s+([^\n@]*)/);
    if (sinceMatch) {
      result.since = sinceMatch[1].trim();
    }

    // Extract @example
    const exampleMatches = jsdoc.matchAll(/@example\s*([^@]*?)(?=\n\s*\*\s*@|\n\s*\*\/|$)/gs);
    for (const m of exampleMatches) {
      if (!result.examples) result.examples = [];
      result.examples.push(m[1].trim().replace(/^\s*\*\s?/gm, ''));
    }

    return result;
  }

  private parseParams(paramsStr: string, jsdocParams?: Record<string, string>): ParamDoc[] {
    const params: ParamDoc[] = [];
    if (!paramsStr.trim()) return params;

    // Simple param parsing (handles most common cases)
    const paramRegex = /(\w+)(\?)?(?:\s*:\s*([^,)]+))?/g;
    let match;

    while ((match = paramRegex.exec(paramsStr)) !== null) {
      const name = match[1];
      const optional = !!match[2];
      const type = match[3]?.trim() || 'any';

      params.push({
        name,
        type,
        optional,
        description: jsdocParams?.[name],
      });
    }

    return params;
  }

  private extractSummary(packageJson: Record<string, any>, entries: APIEntry[]): string {
    if (packageJson.description) {
      return packageJson.description;
    }

    // Generate from entries
    const typeCount = entries.filter((e) => e.type === 'type').length;
    const interfaceCount = entries.filter((e) => e.type === 'interface').length;
    const functionCount = entries.filter((e) => e.type === 'function').length;
    const classCount = entries.filter((e) => e.type === 'class').length;

    const parts: string[] = [];
    if (functionCount > 0) parts.push(`${functionCount} functions`);
    if (classCount > 0) parts.push(`${classCount} classes`);
    if (interfaceCount > 0) parts.push(`${interfaceCount} interfaces`);
    if (typeCount > 0) parts.push(`${typeCount} types`);

    return parts.length > 0 ? `Provides ${parts.join(', ')}.` : 'TypeScript library';
  }

  private getMainExports(entries: APIEntry[]): string[] {
    // Return names of top-level exports (non-internal)
    return entries
      .filter((e) => !e.name.startsWith('_') && !e.name.includes('Internal'))
      .slice(0, 20)
      .map((e) => e.name);
  }

  private truncate(str: string, maxLen: number): string {
    if (str.length <= maxLen) return str;
    return str.substring(0, maxLen - 3) + '...';
  }
}

export default LocalExtractor;
