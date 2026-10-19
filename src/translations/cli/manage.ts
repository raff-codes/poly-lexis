import * as fs from 'node:fs';
import * as path from 'node:path';
import { ProviderUnavailableError } from '../utils/provider-factory.js';
import { syncTranslationStructure } from '../utils/utils.js';
import { autoFillTranslations } from './auto-fill.js';
import { generateTranslationTypes } from './generate-types.js';
import { initTranslations, loadConfig } from './init.js';
import { ensureBaselineMetadata, validateTranslations } from './validate.js';

/** Translation requests run in parallel */
const DEFAULT_CONCURRENCY = 5;
/** Pause between requests for providers that translate one string per request */
const AUTO_FILL_DELAY_MS = 50;

type AutoFillOptions = NonNullable<Parameters<typeof autoFillTranslations>[1]>;

export interface ManageTranslationsOptions {
  /** Auto-fill missing translations */
  autoFill?: boolean;
  /** API key for the configured provider (DeepL, Google Translate or the Claude API) */
  apiKey?: string;
  /** Maximum translations to fill */
  limit?: number;
  /** Number of concurrent translation requests */
  concurrency?: number;
  /** Specific language to process */
  language?: string;
  /** Skip type generation */
  skipTypes?: boolean;
  /** Dry run mode */
  dryRun?: boolean;
  /** Re-translate keys whose source value has changed (stale translations) */
  retranslateChanged?: boolean;
  /** Re-translate every key, regardless of current value */
  force?: boolean;
  /** Also replace translations someone edited by hand */
  includeManualEdits?: boolean;
}

/**
 * Run auto-fill and re-validate afterwards. Returns false when the provider
 * couldn't start (missing key, Claude Code not signed in), so the run carries on.
 */
const runAutoFill = async (
  projectRoot: string,
  options: AutoFillOptions & { totalMissing: number; staleCount: number }
): Promise<boolean> => {
  const { totalMissing, staleCount, ...autoFillOptions } = options;
  try {
    if (autoFillOptions.force) {
      console.log('\n🤖 Force re-translating all keys...\n');
    } else {
      console.log(`\n🤖 Auto-filling ${totalMissing} missing and ${staleCount} changed translations...\n`);
    }
    await autoFillTranslations(projectRoot, autoFillOptions);

    // Re-validate after auto-fill
    if (!autoFillOptions.dryRun) {
      console.log('\n🔍 Re-validating after auto-fill...\n');
      const revalidation = validateTranslations(projectRoot);
      if (revalidation.valid && !revalidation.stale.length) {
        console.log('\n✅ All translations are now complete!\n');
      }
    }
    return true;
  } catch (error) {
    // Only a provider that couldn't start (missing key, Claude Code not signed in) is a skip
    if (!(error instanceof ProviderUnavailableError)) {
      throw error;
    }
    console.log(`\n⚠️  Auto-fill skipped: ${error.message}\n`);
    return false;
  }
};

/**
 * Smart translation management - handles init, validation, auto-fill, and type generation
 * based on the current state of the project
 * @returns true if translations are valid, false otherwise
 */
