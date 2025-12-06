# GitHub Repository Setup Guide

Quick guide to publish Universal Context Memory (UCM) to GitHub.

## Step 1: Create GitHub Repository

1. Go to https://github.com/new
2. Repository name: `universal-context-memory`
3. Description: `Auto-indexing memory for AI coding assistants - baked into your project`
4. Set to **Public**
5. **Do NOT** initialize with README (we have our own)
6. Click "Create repository"

## Step 2: Push Code to GitHub

```bash
# Extract the package
tar -xzf ucm-opensource.tar.gz
cd ucm-opensource

# Initialize git and push
git init
git add .
git commit -m "Initial release: Universal Context Memory v1.0.0"
git branch -M main
git remote add origin https://github.com/LyceumAI/universal-context-memory.git
git push -u origin main

# Create and push initial tag
git tag -a v1.0.0 -m "Release v1.0.0"
git push origin v1.0.0
```

## Step 3: Configure Repository Settings

### General Settings
- Add description and topics: `ai`, `context`, `llm`, `claude`, `cursor`, `copilot`, `developer-tools`
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

# Publish
npm publish
```

## Step 5: Create GitHub Release

1. Go to Releases → Create a new release
2. Tag: `v1.0.0`
3. Title: `Universal Context Memory v1.0.0`
4. Generate release notes or paste from CHANGELOG.md
5. Publish release

## Post-Setup Checklist

- [ ] Repository created on GitHub
- [ ] Code pushed to `main` branch
- [ ] Initial tag `v1.0.0` created
- [ ] Branch protection enabled
- [ ] NPM_TOKEN secret added
- [ ] Package published to npm
- [ ] First GitHub Release created
- [ ] Topics/tags added to repo
- [ ] Discord/community links updated in README

## Updating the README

Update these placeholders in README.md:
- Replace `LyceumAI` with your actual GitHub username/org
- Update Discord invite link
- Update Twitter handle
- Update email address

## Testing After Publish

```bash
# Test npm install works
npm install universal-context-memory

# Test CLI works
npx ucm init
```

---

**You're all set!** 🎉

Your open-source project is now live and ready for contributors.
