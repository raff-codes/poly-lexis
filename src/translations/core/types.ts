import type { TranslationProviderType } from './schema.js';

export interface TranslationConfig {
  /** Path to the translations directory (default: public/static/locales) */
  translationsPath?: string;
  /** Languages to support (default: ['en']) */
  languages?: string[];
  /** Source language for translations (default: 'en') */
  sourceLanguage?: string;
  /** Path to output i18n types (default: src/types/i18nTypes.ts) */
  typesOutputPath?: string;
  /** Translation provider to use (default: 'deepl') */
  provider?: TranslationProviderType;
}

export interface TranslationEntry {
  namespace: string;
  key: string;
  value: string;
}

export interface TranslationFile {
  [key: string]: string;
}

export interface TranslationFiles {
  [namespace: string]: TranslationFile;
}

export interface MissingTranslation {
  namespace: string;
  key: string;
  language: string;
  sourceValue: string;
}

export interface ValidationResult {
  valid: boolean;
  missing: MissingTranslation[];
  empty: MissingTranslation[];
}

export const DEFAULT_CONFIG: Required<TranslationConfig> = {
  translationsPath: 'public/static/locales',
  languages: ['en'],
  sourceLanguage: 'en',
  typesOutputPath: 'src/types/i18nTypes.ts',
  provider: 'google'
};

export const DEFAULT_LANGUAGES = ['en', 'fr', 'it', 'pl', 'es', 'pt', 'de', 'nl', 'sv', 'hu', 'cs', 'ja'] as const;
