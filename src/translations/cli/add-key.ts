import * as path from 'node:path';
import type { TranslationConfig, TranslationEntry } from '../core/types.js';
import {
  getSourceHash,
  hashSourceValue,
  isManuallyEdited,
  readMetadata,
  type TranslationMetadata
} from '../utils/metadata.js';
import { createProvider, type ProviderSetup } from '../utils/provider-factory.js';
import { updateNamespaceContext } from '../utils/source-context.js';
import { printFailures, runTranslations } from '../utils/translation-runner.js';
import { readTranslations, sortKeys, writeTranslation } from '../utils/utils.js';
import { generateTranslationTypes } from './generate-types.js';
import { loadConfig } from './init.js';

interface AddKeyOptions {
  /** Namespace for the translation key */
  namespace: string;
  /** Translation key */
  key: string;
  /** Translation value (English) */
  value: string;
  /** Note for translators about this key, stored in the namespace's $context */
  note?: string;
  /** Description of the namespace, stored in its $context (for a new namespace, or to replace the old one) */
  description?: string;
  /** Auto-translate to all languages */
  autoTranslate?: boolean;
  /** Translation API key for the configured provider */
  apiKey?: string;
}

/**
 * Build the configured provider for `--auto-translate`, or report why it can't
 * run and return undefined so the key is added with empty values instead.
 */
const createOptionalProvider = (
  config: Required<TranslationConfig>,
  apiKey: string | undefined
): ProviderSetup | undefined => {
  try {
    return createProvider(config, { apiKey });
  } catch (error) {
    console.error(`\n⚠ ${error instanceof Error ? error.message : 'Translation provider unavailable'}`);
    console.log('Adding empty values instead.');
    return undefined;
  }
};

/** Add `key` with an empty value to each language that doesn't have it yet */
const addEmptyValues = (
  translationsPath: string,
  languages: string[],
  namespace: string,
  key: string,
  logEach: boolean
): void => {
  for (const language of languages) {
    const entries = readTranslations(translationsPath, language)[namespace] ?? {};

    if (entries[key] !== undefined) {
      if (logEach) {
        console.log(`  - ${language}/${namespace}.json: Already exists`);
      }
      continue;
    }

    writeTranslation(translationsPath, language, namespace, sortKeys({ ...entries, [key]: '' }));
    if (logEach) {
      console.log(`  ✓ ${language}/${namespace}.json`);
    }
  }
};

/**
 * Whether a language needs `key` (re)translated: it is empty, or poly-lexis
 * translated it from a different source value. Hand-edited translations are kept.
 */
const needsTranslation = (
  translationsPath: string,
  metadata: TranslationMetadata,
  language: string,
  namespace: string,
  key: string,
  sourceValue: string
): boolean => {
  const existing = readTranslations(translationsPath, language)[namespace]?.[key];

  if (!existing?.trim()) {
    return true;
  }

  if (isManuallyEdited(metadata, language, namespace, key, existing)) {
    console.log(`  - ${language}: Edited by hand, keeping it`);
    return false;
  }

  const sourceHash = getSourceHash(metadata, language, namespace, key);
  if (sourceHash !== undefined && sourceHash !== hashSourceValue(sourceValue)) {
    console.log(`  - ${language}: Source changed, re-translating`);
    return true;
  }

  console.log(`  - ${language}: Already exists, skipping`);
  return false;
};

/**
 * Add a new translation key to all languages
 */
export async function addTranslationKey(projectRoot: string, options: AddKeyOptions): Promise<void> {
  const config = loadConfig(projectRoot);
  const translationsPath = path.join(projectRoot, config.translationsPath);
  const { namespace, key, value, note, description, autoTranslate = false, apiKey } = options;

  console.log('=====');
  console.log('Adding translation key');
  console.log('=====');
  console.log(`Namespace: ${namespace}`);
  console.log(`Key: ${key}`);
  console.log(`Value (${config.sourceLanguage}): ${value}`);
  if (note) {
    console.log(`Note: ${note}`);
  }
  console.log('=====');

  // Add to source language
  const sourceLanguage = config.sourceLanguage;
  const sourceTranslations = readTranslations(translationsPath, sourceLanguage);

  if (!sourceTranslations[namespace]) {
    sourceTranslations[namespace] = {};
  }

  if (sourceTranslations[namespace][key]) {
    console.log(`⚠ Warning: Key "${key}" already exists in ${namespace}. Updating value.`);
  }

  sourceTranslations[namespace][key] = value;
  const sortedSource = sortKeys(sourceTranslations[namespace]);
  writeTranslation(translationsPath, sourceLanguage, namespace, sortedSource);
  console.log(`✓ Added to ${sourceLanguage}/${namespace}.json`);

  if (note?.trim() || description?.trim()) {
    updateNamespaceContext(translationsPath, sourceLanguage, namespace, {
      description,
      ...(note?.trim() && { keyNotes: { [key]: note } })
    });
    console.log(`✓ Saved context in ${sourceLanguage}/${namespace}.json`);
  }

  // Handle other languages
  const otherLanguages = config.languages.filter((language) => language !== sourceLanguage);
  const setup = autoTranslate ? createOptionalProvider(config, apiKey) : undefined;

  // Every language gets the key first, so it exists even where translating fails
  console.log(setup ? '\nAuto-translating to other languages...' : '\nAdding empty values to other languages...');
  addEmptyValues(translationsPath, otherLanguages, namespace, key, !setup);

  if (setup) {
    const metadata = readMetadata(translationsPath);
    const languagesToTranslate = otherLanguages.filter((language) =>
      needsTranslation(translationsPath, metadata, language, namespace, key, value)
    );

    const result = await runTranslations({
      projectRoot,
      config,
      setup,
      jobs: languagesToTranslate.map((language) => ({ language, namespace, keys: [key] })),
      metadata
    });
    printFailures(result.failed);
  } else if (!autoTranslate) {
    console.log('\nℹ Use --auto-translate flag to automatically translate to all languages');
  }

  console.log('=====');
  console.log('Translation key added successfully!');
  console.log('=====');

  // Automatically generate types
  console.log('\nRegenerating TypeScript types...');
  try {
    generateTranslationTypes(projectRoot);
  } catch (error) {
    console.error('Failed to generate types:', error instanceof Error ? error.message : 'Unknown error');
  }
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
