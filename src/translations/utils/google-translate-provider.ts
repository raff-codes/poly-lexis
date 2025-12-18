/**
 * Google Translate provider implementation
 * Uses Google Cloud Translation API v2
 */

import { logLanguageFallback, resolveLanguageWithFallback } from './language-fallback.js';
import type { TranslateOptions, TranslationProvider } from './translator-interface';

interface GoogleTranslateResponse {
  data: {
    translations: Array<{
      translatedText: string;
    }>;
  };
  error?: {
    message: string;
  };
}

/**
 * Preserve {{variable}} interpolations by replacing with placeholders
 * Uses a format that Google Translate won't translate (uppercase + underscores + numbers)
 */
function preserveVariables(text: string): {
  textWithPlaceholders: string;
  variableMap: Map<string, string>;
} {
  const variableMap = new Map<string, string>();
  let placeholderIndex = 0;

  const textWithPlaceholders = text.replace(/\{\{([^}]+)\}\}/g, (match) => {
    // Use XXX prefix (not a real word in any language) to avoid translation
    const placeholder = `XXX_${placeholderIndex}_XXX`;
    variableMap.set(placeholder, match);
    placeholderIndex++;
    return placeholder;
  });

  return { textWithPlaceholders, variableMap };
}

/**
 * Restore original {{variable}} interpolations from placeholders
 */
function restoreVariables(text: string, variableMap: Map<string, string>): string {
  let result = text;
  for (const [placeholder, original] of variableMap) {
    result = result.replace(new RegExp(placeholder, 'g'), original);
  }
  return result;
}

/**
 * Google Translate provider
 * Implements the TranslationProvider interface
 */
export class GoogleTranslateProvider implements TranslationProvider {
  async translate(options: TranslateOptions): Promise<string> {
    const { text, sourceLang, targetLang, apiKey } = options;

    if (!apiKey) {
      throw new Error(
        'Google Translate API key is required. Set GOOGLE_TRANSLATE_API_KEY environment variable or provide apiKey in options.'
      );
    }

    // Resolve target language with fallback
    const targetLangResult = resolveLanguageWithFallback(targetLang, 'google');
    logLanguageFallback(targetLangResult, 'google');

    // Resolve source language with fallback (if provided)
    let resolvedSourceLang: string | undefined;
    if (sourceLang) {
      const sourceLangResult = resolveLanguageWithFallback(sourceLang, 'google');
      logLanguageFallback(sourceLangResult, 'google');
      resolvedSourceLang = sourceLangResult.resolvedLanguage;
    }

    // Extract and preserve interpolation variables
    const { textWithPlaceholders, variableMap } = preserveVariables(text);

    // Translate the text with placeholders
    const url = `https://translation.googleapis.com/language/translate/v2?key=${apiKey}`;

    // For Google Translate, use base language code (before underscore) for regional variants
    // e.g., 'pt_br' -> 'pt', but keep the full code if it's in the supported list
    const sourceForGoogle = resolvedSourceLang?.includes('_') ? resolvedSourceLang.split('_')[0] : resolvedSourceLang;

    const targetForGoogle = targetLangResult.resolvedLanguage.includes('_')
      ? targetLangResult.resolvedLanguage.split('_')[0]
      : targetLangResult.resolvedLanguage;

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

    const data = (await response.json()) as GoogleTranslateResponse;

    if (data.error) {
      throw new Error(`Google Translate API error: ${data.error.message}`);
    }

    const translatedText = data.data.translations[0].translatedText;

    // Restore original interpolation variables
    return restoreVariables(translatedText, variableMap);
  }

  async translateBatch(
    texts: string[],
    sourceLang: string,
    targetLang: string,
    apiKey?: string,
    delayMs: number = 100
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
