import { execSync, spawnSync } from 'node:child_process';
import * as fs from 'node:fs';
import * as path from 'node:path';
import type { UnusedKeysResult, UnusedTranslation } from '../core/types.js';
import { getNamespaces, readTranslations } from '../utils/utils.js';
import { loadConfig } from './init.js';

/**
 * Check if ripgrep (rg) is available on the system
 */
function isRipgrepAvailable(): boolean {
  try {
    execSync('rg --version', { stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
}

/**
 * Use ripgrep to search for a key in files (fast method)
 */
function searchWithRipgrep(key: string, searchPaths: string[], extensions: string[], projectRoot: string): boolean {
  try {
    // Build glob pattern for extensions
    const globPattern = extensions.length > 1 ? `{${extensions.join(',')}}` : extensions[0];

    // Escape special regex characters in the key
    const escapedKey = key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

    // Search for exact matches with various quote styles
    const patterns = [`['"\`]${escapedKey}['"\`]`, `\\b${escapedKey}\\b`];

    for (const pattern of patterns) {
      const args = [
        '--quiet', // Exit with 0 if found, don't print
        '--glob',
        `*${globPattern}`,
        '--type-add',
        'custom:*{.ts,.tsx,.js,.jsx,.vue,.svelte}',
        '--type',
        'custom',
        pattern,
        ...searchPaths
      ];

      const result = spawnSync('rg', args, {
        cwd: projectRoot,
        encoding: 'utf-8',
        stdio: 'pipe'
      });

      // Exit code 0 means found
      if (result.status === 0) {
        return true;
      }
    }

    return false;
  } catch {
    // Fallback to slower method if ripgrep fails
    return false;
  }
}

/**
 * Recursively find all files matching the given extensions (fallback method)
 */
function findFiles(rootDir: string, searchPaths: string[], extensions: string[]): string[] {
  const files: string[] = [];
  const extensionSet = new Set(extensions);

  // Directories to exclude from search
  const excludeDirs = new Set([
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

  function scanDirectory(dir: string): void {
    try {
      const entries = fs.readdirSync(dir, { withFileTypes: true });

      for (const entry of entries) {
        const fullPath = path.join(dir, entry.name);

        if (entry.isDirectory()) {
          if (!excludeDirs.has(entry.name)) {
            scanDirectory(fullPath);
          }
        } else if (entry.isFile()) {
          const ext = path.extname(entry.name);
          if (extensionSet.has(ext)) {
            files.push(fullPath);
          }
        }
      }
    } catch (error) {
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

/**
 * Check if a key appears in file content using streaming/chunked approach
 */
function checkKeyInFile(key: string, filePath: string): boolean {
  try {
    const content = fs.readFileSync(filePath, 'utf-8');

    // Check for exact match (with various quote styles)
    const exactPatterns = [new RegExp(`['"\`]${key}['"\`]`, 'g'), new RegExp(`\\b${key}\\b`, 'g')];

    for (const pattern of exactPatterns) {
      if (pattern.test(content)) {
        return true;
      }
    }

    return false;
  } catch {
    return false;
  }
}

/**
 * Check for partial matches (key parts used in template strings or concatenation)
 */
function checkPartialMatches(key: string, files: string[]): string[] {
  const partialMatches: string[] = [];

  // Split key by common separators
  const keyParts = key.split(/[._]|(?=[A-Z])/);
  const significantParts = keyParts.filter((part) => part.length >= 3);

  if (significantParts.length === 0) {
    return [];
  }

  // Check each file for parts (sample first 100 files for performance)
  const filesToCheck = files.slice(0, Math.min(100, files.length));
  const foundParts = new Set<string>();

  for (const file of filesToCheck) {
    try {
      const content = fs.readFileSync(file, 'utf-8');

      for (const part of significantParts) {
        if (foundParts.has(part)) continue;

        const partPattern = new RegExp(`\\b${part}\\b`, 'gi');
        if (partPattern.test(content)) {
          foundParts.add(part);
          partialMatches.push(part);
        }
      }

      // Early exit if we found enough parts
      const threshold = significantParts.length === 1 ? 1 : 2;
      if (foundParts.size >= threshold) {
        break;
      }
    } catch {
      // Skip files that can't be read
    }
  }

  return partialMatches;
}

/**
 * Find translation keys that are not used anywhere in the codebase
 * Uses ripgrep if available for fast searching, falls back to manual search
 */
export function findUnusedKeys(projectRoot: string = process.cwd()): UnusedKeysResult {
  const config = loadConfig(projectRoot);
  const translationsPath = path.join(projectRoot, config.translationsPath);
  const sourceLanguage = config.sourceLanguage;

  // Get search configuration
  const searchPaths = config.searchPaths || ['src', 'app', 'pages', 'components'];
  const searchExtensions = config.searchExtensions || ['.ts', '.tsx', '.js', '.jsx', '.vue', '.svelte'];

  const useRipgrep = isRipgrepAvailable();

  console.log('=====');
  console.log('Finding unused translation keys');
  console.log('=====');
  console.log(`Source language: ${sourceLanguage}`);
  console.log(`Search paths: ${searchPaths.join(', ')}`);
  console.log(`File extensions: ${searchExtensions.join(', ')}`);
  console.log(`Search method: ${useRipgrep ? 'ripgrep (fast)' : 'native (standard)'}`);
  console.log('=====');

  // Read all translation keys from source language
  const sourceTranslations = readTranslations(translationsPath, sourceLanguage);
  const namespaces = getNamespaces(translationsPath, sourceLanguage);

  // Collect all keys
  const allKeys: Array<{ namespace: string; key: string }> = [];
  for (const namespace of namespaces) {
    const keys = Object.keys(sourceTranslations[namespace] || {});
    for (const key of keys) {
      allKeys.push({ namespace, key });
    }
  }

  console.log(`Total translation keys: ${allKeys.length}`);
  console.log('Scanning codebase for usage...\n');

  // Find files once for fallback and partial matching
  const files = useRipgrep ? [] : findFiles(projectRoot, searchPaths, searchExtensions);
  const searchedFiles = useRipgrep ? 0 : files.length;

  if (!useRipgrep) {
    console.log(`Searching ${files.length} files...`);
  }

  // Check each key for usage
  const unused: UnusedTranslation[] = [];
  let processedKeys = 0;

  for (const { namespace, key } of allKeys) {
    processedKeys++;

    // Show progress for large key sets
    if (allKeys.length > 100 && processedKeys % 50 === 0) {
      console.log(`Progress: ${processedKeys}/${allKeys.length} keys checked...`);
    }

    let found = false;

    if (useRipgrep) {
      // Fast path: Use ripgrep
      found = searchWithRipgrep(key, searchPaths, searchExtensions, projectRoot);
    } else {
      // Slower path: Check each file manually
      for (const file of files) {
        if (checkKeyInFile(key, file)) {
          found = true;
          break;
        }
      }
    }

    if (!found) {
      // Check for partial matches (only if not using ripgrep or for detailed analysis)
      const partialMatches = !useRipgrep && files.length > 0 ? checkPartialMatches(key, files) : [];

      const threshold = 2;
      if (partialMatches.length >= threshold) {
        // Key parts found but not exact match - might be dynamic usage
        unused.push({
          namespace,
          key,
          usageType: 'partial',
          partialMatches
        });
      } else {
        // Key is not used at all
        unused.push({
          namespace,
          key,
          usageType: 'unused',
          partialMatches: []
        });
      }
    }
  }

  console.log('=====');

  return {
    unused,
    totalKeys: allKeys.length,
    searchedFiles: useRipgrep ? -1 : searchedFiles // -1 indicates ripgrep was used
  };
}

/**
 * Print unused keys results in a formatted way
 */
export function printUnusedKeysResult(result: UnusedKeysResult): void {
  const definitelyUnused = result.unused.filter((u) => u.usageType === 'unused');
  const possiblyUnused = result.unused.filter((u) => u.usageType === 'partial');

  if (definitelyUnused.length === 0 && possiblyUnused.length === 0) {
    console.log('✓ All translation keys are being used!');
    return;
  }

  if (definitelyUnused.length > 0) {
    console.log(`\n⚠ Found ${definitelyUnused.length} unused translation keys:\n`);

    // Group by namespace
    const byNamespace = new Map<string, string[]>();
    for (const item of definitelyUnused) {
      const keys = byNamespace.get(item.namespace) || [];
      keys.push(item.key);
      byNamespace.set(item.namespace, keys);
    }

    for (const [namespace, keys] of byNamespace) {
      console.log(`  ${namespace}:`);
      for (const key of keys.slice(0, 10)) {
        console.log(`    - ${key}`);
      }
      if (keys.length > 10) {
        console.log(`    ... and ${keys.length - 10} more`);
      }
    }
  }

  if (possiblyUnused.length > 0) {
    console.log(`\n💡 Found ${possiblyUnused.length} keys with only partial matches (possibly used dynamically):\n`);

    // Group by namespace
    const byNamespace = new Map<string, Array<{ key: string; parts: string[] }>>();
    for (const item of possiblyUnused) {
      const items = byNamespace.get(item.namespace) || [];
      items.push({ key: item.key, parts: item.partialMatches || [] });
      byNamespace.set(item.namespace, items);
    }

    for (const [namespace, items] of byNamespace) {
      console.log(`  ${namespace}:`);
      for (const { key, parts } of items.slice(0, 5)) {
        console.log(`    - ${key} (found parts: ${parts.join(', ')})`);
      }
      if (items.length > 5) {
        console.log(`    ... and ${items.length - 5} more`);
      }
    }
  }

  console.log(`\n📊 Summary:`);
  console.log(`  Total keys: ${result.totalKeys}`);
  console.log(`  Definitely unused: ${definitelyUnused.length}`);
  console.log(`  Possibly used dynamically: ${possiblyUnused.length}`);

  if (result.searchedFiles === -1) {
    console.log(`  Search method: ripgrep (fast)`);
  } else {
    console.log(`  Files searched: ${result.searchedFiles}`);
  }

  console.log('=====');
}
