import * as path from 'node:path';
import type { MissingTranslation } from '../core/types.js';
import { isManuallyEdited, readMetadata } from '../utils/metadata.js';
import { createProvider } from '../utils/provider-factory.js';
import { groupIntoJobs, printFailures, runTranslations } from '../utils/translation-runner.js';
import { readTranslations, syncTranslationStructure } from '../utils/utils.js';
import { loadConfig } from './init.js';
import { type FillableType, getMissingForLanguage } from './validate.js';

/** Pause between requests for providers that translate one string per request */
const DEFAULT_DELAY_MS = 50;
/** Translation requests run in parallel */
const DEFAULT_CONCURRENCY = 5;

interface AutoFillOptions {
  /** Language to fill translations for */
  language?: string;
  /** Translation API key for the configured provider (DeepL, Google Translate or the Claude API) */
  apiKey?: string;
  /** Maximum number of translations to process */
  limit?: number;
  /** Delay between translations in milliseconds, for providers that translate one string per request */
  delayMs?: number;
  /** Dry run - don't actually write translations */
  dryRun?: boolean;
  /** Number of concurrent translation requests (default: 5) */
  concurrency?: number;
  /** Re-translate keys whose source value has changed since they were written */
  retranslateChanged?: boolean;
  /** Re-translate every key, even ones that already have an up-to-date value */
  force?: boolean;
  /** Also re-translate keys someone has edited by hand since poly-lexis wrote them */
  includeManualEdits?: boolean;
}

interface FillItemOptions {
  retranslateChanged?: boolean;
  force?: boolean;
}

/** How the run picks keys, for the summary header */
const describeMode = (force: boolean, retranslateChanged: boolean): string => {
  if (force) {
    return 'all keys (--force)';
  }
  return retranslateChanged ? 'missing, empty & changed' : 'missing & empty';
};

/**
 * Determine which keys to (re-)translate for a language.
 * - Default: missing and empty keys.
 * - `retranslateChanged`: also include keys whose source value has changed.
 * - `force`: every source key, regardless of current value.
 */
function getFillItemsForLanguage(
  projectRoot: string,
  translationsPath: string,
  sourceLanguage: string,
  language: string,
  options: FillItemOptions
): Array<MissingTranslation & { type: FillableType | 'forced' }> {
  if (options.force) {
    const sourceTranslations = readTranslations(translationsPath, sourceLanguage);
    const items: Array<MissingTranslation & { type: 'forced' }> = [];

    for (const [namespace, keys] of Object.entries(sourceTranslations)) {
      for (const [key, sourceValue] of Object.entries(keys)) {
        items.push({ namespace, key, language, sourceValue, type: 'forced' });
      }
    }

    return items;
  }

  return getMissingForLanguage(projectRoot, language, { includeStale: options.retranslateChanged });
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
  const {
    apiKey,
    limit = Infinity,
    delayMs = DEFAULT_DELAY_MS,
    dryRun = false,
    concurrency = DEFAULT_CONCURRENCY,
    retranslateChanged = false,
    force = false,
    includeManualEdits = false
  } = options;

  // Throws with what to set when the configured provider can't run
  const setup = createProvider(config, { apiKey, concurrency, delayMs });

  // Determine which languages to process
  const languagesToProcess = options.language
    ? [options.language]
    : config.languages.filter((language) => language !== config.sourceLanguage);

  // Sync structure before auto-filling to ensure all files exist
  console.log('🔄 Synchronizing translation structure...');
  const syncResult = syncTranslationStructure(translationsPath, config.languages, config.sourceLanguage);

  if (syncResult.createdFiles.length) {
    console.log(`Created ${syncResult.createdFiles.length} namespace files\n`);
  }

  const mode = describeMode(force, retranslateChanged);
  const providerLabel = setup.provider.model ? `${setup.provider.name} (${setup.provider.model})` : setup.provider.name;

  console.log('=====');
  console.log('Auto-filling translations');
  console.log('=====');
  console.log(`Provider: ${providerLabel}${setup.fallback ? `, falling back to ${setup.fallback.name}` : ''}`);
  console.log(`Languages: ${languagesToProcess.join(', ')}`);
  console.log(`Mode: ${mode}`);
  console.log(`Limit: ${limit === Infinity ? 'unlimited' : limit}`);
  console.log(`Concurrency: ${concurrency}`);
  console.log(`Dry run: ${dryRun}`);
  console.log('=====');

  // Source-hash metadata is updated and saved as each namespace is written so
  // future runs can detect when a source string changes again.
  const metadata = readMetadata(translationsPath);
  const selected: Array<{ language: string; namespace: string; key: string }> = [];
  let skippedManual = 0;

  for (const language of languagesToProcess) {
    if (selected.length >= limit) {
      console.log(`\nReached limit of ${limit} translations`);
      break;
    }

    const targetTranslations = readTranslations(translationsPath, language);
    const items = getFillItemsForLanguage(projectRoot, translationsPath, config.sourceLanguage, language, {
      retranslateChanged,
      force
    }).filter((item) => {
      // Missing and empty keys always need a value; replacing a hand-edited one needs opting in
      const current = targetTranslations[item.namespace]?.[item.key];
      const keep =
        item.type === 'missing' ||
        item.type === 'empty' ||
        includeManualEdits ||
        current === undefined ||
        !isManuallyEdited(metadata, language, item.namespace, item.key, current);
      if (!keep) {
        skippedManual++;
      }
      return keep;
    });

    console.log(`\n${language}: ${items.length ? `${items.length} translations to fill` : 'nothing to translate'}`);
    selected.push(...items.slice(0, limit - selected.length));
  }

  if (skippedManual) {
    console.log(
      `\nℹ Skipped ${skippedManual} translations edited by hand (use --include-manual-edits to replace them)`
    );
  }

  const result = await runTranslations({
    projectRoot,
    config,
    setup,
    jobs: groupIntoJobs(selected),
    metadata,
    dryRun,
    concurrency
  });

  printFailures(result.failed);

  console.log('\n=====');
  console.log(`Total processed: ${selected.length}`);
  console.log(`Total translated: ${result.translated.length}`);
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
  apiKey?: string
): Promise<void> {
  const config = loadConfig(projectRoot);
  const translationsPath = path.join(projectRoot, config.translationsPath);
  const setup = createProvider(config, { apiKey });

  console.log(`Filling translations for ${language}/${namespace}.json`);

  const sourceKeys = readTranslations(translationsPath, config.sourceLanguage)[namespace] || {};
  const targetKeys = readTranslations(translationsPath, language)[namespace] || {};
  const keys = Object.keys(sourceKeys).filter((key) => !targetKeys[key]?.trim());

  if (!keys.length) {
    console.log('No translations to fill');
    return;
  }

  const metadata = readMetadata(translationsPath);
  const result = await runTranslations({
    projectRoot,
    config,
    setup,
    jobs: [{ language, namespace, keys }],
    metadata
  });

  printFailures(result.failed);
  console.log(`✓ Filled ${result.translated.length} translations`);
}
