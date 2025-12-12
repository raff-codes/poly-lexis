export interface TranslationConfig {
  /** Path to the translations directory (default: public/static/locales) */
  translationsPath?: string;
  /** Languages to support (default: ['en']) */
  languages?: string[];
  /** Source language for translations (default: 'en') */
  sourceLanguage?: string;
  /** Path to output i18n types (default: src/types/i18nTypes.ts) */
  typesOutputPath?: string;
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
  typesOutputPath: 'src/types/i18nTypes.ts'
};

export const DEFAULT_LANGUAGES = [
  'en',
  'fr',
  'it',
  'pl',
  'es',
  'pt',
  'de',
  'de_at',
  'nl',
  'sv',
  'hu',
  'cs',
  'ja',
  'zh_hk'
] as const;
