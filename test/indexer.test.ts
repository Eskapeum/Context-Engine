/**
 * Tests for the Indexer module
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { Indexer } from '../src/indexer';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

describe('Indexer', () => {
  let testDir: string;

  beforeEach(() => {
    // Create a temporary test directory
    testDir = fs.mkdtempSync(path.join(os.tmpdir(), 'uce-test-'));
  });

  afterEach(() => {
    // Clean up test directory
    fs.rmSync(testDir, { recursive: true, force: true });
  });

  describe('constructor', () => {
    it('should create an indexer with default config', () => {
      const indexer = new Indexer({ projectRoot: testDir });
      expect(indexer).toBeDefined();
    });

    it('should accept custom configuration', () => {
      const indexer = new Indexer({
        projectRoot: testDir,
        maxFileSize: 500000,
        extractDocstrings: false,
      });
      expect(indexer).toBeDefined();
    });
  });

  describe('index', () => {
    it('should index TypeScript files', async () => {
      // Create a test TypeScript file
      const srcDir = path.join(testDir, 'src');
      fs.mkdirSync(srcDir);
      fs.writeFileSync(
        path.join(srcDir, 'test.ts'),
        `
export interface User {
  id: string;
  name: string;
}

export async function getUser(id: string): Promise<User> {
  return { id, name: 'Test' };
}

export class UserService {
  async findById(id: string) {
    return getUser(id);
  }
}

export const DEFAULT_USER = { id: '1', name: 'Default' };
`
      );

      const indexer = new Indexer({ projectRoot: testDir });
      const index = await indexer.index();

      expect(index.totalFiles).toBe(1);
      expect(index.totalSymbols).toBeGreaterThan(0);
      expect(index.languageStats['typescript']).toBeDefined();
      expect(index.languageStats['typescript'].files).toBe(1);

      // Check symbols were extracted
      const fileIndex = index.files['src/test.ts'];
      expect(fileIndex).toBeDefined();

      const symbolNames = fileIndex.symbols.map((s) => s.name);
      expect(symbolNames).toContain('User');
      expect(symbolNames).toContain('getUser');
      expect(symbolNames).toContain('UserService');
      expect(symbolNames).toContain('DEFAULT_USER');
    });

    it('should index Python files', async () => {
      fs.writeFileSync(
        path.join(testDir, 'test.py'),
        `
"""
Test Python module
"""

class User:
    """A user class"""
    def __init__(self, name: str):
        self.name = name

def get_user(user_id: str) -> User:
    """Get a user by ID"""
    return User("Test")

async def async_get_user(user_id: str) -> User:
    return User("Test")

MAX_USERS = 100
`
      );

      const indexer = new Indexer({ projectRoot: testDir });
      const index = await indexer.index();

      expect(index.totalFiles).toBe(1);
      expect(index.languageStats['python']).toBeDefined();

      const fileIndex = index.files['test.py'];
      const symbolNames = fileIndex.symbols.map((s) => s.name);
      expect(symbolNames).toContain('User');
      expect(symbolNames).toContain('get_user');
      expect(symbolNames).toContain('async_get_user');
    });

    it('should respect .gitignore patterns', async () => {
      // Create .gitignore
      fs.writeFileSync(path.join(testDir, '.gitignore'), 'ignored/\n*.ignored.ts');

      // Create files
      fs.mkdirSync(path.join(testDir, 'ignored'));
      fs.writeFileSync(path.join(testDir, 'ignored', 'file.ts'), 'export const x = 1;');
      fs.writeFileSync(path.join(testDir, 'test.ignored.ts'), 'export const y = 2;');
      fs.writeFileSync(path.join(testDir, 'included.ts'), 'export const z = 3;');

      const indexer = new Indexer({ projectRoot: testDir });
      const index = await indexer.index();

      const filePaths = Object.keys(index.files);
      expect(filePaths).toContain('included.ts');
      expect(filePaths).not.toContain('ignored/file.ts');
      expect(filePaths).not.toContain('test.ignored.ts');
    });

    it('should build dependency graph', async () => {
      const srcDir = path.join(testDir, 'src');
      fs.mkdirSync(srcDir);

      // Create files with imports
      fs.writeFileSync(
        path.join(srcDir, 'user.ts'),
        `
export interface User {
  id: string;
  name: string;
}
`
      );

      fs.writeFileSync(
        path.join(srcDir, 'service.ts'),
        `
import { User } from './user';

export class UserService {
  getUser(): User | null {
    return null;
  }
}
`
      );

      const indexer = new Indexer({ projectRoot: testDir });
      const index = await indexer.index();

      expect(index.dependencies.length).toBeGreaterThan(0);
    });
  });

  describe('saveIndex / loadIndex', () => {
    it('should save and load index', async () => {
      fs.writeFileSync(path.join(testDir, 'test.ts'), 'export const x = 1;');

      const indexer = new Indexer({ projectRoot: testDir });
      const index = await indexer.index();
      await indexer.saveIndex(index);

      // Load it back
      const loadedIndex = indexer.loadIndex();
      expect(loadedIndex).toBeDefined();
      expect(loadedIndex?.totalFiles).toBe(index.totalFiles);
      expect(loadedIndex?.totalSymbols).toBe(index.totalSymbols);
    });

    it('should return null when no index exists', () => {
      const indexer = new Indexer({ projectRoot: testDir });
      const index = indexer.loadIndex();
      expect(index).toBeNull();
    });
  });
});
