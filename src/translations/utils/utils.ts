import * as fs from 'node:fs';
import * as path from 'node:path';
import type { TranslationFile, TranslationFiles } from '../core/types.js';

/**
 * Read all translation files for a specific language
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
    translations[namespace] = JSON.parse(content) as TranslationFile;
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
  fs.writeFileSync(filePath, JSON.stringify(translations, null, 2) + '\n', 'utf-8');
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
