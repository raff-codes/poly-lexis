/**
 * Google Translate provider implementation
 * Uses Google Cloud Translation API v2
 */

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
 */
function preserveVariables(text: string): {
  textWithPlaceholders: string;
  variableMap: Map<string, string>;
} {
  const variableMap = new Map<string, string>();
  let placeholderIndex = 0;

  const textWithPlaceholders = text.replace(/\{\{([^}]+)\}\}/g, (match) => {
    const placeholder = `__PLACEHOLDER_${placeholderIndex}__`;
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

    // Extract and preserve interpolation variables
    const { textWithPlaceholders, variableMap } = preserveVariables(text);

    // Translate the text with placeholders
    const url = `https://translation.googleapis.com/language/translate/v2?key=${apiKey}`;

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        q: textWithPlaceholders,
        source: sourceLang,
        target: targetLang.split('_')[0], // Convert 'pt_BR' to 'pt'
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
