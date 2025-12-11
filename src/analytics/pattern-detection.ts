/**
 * Universal Context Engine - Pattern Detection
 * @module analytics/pattern-detection
 *
 * Detects architectural and design patterns in code.
 * Identifies MVC, microservices, singletons, factories, etc.
 */

import type { ParsedFile, ParsedClass } from '../parser/types.js';

// =============================================================================
// Types
// =============================================================================

/**
 * Pattern categories
 */
export type PatternCategory =
  | 'architectural'
  | 'design'
  | 'api'
  | 'security'
  | 'performance';

/**
 * Detected pattern
 */
export interface DetectedPattern {
  /** Pattern name */
  name: string;
  /** Pattern category */
  category: PatternCategory;
  /** Confidence score (0-1) */
  confidence: number;
  /** Description */
  description: string;
  /** Files where pattern was detected */
  files: string[];
  /** Evidence supporting detection */
  evidence: string[];
}

/**
 * Architecture pattern types
 */
export type ArchitecturePattern =
  | 'mvc'
  | 'mvvm'
  | 'microservices'
  | 'monolith'
  | 'layered'
  | 'event-driven'
  | 'serverless';

/**
 * Design pattern types (Gang of Four)
 */
export type DesignPattern =
  | 'singleton'
  | 'factory'
  | 'builder'
  | 'observer'
  | 'strategy'
  | 'decorator'
  | 'adapter'
  | 'facade'
  | 'proxy';

/**
 * API pattern types
 */
export type APIPattern = 'rest' | 'graphql' | 'grpc' | 'websocket' | 'event-sourcing';

/**
 * Pattern detection result
 */
export interface PatternDetectionResult {
  /** Overall architecture */
  architecture?: ArchitecturePattern;
  /** Design patterns found */
  designPatterns: DetectedPattern[];
  /** API patterns found */
  apiPatterns: DetectedPattern[];
  /** Security patterns found */
  securityPatterns: DetectedPattern[];
  /** Performance patterns found */
  performancePatterns: DetectedPattern[];
  /** Total patterns detected */
  totalPatterns: number;
}

// =============================================================================
// Pattern Detector
// =============================================================================

/**
 * Detects architectural and design patterns
 *
 * Usage:
 * ```typescript
 * const detector = new PatternDetector();
 * const patterns = detector.analyzeProject(parsedFiles);
 * console.log(patterns.architecture); // 'microservices', 'mvc', etc.
 * ```
 */
export class PatternDetector {
  /**
   * Analyze project for patterns
   */
  analyzeProject(parsedFiles: ParsedFile[]): PatternDetectionResult {
    const designPatterns: DetectedPattern[] = [];
    const apiPatterns: DetectedPattern[] = [];
    const securityPatterns: DetectedPattern[] = [];
    const performancePatterns: DetectedPattern[] = [];

    // Detect architecture
    const architecture = this.detectArchitecture(parsedFiles);

    // Detect design patterns
    designPatterns.push(...this.detectDesignPatterns(parsedFiles));

    // Detect API patterns
    apiPatterns.push(...this.detectAPIPatterns(parsedFiles));

    // Detect security patterns
    securityPatterns.push(...this.detectSecurityPatterns(parsedFiles));

    // Detect performance patterns
    performancePatterns.push(...this.detectPerformancePatterns(parsedFiles));

    const totalPatterns =
      designPatterns.length +
      apiPatterns.length +
      securityPatterns.length +
      performancePatterns.length;

    return {
      architecture,
      designPatterns,
      apiPatterns,
      securityPatterns,
      performancePatterns,
      totalPatterns,
    };
  }

  // =============================================================================
  // Architecture Detection
  // =============================================================================

  private detectArchitecture(files: ParsedFile[]): ArchitecturePattern | undefined {
    const evidence = {
      mvc: 0,
      microservices: 0,
      monolith: 0,
      layered: 0,
      eventDriven: 0,
    };

    for (const file of files) {
      const path = file.path.toLowerCase();

      // MVC indicators
      if (path.includes('controller') || path.includes('view') || path.includes('model')) {
        evidence.mvc++;
      }

      // Microservices indicators
      if (
        path.includes('service') &&
        (path.includes('api') || path.includes('endpoint'))
      ) {
        evidence.microservices++;
      }

      // Layered architecture
      if (
        path.includes('repository') ||
        path.includes('domain') ||
        path.includes('infrastructure')
      ) {
        evidence.layered++;
      }

      // Event-driven
      if (path.includes('event') || path.includes('message') || path.includes('queue')) {
        evidence.eventDriven++;
      }
    }

    // Determine dominant pattern
    const max = Math.max(...Object.values(evidence));
    if (max === 0) return undefined;

    if (evidence.mvc === max && evidence.mvc > files.length * 0.15) return 'mvc';
    if (evidence.microservices === max && evidence.microservices > 5) return 'microservices';
    if (evidence.layered === max && evidence.layered > files.length * 0.15) return 'layered';
    if (evidence.eventDriven === max && evidence.eventDriven > 5) return 'event-driven';

    return 'monolith';
  }

