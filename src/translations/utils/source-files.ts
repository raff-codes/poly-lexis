import * as fs from 'node:fs';
import * as path from 'node:path';

/** Directories never searched for translation key usage */
const EXCLUDED_DIRS = new Set([
  'node_modules',
  'dist',
  'build',
  '.next',
  '.nuxt',
  'out',
  'coverage',
  '.git',
  '.svelte-kit',
  '.vercel',
  '.turbo',
  'public',
  'static'
]);

/**
 * Recursively find all files under `searchPaths` (relative to `rootDir`) whose
 * extension is in `extensions`, skipping build output and dependencies.
 */
export function findFiles(rootDir: string, searchPaths: string[], extensions: string[]): string[] {
  const files: string[] = [];
  const extensionSet = new Set(extensions);

  function scanDirectory(dir: string): void {
    try {
      const entries = fs.readdirSync(dir, { withFileTypes: true });

      for (const entry of entries) {
        const fullPath = path.join(dir, entry.name);

        if (entry.isDirectory()) {
          if (!EXCLUDED_DIRS.has(entry.name)) {
            scanDirectory(fullPath);
          }
        } else if (entry.isFile()) {
          const ext = path.extname(entry.name);
          if (extensionSet.has(ext)) {
            files.push(fullPath);
          }
        }
      }
    } catch {
      // Skip directories we can't read
    }
  }

  for (const searchPath of searchPaths) {
    const fullSearchPath = path.join(rootDir, searchPath);
    if (fs.existsSync(fullSearchPath)) {
      scanDirectory(fullSearchPath);
    }
  }

  return files;
}
