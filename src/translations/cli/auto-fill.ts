import * as path from 'node:path';
import { DeepLTranslateProvider } from '../utils/deepl-translate-provider.js';
import { GoogleTranslateProvider } from '../utils/google-translate-provider.js';
import { getTranslationProvider, setTranslationProvider, translateText } from '../utils/translator.js';
import { readTranslations, sortKeys, writeTranslation } from '../utils/utils.js';
import { loadConfig } from './init.js';
import { getMissingForLanguage } from './validate.js';

interface AutoFillOptions {
  /** Language to fill translations for */
  language?: string;
  /** Translation API key (for DeepL or Google Translate) */
  apiKey?: string;
  /** Maximum number of translations to process */
  limit?: number;
  /** Delay between translations in milliseconds */
  delayMs?: number;
  /** Dry run - don't actually write translations */
  dryRun?: boolean;
}

/**
 * Automatically fill empty or missing translations for a language
 */
export async function autoFillTranslations(
  projectRoot: string = process.cwd(),
  options: AutoFillOptions = {}
): Promise<void> {
  const config = loadConfig(projectRoot);
  const translationsPath = path.join(projectRoot, config.translationsPath);
  const { apiKey, limit = 1000, delayMs = 100, dryRun = false } = options;

  // Set up the translation provider based on config (only if not already set by user)
  const currentProvider = getTranslationProvider();
  const isDefaultGoogleProvider = currentProvider.constructor.name === 'GoogleTranslateProvider';

  // Only set provider if user hasn't already set a custom one
  if (isDefaultGoogleProvider) {
    const provider = config.provider || 'deepl';
    if (provider === 'deepl') {
      setTranslationProvider(new DeepLTranslateProvider());
    } else {
      setTranslationProvider(new GoogleTranslateProvider());
    }
  }

  if (!apiKey) {
    const provider = config.provider || 'deepl';
    const envVarName = provider === 'google' ? 'GOOGLE_TRANSLATE_API_KEY' : 'DEEPL_API_KEY';
    throw new Error(`Translation API key is required. Set ${envVarName} or pass --api-key`);
  }

  // Determine which languages to process
  const languagesToProcess = options.language
    ? [options.language]
    : config.languages.filter((lang) => lang !== config.sourceLanguage);

  console.log('=====');
  console.log('Auto-filling translations');
  console.log('=====');
  console.log(`Languages: ${languagesToProcess.join(', ')}`);
  console.log(`Limit: ${limit}`);
  console.log(`Dry run: ${dryRun}`);
  console.log('=====');

  let totalProcessed = 0;
  let totalTranslated = 0;

  for (const language of languagesToProcess) {
    if (totalProcessed >= limit) {
      console.log(`\nReached limit of ${limit} translations`);
      break;
    }

    console.log(`\nProcessing language: ${language}`);

    // Get missing and empty translations for this language
    const missing = getMissingForLanguage(projectRoot, language);

    if (missing.length === 0) {
      console.log('  No missing or empty translations');
      continue;
    }

    console.log(`  Found ${missing.length} translations to fill`);

    // Process up to the remaining limit
    const remainingLimit = limit - totalProcessed;
    const itemsToProcess = missing.slice(0, remainingLimit);

    for (const item of itemsToProcess) {
      totalProcessed++;

      try {
        console.log(`  [${totalProcessed}/${limit}] Translating ${item.namespace}.${item.key}`);
        console.log(`    EN: "${item.sourceValue}"`);

        // Translate the text
        const translated = await translateText(item.sourceValue, language, config.sourceLanguage, apiKey);
        console.log(`    ${language.toUpperCase()}: "${translated}"`);

        if (!dryRun) {
          // Read current translations
          const translations = readTranslations(translationsPath, language);

          if (!translations[item.namespace]) {
            translations[item.namespace] = {};
          }

          // Update the translation
          translations[item.namespace][item.key] = translated;
          const sorted = sortKeys(translations[item.namespace]);

          // Write back
          writeTranslation(translationsPath, language, item.namespace, sorted);
          console.log('    ✓ Saved');
        } else {
          console.log('    ✓ Dry run - not saved');
        }

        totalTranslated++;

        // Delay to avoid rate limiting
        if (delayMs > 0 && totalProcessed < limit) {
          await new Promise((resolve) => setTimeout(resolve, delayMs));
        }
      } catch (error) {
        console.error(`    ✗ Error: ${error instanceof Error ? error.message : 'Unknown error'}`);
      }
    }
  }

  console.log('\n=====');
  console.log(`Total processed: ${totalProcessed}`);
  console.log(`Total translated: ${totalTranslated}`);
  if (dryRun) {
    console.log('⚠ Dry run - no changes were saved');
  }
  console.log('=====');
}

/**
 * Fill translations for a specific namespace and language
 */
export async function fillNamespace(
  projectRoot: string,
  language: string,
  namespace: string,
  apiKey: string
): Promise<void> {
  const config = loadConfig(projectRoot);
  const translationsPath = path.join(projectRoot, config.translationsPath);

  // Set up the translation provider based on config (only if not already set by user)
  const currentProvider = getTranslationProvider();
  const isDefaultGoogleProvider = currentProvider.constructor.name === 'GoogleTranslateProvider';

  // Only set provider if user hasn't already set a custom one
  if (isDefaultGoogleProvider) {
    const provider = config.provider || 'deepl';
    if (provider === 'deepl') {
      setTranslationProvider(new DeepLTranslateProvider());
    } else {
      setTranslationProvider(new GoogleTranslateProvider());
    }
  }

  console.log(`Filling translations for ${language}/${namespace}.json`);

  // Read source and target translations
  const sourceTranslations = readTranslations(translationsPath, config.sourceLanguage);
  const targetTranslations = readTranslations(translationsPath, language);

  const sourceKeys = sourceTranslations[namespace] || {};
  const targetKeys = targetTranslations[namespace] || {};

  let count = 0;

  for (const [key, sourceValue] of Object.entries(sourceKeys)) {
    const targetValue = targetKeys[key];

    // Skip if already has value
    if (targetValue && targetValue.trim() !== '') {
      continue;
    }

    console.log(`  Translating ${key}...`);
    const translated = await translateText(sourceValue, language, config.sourceLanguage, apiKey);
    targetKeys[key] = translated;
    count++;

    // Small delay
    await new Promise((resolve) => setTimeout(resolve, 100));
  }

  // Write back
  if (count > 0) {
    const sorted = sortKeys(targetKeys);
    writeTranslation(translationsPath, language, namespace, sorted);
    console.log(`✓ Filled ${count} translations`);
  } else {
    console.log('No translations to fill');
  }
}
