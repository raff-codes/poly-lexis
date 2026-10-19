import * as fs from 'node:fs';
import * as path from 'node:path';
import { FALLBACK_PROVIDERS, TRANSLATION_PROVIDERS, validateLanguages } from '../core/schema.js';
import type { TranslationConfig } from '../core/types.js';
import { DEFAULT_CONFIG, DEFAULT_LANGUAGES } from '../core/types.js';
import { ensureTranslationsStructure, getAvailableLanguages, syncTranslationStructure } from '../utils/utils.js';

const CONFIG_FILE_NAME = '.translationsrc.json';

/** Locations checked, in order, for an existing translations directory */
const COMMON_TRANSLATION_PATHS = [
  'public/static/locales',
  'public/locales',
  'src/locales',
  'locales',
  'i18n',
  'translations'
];

/** Written to `<source>/common.json` when a project has no translations yet */
const SAMPLE_TRANSLATIONS = {
  LOADING: 'Loading',
  SAVE: 'Save',
  CANCEL: 'Cancel',
  SUBMIT: 'Submit',
  ERROR: 'Error',
  SUCCESS: 'Success'
};

const STRING_FIELDS = ['translationsPath', 'sourceLanguage', 'typesOutputPath', 'context', 'glossary'] as const;
const STRING_ARRAY_FIELDS = ['languages', 'searchPaths', 'searchExtensions', 'protectedTerms'] as const;
const BOOLEAN_FIELDS = ['useFallbackLanguages', 'contextRequired'] as const;
const OBJECT_FIELDS = ['languageSettings', 'claude'] as const;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/**
 * Check the shape of a parsed .translationsrc.json. Throws naming the field and
 * what it should be; unknown fields (such as `$schema`) are kept as they are.
 */
function parseConfig(raw: unknown, configPath: string): TranslationConfig {
  if (!isRecord(raw)) {
    throw new Error(`${configPath} must contain a JSON object`);
  }

  for (const field of STRING_FIELDS) {
    if (raw[field] !== undefined && typeof raw[field] !== 'string') {
      throw new Error(`${configPath}: "${field}" must be a string`);
    }
  }
  for (const field of STRING_ARRAY_FIELDS) {
    const value = raw[field];
    if (value !== undefined && (!Array.isArray(value) || value.some((item) => typeof item !== 'string'))) {
      throw new Error(`${configPath}: "${field}" must be an array of strings`);
    }
  }
  for (const field of BOOLEAN_FIELDS) {
    if (raw[field] !== undefined && typeof raw[field] !== 'boolean') {
      throw new Error(`${configPath}: "${field}" must be true or false`);
    }
  }
  for (const field of OBJECT_FIELDS) {
    if (raw[field] !== undefined && !isRecord(raw[field])) {
      throw new Error(`${configPath}: "${field}" must be an object`);
    }
  }
  if (raw.keyRoles !== undefined && !Array.isArray(raw.keyRoles)) {
    throw new Error(`${configPath}: "keyRoles" must be an array of { "pattern", "role" } objects`);
  }
  if (raw.provider !== undefined && !TRANSLATION_PROVIDERS.includes(raw.provider as never)) {
    throw new Error(`${configPath}: "provider" must be one of: ${TRANSLATION_PROVIDERS.join(', ')}`);
  }
  if (
    raw.fallbackProvider !== undefined &&
    raw.fallbackProvider !== null &&
    !FALLBACK_PROVIDERS.includes(raw.fallbackProvider as never)
  ) {
    throw new Error(`${configPath}: "fallbackProvider" must be null or one of: ${FALLBACK_PROVIDERS.join(', ')}`);
  }

  return raw as TranslationConfig;
}

/**
 * Detect existing translation structure in common locations
 */
export function detectExistingTranslations(projectRoot: string): {
  path: string | null;
  languages: string[];
} {
  for (const possiblePath of COMMON_TRANSLATION_PATHS) {
    const fullPath = path.join(projectRoot, possiblePath);
    if (!fs.existsSync(fullPath)) continue;

    const languages = getAvailableLanguages(fullPath);
    if (languages.length) {
      return { path: possiblePath, languages };
    }
  }

  return { path: null, languages: [] };
}

