# GitHub Repository Setup Guide

Quick guide to publish Universal Context Engine (UCE) to GitHub and npm.

## Step 1: Create GitHub Repository

1. Go to https://github.com/new
2. Repository name: `Context-Engine`
3. Description: `Universal Context Engine - Live context intelligence for AI coding assistants`
4. Set to **Public**
5. **Do NOT** initialize with README (we have our own)
6. Click "Create repository"

## Step 2: Push Code to GitHub

```bash
# Clone or navigate to your project
cd Context-Engine

# Initialize git and push
git init
git add .
git commit -m "Initial release: Universal Context Engine v2.2.1"
git branch -M main
git remote add origin https://github.com/Eskapeum/Context-Engine.git
git push -u origin main

# Create and push version tag
git tag -a v2.2.1 -m "Release v2.2.1"
git push origin v2.2.1
```

## Step 3: Configure Repository Settings

### General Settings
- Add description and topics: `ai`, `context`, `llm`, `claude`, `cursor`, `copilot`, `developer-tools`, `uce`, `mcp`
- Enable Issues and Discussions
- Add website URL (if you have one)

### Branch Protection (Settings → Branches)
- Add rule for `main` branch
- Require pull request reviews
- Require status checks to pass

### Secrets (Settings → Secrets → Actions)
Add these secrets for CI/CD:
- `NPM_TOKEN`: Get from https://www.npmjs.com/settings/tokens

## Step 4: Publish to npm

```bash
# Login to npm
npm login

# Build and publish
npm run build
npm publish
```

## Step 5: Create GitHub Release

1. Go to Releases → Create a new release
2. Tag: `v2.2.1`
3. Title: `Universal Context Engine v2.2.1`
4. Generate release notes or paste from CHANGELOG.md
5. Publish release

## Post-Setup Checklist

- [ ] Repository created on GitHub
- [ ] Code pushed to `main` branch
- [ ] Version tag created
- [ ] Branch protection enabled
- [ ] NPM_TOKEN secret added
- [ ] Package published to npm as `universal-context-engine`
- [ ] First GitHub Release created
- [ ] Topics/tags added to repo

## Testing After Publish

```bash
# Test npm install works
npm install universal-context-engine

# Test CLI works
npx uce hello

# Test indexing
npx uce init
```

## What Gets Generated

After running `npx uce init`, you'll have:

```
your-project/
├── .uce/
│   └── index.json      # Codebase index (don't commit)
└── UCE.md              # Universal context file (commit this!)
```

**UCE.md** is the single universal context file that works with:
- Claude Code
- Cursor IDE
- GitHub Copilot
- Any LLM or AI assistant

---

**You're all set!** 🎉

Your open-source project is now live and ready for contributors.
