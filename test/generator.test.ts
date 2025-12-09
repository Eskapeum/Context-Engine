/**
 * Tests for the Generator module
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { Indexer } from '../src/indexer';
import { ContextGenerator, generateUceMd } from '../src/generator';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

describe('ContextGenerator', () => {
  let testDir: string;
  let indexer: Indexer;

  beforeEach(async () => {
    // Create a temporary test directory with some files
    testDir = fs.mkdtempSync(path.join(os.tmpdir(), 'uce-gen-test-'));

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

  describe('generateUceMd', () => {
    it('should generate valid markdown', async () => {
      const index = await indexer.index();
      const config = {
        projectRoot: testDir,
        index,
        maxTokens: 50000,
        includeFileContents: false,
        priorityFiles: [],
      };

      const md = generateUceMd(config);

      expect(md).toContain('# ');
      expect(md).toContain('Universal Context');
      expect(md).toContain('Files');
      expect(md).toContain('Symbols');
      expect(md).toContain('UCE');
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

      const md = generateUceMd(config);

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

      const md = generateUceMd(config);

      expect(md).toContain('AuthService');
      expect(md).toContain('User');
    });

    it('should include public API section', async () => {
      const index = await indexer.index();
      const config = {
        projectRoot: testDir,
        index,
        maxTokens: 50000,
        includeFileContents: false,
        priorityFiles: [],
      };

      const md = generateUceMd(config);

      expect(md).toContain('Public API');
      expect(md).toContain('Classes');
      expect(md).toContain('Interfaces');
    });

    it('should include development guidelines', async () => {
      const index = await indexer.index();
      const config = {
        projectRoot: testDir,
        index,
        maxTokens: 50000,
        includeFileContents: false,
        priorityFiles: [],
      };

      const md = generateUceMd(config);

      expect(md).toContain('Development Guidelines');
      expect(md).toContain('Quick Commands');
      expect(md).toContain('npx uce');
    });
  });

  describe('ContextGenerator class', () => {
    it('should generate UCE.md file', async () => {
      const index = await indexer.index();
      const generator = new ContextGenerator({ projectRoot: testDir, index });

      generator.generateAll();

      expect(fs.existsSync(path.join(testDir, 'UCE.md'))).toBe(true);

      const content = fs.readFileSync(path.join(testDir, 'UCE.md'), 'utf-8');
      expect(content).toContain('Universal Context');
      expect(content).toContain('AuthService');
    });

    it('should return UCE.md content without writing file', async () => {
      const index = await indexer.index();
      const generator = new ContextGenerator({ projectRoot: testDir, index });

      const uceMd = generator.generate();

      expect(uceMd).toContain('Universal Context');
      expect(uceMd).toContain('AuthService');
      expect(uceMd).toContain('User');
    });
  });
});