/**
 * Merge the given config over the defaults, preferring a detected translations
 * directory and its valid languages when one exists.
 */
function resolveInitConfig(projectRoot: string, config: TranslationConfig): Required<TranslationConfig> {
  const baseConfig = { ...DEFAULT_CONFIG, ...config };

  // Use detected path and languages if found
  const existing = detectExistingTranslations(projectRoot);
  if (!existing.path || !existing.languages.length) {
    return baseConfig;
  }

  console.log(`✓ Detected existing translations at: ${existing.path}`);
  console.log(`✓ Found languages: ${existing.languages.join(', ')}`);

  // Validate detected languages
  const validation = validateLanguages(existing.languages);
  if (!validation.valid) {
    console.log(`⚠️  Warning: Invalid language codes found: ${validation.invalid.join(', ')}`);
    console.log('These languages will be skipped.');
  }

  const validLanguages = existing.languages.filter((language) => !validation.invalid.includes(language));

  return {
    ...baseConfig,
    translationsPath: existing.path,
    languages: validLanguages.length ? validLanguages : baseConfig.languages
  };
}

/**
 * Initialize translation structure for a project
 */
export function initTranslations(projectRoot: string, config: TranslationConfig = {}): void {
  console.log('=====');
  console.log('Initializing translation structure');
  console.log('=====');

  const finalConfig = resolveInitConfig(projectRoot, config);

  const translationsPath = path.join(projectRoot, finalConfig.translationsPath);
  const languages = finalConfig.languages.length ? finalConfig.languages : [...DEFAULT_LANGUAGES];

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
    fs.writeFileSync(commonPath, `${JSON.stringify(SAMPLE_TRANSLATIONS, null, 2)}\n`, 'utf-8');
    console.log(`Created sample file: ${commonPath}`);
  }

  // Sync all namespaces from source to target languages
  console.log('\nSynchronizing translation structure...');
  const syncResult = syncTranslationStructure(translationsPath, languages, sourceLanguage);

  if (syncResult.createdFiles.length) {
    console.log(`Created ${syncResult.createdFiles.length} namespace files in target languages`);
    const languageGroups = new Set(syncResult.createdFiles.map((file) => file.language));
    for (const language of languageGroups) {
      const languageFiles = syncResult.createdFiles.filter((file) => file.language === language);
      console.log(`  ${language}: ${languageFiles.map((file) => file.namespace).join(', ')}`);
    }
  }

  // Create config file with schema reference
  const configPath = path.join(projectRoot, CONFIG_FILE_NAME);
  if (!fs.existsSync(configPath)) {
    const configContent = {
      $schema: './node_modules/poly-lexis/dist/translations/core/translations-config.schema.json',
      translationsPath: finalConfig.translationsPath,
      languages,
      sourceLanguage,
      typesOutputPath: finalConfig.typesOutputPath,
      provider: finalConfig.provider
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
  const configPath = path.join(projectRoot, CONFIG_FILE_NAME);

  if (!fs.existsSync(configPath)) {
    // Try to detect existing translations
    const existing = detectExistingTranslations(projectRoot);
    if (existing.path && existing.languages.length) {
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
  const config = parseConfig(parseJson(configContent, configPath), configPath);

  // Validate languages in config
  if (config.languages) {
    const validation = validateLanguages(config.languages);
    if (!validation.valid) {
      console.warn(`⚠️  Warning: Invalid language codes in config: ${validation.invalid.join(', ')}`);
      console.warn(`Please update ${CONFIG_FILE_NAME} with valid language codes.`);
    }
  }

  return { ...DEFAULT_CONFIG, ...config };
}

/** JSON.parse that names the file when its contents aren't valid JSON */
function parseJson(content: string, filePath: string): unknown {
  try {
    return JSON.parse(content);
  } catch (error) {
    throw new Error(`${filePath} is not valid JSON: ${error instanceof Error ? error.message : String(error)}`);
  }
}
