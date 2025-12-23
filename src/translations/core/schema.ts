/**
 * Translation provider types
 */
export const TRANSLATION_PROVIDERS = ['deepl', 'google'] as const;
export type TranslationProviderType = (typeof TRANSLATION_PROVIDERS)[number];

/**
 * DeepL supported target languages
 * Based on DeepL API v2 documentation
 */
export const DEEPL_LANGUAGES = [
  'ar', // Arabic
  'bg', // Bulgarian
  'cs', // Czech
  'da', // Danish
  'de', // German
  'el', // Greek
  'en', // English (unspecified)
  'en_gb', // English (British)
  'en_us', // English (American)
  'es', // Spanish
  'es_419', // Spanish (Latin American)
  'et', // Estonian
  'fi', // Finnish
  'fr', // French
  'he', // Hebrew (next-gen models only)
  'hu', // Hungarian
  'id', // Indonesian
  'it', // Italian
  'ja', // Japanese
  'ko', // Korean
  'lt', // Lithuanian
  'lv', // Latvian
  'nb', // Norwegian Bokmål
  'nl', // Dutch
  'pl', // Polish
  'pt', // Portuguese (unspecified)
  'pt_br', // Portuguese (Brazilian)
  'pt_pt', // Portuguese (excluding Brazilian)
  'ro', // Romanian
  'ru', // Russian
  'sk', // Slovak
  'sl', // Slovenian
  'sv', // Swedish
  'th', // Thai (next-gen models only)
  'tr', // Turkish
  'uk', // Ukrainian
  'vi', // Vietnamese (next-gen models only)
  'zh', // Chinese (unspecified)
  'zh_hans', // Chinese (simplified)
  'zh_hant' // Chinese (traditional)
] as const;

/**
 * Google Translate supported languages
 * Based on Google Cloud Translation API v2
 * Reference: https://docs.cloud.google.com/translate/docs/languages
 */
export const GOOGLE_LANGUAGES = [
  'af', // Afrikaans
  'sq', // Albanian
  'am', // Amharic
  'ar', // Arabic
  'hy', // Armenian
  'az', // Azerbaijani
  'eu', // Basque
  'be', // Belarusian
  'bn', // Bengali
  'bs', // Bosnian
  'bg', // Bulgarian
  'ca', // Catalan
  'ceb', // Cebuano
  'zh', // Chinese (Simplified)
  'zh_cn', // Chinese (Simplified)
  'zh_tw', // Chinese (Traditional)
  'co', // Corsican
  'hr', // Croatian
  'cs', // Czech
  'da', // Danish
  'nl', // Dutch
  'en', // English
  'eo', // Esperanto
  'et', // Estonian
  'fi', // Finnish
  'fr', // French
  'fy', // Frisian
  'gl', // Galician
  'ka', // Georgian
  'de', // German
  'el', // Greek
  'gu', // Gujarati
  'ht', // Haitian Creole
  'ha', // Hausa
  'haw', // Hawaiian
  'he', // Hebrew
  'hi', // Hindi
  'hmn', // Hmong
  'hu', // Hungarian
  'is', // Icelandic
  'ig', // Igbo
  'id', // Indonesian
  'ga', // Irish
  'it', // Italian
  'ja', // Japanese
  'jv', // Javanese
  'kn', // Kannada
  'kk', // Kazakh
  'km', // Khmer
  'rw', // Kinyarwanda
  'ko', // Korean
  'ku', // Kurdish
  'ky', // Kyrgyz
  'lo', // Lao
  'la', // Latin
  'lv', // Latvian
  'lt', // Lithuanian
  'lb', // Luxembourgish
  'mk', // Macedonian
  'mg', // Malagasy
  'ms', // Malay
  'ml', // Malayalam
  'mt', // Maltese
  'mi', // Maori
  'mr', // Marathi
  'mn', // Mongolian
  'my', // Myanmar (Burmese)
  'ne', // Nepali
  'no', // Norwegian
  'ny', // Nyanja (Chichewa)
  'or', // Odia (Oriya)
  'ps', // Pashto
  'fa', // Persian
  'pl', // Polish
  'pt', // Portuguese
  'pt_br', // Portuguese (Brazil)
  'pa', // Punjabi
  'ro', // Romanian
  'ru', // Russian
  'sm', // Samoan
  'gd', // Scots Gaelic
  'sr', // Serbian
  'st', // Sesotho
  'sn', // Shona
  'sd', // Sindhi
  'si', // Sinhala (Sinhalese)
  'sk', // Slovak
  'sl', // Slovenian
  'so', // Somali
  'es', // Spanish
  'su', // Sundanese
  'sw', // Swahili
  'sv', // Swedish
  'tl', // Tagalog (Filipino)
  'tg', // Tajik
  'ta', // Tamil
  'tt', // Tatar
  'te', // Telugu
  'th', // Thai
  'tr', // Turkish
  'tk', // Turkmen
  'uk', // Ukrainian
  'ur', // Urdu
  'ug', // Uyghur
  'uz', // Uzbek
  'vi', // Vietnamese
  'cy', // Welsh
  'xh', // Xhosa
  'yi', // Yiddish
  'yo', // Yoruba
  'zu' // Zulu
] as const;

