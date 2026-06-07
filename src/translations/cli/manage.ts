import * as fs from 'node:fs';
import * as path from 'node:path';
import { syncTranslationStructure } from '../utils/utils.js';
import { autoFillTranslations } from './auto-fill.js';
import { generateTranslationTypes } from './generate-types.js';
import { initTranslations, loadConfig } from './init.js';
import { validateTranslations } from './validate.js';

export interface ManageTranslationsOptions {
  /** Auto-fill missing translations */
  autoFill?: boolean;
  /** Google Translate API key for auto-fill */
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
}

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
    concurrency = 5,
    language,
    skipTypes = false,
    dryRun = false,
    retranslateChanged = false,
    force = false
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
  const sourceLangPath = path.join(translationsPath, config.sourceLanguage);
  if (!fs.existsSync(sourceLangPath)) {
    console.log(`⚠️  Source language directory not found: ${sourceLangPath}`);
    console.log('Please add translation files to the source language directory.\n');
    return false;
  }

  // Step 2.5: Sync translation structure
  console.log('🔄 Synchronizing translation structure...\n');
  const syncResult = syncTranslationStructure(translationsPath, config.languages, config.sourceLanguage);

  if (syncResult.createdFiles.length > 0) {
    console.log(`✓ Created ${syncResult.createdFiles.length} namespace files\n`);
  }

  if (syncResult.removedNamespaces.length > 0) {
    console.log(`✓ Removed ${syncResult.removedNamespaces.length} orphaned namespace files\n`);
  }

  if (syncResult.cleanedKeys.length > 0) {
    console.log(`✓ Removed ${syncResult.cleanedKeys.length} orphaned keys from translation files\n`);
  }

  if (
    syncResult.createdFiles.length === 0 &&
    syncResult.cleanedKeys.length === 0 &&
    syncResult.removedNamespaces.length === 0
  ) {
    console.log('✓ Translation structure is already synchronized\n');
  }

  // Step 3: Validate translations
  console.log('🔍 Validating translations...\n');
  const validationResult = validateTranslations(projectRoot);

  // Auto-fill should also run when there is nothing missing/empty but the user
  // asked to re-translate changed (stale) keys or to force a full re-translation.
  const hasWorkToFill = !validationResult.valid || force || (retranslateChanged && validationResult.stale.length > 0);

  if (validationResult.valid && !validationResult.stale.length) {
    console.log('\n✅ All translations are complete!\n');
  } else if (validationResult.valid) {
    console.log(`\n⚠️  ${validationResult.stale.length} translations may be outdated.\n`);
  }

  if (hasWorkToFill) {
    const totalMissing =
      validationResult.missing.length + validationResult.empty.length + validationResult.orphaned.length;

    // Step 4: Auto-fill if requested
    if (autoFill) {
      if (!apiKey) {
        const provider = config.provider || 'deepl';
        const envVarName = provider === 'google' ? 'GOOGLE_TRANSLATE_API_KEY' : 'DEEPL_API_KEY';
        console.log('\n⚠️  Auto-fill requested but no API key provided.');
        console.log(`Set ${envVarName} or pass --api-key to enable auto-fill.\n`);
      } else {
        if (force) {
          console.log('\n🤖 Force re-translating all keys...\n');
        } else {
          const staleCount = retranslateChanged ? validationResult.stale.length : 0;
          console.log(`\n🤖 Auto-filling ${totalMissing} missing and ${staleCount} changed translations...\n`);
        }
        await autoFillTranslations(projectRoot, {
          apiKey,
          limit,
          concurrency,
          language,
          dryRun,
          delayMs: 50,
          retranslateChanged,
          force
        });

        // Re-validate after auto-fill
        if (!dryRun) {
          console.log('\n🔍 Re-validating after auto-fill...\n');
          const revalidation = validateTranslations(projectRoot);
          if (revalidation.valid && !revalidation.stale.length) {
            console.log('\n✅ All translations are now complete!\n');
          }
        }
      }
    } else if (!validationResult.valid) {
      console.log(`\n💡 Tip: Run with --auto-fill to automatically translate missing keys.\n`);
    } else if (validationResult.stale.length > 0) {
      console.log('\n💡 Tip: Run with --auto-fill --retranslate-changed to update outdated translations.\n');
    }
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
    if (validationResult.orphaned.length > 0) {
      console.log(`⚠️  ${validationResult.orphaned.length} orphaned translations (will be auto-removed on next sync)`);
    }
    if (validationResult.stale.length > 0) {
      console.log(`⚠️  ${validationResult.stale.length} potentially outdated translations`);
    }
    console.log('\nNext steps:');
    console.log('  1. Add missing translations manually, or');
    console.log('  2. Run with --auto-fill to translate automatically');
  } else if (validationResult.valid && validationResult.stale.length > 0 && !autoFill) {
    console.log(`\n⚠️  ${validationResult.stale.length} potentially outdated translations`);
    console.log('\nNext steps:');
    console.log('  Run with --auto-fill --retranslate-changed to update them');
  } else if (validationResult.valid) {
    console.log('\n✅ All systems ready!');
  }

  console.log('=====\n');

  // Return validation status (true if valid after all operations)
  if (autoFill && !dryRun && apiKey) {
    // Re-validate to get final status
    const finalValidation = validateTranslations(projectRoot);
    return finalValidation.valid;
  }

  return validationResult.valid;
}
