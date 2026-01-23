import * as fs from 'node:fs';
import * as path from 'node:path';
import type { TranslationFile, TranslationFiles } from '../core/types.js';

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
export function flattenObject(obj: NestedTranslationFile, prefix = ''): TranslationFile {
  const result: TranslationFile = {};

  for (const [key, value] of Object.entries(obj)) {
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
export function unflattenObject(obj: TranslationFile): NestedTranslationFile {
  const result: NestedTranslationFile = {};

  for (const [key, value] of Object.entries(obj)) {
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
export function isNestedObject(obj: Record<string, unknown>): boolean {
  return Object.values(obj).some((value) => typeof value === 'object' && value !== null);
}

/**
 * Read all translation files for a specific language
 * Automatically flattens nested structures into dot notation
 */
export function readTranslations(translationsPath: string, language: string): TranslationFiles {
  const langPath = path.join(translationsPath, language);

  if (!fs.existsSync(langPath)) {
    return {};
  }

  const files = fs.readdirSync(langPath).filter((f) => f.endsWith('.json'));
  const translations: TranslationFiles = {};

  for (const file of files) {
    const namespace = path.basename(file, '.json');
    const filePath = path.join(langPath, file);
    const content = fs.readFileSync(filePath, 'utf-8');
    const parsed = JSON.parse(content) as NestedTranslationFile;

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
 * Write translation file for a specific language and namespace
 */
export function writeTranslation(
  translationsPath: string,
  language: string,
  namespace: string,
  translations: TranslationFile
): void {
  const langPath = path.join(translationsPath, language);

  if (!fs.existsSync(langPath)) {
    fs.mkdirSync(langPath, { recursive: true });
  }

  const filePath = path.join(langPath, `${namespace}.json`);
  fs.writeFileSync(filePath, `${JSON.stringify(translations, null, 2)}\n`, 'utf-8');
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
  const langPath = path.join(translationsPath, language);

  if (!fs.existsSync(langPath)) {
    return [];
  }

  return fs
    .readdirSync(langPath)
    .filter((f) => f.endsWith('.json'))
    .map((f) => path.basename(f, '.json'));
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

  return sourceVars.every((v, i) => v === translatedVars[i]);
}

/**
 * Sort object keys alphabetically
 */
export function sortKeys<T extends Record<string, unknown>>(obj: T): T {
  const sorted = {} as T;
  const keys = Object.keys(obj).sort();
  for (const key of keys) {
    sorted[key as keyof T] = obj[key as keyof T];
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

  for (const lang of languages) {
    const langPath = path.join(translationsPath, lang);
    if (!fs.existsSync(langPath)) {
      fs.mkdirSync(langPath, { recursive: true });
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

export interface SyncResult {
  createdFolders: string[];
  createdFiles: Array<{ language: string; namespace: string; path: string }>;
  skippedFiles: Array<{ language: string; namespace: string; reason: string }>;
  cleanedKeys: Array<{ language: string; namespace: string; key: string }>;
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
  const targetLanguages = languages.filter((lang) => lang !== sourceLanguage);

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
        let hasOrphanedKeys = false;
        const cleanedFile: TranslationFile = {};

        // Only keep keys that exist in source
        for (const key of Object.keys(targetFile)) {
          if (sourceFile[key] !== undefined) {
            cleanedFile[key] = targetFile[key];
          } else {
            // Orphaned key found
            hasOrphanedKeys = true;
            result.cleanedKeys.push({
              language,
              namespace,
              key
            });
          }
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

  return result;
}