  // =============================================================================
  // Design Pattern Detection
  // =============================================================================

  private detectDesignPatterns(files: ParsedFile[]): DetectedPattern[] {
    const patterns: DetectedPattern[] = [];

    // Singleton pattern
    const singleton = this.detectSingleton(files);
    if (singleton) patterns.push(singleton);

    // Factory pattern
    const factory = this.detectFactory(files);
    if (factory) patterns.push(factory);

    // Builder pattern
    const builder = this.detectBuilder(files);
    if (builder) patterns.push(builder);

    // Observer pattern
    const observer = this.detectObserver(files);
    if (observer) patterns.push(observer);

    // Strategy pattern
    const strategy = this.detectStrategy(files);
    if (strategy) patterns.push(strategy);

    return patterns;
  }

  private detectSingleton(files: ParsedFile[]): DetectedPattern | null {
    const evidence: string[] = [];
    const matchingFiles: string[] = [];

    for (const file of files) {
      for (const cls of file.classes) {
        // Look for getInstance() method
        const hasGetInstance = cls.methods?.some((m) => m.name === 'getInstance');

        // Look for private constructor pattern
        const content = this.extractClassContent(file.content, cls);
        const hasPrivateConstructor = /private\s+constructor/.test(content);

        if (hasGetInstance || hasPrivateConstructor) {
          matchingFiles.push(file.path);
          evidence.push(`${file.path}: Class ${cls.name} uses singleton pattern`);
        }
      }
    }

    if (matchingFiles.length === 0) return null;

    return {
      name: 'Singleton',
      category: 'design',
      confidence: Math.min(matchingFiles.length / 5, 1),
      description: 'Ensures a class has only one instance',
      files: matchingFiles,
      evidence,
    };
  }

  private detectFactory(files: ParsedFile[]): DetectedPattern | null {
    const evidence: string[] = [];
    const matchingFiles: string[] = [];

    for (const file of files) {
      // Look for factory functions/classes
      const hasFactory =
        file.functions.some((f) => f.name.toLowerCase().includes('factory')) ||
        file.classes.some((c) => c.name.toLowerCase().includes('factory'));

      // Look for create* methods
      const hasCreateMethods = file.functions.some((f) => f.name.startsWith('create'));

      if (hasFactory || hasCreateMethods) {
        matchingFiles.push(file.path);
        evidence.push(`${file.path}: Contains factory methods or classes`);
      }
    }

    if (matchingFiles.length === 0) return null;

    return {
      name: 'Factory',
      category: 'design',
      confidence: Math.min(matchingFiles.length / 10, 1),
      description: 'Creates objects without specifying exact classes',
      files: matchingFiles,
      evidence,
    };
  }

  private detectBuilder(files: ParsedFile[]): DetectedPattern | null {
    const evidence: string[] = [];
    const matchingFiles: string[] = [];

    for (const file of files) {
      for (const cls of file.classes) {
        // Look for builder pattern: build() method and method chaining
        const hasBuild = cls.methods?.some((m) => m.name === 'build');
        const hasChaining = cls.methods?.some(
          (m) => m.returnType === cls.name || m.name.startsWith('with')
        );

        if (hasBuild && hasChaining) {
          matchingFiles.push(file.path);
          evidence.push(`${file.path}: Class ${cls.name} uses builder pattern`);
        }
      }
    }

    if (matchingFiles.length === 0) return null;

    return {
      name: 'Builder',
      category: 'design',
      confidence: Math.min(matchingFiles.length / 5, 1),
      description: 'Constructs complex objects step by step',
      files: matchingFiles,
      evidence,
    };
  }

