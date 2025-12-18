/**
 * Translation utilities with support for custom translation providers
 * Only translates content outside of {{variable}} interpolations
 */

import { GoogleTranslateProvider } from './google-translate-provider';
import type { TranslationProvider } from './translator-interface';

/**
 * Default translation provider (Google Translate)
 */
const defaultProvider: TranslationProvider = new GoogleTranslateProvider();

/**
 * Custom translation provider (if set by user)
 */
let customProvider: TranslationProvider | null = null;

/**
 * Set a custom translation provider
 * @param provider - Custom translation provider implementing TranslationProvider interface
 */
export function setTranslationProvider(provider: TranslationProvider): void {
  customProvider = provider;
}

/**
 * Get the active translation provider (custom or default)
 */
export function getTranslationProvider(): TranslationProvider {
  return customProvider || defaultProvider;
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
  useFallbackLanguages = true
): Promise<string> {
  const provider = getTranslationProvider();
  return provider.translate({
    text,
    sourceLang,
    targetLang,
    apiKey,
    useFallbackLanguages
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
