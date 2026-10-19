import * as fs from 'node:fs';
import * as path from 'node:path';
import type { TranslationFile, TranslationFiles } from '../core/types.js';
import { metadataExists, pruneMetadata, readMetadata, writeMetadata } from './metadata.js';
import { CONTEXT_KEY } from './source-context.js';

/**
 * Nested translation structure (allows nested objects)
 */
export type NestedTranslationFile = {
  [key: string]: string | NestedTranslationFile;
};

/**
 * Flatten a nested object into a flat key-value structure using dot notation
 * Example: { home: { title: "Hello" } } -> { "home.title": "Hello" }
 */
export function flattenObject(nested: NestedTranslationFile, prefix = ''): TranslationFile {
  const result: TranslationFile = {};

  for (const [key, value] of Object.entries(nested)) {
    const newKey = prefix ? `${prefix}.${key}` : key;

    if (typeof value === 'string') {
      result[newKey] = value;
    } else if (typeof value === 'object' && value !== null) {
      Object.assign(result, flattenObject(value, newKey));
    }
  }

  return result;
}

/**
 * Unflatten a flat object with dot notation keys into a nested structure
 * Example: { "home.title": "Hello" } -> { home: { title: "Hello" } }
 */
export function unflattenObject(flat: TranslationFile): NestedTranslationFile {
  const result: NestedTranslationFile = {};

  for (const [key, value] of Object.entries(flat)) {
    const parts = key.split('.');
    let current: NestedTranslationFile = result;

    for (let i = 0; i < parts.length - 1; i++) {
      const part = parts[i];
      if (!(part in current) || typeof current[part] === 'string') {
        current[part] = {};
      }
      current = current[part] as NestedTranslationFile;
    }

    current[parts[parts.length - 1]] = value;
  }

  return result;
}

/**
 * Check if an object is flat (all values are strings) or nested
 */
export function isNestedObject(record: Record<string, unknown>): boolean {
  return Object.values(record).some((value) => typeof value === 'object' && value !== null);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/**
 * Parse the contents of a translation file. The top level must be an object;
 * leaf values are left as they are and handled by the readers.
 */
function parseTranslationFile(value: unknown, filePath: string): NestedTranslationFile {
  if (!isRecord(value)) {
    throw new Error(`${filePath} must be a JSON object mapping keys to strings or nested objects`);
  }
  return value as NestedTranslationFile;
}

/** The `$context` entry of an existing namespace file, or undefined when the file has none */
function readExistingContext(filePath: string): unknown {
  if (!fs.existsSync(filePath)) {
    return undefined;
  }
  const parsed: unknown = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
  return isRecord(parsed) ? parsed[CONTEXT_KEY] : undefined;
}

/**
 * Read all translation files for a specific language
 * Automatically flattens nested structures into dot notation.
 * The reserved `$context` entry is left out; read it with `readNamespaceContexts`.
 */
export function readTranslations(translationsPath: string, language: string): TranslationFiles {
  const languagePath = path.join(translationsPath, language);

  if (!fs.existsSync(languagePath)) {
    return {};
  }

  const files = fs.readdirSync(languagePath).filter((fileName) => fileName.endsWith('.json'));
  const translations: TranslationFiles = {};

  for (const file of files) {
    const namespace = path.basename(file, '.json');
    const filePath = path.join(languagePath, file);
    const content = fs.readFileSync(filePath, 'utf-8');
    const { [CONTEXT_KEY]: _context, ...parsed } = parseTranslationFile(JSON.parse(content), filePath);

    // Flatten nested structures automatically
    if (isNestedObject(parsed)) {
      translations[namespace] = flattenObject(parsed);
    } else {
      translations[namespace] = parsed as TranslationFile;
    }
  }

  return translations;
}

/**
 * Write translation file for a specific language and namespace.
 * A `$context` entry already in the file is kept as its first entry.
 */
export function writeTranslation(
  translationsPath: string,
  language: string,
  namespace: string,
  translations: TranslationFile
): void {
  const languagePath = path.join(translationsPath, language);

  if (!fs.existsSync(languagePath)) {
    fs.mkdirSync(languagePath, { recursive: true });
  }

  const filePath = path.join(languagePath, `${namespace}.json`);
  const existingContext = readExistingContext(filePath);
  const content = existingContext === undefined ? translations : { [CONTEXT_KEY]: existingContext, ...translations };

  fs.writeFileSync(filePath, `${JSON.stringify(content, null, 2)}\n`, 'utf-8');
}

/**
 * Get all available languages from the translations directory
 */
export function getAvailableLanguages(translationsPath: string): string[] {
  if (!fs.existsSync(translationsPath)) {
    return [];
  }

  return fs
    .readdirSync(translationsPath, { withFileTypes: true })
    .filter((dirent) => dirent.isDirectory())
    .map((dirent) => dirent.name);
}

/**
 * Get all namespaces for a specific language
 */
export function getNamespaces(translationsPath: string, language: string): string[] {
  const languagePath = path.join(translationsPath, language);

  if (!fs.existsSync(languagePath)) {
    return [];
  }

  return fs
    .readdirSync(languagePath)
    .filter((fileName) => fileName.endsWith('.json'))
    .map((fileName) => path.basename(fileName, '.json'));
}

/**
 * Check if a string contains interpolation variables (e.g., {{variable}})
 */
export function hasInterpolation(text: string): boolean {
  return /\{\{[^}]+\}\}/g.test(text);
}

