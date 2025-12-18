/**
 * Language fallback utilities
 * Provides intelligent fallback logic for unsupported language codes
 */

import type { DeepLLanguage, GoogleLanguage, TranslationProviderType } from '../core/schema.js';
import { DEEPL_LANGUAGES, GOOGLE_LANGUAGES } from '../core/schema.js';

/**
 * Language fallback mapping
 * Maps unsupported language codes to their fallback alternatives
 * Format: unsupported_code -> [fallback_1, fallback_2, ...]
 */
const LANGUAGE_FALLBACK_MAP: Record<string, string[]> = {
  // German variants
  de_at: ['de'], // Austrian German -> German
  de_ch: ['de'], // Swiss German -> German
  de_de: ['de'], // Standard German -> German

  // English variants
  en_gb: ['en'], // British English -> English
  en_us: ['en'], // American English -> English
  en_au: ['en'], // Australian English -> English
  en_ca: ['en'], // Canadian English -> English
  en_nz: ['en'], // New Zealand English -> English

  // Chinese variants (Hong Kong, Taiwan -> Traditional)
  zh_hk: ['zh_hant', 'zh'], // Hong Kong Chinese -> Traditional Chinese -> Chinese
  zh_tw: ['zh_hant', 'zh'], // Taiwan Chinese -> Traditional Chinese -> Chinese
  zh_mo: ['zh_hant', 'zh'], // Macau Chinese -> Traditional Chinese -> Chinese

  // Chinese variants (Mainland, Singapore -> Simplified)
  zh_cn: ['zh_hans', 'zh'], // Mainland Chinese -> Simplified Chinese -> Chinese
  zh_sg: ['zh_hans', 'zh'], // Singapore Chinese -> Simplified Chinese -> Chinese

  // Portuguese variants
  pt_pt: ['pt'], // European Portuguese -> Portuguese
  pt_ao: ['pt'], // Angolan Portuguese -> Portuguese
  pt_mz: ['pt'], // Mozambican Portuguese -> Portuguese

  // Spanish variants (Latin America)
  es_mx: ['es_419', 'es'], // Mexican Spanish -> Latin American Spanish -> Spanish
  es_ar: ['es_419', 'es'], // Argentine Spanish -> Latin American Spanish -> Spanish
  es_co: ['es_419', 'es'], // Colombian Spanish -> Latin American Spanish -> Spanish
  es_cl: ['es_419', 'es'], // Chilean Spanish -> Latin American Spanish -> Spanish
  es_pe: ['es_419', 'es'], // Peruvian Spanish -> Latin American Spanish -> Spanish
  es_ve: ['es_419', 'es'], // Venezuelan Spanish -> Latin American Spanish -> Spanish
  es_ec: ['es_419', 'es'], // Ecuadorian Spanish -> Latin American Spanish -> Spanish
  es_gt: ['es_419', 'es'], // Guatemalan Spanish -> Latin American Spanish -> Spanish
  es_cu: ['es_419', 'es'], // Cuban Spanish -> Latin American Spanish -> Spanish
  es_do: ['es_419', 'es'], // Dominican Spanish -> Latin American Spanish -> Spanish
  es_hn: ['es_419', 'es'], // Honduran Spanish -> Latin American Spanish -> Spanish
  es_ni: ['es_419', 'es'], // Nicaraguan Spanish -> Latin American Spanish -> Spanish
  es_sv: ['es_419', 'es'], // Salvadoran Spanish -> Latin American Spanish -> Spanish
  es_cr: ['es_419', 'es'], // Costa Rican Spanish -> Latin American Spanish -> Spanish
  es_pa: ['es_419', 'es'], // Panamanian Spanish -> Latin American Spanish -> Spanish
  es_uy: ['es_419', 'es'], // Uruguayan Spanish -> Latin American Spanish -> Spanish
  es_py: ['es_419', 'es'], // Paraguayan Spanish -> Latin American Spanish -> Spanish
  es_bo: ['es_419', 'es'], // Bolivian Spanish -> Latin American Spanish -> Spanish

  // Spanish (European)
  es_es: ['es'], // European Spanish -> Spanish

  // French variants
  fr_ca: ['fr'], // Canadian French -> French
  fr_ch: ['fr'], // Swiss French -> French
  fr_be: ['fr'], // Belgian French -> French
  fr_fr: ['fr'], // Standard French -> French

  // Norwegian variants
  no: ['nb'], // Norwegian -> Norwegian Bokmål
  nn: ['nb'], // Norwegian Nynorsk -> Norwegian Bokmål

  // Other regional variants
  it_ch: ['it'], // Swiss Italian -> Italian
  nl_be: ['nl'], // Belgian Dutch (Flemish) -> Dutch
  sv_fi: ['sv'], // Finland Swedish -> Swedish
  ar_ae: ['ar'], // UAE Arabic -> Arabic
  ar_sa: ['ar'], // Saudi Arabic -> Arabic
  ar_eg: ['ar'] // Egyptian Arabic -> Arabic
};

