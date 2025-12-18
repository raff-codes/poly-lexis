import * as fs from 'node:fs';
import * as path from 'node:path';
import { validateLanguages } from '../core/schema.js';
import type { TranslationConfig } from '../core/types.js';
import { DEFAULT_CONFIG, DEFAULT_LANGUAGES } from '../core/types.js';
import { ensureTranslationsStructure, getAvailableLanguages } from '../utils/utils.js';

/**
 * Detect existing translation structure in common locations
 */
export function detectExistingTranslations(projectRoot: string): {
  path: string | null;
  languages: string[];
} {
  const possiblePaths = ['public/static/locales', 'public/locales', 'src/locales', 'locales', 'i18n', 'translations'];

  for (const possiblePath of possiblePaths) {
    const fullPath = path.join(projectRoot, possiblePath);
    if (fs.existsSync(fullPath)) {
      const languages = getAvailableLanguages(fullPath);
      if (languages.length > 0) {
        return { path: possiblePath, languages };
      }
    }
  }

  return { path: null, languages: [] };
}

/**
 * Initialize translation structure for a project
 */
export function initTranslations(projectRoot: string, config: TranslationConfig = {}): void {
  console.log('=====');
  console.log('Initializing translation structure');
  console.log('=====');

  // Detect existing translations
  const existing = detectExistingTranslations(projectRoot);

  let finalConfig = { ...DEFAULT_CONFIG, ...config };

  // Use detected path and languages if found
  if (existing.path && existing.languages.length > 0) {
    console.log(`✓ Detected existing translations at: ${existing.path}`);
    console.log(`✓ Found languages: ${existing.languages.join(', ')}`);

    // Validate detected languages
    const validation = validateLanguages(existing.languages);
    if (!validation.valid) {
      console.log(`⚠️  Warning: Invalid language codes found: ${validation.invalid.join(', ')}`);
      console.log('These languages will be skipped.');
    }

    const validLanguages = existing.languages.filter((lang) => !validation.invalid.includes(lang));

    finalConfig = {
      ...finalConfig,
      translationsPath: existing.path,
      languages: validLanguages.length > 0 ? validLanguages : finalConfig.languages
    };
  }

  const translationsPath = path.join(projectRoot, finalConfig.translationsPath);
  const languages = finalConfig.languages.length > 0 ? finalConfig.languages : [...DEFAULT_LANGUAGES];

  console.log(`Project root: ${projectRoot}`);
  console.log(`Translations path: ${translationsPath}`);
  console.log(`Languages: ${languages.join(', ')}`);
  console.log('=====');

  // Validate languages
  const validation = validateLanguages(languages);
  if (!validation.valid) {
    throw new Error(`Invalid language codes: ${validation.invalid.join(', ')}`);
  }

  // Create directory structure
  ensureTranslationsStructure(translationsPath, languages);

  // Create sample translation files for English (source language)
  const sourceLanguage = finalConfig.sourceLanguage;
  const sourcePath = path.join(translationsPath, sourceLanguage);

  // Create a sample common.json if it doesn't exist
  const commonPath = path.join(sourcePath, 'common.json');
  if (!fs.existsSync(commonPath)) {
    const sampleTranslations = {
      LOADING: 'Loading',
      SAVE: 'Save',
      CANCEL: 'Cancel',
      SUBMIT: 'Submit',
      ERROR: 'Error',
      SUCCESS: 'Success'
    };

    fs.writeFileSync(commonPath, `${JSON.stringify(sampleTranslations, null, 2)}\n`, 'utf-8');
    console.log(`Created sample file: ${commonPath}`);
  }

  // Create empty translation files for other languages
  for (const lang of languages) {
    if (lang === sourceLanguage) continue;

    const langCommonPath = path.join(translationsPath, lang, 'common.json');
    if (!fs.existsSync(langCommonPath)) {
      fs.writeFileSync(langCommonPath, '{}\n', 'utf-8');
      console.log(`Created empty file: ${langCommonPath}`);
    }
  }

  // Create config file with schema reference
  const configPath = path.join(projectRoot, '.translationsrc.json');
  if (!fs.existsSync(configPath)) {
    const configContent = {
      $schema: './node_modules/poly-lexis/dist/translations/core/translations-config.schema.json',
      translationsPath: finalConfig.translationsPath,
      languages,
      sourceLanguage,
      typesOutputPath: finalConfig.typesOutputPath
    };

    fs.writeFileSync(configPath, `${JSON.stringify(configContent, null, 2)}\n`, 'utf-8');
    console.log(`Created config file: ${configPath}`);
  }

  console.log('=====');
  console.log('Translation structure initialized successfully!');
  console.log('=====');
}

/**
 * Load translation configuration from .translationsrc.json
 */
export function loadConfig(projectRoot: string): Required<TranslationConfig> {
  const configPath = path.join(projectRoot, '.translationsrc.json');

  if (!fs.existsSync(configPath)) {
    // Try to detect existing translations
    const existing = detectExistingTranslations(projectRoot);
    if (existing.path && existing.languages.length > 0) {
      console.log(`ℹ️  No config found, but detected translations at ${existing.path}`);
      return {
        ...DEFAULT_CONFIG,
        translationsPath: existing.path,
        languages: existing.languages
      };
    }
    return DEFAULT_CONFIG;
  }

  const configContent = fs.readFileSync(configPath, 'utf-8');
  const config = JSON.parse(configContent) as TranslationConfig;

  // Validate languages in config
  if (config.languages) {
    const validation = validateLanguages(config.languages);
    if (!validation.valid) {
      console.warn(`⚠️  Warning: Invalid language codes in config: ${validation.invalid.join(', ')}`);
      console.warn('Please update .translationsrc.json with valid language codes.');
    }
  }

  return { ...DEFAULT_CONFIG, ...config };
}
