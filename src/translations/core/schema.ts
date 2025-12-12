/**
 * Supported language codes for translations
 * Based on ISO 639-1 and regional variants
 */
export const SUPPORTED_LANGUAGES = [
  'en', // English
  'fr', // French
  'it', // Italian
  'pl', // Polish
  'es', // Spanish
  'pt', // Portuguese
  'de', // German
  'de_at', // German (Austria)
  'nl', // Dutch
  'sv', // Swedish
  'hu', // Hungarian
  'cs', // Czech
  'ja', // Japanese
  'zh_hk', // Chinese (Hong Kong)
  'zh_cn', // Chinese (Simplified)
  'ko', // Korean
  'ru', // Russian
  'ar', // Arabic
  'he', // Hebrew
  'tr', // Turkish
  'da', // Danish
  'fi', // Finnish
  'no', // Norwegian
  'pt_br' // Portuguese (Brazil)
] as const;

export type SupportedLanguage = (typeof SUPPORTED_LANGUAGES)[number];

/**
 * JSON Schema for .translationsrc.json
 */
export const TRANSLATION_CONFIG_SCHEMA = {
  $schema: 'http://json-schema.org/draft-07/schema#',
  title: 'Translation Configuration',
  description: 'Configuration for the translation management system',
  type: 'object',
  properties: {
    translationsPath: {
      type: 'string',
      description: 'Path to the translations directory relative to project root',
      default: 'public/static/locales'
    },
    languages: {
      type: 'array',
      description: 'List of language codes to support',
      items: {
        type: 'string',
        enum: SUPPORTED_LANGUAGES
      },
      minItems: 1,
      uniqueItems: true
    },
    sourceLanguage: {
      type: 'string',
      description: 'Source language for translations (usually "en")',
      enum: SUPPORTED_LANGUAGES,
      default: 'en'
    },
    typesOutputPath: {
      type: 'string',
      description: 'Path to output TypeScript types file',
      default: 'src/types/i18nTypes.ts'
    }
  },
  required: ['translationsPath', 'languages', 'sourceLanguage'],
  additionalProperties: false
};

/**
 * Validate if a language code is supported
 */
export function isValidLanguage(lang: string): lang is SupportedLanguage {
  return SUPPORTED_LANGUAGES.includes(lang as SupportedLanguage);
}

/**
 * Validate languages array
 */
export function validateLanguages(languages: string[]): { valid: boolean; invalid: string[] } {
  const invalid = languages.filter((lang) => !isValidLanguage(lang));
  return {
    valid: invalid.length === 0,
    invalid
  };
}