/**
 * Result of language fallback resolution
 */
export interface LanguageFallbackResult {
  /** The resolved language code to use */
  resolvedLanguage: string;
  /** Whether a fallback was used */
  usedFallback: boolean;
  /** The original language code requested */
  originalLanguage: string;
  /** Chain of fallback attempts made */
  fallbackChain?: string[];
}

/**
 * Resolve language code with fallback logic
 * Tries to find a supported language for the given provider
 *
 * @param language - Original language code requested
 * @param provider - Translation provider type ('deepl' or 'google')
 * @param enableFallback - Whether to enable fallback logic (default: true)
 * @returns LanguageFallbackResult with resolved language and metadata
 */
export function resolveLanguageWithFallback(
  language: string,
  provider: TranslationProviderType,
  enableFallback = true
): LanguageFallbackResult {
  const normalizedLanguage = language.toLowerCase();
  const supportedLanguages = getSupportedLanguagesForProvider(provider);

  // Check if the original language is supported
  if (isLanguageSupported(normalizedLanguage, supportedLanguages)) {
    return {
      resolvedLanguage: normalizedLanguage,
      usedFallback: false,
      originalLanguage: language
    };
  }

  // If fallback is disabled, return original language
  if (!enableFallback) {
    return {
      resolvedLanguage: normalizedLanguage,
      usedFallback: false,
      originalLanguage: language
    };
  }

  // Try fallback chain
  const fallbackChain = LANGUAGE_FALLBACK_MAP[normalizedLanguage] || [];

  for (const fallbackLang of fallbackChain) {
    if (isLanguageSupported(fallbackLang, supportedLanguages)) {
      return {
        resolvedLanguage: fallbackLang,
        usedFallback: true,
        originalLanguage: language,
        fallbackChain: [normalizedLanguage, ...fallbackChain]
      };
    }
  }

  // If no fallback found, try extracting base language (before underscore)
  const baseLang = normalizedLanguage.split('_')[0];
  if (baseLang !== normalizedLanguage && isLanguageSupported(baseLang, supportedLanguages)) {
    return {
      resolvedLanguage: baseLang,
      usedFallback: true,
      originalLanguage: language,
      fallbackChain: [normalizedLanguage, baseLang]
    };
  }

  // No supported language found, return original (will likely fail at API level)
  return {
    resolvedLanguage: normalizedLanguage,
    usedFallback: false,
    originalLanguage: language
  };
}

/**
 * Get supported languages for a specific provider
 */
function getSupportedLanguagesForProvider(provider: TranslationProviderType): readonly string[] {
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
 * Check if a language is supported by checking against the supported list
 */
function isLanguageSupported(language: string, supportedLanguages: readonly string[]): boolean {
  return supportedLanguages.includes(language as DeepLLanguage | GoogleLanguage);
}

/**
 * Log fallback information to console
 * Informs user when a language fallback is being used
 */
export function logLanguageFallback(result: LanguageFallbackResult, provider: TranslationProviderType): void {
  if (result.usedFallback) {
    console.warn(
      `⚠️  Language fallback: '${result.originalLanguage}' is not supported by ${provider}, using '${result.resolvedLanguage}' instead`
    );
    if (result.fallbackChain && result.fallbackChain.length > 2) {
      console.warn(`   Fallback chain: ${result.fallbackChain.join(' → ')}`);
    }
  }
}

/**
 * Get all registered fallback mappings
 * Useful for debugging and documentation
 */
export function getFallbackMappings(): Record<string, string[]> {
  return { ...LANGUAGE_FALLBACK_MAP };
}