  private detectObserver(files: ParsedFile[]): DetectedPattern | null {
    const evidence: string[] = [];
    const matchingFiles: string[] = [];

    for (const file of files) {
      const content = file.content.toLowerCase();

      // Look for observer/listener pattern indicators
      const hasObserver =
        content.includes('addeventlistener') ||
        content.includes('subscribe') ||
        content.includes('observer') ||
        content.includes('notify');

      if (hasObserver) {
        matchingFiles.push(file.path);
        evidence.push(`${file.path}: Contains observer/event pattern`);
      }
    }

    if (matchingFiles.length === 0) return null;

    return {
      name: 'Observer',
      category: 'design',
      confidence: Math.min(matchingFiles.length / 10, 1),
      description: 'Defines one-to-many dependency between objects',
      files: matchingFiles,
      evidence,
    };
  }

  private detectStrategy(files: ParsedFile[]): DetectedPattern | null {
    const evidence: string[] = [];
    const matchingFiles: string[] = [];

    for (const file of files) {
      const hasStrategy =
        file.path.toLowerCase().includes('strategy') ||
        file.classes.some((c) => c.name.toLowerCase().includes('strategy'));

      if (hasStrategy) {
        matchingFiles.push(file.path);
        evidence.push(`${file.path}: Contains strategy pattern`);
      }
    }

    if (matchingFiles.length === 0) return null;

    return {
      name: 'Strategy',
      category: 'design',
      confidence: Math.min(matchingFiles.length / 5, 1),
      description: 'Defines family of algorithms and makes them interchangeable',
      files: matchingFiles,
      evidence,
    };
  }

  // =============================================================================
  // API Pattern Detection
  // =============================================================================

  private detectAPIPatterns(files: ParsedFile[]): DetectedPattern[] {
    const patterns: DetectedPattern[] = [];

    // REST API
    const rest = this.detectREST(files);
    if (rest) patterns.push(rest);

    // GraphQL
    const graphql = this.detectGraphQL(files);
    if (graphql) patterns.push(graphql);

    // WebSocket
    const websocket = this.detectWebSocket(files);
    if (websocket) patterns.push(websocket);

    return patterns;
  }

  private detectREST(files: ParsedFile[]): DetectedPattern | null {
    const evidence: string[] = [];
    const matchingFiles: string[] = [];

    for (const file of files) {
      const content = file.content.toLowerCase();

      const hasREST =
        content.includes('express') ||
        content.includes('app.get') ||
        content.includes('app.post') ||
        content.includes('router.') ||
        content.includes('@get') ||
        content.includes('@post');

      if (hasREST) {
        matchingFiles.push(file.path);
        evidence.push(`${file.path}: Contains REST API endpoints`);
      }
    }

    if (matchingFiles.length === 0) return null;

    return {
      name: 'REST API',
      category: 'api',
      confidence: Math.min(matchingFiles.length / 5, 1),
      description: 'RESTful HTTP API endpoints',
      files: matchingFiles,
      evidence,
    };
  }

  private detectGraphQL(files: ParsedFile[]): DetectedPattern | null {
    const evidence: string[] = [];
    const matchingFiles: string[] = [];

    for (const file of files) {
      const content = file.content.toLowerCase();

      const hasGraphQL =
        content.includes('graphql') ||
        content.includes('resolver') ||
        content.includes('query') ||
        content.includes('mutation');

      if (hasGraphQL) {
        matchingFiles.push(file.path);
        evidence.push(`${file.path}: Contains GraphQL schema or resolvers`);
      }
    }

    if (matchingFiles.length === 0) return null;

    return {
      name: 'GraphQL',
      category: 'api',
      confidence: Math.min(matchingFiles.length / 5, 1),
      description: 'GraphQL API with queries and mutations',
      files: matchingFiles,
      evidence,
    };
  }

  private detectWebSocket(files: ParsedFile[]): DetectedPattern | null {
    const evidence: string[] = [];
    const matchingFiles: string[] = [];

    for (const file of files) {
      const content = file.content.toLowerCase();

      const hasWebSocket =
        content.includes('websocket') ||
        content.includes('socket.io') ||
        content.includes('ws://');

      if (hasWebSocket) {
        matchingFiles.push(file.path);
        evidence.push(`${file.path}: Uses WebSocket for real-time communication`);
      }
    }

    if (matchingFiles.length === 0) return null;

    return {
      name: 'WebSocket',
      category: 'api',
      confidence: Math.min(matchingFiles.length / 3, 1),
      description: 'Real-time bidirectional communication',
      files: matchingFiles,
      evidence,
    };
  }