export async function manageTranslations(
  projectRoot: string = process.cwd(),
  options: ManageTranslationsOptions = {}
): Promise<boolean> {
  const {
    autoFill = false,
    apiKey,
    limit,
    concurrency = DEFAULT_CONCURRENCY,
    language,
    skipTypes = false,
    dryRun = false,
    retranslateChanged = false,
    force = false,
    includeManualEdits = false
  } = options;

  console.log('=====');
  console.log('Translation Management');
  console.log('=====');

  // Step 1: Check if initialized
  const configPath = path.join(projectRoot, '.translationsrc.json');
  const isInitialized = fs.existsSync(configPath);

  if (!isInitialized) {
    console.log('📁 No translation configuration found. Initializing...\n');
    initTranslations(projectRoot);
    console.log('\n✅ Initialization complete!\n');
  } else {
    console.log('✓ Translation structure initialized\n');
  }

  // Step 2: Load config
  const config = loadConfig(projectRoot);
  const translationsPath = path.join(projectRoot, config.translationsPath);

  // Check if source language directory exists
  const sourceLanguagePath = path.join(translationsPath, config.sourceLanguage);
  if (!fs.existsSync(sourceLanguagePath)) {
    console.log(`⚠️  Source language directory not found: ${sourceLanguagePath}`);
    console.log('Please add translation files to the source language directory.\n');
    return false;
  }

  // Step 2.5: Sync translation structure
  console.log('🔄 Synchronizing translation structure...\n');
  const syncResult = syncTranslationStructure(translationsPath, config.languages, config.sourceLanguage);

  if (syncResult.createdFiles.length) {
    console.log(`✓ Created ${syncResult.createdFiles.length} namespace files\n`);
  }

  if (syncResult.removedNamespaces.length) {
    console.log(`✓ Removed ${syncResult.removedNamespaces.length} orphaned namespace files\n`);
  }

  if (syncResult.cleanedKeys.length) {
    console.log(`✓ Removed ${syncResult.cleanedKeys.length} orphaned keys from translation files\n`);
  }

  if (!syncResult.createdFiles.length && !syncResult.cleanedKeys.length && !syncResult.removedNamespaces.length) {
    console.log('✓ Translation structure is already synchronized\n');
  }

  // Step 2.6: Establish a change-tracking baseline for existing translations.
  // Records the current source hash for any already-translated key that isn't
  // tracked yet, so future source changes can be detected. Runs before
  // validation so genuinely stale keys (already tracked) are still flagged.
  if (!dryRun) {
    const baseline = ensureBaselineMetadata(projectRoot);
    if (baseline.recorded) {
      const verb = baseline.created ? 'Created change-tracking baseline for' : 'Added change tracking for';
      console.log(`📌 ${verb} ${baseline.recorded} existing translations\n`);
    }
  }

  // Step 3: Validate translations
  console.log('🔍 Validating translations...\n');
  const validationResult = validateTranslations(projectRoot);

  // Auto-fill should also run when there is nothing missing/empty but the user
  // asked to re-translate changed (stale) keys or to force a full re-translation.
  const hasWorkToFill = !validationResult.valid || force || (retranslateChanged && !!validationResult.stale.length);

  if (validationResult.valid && !validationResult.stale.length) {
    console.log('\n✅ All translations are complete!\n');
  } else if (validationResult.valid) {
    console.log(`\n⚠️  ${validationResult.stale.length} translations may be outdated.\n`);
  }

  // Step 4: Auto-fill if requested
  const autoFillRan =
    hasWorkToFill &&
    autoFill &&
    (await runAutoFill(projectRoot, {
      apiKey,
      limit,
      concurrency,
      language,
      dryRun,
      delayMs: AUTO_FILL_DELAY_MS,
      retranslateChanged,
      force,
      includeManualEdits,
      totalMissing: validationResult.missing.length + validationResult.empty.length + validationResult.orphaned.length,
      staleCount: retranslateChanged ? validationResult.stale.length : 0
    }));

  if (hasWorkToFill && !autoFill && !validationResult.valid) {
    console.log(`\n💡 Tip: Run with --auto-fill to automatically translate missing keys.\n`);
  } else if (hasWorkToFill && !autoFill && validationResult.stale.length) {
    console.log('\n💡 Tip: Run with --auto-fill --retranslate-changed to update outdated translations.\n');
  }

  // Step 5: Generate types
  if (!skipTypes && !dryRun) {
    console.log('📝 Generating TypeScript types...\n');
    generateTranslationTypes(projectRoot);
    console.log('\n✅ Types generated!\n');
  } else if (skipTypes) {
    console.log('⏭️  Skipping type generation (--skip-types)\n');
  } else if (dryRun) {
    console.log('⏭️  Skipping type generation (--dry-run)\n');
  }

  // Summary
  console.log('=====');
  console.log('Summary');
  console.log('=====');
  console.log(`Configuration: ${configPath}`);
  console.log(`Translations: ${translationsPath}`);
  console.log(`Languages: ${config.languages.join(', ')}`);
  console.log(`Source language: ${config.sourceLanguage}`);

  if (!validationResult.valid && !autoFill) {
    console.log(`\n⚠️  ${validationResult.missing.length} missing translations`);
    console.log(`⚠️  ${validationResult.empty.length} empty translations`);
    if (validationResult.orphaned.length) {
      console.log(`⚠️  ${validationResult.orphaned.length} orphaned translations (will be auto-removed on next sync)`);
    }
    if (validationResult.stale.length) {
      console.log(`⚠️  ${validationResult.stale.length} potentially outdated translations`);
    }
    console.log('\nNext steps:');
    console.log('  1. Add missing translations manually, or');
    console.log('  2. Run with --auto-fill to translate automatically');
  } else if (validationResult.valid && validationResult.stale.length && !autoFill) {
    console.log(`\n⚠️  ${validationResult.stale.length} potentially outdated translations`);
    console.log('\nNext steps:');
    console.log('  Run with --auto-fill --retranslate-changed to update them');
  } else if (validationResult.valid) {
    console.log('\n✅ All systems ready!');
  }

  console.log('=====\n');

  // Return validation status (true if valid after all operations)
  if (autoFillRan && !dryRun) {
    // Re-validate to get final status
    const finalValidation = validateTranslations(projectRoot);
    return finalValidation.valid;
  }

  return validationResult.valid;
}
