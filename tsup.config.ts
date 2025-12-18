import { defineConfig } from 'tsup';

export default defineConfig([
  // Library build
  {
    entry: {
      index: 'src/index.ts'
    },
    format: ['esm'],
    dts: true,
    splitting: false,
    sourcemap: true,
    clean: true,
    target: 'es2022'
  },
  // CLI build with shebang
  {
    entry: {
      'cli/translations': 'src/cli/translations.ts'
    },
    format: ['esm'],
    dts: true,
    splitting: false,
    sourcemap: true,
    target: 'es2022',
    shims: true,
    banner: {
      js: '#!/usr/bin/env node'
    }
  },
  // Verification script build with shebang
  {
    entry: {
      'scripts/verify-translations': 'src/scripts/verify-translations.ts'
    },
    format: ['esm'],
    dts: false,
    splitting: false,
    sourcemap: true,
    target: 'es2022',
    shims: true,
    banner: {
      js: '#!/usr/bin/env node'
    }
  },
  // Schema generation script build (no shebang since it's called via npm script)
  {
    entry: {
      'scripts/generate-schema': 'src/scripts/generate-schema.ts'
    },
    format: ['esm'],
    dts: false,
    splitting: false,
    sourcemap: true,
    target: 'es2022',
    shims: true
  }
]);
