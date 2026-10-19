import * as fs from 'node:fs';
import * as path from 'node:path';
import type { KeyUsage } from '../core/types.js';
import { findFiles } from './source-files.js';

const PLURAL_SUFFIX = /_(zero|one|two|few|many|other)$/;
const TEST_FILE = /(^|[/\\])__tests__[/\\]|\.(test|spec)\.[cm]?[jt]sx?$/;
const LINES_AROUND = 2;
const MAX_SNIPPET_LENGTH = 400;

interface IndexedUsage extends KeyUsage {
  /** Namespaces whose name appears as a string literal in the same file */
  fileNamespaces: Set<string>;
  /** Namespace written in front of the key itself (`'common:SAVE'`, `'common.SAVE'`) */
  prefixNamespace?: string;
}

/** How sure a usage is to belong to `namespace`: a prefix on the key beats a mention elsewhere in the file */
const namespaceScore = (usage: IndexedUsage, namespace: string): number => {
  if (usage.prefixNamespace === namespace) return 2;
  return usage.fileNamespaces.has(namespace) ? 1 : 0;
};

/** Where each translation key is used in the codebase */
export interface UsageIndex {
  /**
   * Usages of `key`, preferring ones written with the `namespace` prefix
   * (`t('common:SAVE')`), then files that mention `namespace` (where the key most
   * likely belongs to that namespace rather than a same-named key elsewhere).
   * Plural keys (`ITEMS_one`) return the usages of their base key (`ITEMS`).
   */
  getUsages(key: string, namespace: string, limit?: number): KeyUsage[];
}

export interface BuildUsageIndexOptions {
  projectRoot: string;
  searchPaths: string[];
  searchExtensions: string[];
  /** Keys to look for */
  keys: string[];
  /** Namespace names, for ranking usages by file */
  namespaces: string[];
  /** Files to leave out, relative to the project root (e.g. the generated types file) */
  excludeFiles?: string[];
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** 0-based start offset of every line */
function lineStarts(content: string): number[] {
  const starts = [0];
  for (let index = content.indexOf('\n'); index !== -1; index = content.indexOf('\n', index + 1)) {
    starts.push(index + 1);
  }
  return starts;
}

/** 0-based line containing `offset` */
function lineAt(starts: number[], offset: number): number {
  let low = 0;
  let high = starts.length - 1;
  while (low < high) {
    const middle = Math.ceil((low + high) / 2);
    if (starts[middle] <= offset) {
      low = middle;
    } else {
      high = middle - 1;
    }
  }
  return low;
}

function snippetAround(lines: string[], line: number): string {
  const snippet = lines
    .slice(Math.max(0, line - LINES_AROUND), line + LINES_AROUND + 1)
    .map((text) => text.trimEnd())
    .join('\n');
  return snippet.length > MAX_SNIPPET_LENGTH ? `${snippet.slice(0, MAX_SNIPPET_LENGTH)}…` : snippet;
}

/**
 * Scan the codebase once and record where each key appears as a quoted string.
 * Test files and the excluded files (the generated types file) are skipped:
 * they mention every key without showing how it is used.
 */
export function buildUsageIndex(options: BuildUsageIndexOptions): UsageIndex {
  const { projectRoot, searchPaths, searchExtensions, keys, namespaces, excludeFiles = [] } = options;
  const excluded = new Set(excludeFiles.map((file) => path.resolve(projectRoot, file)));
  const lookupKeys = [...new Set(keys.map((key) => key.replace(PLURAL_SUFFIX, '')))].sort(
    (first, second) => second.length - first.length
  );
  const usages = new Map<string, IndexedUsage[]>();

  if (!lookupKeys.length) {
    return { getUsages: () => [] };
  }

  // An optional namespace prefix (i18next's `ns:KEY`, or `ns.KEY`) between the quote and the key
  const namespaceAlternatives = [...namespaces]
    .sort((first, second) => second.length - first.length)
    .map(escapeRegExp)
    .join('|');
  const namespacePrefix = namespaces.length ? `(?:(${namespaceAlternatives})[:.])?` : '()?';
  const keyPattern = new RegExp(`['"\`]${namespacePrefix}(${lookupKeys.map(escapeRegExp).join('|')})['"\`]`, 'g');

  for (const file of findFiles(projectRoot, searchPaths, searchExtensions)) {
    if (excluded.has(path.resolve(file)) || TEST_FILE.test(file)) {
      continue;
    }

    const content = fs.readFileSync(file, 'utf-8');
    const matches = [...content.matchAll(keyPattern)];
    if (!matches.length) {
      continue;
    }

    const starts = lineStarts(content);
    const lines = content.split('\n');
    const fileNamespaces = new Set(
      namespaces.filter((namespace) => new RegExp(`['"\`]${escapeRegExp(namespace)}['"\`]`).test(content))
    );
    const relativeFile = path.relative(projectRoot, file);

    for (const match of matches) {
      const prefixNamespace = match[1];
      const key = match[2];
      const line = lineAt(starts, match.index ?? 0);
      const existing = usages.get(key) ?? [];
      // One usage per line is enough even when a line names the key twice
      if (!existing.some((usage) => usage.file === relativeFile && usage.line === line + 1)) {
        existing.push({
          file: relativeFile,
          line: line + 1,
          snippet: snippetAround(lines, line),
          fileNamespaces,
          ...(prefixNamespace && { prefixNamespace })
        });
        usages.set(key, existing);
      }
    }
  }

  return {
    getUsages(key, namespace, limit = 3) {
      const found = usages.get(key.replace(PLURAL_SUFFIX, '')) ?? [];
      return [...found]
        .sort((first, second) => namespaceScore(second, namespace) - namespaceScore(first, namespace))
        .slice(0, limit)
        .map(({ file, line, snippet }) => ({ file, line, snippet }));
    }
  };
}

/** An index with no usages, for providers that cannot use code context */
export const EMPTY_USAGE_INDEX: UsageIndex = { getUsages: () => [] };
