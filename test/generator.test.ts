/**
 * Tests for the Generator module
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { Indexer } from '../src/indexer';
import {
  ContextGenerator,
  generateContextMd,
  generateClaudeMd,
  generateCursorRules,
  generateCopilotInstructions,
} from '../src/generator';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

describe('ContextGenerator', () => {
  let testDir: string;
  let indexer: Indexer;

  beforeEach(async () => {
    // Create a temporary test directory with some files
    testDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ucm-gen-test-'));

    const srcDir = path.join(testDir, 'src');
    fs.mkdirSync(srcDir);

    fs.writeFileSync(
      path.join(srcDir, 'auth.ts'),
      `
/**
 * Authentication module
 */

export interface User {
  id: string;
  email: string;
}

export class AuthService {
  async login(email: string, password: string): Promise<User | null> {
    return null;
  }

  async logout(): Promise<void> {}
}

export const AUTH_CONFIG = {
  tokenExpiry: 3600,
};
`
    );

    fs.writeFileSync(
      path.join(srcDir, 'api.ts'),
      `
import { User, AuthService } from './auth';

export async function getUsers(): Promise<User[]> {
  return [];
}

export class UserAPI {
  private auth: AuthService;

  constructor() {
    this.auth = new AuthService();
  }
}
`
    );

    indexer = new Indexer({ projectRoot: testDir });
  });

  afterEach(() => {
    fs.rmSync(testDir, { recursive: true, force: true });
  });

  describe('generateContextMd', () => {
    it('should generate valid markdown', async () => {
      const index = await indexer.index();
      const config = {
        projectRoot: testDir,
        index,
        maxTokens: 50000,
        includeFileContents: false,
        priorityFiles: [],
      };

      const md = generateContextMd(config);

      expect(md).toContain('# ');
      expect(md).toContain('Project Context');
      expect(md).toContain('Files');
      expect(md).toContain('Symbols');
      expect(md).toContain('UCM');
    });

    it('should include file tree', async () => {
      const index = await indexer.index();
      const config = {
        projectRoot: testDir,
        index,
        maxTokens: 50000,
        includeFileContents: false,
        priorityFiles: [],
      };

      const md = generateContextMd(config);

      expect(md).toContain('src/');
      expect(md).toContain('auth.ts');
      expect(md).toContain('api.ts');
    });

    it('should include key symbols', async () => {
      const index = await indexer.index();
      const config = {
        projectRoot: testDir,
        index,
        maxTokens: 50000,
        includeFileContents: false,
        priorityFiles: [],
      };

      const md = generateContextMd(config);

      expect(md).toContain('AuthService');
      expect(md).toContain('User');
    });
  });

  describe('generateClaudeMd', () => {
    it('should generate Claude-specific context', async () => {
      const index = await indexer.index();
      const config = {
        projectRoot: testDir,
        index,
        maxTokens: 50000,
        includeFileContents: false,
        priorityFiles: [],
      };

      const md = generateClaudeMd(config);

      expect(md).toContain('Claude Code Context');
      expect(md).toContain('CLAUDE.md');
      expect(md).toContain('ucm');
    });
  });

  describe('generateCursorRules', () => {
    it('should generate Cursor rules format', async () => {
      const index = await indexer.index();
      const config = {
        projectRoot: testDir,
        index,
        maxTokens: 50000,
        includeFileContents: false,
        priorityFiles: [],
      };

      const rules = generateCursorRules(config);

      expect(rules).toContain('# Cursor Rules');
      expect(rules).toContain('# Key Files');
      expect(rules).toContain('# Guidelines');
    });
  });

  describe('generateCopilotInstructions', () => {
    it('should generate Copilot instructions', async () => {
      const index = await indexer.index();
      const config = {
        projectRoot: testDir,
        index,
        maxTokens: 50000,
        includeFileContents: false,
        priorityFiles: [],
      };

      const md = generateCopilotInstructions(config);

      expect(md).toContain('GitHub Copilot');
      expect(md).toContain('Project Context');
    });
  });

  describe('ContextGenerator class', () => {
    it('should generate all context files', async () => {
      const index = await indexer.index();
      const generator = new ContextGenerator({ projectRoot: testDir, index });

      generator.generateAll();

      // Check files were created
      expect(fs.existsSync(path.join(testDir, 'CONTEXT.md'))).toBe(true);
      expect(fs.existsSync(path.join(testDir, 'CLAUDE.md'))).toBe(true);
      expect(fs.existsSync(path.join(testDir, '.cursorrules'))).toBe(true);
      expect(fs.existsSync(path.join(testDir, '.github', 'copilot-instructions.md'))).toBe(true);
    });

    it('should generate individual context file', async () => {
      const index = await indexer.index();
      const generator = new ContextGenerator({ projectRoot: testDir, index });

      const contextMd = generator.generate('context');
      const claudeMd = generator.generate('claude');
      const cursorRules = generator.generate('cursor');
      const copilotMd = generator.generate('copilot');

      expect(contextMd).toContain('Project Context');
      expect(claudeMd).toContain('Claude Code');
      expect(cursorRules).toContain('Cursor Rules');
      expect(copilotMd).toContain('Copilot');
    });
  });
});
