/**
 * Supported language codes for translations
 * Based on Google Translate API supported languages (ISO 639-1 and regional variants)
 * Complete list of all languages supported by Google Cloud Translation API
 */
export const SUPPORTED_LANGUAGES = [
  'af', // Afrikaans
  'sq', // Albanian
  'am', // Amharic
  'ar', // Arabic
  'hy', // Armenian
  'as', // Assamese
  'ay', // Aymara
  'az', // Azerbaijani
  'bm', // Bambara
  'eu', // Basque
  'be', // Belarusian
  'bn', // Bengali
  'bho', // Bhojpuri
  'bs', // Bosnian
  'bg', // Bulgarian
  'ca', // Catalan
  'ceb', // Cebuano
  'ny', // Chichewa
  'zh', // Chinese (Simplified) - Google uses 'zh' or 'zh-CN'
  'zh_cn', // Chinese (Simplified) - alternative format
  'zh_tw', // Chinese (Traditional)
  'co', // Corsican
  'hr', // Croatian
  'cs', // Czech
  'da', // Danish
  'dv', // Dhivehi
  'doi', // Dogri
  'nl', // Dutch
  'en', // English
  'eo', // Esperanto
  'et', // Estonian
  'ee', // Ewe
  'tl', // Filipino (Tagalog)
  'fi', // Finnish
  'fr', // French
  'gl', // Galician
  'ka', // Georgian
  'de', // German
  'el', // Greek
  'gn', // Guarani
  'gu', // Gujarati
  'ht', // Haitian Creole
  'ha', // Hausa
  'haw', // Hawaiian
  'iw', // Hebrew (legacy code, 'he' is preferred)
  'he', // Hebrew
  'hi', // Hindi
  'hmn', // Hmong
  'hu', // Hungarian
  'is', // Icelandic
  'ig', // Igbo
  'ilo', // Ilocano
  'id', // Indonesian
  'ga', // Irish
  'it', // Italian
  'ja', // Japanese
  'jw', // Javanese
  'kn', // Kannada
  'kk', // Kazakh
  'km', // Khmer
  'rw', // Kinyarwanda
  'gom', // Konkani
  'ko', // Korean
  'kri', // Krio
  'ku', // Kurdish (Kurmanji)
  'ckb', // Kurdish (Sorani)
  'ky', // Kyrgyz
  'lo', // Lao
  'la', // Latin
  'lv', // Latvian
  'ln', // Lingala
  'lt', // Lithuanian
  'lg', // Luganda
  'lb', // Luxembourgish
  'mk', // Macedonian
  'mai', // Maithili
  'mg', // Malagasy
  'ms', // Malay
  'ml', // Malayalam
  'mt', // Maltese
  'mi', // Maori
  'mr', // Marathi
  'mni', // Meiteilon (Manipuri)
  'lus', // Mizo
  'mn', // Mongolian
  'my', // Myanmar (Burmese)
  'ne', // Nepali
  'no', // Norwegian
  'or', // Odia
  'om', // Oromo
  'ps', // Pashto
  'fa', // Persian
  'pl', // Polish
  'pt', // Portuguese
  'pt_br', // Portuguese (Brazil)
  'pa', // Punjabi
  'qu', // Quechua
  'ro', // Romanian
  'ru', // Russian
  'sm', // Samoan
  'sa', // Sanskrit
  'gd', // Scottish Gaelic
  'sr', // Serbian
  'st', // Sesotho
  'sn', // Shona
  'sd', // Sindhi
  'si', // Sinhala
  'sk', // Slovak
  'sl', // Slovenian
  'so', // Somali
  'es', // Spanish
  'su', // Sundanese
  'sw', // Swahili
  'sv', // Swedish
  'tg', // Tajik
  'ta', // Tamil
  'tt', // Tatar
  'te', // Telugu
  'th', // Thai
  'ti', // Tigrinya
  'ts', // Tsonga
  'tr', // Turkish
  'tk', // Turkmen
  'ak', // Twi
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
export function validateLanguages(languages: string[]): {
  valid: boolean;
  invalid: string[];
} {
  const invalid = languages.filter((lang) => !isValidLanguage(lang));
  return {
    valid: invalid.length === 0,
    invalid
  };
}
