/**
 * Google Translate provider implementation
 * Uses Google Cloud Translation API v2
 */

import { logLanguageFallback, resolveLanguageWithFallback } from './language-fallback.js';
import { AUTH_FAILURE_STATUSES, ProviderAuthError } from './provider-errors.js';
import type { TranslateOptions, TranslationProvider } from './translator-interface.js';

const GOOGLE_TRANSLATE_API_URL = 'https://translation.googleapis.com/language/translate/v2';
const DEFAULT_BATCH_DELAY_MS = 100;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/**
 * The first translated text of a Google Translate response. Throws the API's
 * own error message when the response carries one.
 */
function parseGoogleTranslation(value: unknown): string {
  if (isRecord(value) && isRecord(value.error)) {
    throw new Error(`Google Translate API error: ${value.error.message}`);
  }
  const translations = isRecord(value) && isRecord(value.data) ? value.data.translations : undefined;
  const [first] = Array.isArray(translations) ? translations : [];
  if (!isRecord(first) || typeof first.translatedText !== 'string') {
    throw new Error('Google Translate API response: `data.translations[0].translatedText` must be a string');
  }
  return first.translatedText;
}

/** Google Translate takes the base code of a regional variant ('pt_br' -> 'pt') */
function toGoogleLanguageCode(languageCode: string): string {
  return languageCode.split('_')[0];
}

/** Resolve a language to one Google supports, logging when a fallback is used */
function resolveGoogleLanguage(language: string, useFallbackLanguages: boolean): string {
  const result = resolveLanguageWithFallback(language, 'google', useFallbackLanguages);
  logLanguageFallback(result, 'google');
  return result.resolvedLanguage;
}

/**
 * Preserve {{variable}} and {variable} interpolations by replacing with placeholders
 * Uses a format that Google Translate won't translate (uppercase + underscores + numbers)
 */
function preserveVariables(
  text: string,
  protectedTerms: string[] = []
): {
  textWithPlaceholders: string;
  variableMap: Map<string, string>;
} {
  const variableMap = new Map<string, string>();
  let placeholderIndex = 0;

  // Replace protected terms first (before variable patterns)
  const result = protectedTerms.reduce((current, term) => {
    const escaped = term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    return current.replace(new RegExp(escaped, 'g'), () => {
      const placeholder = `XXX_${placeholderIndex}_XXX`;
      variableMap.set(placeholder, term);
      placeholderIndex++;
      return placeholder;
    });
  }, text);

  // Match both {{variable}} and {variable} patterns
  // Process {{...}} first to avoid partial matches
  const textWithPlaceholders = result
    .replace(/\{\{([^}]+)\}\}/g, (match) => {
      const placeholder = `XXX_${placeholderIndex}_XXX`;
      variableMap.set(placeholder, match);
      placeholderIndex++;
      return placeholder;
    })
    .replace(/\{([^}]+)\}/g, (match) => {
      const placeholder = `XXX_${placeholderIndex}_XXX`;
      variableMap.set(placeholder, match);
      placeholderIndex++;
      return placeholder;
    });

  return { textWithPlaceholders, variableMap };
}

/**
 * Restore original {{variable}} and {variable} interpolations from placeholders
 */
function restoreVariables(text: string, variableMap: Map<string, string>): string {
  return Array.from(variableMap).reduce(
    (current, [placeholder, original]) => current.replace(new RegExp(placeholder, 'g'), original),
    text
  );
}

/**
 * Google Translate provider
 * Implements the TranslationProvider interface
 */
export class GoogleTranslateProvider implements TranslationProvider {
  async translate(options: TranslateOptions): Promise<string> {
    const { text, sourceLang, targetLang, apiKey, useFallbackLanguages = true, protectedTerms = [] } = options;

    if (!apiKey) {
      throw new Error(
        'Google Translate API key is required. Set GOOGLE_TRANSLATE_API_KEY environment variable or provide apiKey in options.'
      );
    }

    // Resolve target and (if provided) source language with fallback
    const resolvedTargetLanguage = resolveGoogleLanguage(targetLang, useFallbackLanguages);
    const resolvedSourceLanguage = sourceLang ? resolveGoogleLanguage(sourceLang, useFallbackLanguages) : undefined;

    // Extract and preserve interpolation variables
    const { textWithPlaceholders, variableMap } = preserveVariables(text, protectedTerms);

    // Translate the text with placeholders
    const url = `${GOOGLE_TRANSLATE_API_URL}?key=${apiKey}`;

    // For Google Translate, use base language code (before underscore) for regional variants
    const sourceForGoogle = resolvedSourceLanguage && toGoogleLanguageCode(resolvedSourceLanguage);
    const targetForGoogle = toGoogleLanguageCode(resolvedTargetLanguage);

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        q: textWithPlaceholders,
        source: sourceForGoogle,
        target: targetForGoogle,
        format: 'text'
      })
    });

    const data = (await response.json().catch(() => undefined)) as unknown;
    // Google answers an invalid key with 400 "API key not valid", and a disabled API or billing with 403
    const errorMessage = isRecord(data) && isRecord(data.error) ? String(data.error.message) : '';
    if (AUTH_FAILURE_STATUSES.has(response.status) || /API key not valid/i.test(errorMessage)) {
      throw new ProviderAuthError(
        `Google Translate API error: ${errorMessage || response.statusText} (${response.status})`,
        response.status
      );
    }

    const translatedText = parseGoogleTranslation(data);

    // Restore original interpolation variables
    return restoreVariables(translatedText, variableMap);
  }

  async translateBatch(
    texts: string[],
    sourceLang: string,
    targetLang: string,
    apiKey?: string,
    delayMs: number = DEFAULT_BATCH_DELAY_MS
  ): Promise<string[]> {
    const results: string[] = [];

    for (const text of texts) {
      const translated = await this.translate({
        text,
        sourceLang,
        targetLang,
        apiKey
      });
      results.push(translated);

      // Add delay to avoid rate limiting
      if (delayMs > 0) {
        await new Promise((resolve) => setTimeout(resolve, delayMs));
      }
    }

    return results;
  }

  async validateConfig(): Promise<boolean> {
    const apiKey = process.env.GOOGLE_TRANSLATE_API_KEY;
    return !!apiKey;
  }
}