/**
 * Extract interpolation variable names from a string
 */
export function extractVariables(text: string): string[] {
  const matches = text.match(/\{\{([^}]+)\}\}/g);
  if (!matches) return [];
  return matches.map((match) => match.replace(/\{\{|\}\}/g, '').trim());
}

/**
 * Validate that translated text has the same variables as source text
 */
export function validateVariables(sourceText: string, translatedText: string): boolean {
  const sourceVars = extractVariables(sourceText).sort();
  const translatedVars = extractVariables(translatedText).sort();

  if (sourceVars.length !== translatedVars.length) {
    return false;
  }

  return sourceVars.every((variable, index) => variable === translatedVars[index]);
}

/**
 * Sort object keys alphabetically
 */
export function sortKeys<T extends Record<string, unknown>>(record: T): T {
  const sorted = {} as T;
  const keys = Object.keys(record).sort();
  for (const key of keys) {
    sorted[key as keyof T] = record[key as keyof T];
  }
  return sorted;
}

/**
 * Ensure translations path exists and has proper structure
 */
export function ensureTranslationsStructure(translationsPath: string, languages: string[]): void {
  if (!fs.existsSync(translationsPath)) {
    fs.mkdirSync(translationsPath, { recursive: true });
  }

  for (const language of languages) {
    const languagePath = path.join(translationsPath, language);
    if (!fs.existsSync(languagePath)) {
      fs.mkdirSync(languagePath, { recursive: true });
    }
  }
}

/**
 * Create an empty translation structure from a source translation file
 * All values are set to empty strings, preserving the key structure
 */
export function createEmptyTranslationStructure(sourceFile: TranslationFile): TranslationFile {
  const result: TranslationFile = {};

  for (const key of Object.keys(sourceFile)) {
    result[key] = '';
  }

  return result;
}

/** What {@link syncTranslationStructure} changed */
export interface SyncResult {
  /** Language folders that were created */
  createdFolders: string[];
  /** Namespace files created in target languages with empty values */
  createdFiles: Array<{ language: string; namespace: string; path: string }>;
  /** Namespace files that already existed, and whether orphaned keys were cleaned from them */
  skippedFiles: Array<{ language: string; namespace: string; reason: string }>;
  /** Keys removed from target languages because they are not in the source */
  cleanedKeys: Array<{ language: string; namespace: string; key: string }>;
  /** Namespace files removed from target languages because they are not in the source */
  removedNamespaces: Array<{ language: string; namespace: string; path: string }>;
}

