# Contributing to Universal Context Memory (UCE)

Thank you for your interest in contributing to UCE! This project is part of the **Lyceum AI Academy** mission to make AI-assisted development accessible to everyone.

## Table of Contents

- [Code of Conduct](#code-of-conduct)
- [Getting Started](#getting-started)
- [Development Setup](#development-setup)
- [Making Changes](#making-changes)
- [Pull Request Process](#pull-request-process)
- [Adding Language Support](#adding-language-support)
- [Testing](#testing)
- [Style Guide](#style-guide)
- [Community](#community)

## Code of Conduct

We are committed to providing a welcoming and inclusive experience for everyone. Please be respectful and constructive in all interactions.

### Our Standards

- Be respectful and inclusive
- Welcome newcomers and help them learn
- Focus on what's best for the community
- Accept constructive criticism gracefully

### Unacceptable Behavior

- Harassment, discrimination, or trolling
- Personal attacks or insults
- Publishing others' private information
- Other conduct inappropriate in a professional setting

## Getting Started

### Prerequisites

- Node.js 18 or higher
- npm, yarn, or pnpm
- Git

### Fork and Clone

1. Fork the repository on GitHub
2. Clone your fork:

```bash
git clone https://github.com/YOUR_USERNAME/universal-context-memory.git
cd universal-context-memory
```

3. Add the upstream remote:

```bash
git remote add upstream https://github.com/LyceumAI/universal-context-memory.git
```

## Development Setup

### Install Dependencies

```bash
npm install
```

### Build the Project

```bash
npm run build
```

### Run Tests

```bash
npm test
```

### Link for Local Testing

```bash
npm link

# Now you can test in any project:
cd /path/to/test/project
uce init
```

### Watch Mode (Auto-rebuild)

```bash
npm run dev
```

## Making Changes

### Create a Branch

Always create a new branch for your changes:

```bash
git checkout -b feature/your-feature-name
# or
git checkout -b fix/your-bug-fix
```

### Branch Naming Conventions

- `feature/` - New features
- `fix/` - Bug fixes
- `docs/` - Documentation only
- `refactor/` - Code refactoring
- `test/` - Test additions or fixes
- `chore/` - Maintenance tasks

### Commit Messages

We follow [Conventional Commits](https://www.conventionalcommits.org/):

```
<type>(<scope>): <description>

[optional body]

[optional footer]
```

**Types:**

- `feat`: New feature
- `fix`: Bug fix
- `docs`: Documentation
- `style`: Formatting
- `refactor`: Code restructuring
- `test`: Tests
- `chore`: Maintenance

**Examples:**

```
feat(indexer): add Ruby language support

fix(cli): handle symlinks correctly in watch mode

docs: add API documentation for ContextGenerator
```

## Pull Request Process

### Before Submitting

1. **Update from upstream:**

```bash
git fetch upstream
git rebase upstream/main
```

2. **Run all checks:**

```bash
npm run lint
npm run typecheck
npm test
```

3. **Build successfully:**

```bash
npm run build
```

### Submitting a PR

1. Push your branch to your fork
2. Open a PR against `main` on the upstream repository
3. Fill out the PR template completely
4. Link any related issues

### PR Requirements

- [ ] Tests pass
- [ ] Linting passes
- [ ] TypeScript compiles without errors
- [ ] Documentation updated (if applicable)
- [ ] CHANGELOG.md updated (for features/fixes)

### Review Process

1. At least one maintainer must approve
2. All CI checks must pass
3. Discussions must be resolved
4. Commits may be squashed on merge

## Adding Language Support

UCE uses regex-based pattern matching to extract symbols. To add a new language:

### 1. Add Language Config

In `src/indexer.ts`, add a new entry to `LANGUAGE_CONFIGS`:

```typescript
newlanguage: {
  extensions: ['.ext'],
  patterns: {
    function: /your-function-regex/gm,
    class: /your-class-regex/gm,
    interface: /your-interface-regex/gm,  // optional
    type: /your-type-regex/gm,            // optional
    constant: /your-constant-regex/gm,    // optional
    import: /your-import-regex/gm,
    docstring: /your-docstring-regex/gm,  // optional
  },
},
```

### 2. Pattern Guidelines

- Patterns must have the `gm` flags (global, multiline)
- First capture group should be the symbol name
- For functions: group 1 = name, group 2 = params, group 3 = return type
- Test with real code from popular projects

### 3. Add Tests

Create tests in `test/languages/newlanguage.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { Indexer } from '../../src/indexer';

describe('New Language Support', () => {
  it('should extract functions', async () => {
    // Test implementation
  });
  
  it('should extract classes', async () => {
    // Test implementation
  });
});
```

### 4. Update Documentation

- Add language to README.md table
- Add examples to documentation

## Testing

### Running Tests

```bash
# Run all tests
npm test

# Run with coverage
npm run test:coverage

# Run specific test file
npm test -- indexer.test.ts

# Watch mode
npm test -- --watch
```

### Writing Tests

We use [Vitest](https://vitest.dev/) for testing.

```typescript
import { describe, it, expect, beforeEach } from 'vitest';
import { Indexer } from '../src/indexer';

describe('Indexer', () => {
  let indexer: Indexer;

  beforeEach(() => {
    indexer = new Indexer({ projectRoot: '/test/path' });
  });

  it('should do something', () => {
    // Test implementation
    expect(result).toBe(expected);
  });
});
```

### Test Coverage

We aim for 80%+ code coverage. Run coverage report:

```bash
npm run test:coverage
```

## Style Guide

### TypeScript

- Use TypeScript strict mode
- Prefer explicit types over `any`
- Document public APIs with JSDoc

### Code Formatting

We use Prettier for formatting:

```bash
npm run format
```

Configuration is in `.prettierrc`:

```json
{
  "semi": true,
  "singleQuote": true,
  "tabWidth": 2,
  "trailingComma": "es5",
  "printWidth": 100
}
```

### Linting

We use ESLint:

```bash
npm run lint
npm run lint:fix  # Auto-fix issues
```

### File Organization

```
src/
├── indexer.ts      # Core indexing logic
├── generator.ts    # Context file generation
├── cli.ts          # CLI commands
└── index.ts        # Public API exports

test/
├── indexer.test.ts
├── generator.test.ts
├── cli.test.ts
└── languages/      # Language-specific tests
```

## Community

### Getting Help

- **Discord**: [Join our server](https://discord.gg/lyceumacademy)
- **GitHub Discussions**: For questions and ideas
- **GitHub Issues**: For bugs and feature requests

### Good First Issues

Look for issues labeled `good first issue` - these are great for new contributors!

### Recognition

Contributors are recognized in:
- CONTRIBUTORS.md
- Release notes
- Our Discord community

## License

By contributing to UCE, you agree that your contributions will be licensed under the MIT License.

---

Thank you for contributing to UCE! 🎉

**Built with ❤️ by the Lyceum AI Academy community**
