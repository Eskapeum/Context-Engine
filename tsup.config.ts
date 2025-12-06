import { defineConfig } from 'tsup';

export default defineConfig([
  // Library build
  {
    entry: { index: 'src/index.ts' },
    format: ['esm', 'cjs'],
    dts: true,
    splitting: false,
    sourcemap: true,
    clean: true,
  },
  // CLI build
  {
    entry: { cli: 'src/cli.ts' },
    format: ['esm'],
    splitting: false,
    sourcemap: true,
    banner: {
      js: '#!/usr/bin/env node',
    },
    onSuccess: 'chmod +x dist/cli.js',
  },
]);
