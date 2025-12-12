import * as path from 'node:path';
import type { TranslationEntry } from '../core/types.js';
import { translateText } from '../utils/translator.js';
import { readTranslations, sortKeys, writeTranslation } from '../utils/utils.js';
import { loadConfig } from './init.js';

interface AddKeyOptions {
  /** Namespace for the translation key */
  namespace: string;
  /** Translation key */
  key: string;
  /** Translation value (English) */
  value: string;
  /** Auto-translate to all languages */
  autoTranslate?: boolean;
  /** Google Translate API key */
  apiKey?: string;
}

/**
 * Add a new translation key to all languages
 */
export async function addTranslationKey(projectRoot: string, options: AddKeyOptions): Promise<void> {
  const config = loadConfig(projectRoot);
  const translationsPath = path.join(projectRoot, config.translationsPath);
  const { namespace, key, value, autoTranslate = false, apiKey } = options;

  console.log('=====');
  console.log('Adding translation key');
  console.log('=====');
  console.log(`Namespace: ${namespace}`);
  console.log(`Key: ${key}`);
  console.log(`Value (${config.sourceLanguage}): ${value}`);
  console.log('=====');

  // Add to source language
  const sourceLang = config.sourceLanguage;
  const sourceTranslations = readTranslations(translationsPath, sourceLang);

  if (!sourceTranslations[namespace]) {
    sourceTranslations[namespace] = {};
  }

  if (sourceTranslations[namespace][key]) {
    console.log(`⚠ Warning: Key "${key}" already exists in ${namespace}. Updating value.`);
  }

  sourceTranslations[namespace][key] = value;
  const sortedSource = sortKeys(sourceTranslations[namespace]);
  writeTranslation(translationsPath, sourceLang, namespace, sortedSource);
  console.log(`✓ Added to ${sourceLang}/${namespace}.json`);

  // Handle other languages
  const otherLanguages = config.languages.filter((lang) => lang !== sourceLang);

  if (autoTranslate && apiKey) {
    console.log('\nAuto-translating to other languages...');

    for (const lang of otherLanguages) {
      try {
        const targetTranslations = readTranslations(translationsPath, lang);

        if (!targetTranslations[namespace]) {
          targetTranslations[namespace] = {};
        }

        // Only translate if key doesn't exist or is empty
        if (!targetTranslations[namespace][key] || targetTranslations[namespace][key].trim() === '') {
          const translated = await translateText(value, lang, sourceLang, apiKey);
          targetTranslations[namespace][key] = translated;
          const sorted = sortKeys(targetTranslations[namespace]);
          writeTranslation(translationsPath, lang, namespace, sorted);
          console.log(`  ✓ ${lang}: "${translated}"`);

          // Small delay to avoid rate limiting
          await new Promise((resolve) => setTimeout(resolve, 100));
        } else {
          console.log(`  - ${lang}: Already exists, skipping`);
        }
      } catch (error) {
        console.error(`  ✗ ${lang}: Translation failed - ${error instanceof Error ? error.message : 'Unknown error'}`);
      }
    }
  } else {
    // Add empty string to other languages
    console.log('\nAdding empty values to other languages...');

    for (const lang of otherLanguages) {
      const targetTranslations = readTranslations(translationsPath, lang);

      if (!targetTranslations[namespace]) {
        targetTranslations[namespace] = {};
      }

      // Only add if key doesn't exist
      if (!targetTranslations[namespace][key]) {
        targetTranslations[namespace][key] = '';
        const sorted = sortKeys(targetTranslations[namespace]);
        writeTranslation(translationsPath, lang, namespace, sorted);
        console.log(`  ✓ ${lang}/${namespace}.json`);
      } else {
        console.log(`  - ${lang}/${namespace}.json: Already exists`);
      }
    }

    if (!autoTranslate) {
      console.log('\nℹ Use --auto-translate flag to automatically translate to all languages');
    }
  }

  console.log('=====');
  console.log('Translation key added successfully!');
  console.log('=====');
}

/**
 * Add multiple translation keys at once
 */
export async function addTranslationKeys(
  projectRoot: string,
  entries: TranslationEntry[],
  autoTranslate: boolean = false,
  apiKey?: string
): Promise<void> {
  console.log(`Adding ${entries.length} translation keys...`);

  for (const entry of entries) {
    await addTranslationKey(projectRoot, {
      namespace: entry.namespace,
      key: entry.key,
      value: entry.value,
      autoTranslate,
      apiKey
    });
  }
}