  // =============================================================================
  // Security Pattern Detection
  // =============================================================================

  private detectSecurityPatterns(files: ParsedFile[]): DetectedPattern[] {
    const patterns: DetectedPattern[] = [];

    // Authentication
    const auth = this.detectAuthentication(files);
    if (auth) patterns.push(auth);

    // Encryption
    const encryption = this.detectEncryption(files);
    if (encryption) patterns.push(encryption);

    return patterns;
  }

  private detectAuthentication(files: ParsedFile[]): DetectedPattern | null {
    const evidence: string[] = [];
    const matchingFiles: string[] = [];

    for (const file of files) {
      const content = file.content.toLowerCase();

      const hasAuth =
        content.includes('authenticate') ||
        content.includes('jwt') ||
        content.includes('passport') ||
        content.includes('bcrypt') ||
        content.includes('login');

      if (hasAuth) {
        matchingFiles.push(file.path);
        evidence.push(`${file.path}: Contains authentication logic`);
      }
    }

    if (matchingFiles.length === 0) return null;

    return {
      name: 'Authentication',
      category: 'security',
      confidence: Math.min(matchingFiles.length / 3, 1),
      description: 'User authentication and authorization',
      files: matchingFiles,
      evidence,
    };
  }

  private detectEncryption(files: ParsedFile[]): DetectedPattern | null {
    const evidence: string[] = [];
    const matchingFiles: string[] = [];

    for (const file of files) {
      const content = file.content.toLowerCase();

      const hasEncryption =
        content.includes('encrypt') ||
        content.includes('crypto') ||
        content.includes('cipher');

      if (hasEncryption) {
        matchingFiles.push(file.path);
        evidence.push(`${file.path}: Uses encryption`);
      }
    }

    if (matchingFiles.length === 0) return null;

    return {
      name: 'Encryption',
      category: 'security',
      confidence: Math.min(matchingFiles.length / 3, 1),
      description: 'Data encryption and cryptography',
      files: matchingFiles,
      evidence,
    };
  }

  // =============================================================================
  // Performance Pattern Detection
  // =============================================================================

  private detectPerformancePatterns(files: ParsedFile[]): DetectedPattern[] {
    const patterns: DetectedPattern[] = [];

    // Caching
    const caching = this.detectCaching(files);
    if (caching) patterns.push(caching);

    // Lazy loading
    const lazyLoading = this.detectLazyLoading(files);
    if (lazyLoading) patterns.push(lazyLoading);

    return patterns;
  }

  private detectCaching(files: ParsedFile[]): DetectedPattern | null {
    const evidence: string[] = [];
    const matchingFiles: string[] = [];

    for (const file of files) {
      const content = file.content.toLowerCase();

      const hasCaching =
        content.includes('cache') ||
        content.includes('memoize') ||
        content.includes('redis');

      if (hasCaching) {
        matchingFiles.push(file.path);
        evidence.push(`${file.path}: Implements caching`);
      }
    }

    if (matchingFiles.length === 0) return null;

    return {
      name: 'Caching',
      category: 'performance',
      confidence: Math.min(matchingFiles.length / 3, 1),
      description: 'Data caching for performance optimization',
      files: matchingFiles,
      evidence,
    };
  }

  private detectLazyLoading(files: ParsedFile[]): DetectedPattern | null {
    const evidence: string[] = [];
    const matchingFiles: string[] = [];

    for (const file of files) {
      const content = file.content.toLowerCase();

      const hasLazyLoading =
        content.includes('lazy') ||
        content.includes('import(') ||
        content.includes('loadable');

      if (hasLazyLoading) {
        matchingFiles.push(file.path);
        evidence.push(`${file.path}: Uses lazy loading`);
      }
    }

    if (matchingFiles.length === 0) return null;

    return {
      name: 'Lazy Loading',
      category: 'performance',
      confidence: Math.min(matchingFiles.length / 3, 1),
      description: 'Deferred resource loading',
      files: matchingFiles,
      evidence,
    };
  }

  // =============================================================================
  // Helper Methods
  // =============================================================================

  private extractClassContent(fileContent: string, cls: ParsedClass): string {
    const lines = fileContent.split('\n');
    return lines.slice(cls.startLine - 1, cls.endLine).join('\n');
  }
}

// =============================================================================
// Factory Function
// =============================================================================

/**
 * Create a new pattern detector
 */
export function createPatternDetector(): PatternDetector {
  return new PatternDetector();
}
