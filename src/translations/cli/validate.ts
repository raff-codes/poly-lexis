import * as path from 'node:path';
import type { MissingTranslation, OrphanedTranslation, ValidationResult } from '../core/types.js';
import { getNamespaces, readTranslations, syncTranslationStructure } from '../utils/utils.js';
import { loadConfig } from './init.js';

/**
 * Validate all translations against the source language
 * Checks for missing keys, empty values, and orphaned keys (keys removed from source)
 */
export function validateTranslations(projectRoot: string = process.cwd()): ValidationResult {
  const config = loadConfig(projectRoot);
  const translationsPath = path.join(projectRoot, config.translationsPath);
  const sourceLanguage = config.sourceLanguage;

  const missing: MissingTranslation[] = [];
  const empty: MissingTranslation[] = [];
  const orphaned: OrphanedTranslation[] = [];

  // Read source translations
  const sourceTranslations = readTranslations(translationsPath, sourceLanguage);
  const sourceNamespaces = getNamespaces(translationsPath, sourceLanguage);

  // CRITICAL: Use config languages instead of filesystem languages
  // This ensures we validate ALL configured languages, not just ones on disk
  const languages = config.languages.filter((lang) => lang !== sourceLanguage);

  // Sync structure before validation to ensure all files exist and clean orphaned keys
  const syncResult = syncTranslationStructure(translationsPath, config.languages, sourceLanguage);

  if (syncResult.createdFiles.length > 0) {
    console.log(`Created ${syncResult.createdFiles.length} missing namespace files during sync`);
  }

  if (syncResult.cleanedKeys.length > 0) {
    console.log(`Cleaned ${syncResult.cleanedKeys.length} orphaned keys during sync`);
  }

  console.log('=====');
  console.log('Validating translations');
  console.log('=====');
  console.log(`Source language: ${sourceLanguage}`);
  console.log(`Target languages: ${languages.join(', ')}`);
  console.log(`Namespaces: ${sourceNamespaces.join(', ')}`);
  console.log('=====');

  // Validate each language
  for (const language of languages) {
    const targetTranslations = readTranslations(translationsPath, language);

    // Check each namespace
    for (const namespace of sourceNamespaces) {
      const sourceKeys = sourceTranslations[namespace] || {};
      const targetKeys = targetTranslations[namespace] || {};

      // Check for missing or empty translations
      for (const [key, sourceValue] of Object.entries(sourceKeys)) {
        const targetValue = targetKeys[key];

        // Missing key in target language
        if (targetValue === undefined) {
          missing.push({
            namespace,
            key,
            language,
            sourceValue
          });
        }
        // Empty value in target language
        else if (typeof targetValue === 'string' && targetValue.trim() === '') {
          empty.push({
            namespace,
            key,
            language,
            sourceValue
          });
        }
      }

      // Check for orphaned keys (exist in target but not in source)
      for (const [key, targetValue] of Object.entries(targetKeys)) {
        if (sourceKeys[key] === undefined) {
          orphaned.push({
            namespace,
            key,
            language,
            value: targetValue
          });
        }
      }
    }
  }

  const valid = !missing.length && !empty.length && !orphaned.length;

  if (valid) {
    console.log('✓ All translations are valid!');
  } else {
    if (missing.length > 0) {
      console.log(`\n⚠ Found ${missing.length} missing translations:`);
      for (const item of missing.slice(0, 10)) {
        console.log(`  ${item.language}/${item.namespace}.json -> ${item.key}`);
      }
      if (missing.length > 10) {
        console.log(`  ... and ${missing.length - 10} more`);
      }
    }

    if (empty.length > 0) {
      console.log(`\n⚠ Found ${empty.length} empty translations:`);
      for (const item of empty.slice(0, 10)) {
        console.log(`  ${item.language}/${item.namespace}.json -> ${item.key}`);
      }
      if (empty.length > 10) {
        console.log(`  ... and ${empty.length - 10} more`);
      }
    }

    if (orphaned.length > 0) {
      console.log(`\n⚠ Found ${orphaned.length} orphaned translations (keys removed from source):`);
      for (const item of orphaned.slice(0, 10)) {
        console.log(`  ${item.language}/${item.namespace}.json -> ${item.key}`);
      }
      if (orphaned.length > 10) {
        console.log(`  ... and ${orphaned.length - 10} more`);
      }
    }
  }

  console.log('=====');

  return { valid, missing, empty, orphaned };
}

/**
 * Get all missing or empty translations for a specific language
 */
export function getMissingForLanguage(
  projectRoot: string,
  language: string
): Array<MissingTranslation & { type: 'missing' | 'empty' }> {
  const result = validateTranslations(projectRoot);
  const items = [
    ...result.missing.filter((m) => m.language === language).map((m) => ({ ...m, type: 'missing' as const })),
    ...result.empty.filter((e) => e.language === language).map((e) => ({ ...e, type: 'empty' as const }))
  ];

  return items;
}
