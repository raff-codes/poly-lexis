import { execSync } from 'node:child_process';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { getNamespaces, readTranslations } from '../utils/utils.js';
import { loadConfig } from './init.js';

const PLURAL_SUFFIXES = ['_zero', '_one', '_two', '_few', '_many', '_other'] as const;

/**
 * Extract base keys from plural-suffixed keys (e.g., "items_one" -> "items")
 * Follows CLDR plural categories used by i18next and similar libraries.
 */
export function extractPluralBaseKeys(keys: string[]): string[] {
  const keySet = new Set(keys);
  const baseKeys = new Set<string>();

  for (const key of keys) {
    for (const suffix of PLURAL_SUFFIXES) {
      if (key.endsWith(suffix)) {
        const baseKey = key.slice(0, -suffix.length);
        if (baseKey && !keySet.has(baseKey)) {
          baseKeys.add(baseKey);
        }
        break;
      }
    }
  }

  return Array.from(baseKeys);
}

const typeTemplate = (translationKeys: string[], namespaceKeys: string[]): string => `
  export const translationKeys = [${translationKeys.map((key) => `"${key}"`).join(', ')}] as const;
  export const namespaceKeys = [${namespaceKeys.map((key) => `"${key}"`).join(', ')}] as const;

  export type TranslationKey = typeof translationKeys[number];
  export type TranslationNamespace = typeof namespaceKeys[number];
`;

/**
 * Generate TypeScript types from translation files
 */
export function generateTranslationTypes(projectRoot: string = process.cwd()): void {
  console.log('=====');
  console.time('i18n types generated');
  console.log('Generating i18n types');
  console.log('=====');

  const config = loadConfig(projectRoot);
  const translationsPath = path.join(projectRoot, config.translationsPath);
  const sourceLanguage = config.sourceLanguage;
  const outputFilePath = path.join(projectRoot, config.typesOutputPath);

  const dirPath = path.join(translationsPath, sourceLanguage);

  // Check if the source language directory exists
  if (!fs.existsSync(dirPath)) {
    throw new Error(`Source language directory not found: ${dirPath}`);
  }

  // Get namespaces
  const namespaces = getNamespaces(translationsPath, sourceLanguage);

  if (!namespaces.length) {
    throw new Error(`No translation files found in ${dirPath}`);
  }

  // Read all translation files and collect keys
  const translations = readTranslations(translationsPath, sourceLanguage);
  let allKeys: string[] = [];

  for (const namespace of namespaces) {
    const keys = Object.keys(translations[namespace] || {});
    allKeys = allKeys.concat(keys);
  }

  // Add base keys for plural-suffixed keys (e.g., "items_one" -> also generates "items")
  const pluralBaseKeys = extractPluralBaseKeys(allKeys);
  allKeys = allKeys.concat(pluralBaseKeys);

  // Ensure the output directory exists
  const outputDir = path.dirname(outputFilePath);
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }

  const typeString = typeTemplate(allKeys, namespaces);
  fs.writeFileSync(outputFilePath, typeString, 'utf8');

  console.log(`Generated types with ${allKeys.length} keys and ${namespaces.length} namespaces`);
  console.log(`Output: ${outputFilePath}`);

  // Format with Biome
  try {
    execSync(`pnpm biome format --write ${outputFilePath}`, {
      stdio: 'inherit',
      cwd: projectRoot
    });
  } catch {
    console.warn('Failed to format with Biome, continuing without formatting...');
  }

  console.timeEnd('i18n types generated');
  console.log('=====');
}
