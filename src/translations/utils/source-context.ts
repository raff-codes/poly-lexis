import * as fs from 'node:fs';
import * as path from 'node:path';
import type { ContextIssue, NamespaceContext, TranslationFiles } from '../core/types.js';

/**
 * Reserved entry in a source-language namespace file that holds the context a
 * person wrote for that namespace:
 *
 *   {
 *     "$context": {
 *       "description": "Checkout for spa bookings",
 *       "keys": { "BOOK": "Button that confirms the booking" }
 *     },
 *     "BOOK": "Book"
 *   }
 *
 * i18next only looks up the keys it is asked for, so the entry is harmless at
 * runtime. Every poly-lexis reader strips it before treating the file as
 * translations, so it is never translated, synced to other languages or typed.
 */
export const CONTEXT_KEY = '$context';

export interface ParsedNamespaceContext {
  context: NamespaceContext;
  /** Shape problems found while parsing, in plain language */
  problems: string[];
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/**
 * Parse a raw `$context` value. Malformed parts are dropped and reported rather
 * than thrown, so a typo in context never blocks translating.
 */
export function parseNamespaceContext(raw: unknown): ParsedNamespaceContext {
  const problems: string[] = [];
  const context: NamespaceContext = { keys: {} };

  if (raw === undefined) {
    return { context, problems };
  }

  if (!isRecord(raw)) {
    problems.push('$context must be an object with "description" and "keys"');
    return { context, problems };
  }

  if (raw.description !== undefined) {
    if (typeof raw.description === 'string' && raw.description.trim()) {
      context.description = raw.description.trim();
    } else {
      problems.push('$context.description must be a non-empty string');
    }
  }

  if (raw.keys !== undefined) {
    if (!isRecord(raw.keys)) {
      problems.push('$context.keys must be an object mapping keys to notes');
    } else {
      for (const [key, note] of Object.entries(raw.keys)) {
        if (typeof note === 'string' && note.trim()) {
          context.keys[key] = note.trim();
        } else {
          problems.push(`$context.keys.${key} must be a non-empty string`);
        }
      }
    }
  }

  return { context, problems };
}

function readRawFile(filePath: string): Record<string, unknown> | null {
  if (!fs.existsSync(filePath)) {
    return null;
  }
  const parsed = JSON.parse(fs.readFileSync(filePath, 'utf-8')) as unknown;
  return isRecord(parsed) ? parsed : null;
}

/**
 * Read the `$context` of every namespace in a language directory.
 * Namespaces without a `$context` entry get an empty context.
 */
export function readNamespaceContexts(
  translationsPath: string,
  language: string
): Record<string, ParsedNamespaceContext> {
  const langPath = path.join(translationsPath, language);

  if (!fs.existsSync(langPath)) {
    return {};
  }

  const contexts: Record<string, ParsedNamespaceContext> = {};

  for (const file of fs.readdirSync(langPath).filter((f) => f.endsWith('.json'))) {
    const namespace = path.basename(file, '.json');
    const raw = readRawFile(path.join(langPath, file));
    contexts[namespace] = parseNamespaceContext(raw?.[CONTEXT_KEY]);
  }

  return contexts;
}

export interface NamespaceContextUpdate {
  /** Replace the namespace description */
  description?: string;
  /** Add or replace notes for these keys */
  keyNotes?: Record<string, string>;
}

/**
 * Write context into a source namespace file, keeping `$context` as the first
 * entry and leaving every translation untouched. Creates the file if needed.
 */
export function updateNamespaceContext(
  translationsPath: string,
  language: string,
  namespace: string,
  update: NamespaceContextUpdate
): void {
  const filePath = path.join(translationsPath, language, `${namespace}.json`);
  const raw = readRawFile(filePath) ?? {};
  const { [CONTEXT_KEY]: existingRaw, ...entries } = raw;
  const { context } = parseNamespaceContext(existingRaw);

  const description = update.description?.trim() || context.description;
  const keys = { ...context.keys };
  for (const [key, note] of Object.entries(update.keyNotes ?? {})) {
    if (note.trim()) {
      keys[key] = note.trim();
    }
  }

  const sortedKeys = Object.fromEntries(Object.entries(keys).sort(([first], [second]) => first.localeCompare(second)));
  const nextContext = {
    ...(description && { description }),
    ...(Object.keys(sortedKeys).length > 0 && { keys: sortedKeys })
  };

  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  const content = Object.keys(nextContext).length > 0 ? { [CONTEXT_KEY]: nextContext, ...entries } : entries;
  fs.writeFileSync(filePath, `${JSON.stringify(content, null, 2)}\n`, 'utf-8');
}

export interface FindContextIssuesOptions {
  /** Report namespaces without a `$context.description` (default: true) */
  requireDescriptions?: boolean;
}

/**
 * Report missing namespace descriptions, notes for keys that no longer exist,
 * and malformed `$context` entries.
 */
export function findContextIssues(
  contexts: Record<string, ParsedNamespaceContext>,
  sourceTranslations: TranslationFiles,
  options: FindContextIssuesOptions = {}
): ContextIssue[] {
  const { requireDescriptions = true } = options;
  const issues: ContextIssue[] = [];

  for (const namespace of Object.keys(sourceTranslations)) {
    const parsed = contexts[namespace] ?? { context: { keys: {} }, problems: [] };

    for (const problem of parsed.problems) {
      issues.push({ namespace, type: 'invalid-context', message: problem });
    }

    if (requireDescriptions && !parsed.context.description) {
      issues.push({
        namespace,
        type: 'missing-description',
        message: `Add $context.description to ${namespace}.json saying which screen or feature these strings belong to`
      });
    }

    const keys = sourceTranslations[namespace] ?? {};
    for (const key of Object.keys(parsed.context.keys)) {
      if (keys[key] === undefined) {
        issues.push({
          namespace,
          key,
          type: 'unknown-key-note',
          message: `$context.keys.${key} refers to a key that is not in ${namespace}.json; remove or rename the note`
        });
      }
    }
  }

  return issues;
}
