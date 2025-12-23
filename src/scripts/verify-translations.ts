#!/usr/bin/env node
import { validateTranslations } from '../translations/cli/validate.js';

/**
 * Script to verify that all translations have no missing keys
 * Exits with error code 1 if there are any missing or empty translations
 * This is useful for CI/CD pipelines to ensure translation completeness
 */
function verifyTranslations(): void {
  const projectRoot = process.cwd();

  try {
    const result = validateTranslations(projectRoot);

    if (!result.valid) {
      console.error('\n❌ Translation verification failed!');
      console.error(
        `Found ${result.missing.length} missing translations, ${result.empty.length} empty translations, and ${result.orphaned.length} orphaned translations.`
      );
      console.error('Please fix these issues before proceeding.\n');
      process.exit(1);
    }

    console.log('\n✅ All translations verified successfully!');
    process.exit(0);
  } catch (error) {
    console.error('\n❌ Error during translation verification:');
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  }
}

verifyTranslations();
