/**
 * Language fallback utilities
 * Provides intelligent fallback logic for unsupported language codes
 */

import type { DeepLLanguage, GoogleLanguage, TranslationProviderType } from '../core/schema.js';
import { DEEPL_LANGUAGES, GOOGLE_LANGUAGES } from '../core/schema.js';
import { LANGUAGE_FALLBACK_MAP } from './language-fallback-map.js';

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