/**
 * All supported language codes (union of DeepL and Google Translate)
 */
export const SUPPORTED_LANGUAGES = Array.from(
  new Set([...DEEPL_LANGUAGES, ...GOOGLE_LANGUAGES])
).sort() as readonly string[];

export type DeepLLanguage = (typeof DEEPL_LANGUAGES)[number];
export type GoogleLanguage = (typeof GOOGLE_LANGUAGES)[number];
export type SupportedLanguage = (typeof SUPPORTED_LANGUAGES)[number];

/**
 * JSON Schema for .translationsrc.json
 */
export const TRANSLATION_CONFIG_SCHEMA = {
  title: 'Translation Configuration',
  description: 'Configuration for the translation management system',
  type: 'object',
  properties: {
    $schema: {
      type: 'string',
      description: 'JSON Schema reference'
    },
    translationsPath: {
      type: 'string',
      description: 'Path to the translations directory relative to project root',
      default: 'public/static/locales',
      examples: ['public/static/locales', 'src/locales', 'locales']
    },
    languages: {
      type: 'array',
      description: 'List of language codes to support',
      items: {
        type: 'string',
        enum: SUPPORTED_LANGUAGES
      },
      minItems: 1,
      uniqueItems: true,
      default: ['en']
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
      default: 'src/types/i18nTypes.ts',
      examples: ['src/types/i18nTypes.ts', 'src/types/translations.ts']
    },
    provider: {
      type: 'string',
      description: 'Translation provider to use (deepl or google)',
      enum: TRANSLATION_PROVIDERS,
      default: 'deepl'
    },
    useFallbackLanguages: {
      type: 'boolean',
      description: 'Enable automatic language fallback for unsupported regional variants (e.g., de_at -> de)',
      default: false
    },
    searchPaths: {
      type: 'array',
      description: 'Directories to search for translation key usage',
      items: {
        type: 'string'
      },
      default: ['src', 'app', 'pages', 'components']
    },
    searchExtensions: {
      type: 'array',
      description: 'File extensions to search for key usage',
      items: {
        type: 'string'
      },
      default: ['.ts', '.tsx', '.js', '.jsx', '.vue', '.svelte']
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
 * Validate if a language is supported by DeepL
 */
export function isValidDeepLLanguage(lang: string): lang is DeepLLanguage {
  return DEEPL_LANGUAGES.includes(lang as DeepLLanguage);
}

/**
 * Validate if a language is supported by Google Translate
 */
export function isValidGoogleLanguage(lang: string): lang is GoogleLanguage {
  return GOOGLE_LANGUAGES.includes(lang as GoogleLanguage);
}

/**
 * Validate if a language is supported by a specific provider
 */
export function isValidLanguageForProvider(lang: string, provider: TranslationProviderType): boolean {
  switch (provider) {
    case 'deepl':
      return isValidDeepLLanguage(lang);
    case 'google':
      return isValidGoogleLanguage(lang);
    default:
      return false;
  }
}

/**
 * Validate languages array
 */
export function validateLanguages(languages: string[]): {
  valid: boolean;
  invalid: string[];
} {
  const invalid = languages.filter((lang) => !isValidLanguage(lang));
  return {
    valid: !invalid.length,
    invalid
  };
}

/**
 * Validate languages array for a specific provider
 */
export function validateLanguagesForProvider(
  languages: string[],
  provider: TranslationProviderType
): {
  valid: boolean;
  invalid: string[];
} {
  const invalid = languages.filter((lang) => !isValidLanguageForProvider(lang, provider));
  return {
    valid: !invalid.length,
    invalid
  };
}

/**
 * Get supported languages for a specific provider
 */
export function getSupportedLanguages(provider: TranslationProviderType): readonly string[] {
  switch (provider) {
    case 'deepl':
      return DEEPL_LANGUAGES;
    case 'google':
      return GOOGLE_LANGUAGES;
    default:
      return [];
  }
}

/**
 * Re-export language fallback utilities for convenience
 */
export {
  getFallbackMappings,
  type LanguageFallbackResult,
  logLanguageFallback,
  resolveLanguageWithFallback
} from '../utils/language-fallback.js';
