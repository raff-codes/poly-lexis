/**
 * Translation utilities with support for custom translation providers
 * Only translates content outside of {{variable}} interpolations
 */

import { isContextualProvider } from './contextual-provider.js';
import { GoogleTranslateProvider } from './google-translate-provider';
import type { ContextualTranslationProvider, TranslationProvider } from './translator-interface';

/**
 * Default translation provider (Google Translate)
 */
const defaultProvider: TranslationProvider = new GoogleTranslateProvider();

/**
 * Custom translation provider (if set by user)
 */
let customProvider: TranslationProvider | ContextualTranslationProvider | null = null;

/**
 * Set a custom translation provider. When set, it is used instead of the
 * provider named in .translationsrc.json.
 * @param provider - A provider translating one string per call, or a contextual provider translating batches
 */
export function setTranslationProvider(provider: TranslationProvider | ContextualTranslationProvider): void {
  customProvider = provider;
}

/**
 * The provider set with {@link setTranslationProvider}, or null when the config decides
 */
export function getCustomTranslationProvider(): TranslationProvider | ContextualTranslationProvider | null {
  return customProvider;
}

/**
 * Get the active single-string translation provider (custom or default)
 */
export function getTranslationProvider(): TranslationProvider {
  return customProvider && !isContextualProvider(customProvider) ? customProvider : defaultProvider;
}

/**
 * Reset to the default Google Translate provider
 */
export function resetTranslationProvider(): void {
  customProvider = null;
}

/**
 * Translate text using the active translation provider
 * Preserves {{variable}} interpolations by temporarily replacing them
 *
 * @param text - Text to translate
 * @param targetLang - Target language code
 * @param sourceLang - Source language code (default: "en")
 * @param apiKey - API key for the translation service
 * @param useFallbackLanguages - Enable automatic language fallback (default: true)
 * @returns Promise resolving to translated text
 */
export async function translateText(
  text: string,
  targetLang: string,
  sourceLang: string = 'en',
  apiKey?: string,
  useFallbackLanguages = true,
  protectedTerms: string[] = []
): Promise<string> {
  const provider = getTranslationProvider();
  return provider.translate({
    text,
    sourceLang,
    targetLang,
    apiKey,
    useFallbackLanguages,
    protectedTerms
  });
}

/**
 * Translate multiple texts in batch
 *
 * @param texts - Array of texts to translate
 * @param targetLang - Target language code
 * @param sourceLang - Source language code (default: "en")
 * @param apiKey - API key for the translation service
 * @param delayMs - Delay between requests in milliseconds (default: 100)
 * @returns Promise resolving to array of translated texts
 */
export async function translateBatch(
  texts: string[],
  targetLang: string,
  sourceLang: string = 'en',
  apiKey?: string,
  delayMs: number = 100
): Promise<string[]> {
  const provider = getTranslationProvider();
  return provider.translateBatch(texts, sourceLang, targetLang, apiKey, delayMs);
}
