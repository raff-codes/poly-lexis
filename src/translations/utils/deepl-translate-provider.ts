/**
 * DeepL Translate provider implementation
 * Uses DeepL Translation API v2
 */

import { logLanguageFallback, resolveLanguageWithFallback } from './language-fallback.js';
import { AUTH_FAILURE_STATUSES, ProviderAuthError } from './provider-errors.js';
import type { TranslateOptions, TranslationProvider } from './translator-interface.js';

const DEEPL_FREE_API_URL = 'https://api-free.deepl.com/v2/translate';
const DEEPL_PRO_API_URL = 'https://api.deepl.com/v2/translate';
const DEFAULT_BATCH_DELAY_MS = 100;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** The `message` of a DeepL error body, if it has one */
function parseDeepLErrorMessage(value: unknown): string | undefined {
  return isRecord(value) && typeof value.message === 'string' ? value.message : undefined;
}

/** The first translated text of a DeepL response; throws when the response holds none */
function parseDeepLTranslation(value: unknown): string {
  const translations = isRecord(value) ? value.translations : undefined;
  if (!Array.isArray(translations) || !translations.length) {
    throw new Error('DeepL API returned no translations');
  }
  const [first] = translations;
  if (!isRecord(first) || typeof first.text !== 'string') {
    throw new Error('DeepL API response: `translations[0].text` must be a string');
  }
  return first.text;
}

/**
 * Replace protected terms and {{variable}} / {variable} interpolations with
 * unique placeholders (e.g. XXX_0_XXX) before sending text to the translation API.
 * Placeholders use uppercase letters and underscores — a format translation
 * models treat as technical tokens and leave untouched.
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

  // Replace protected terms first so they aren't caught by the variable patterns below
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
 * Restore all placeholders back to their original values.
 */
function restoreVariables(text: string, variableMap: Map<string, string>): string {
  return Array.from(variableMap).reduce(
    (current, [placeholder, original]) => current.replace(new RegExp(placeholder, 'g'), original),
    text
  );
}

/**
 * Convert language code format from underscore to hyphen (e.g., 'pt_BR' to 'PT-BR')
 * DeepL uses uppercase language codes with hyphens for regional variants
 */
function normalizeLanguageCode(languageCode: string): string {
  return languageCode.replace('_', '-').toUpperCase();
}

/** Resolve a language to one DeepL supports, logging when a fallback is used */
function resolveDeepLLanguage(language: string, useFallbackLanguages: boolean): string {
  const result = resolveLanguageWithFallback(language, 'deepl', useFallbackLanguages);
  logLanguageFallback(result, 'deepl');
  return result.resolvedLanguage;
}

/**
 * DeepL Translate provider
 * Implements the TranslationProvider interface
 */
export class DeepLTranslateProvider implements TranslationProvider {
  private readonly isFreeApi: boolean;

  constructor(isFreeApi = false) {
    this.isFreeApi = isFreeApi;
  }

  private getApiEndpoint(): string {
    return this.isFreeApi ? DEEPL_FREE_API_URL : DEEPL_PRO_API_URL;
  }

  async translate(options: TranslateOptions): Promise<string> {
    const { text, sourceLang, targetLang, apiKey, useFallbackLanguages = true, protectedTerms = [] } = options;
    // Surrounding content that disambiguates short strings; not translated or billed
    const context = typeof options.context === 'string' && options.context.trim() ? options.context.trim() : undefined;
    // prefer_more / prefer_less fall back to the default register where a language has no formality
    const formality = typeof options.formality === 'string' ? options.formality : undefined;

    if (!apiKey) {
      throw new Error(
        'DeepL API key is required. Set DEEPL_API_KEY environment variable or provide apiKey in options.'
      );
    }

    // Resolve target and (if provided) source language with fallback
    const resolvedTargetLanguage = resolveDeepLLanguage(targetLang, useFallbackLanguages);
    const resolvedSourceLanguage = sourceLang ? resolveDeepLLanguage(sourceLang, useFallbackLanguages) : undefined;

    // Extract and preserve interpolation variables
    const { textWithPlaceholders, variableMap } = preserveVariables(text, protectedTerms);

    // Prepare request body
    const body = {
      text: [textWithPlaceholders],
      target_lang: normalizeLanguageCode(resolvedTargetLanguage),
      ...(resolvedSourceLanguage && { source_lang: normalizeLanguageCode(resolvedSourceLanguage) }),
      ...(context && { context }),
      ...(formality && { formality })
    };

    const response = await fetch(this.getApiEndpoint(), {
      method: 'POST',
      headers: {
        Authorization: `DeepL-Auth-Key ${apiKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(body)
    });

    if (!response.ok) {
      const errorMessage = parseDeepLErrorMessage(await response.json().catch(() => undefined));
      const message = `DeepL API error: ${errorMessage || response.statusText} (${response.status})`;
      // A bad key or an exhausted quota fails every request; stop instead of retrying each key
      if (AUTH_FAILURE_STATUSES.has(response.status)) {
        throw new ProviderAuthError(message, response.status);
      }
      throw new Error(message);
    }

    const translatedText = parseDeepLTranslation(await response.json());

    // Restore original interpolation variables
    return restoreVariables(translatedText, variableMap);
  }

  async translateBatch(
    texts: string[],
    sourceLang: string,
    targetLang: string,
    apiKey?: string,
    delayMs = DEFAULT_BATCH_DELAY_MS
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
    const apiKey = process.env.DEEPL_API_KEY;
    return !!apiKey;
  }
}
