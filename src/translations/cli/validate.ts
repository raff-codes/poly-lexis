import * as path from 'node:path';
import type { MissingTranslation, OrphanedTranslation, StaleTranslation, ValidationResult } from '../core/types.js';
import { getSourceHash, hashSourceValue, readMetadata } from '../utils/metadata.js';
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
  const stale: StaleTranslation[] = [];

  // Read source translations
  const sourceTranslations = readTranslations(translationsPath, sourceLanguage);
  const sourceNamespaces = getNamespaces(translationsPath, sourceLanguage);

  // Read source-hash metadata to detect translations made stale by source changes
  const metadata = readMetadata(translationsPath);

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
        // Stale translation: source value changed since this translation was written.
        // Only detectable when a source hash was recorded for this key.
        else if (typeof targetValue === 'string') {
          const recordedHash = getSourceHash(metadata, language, namespace, key);
          if (recordedHash !== undefined && recordedHash !== hashSourceValue(sourceValue)) {
            stale.push({
              namespace,
              key,
              language,
              sourceValue,
              currentValue: targetValue
            });
          }
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

  // Stale translations are surfaced as a warning and do not, on their own,
  // make the translation set invalid (the keys are still present and non-empty).
  const valid = !missing.length && !empty.length && !orphaned.length;

  if (valid && !stale.length) {
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

    if (stale.length > 0) {
      console.log(
        `\n⚠ Found ${stale.length} potentially outdated translations (source value changed since translation):`
      );
      for (const item of stale.slice(0, 10)) {
        console.log(`  ${item.language}/${item.namespace}.json -> ${item.key}`);
      }
      if (stale.length > 10) {
        console.log(`  ... and ${stale.length - 10} more`);
      }
      console.log('  Run auto-fill with --retranslate-changed to update them.');
    }
  }

  console.log('=====');

  return { valid, missing, empty, orphaned, stale };
}

export type FillableType = 'missing' | 'empty' | 'stale';

export interface GetMissingOptions {
  /** Also include translations whose source value has changed (stale) */
  includeStale?: boolean;
}

/**
 * Get all missing or empty translations for a specific language.
 * When `includeStale` is set, also returns translations whose source value has
 * changed since they were written (so they can be re-translated).
 */
export function getMissingForLanguage(
  projectRoot: string,
  language: string,
  options: GetMissingOptions = {}
): Array<MissingTranslation & { type: FillableType }> {
  const result = validateTranslations(projectRoot);
  const items: Array<MissingTranslation & { type: FillableType }> = [
    ...result.missing.filter((m) => m.language === language).map((m) => ({ ...m, type: 'missing' as const })),
    ...result.empty.filter((e) => e.language === language).map((e) => ({ ...e, type: 'empty' as const }))
  ];

  if (options.includeStale) {
    items.push(
      ...result.stale
        .filter((s) => s.language === language)
        .map((s) => ({
          namespace: s.namespace,
          key: s.key,
          language: s.language,
          sourceValue: s.sourceValue,
          type: 'stale' as const
        }))
    );
  }

  return items;
}