/**
 * Synchronize translation structure based on source language
 * - Ensures all configured languages have folders
 * - Ensures all namespaces from source language exist in target languages
 * - Creates files with empty values matching source structure
 * - Removes orphaned namespace files from target languages (namespaces not in source)
 * - Removes orphaned keys from target languages (keys not in source)
 */
export function syncTranslationStructure(
  translationsPath: string,
  languages: string[],
  sourceLanguage: string
): SyncResult {
  const result: SyncResult = {
    createdFolders: [],
    createdFiles: [],
    skippedFiles: [],
    cleanedKeys: [],
    removedNamespaces: []
  };

  // 1. Ensure all language folders exist
  ensureTranslationsStructure(translationsPath, languages);

  // 2. Get all namespaces from source language
  const sourceNamespaces = getNamespaces(translationsPath, sourceLanguage);

  if (!sourceNamespaces.length) {
    return result; // No namespaces to sync
  }

  // 3. Read source translations once
  const sourceTranslations = readTranslations(translationsPath, sourceLanguage);

  // 4. Sync each target language
  const targetLanguages = languages.filter((language) => language !== sourceLanguage);

  for (const language of targetLanguages) {
    const targetTranslations = readTranslations(translationsPath, language);
    const targetNamespaces = getNamespaces(translationsPath, language);

    // 4.1. Remove orphaned namespace files (files that don't exist in source)
    for (const namespace of targetNamespaces) {
      if (!sourceNamespaces.includes(namespace)) {
        const filePath = path.join(translationsPath, language, `${namespace}.json`);
        fs.unlinkSync(filePath);
        result.removedNamespaces.push({
          language,
          namespace,
          path: filePath
        });
      }
    }

    // 4.2. Sync each source namespace
    for (const namespace of sourceNamespaces) {
      const filePath = path.join(translationsPath, language, `${namespace}.json`);
      const sourceFile = sourceTranslations[namespace] || {};

      // Check if file already exists
      if (fs.existsSync(filePath)) {
        // File exists - check for orphaned keys and remove them
        const targetFile = targetTranslations[namespace] || {};
        const orphanedKeys = Object.keys(targetFile).filter((key) => sourceFile[key] === undefined);
        const hasOrphanedKeys = !!orphanedKeys.length;
        const cleanedFile: TranslationFile = {};

        // Only keep keys that exist in source
        for (const key of Object.keys(targetFile)) {
          if (sourceFile[key] !== undefined) {
            cleanedFile[key] = targetFile[key];
          }
        }
        for (const key of orphanedKeys) {
          result.cleanedKeys.push({
            language,
            namespace,
            key
          });
        }

        // Add missing keys with empty values
        for (const key of Object.keys(sourceFile)) {
          if (cleanedFile[key] === undefined) {
            cleanedFile[key] = '';
          }
        }

        // Write the cleaned file if there were orphaned keys
        if (hasOrphanedKeys) {
          writeTranslation(translationsPath, language, namespace, cleanedFile);
        }

        result.skippedFiles.push({
          language,
          namespace,
          reason: hasOrphanedKeys ? 'cleaned orphaned keys' : 'already exists'
        });
        continue;
      }

      // Create empty structure from source
      const emptyStructure = createEmptyTranslationStructure(sourceFile);

      // Write the file
      writeTranslation(translationsPath, language, namespace, emptyStructure);

      result.createdFiles.push({
        language,
        namespace,
        path: filePath
      });
    }
  }

  // Prune source-hash metadata for keys/namespaces no longer in the source,
  // keeping the sidecar file in sync with the translation files.
  if (metadataExists(translationsPath)) {
    const sourceKeysByNamespace: Record<string, Set<string>> = {};
    for (const namespace of sourceNamespaces) {
      sourceKeysByNamespace[namespace] = new Set(Object.keys(sourceTranslations[namespace] || {}));
    }

    const metadata = readMetadata(translationsPath);
    if (pruneMetadata(metadata, sourceKeysByNamespace)) {
      writeMetadata(translationsPath, metadata);
    }
  }

  return result;
}
