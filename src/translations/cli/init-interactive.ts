import * as path from 'node:path';
import { checkbox, confirm, input } from '@inquirer/prompts';
import { SUPPORTED_LANGUAGES } from '../core/schema.js';
import type { TranslationConfig } from '../core/types.js';
import { DEFAULT_CONFIG } from '../core/types.js';
import { initTranslations } from './init.js';

/**
 * Interactive initialization of translation structure
 */
export async function initTranslationsInteractive(projectRoot: string = process.cwd()): Promise<void> {
  console.log('\n🌍 Translation System Setup\n');

  // Check if already initialized
  const configPath = path.join(projectRoot, '.translationsrc.json');
  const alreadyExists = require('node:fs').existsSync(configPath);

  if (alreadyExists) {
    console.log('⚠️  Configuration file already exists at .translationsrc.json\n');
    const shouldOverwrite = await confirm({
      message: 'Would you like to reconfigure?',
      default: false
    });

    if (!shouldOverwrite) {
      console.log('✓ Keeping existing configuration');
      return;
    }
  }

  // Detect existing translations
  const { detectExistingTranslations } = await import('./init.js');
  const existing = detectExistingTranslations(projectRoot);

  let translationsPath: string;
  let languages: string[];

  // Ask about translations path
  if (existing.path) {
    console.log(`✓ Found existing translations at: ${existing.path}`);
    const useExisting = await confirm({
      message: 'Use this location?',
      default: true
    });

    if (useExisting) {
      translationsPath = existing.path;
    } else {
      translationsPath = await input({
        message: 'Enter translations directory path:',
        default: DEFAULT_CONFIG.translationsPath,
        validate: (value) => {
          if (!value.trim()) return 'Path is required';
          return true;
        }
      });
    }
  } else {
    translationsPath = await input({
      message: 'Where should translations be stored?',
      default: DEFAULT_CONFIG.translationsPath,
      validate: (value) => {
        if (!value.trim()) return 'Path is required';
        return true;
      }
    });
  }

  // Ask about languages
  if (existing.languages.length > 0) {
    console.log(`✓ Found existing languages: ${existing.languages.join(', ')}`);
    const useExistingLangs = await confirm({
      message: 'Use these languages?',
      default: true
    });

    if (useExistingLangs) {
      languages = existing.languages;
    } else {
      languages = await selectLanguages();
    }
  } else {
    languages = await selectLanguages();
  }

  // Ask about source language
  const sourceLanguage = await input({
    message: 'What is your source language?',
    default: 'en',
    validate: (value) => {
      if (!SUPPORTED_LANGUAGES.includes(value as never)) {
        return `Invalid language code. Must be one of: ${SUPPORTED_LANGUAGES.join(', ')}`;
      }
      if (!languages.includes(value)) {
        return 'Source language must be in the list of supported languages';
      }
      return true;
    }
  });

  // Ask about types output path
  const typesOutputPath = await input({
    message: 'Where should TypeScript types be generated?',
    default: DEFAULT_CONFIG.typesOutputPath
  });

  // Summary
  console.log('\n📋 Configuration Summary:');
  console.log(`   Translations: ${translationsPath}`);
  console.log(`   Languages: ${languages.join(', ')}`);
  console.log(`   Source: ${sourceLanguage}`);
  console.log(`   Types: ${typesOutputPath}`);

  const confirmInit = await confirm({
    message: '\nProceed with initialization?',
    default: true
  });

  if (!confirmInit) {
    console.log('❌ Cancelled');
    return;
  }

  // Initialize with selected config
  const config: TranslationConfig = {
    translationsPath,
    languages,
    sourceLanguage,
    typesOutputPath
  };

  console.log();
  initTranslations(projectRoot, config);

  // Show helpful next steps
  console.log('\n📝 Configuration saved to: .translationsrc.json');
  console.log('\n💡 Next steps:');
  console.log('   1. Run "translations add" to add your first translation key');
  console.log('   2. Run "translations" to validate and generate types');
  console.log('   3. Check the .translationsrc.json file for your configuration\n');
}

/**
 * Helper to select languages interactively
 */
async function selectLanguages(): Promise<string[]> {
  const languageChoices = SUPPORTED_LANGUAGES.map((lang) => ({
    name: `${lang} - ${getLanguageName(lang)}`,
    value: lang,
    checked: lang === 'en' // English selected by default
  }));

  const selected = await checkbox({
    message: 'Select languages to support (space to select, enter to confirm):',
    choices: languageChoices,
    required: true,
    pageSize: 15,
    loop: false
  });

  return selected;
}

/**
 * Get human-readable language name
 */
function getLanguageName(code: string): string {
  const names: Record<string, string> = {
    en: 'English',
    fr: 'French',
    it: 'Italian',
    pl: 'Polish',
    es: 'Spanish',
    pt: 'Portuguese',
    de: 'German',
    de_at: 'German (Austria)',
    nl: 'Dutch',
    sv: 'Swedish',
    hu: 'Hungarian',
    cs: 'Czech',
    ja: 'Japanese',
    zh_hk: 'Chinese (Hong Kong)',
    zh_cn: 'Chinese (Simplified)',
    ko: 'Korean',
    ru: 'Russian',
    ar: 'Arabic',
    he: 'Hebrew',
    tr: 'Turkish',
    da: 'Danish',
    fi: 'Finnish',
    no: 'Norwegian',
    pt_br: 'Portuguese (Brazil)'
  };
  return names[code] || code;
}
