/**
 * DeepL Translate provider implementation
 * Uses DeepL Translation API v2
 */

import type { TranslateOptions, TranslationProvider } from './translator-interface';

interface DeepLTranslateResponse {
  translations: Array<{
    detected_source_language: string;
    text: string;
  }>;
}

interface DeepLErrorResponse {
  message?: string;
}

/**
 * Preserve {{variable}} interpolations by replacing with placeholders
 * Uses a format that DeepL won't translate (uppercase + underscores + numbers)
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
 * Convert language code format from underscore to hyphen (e.g., 'pt_BR' to 'PT-BR')
 * DeepL uses uppercase language codes with hyphens for regional variants
 */
function normalizeLanguageCode(langCode: string): string {
  return langCode.replace('_', '-').toUpperCase();
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
    return this.isFreeApi ? 'https://api-free.deepl.com/v2/translate' : 'https://api.deepl.com/v2/translate';
  }

  async translate(options: TranslateOptions): Promise<string> {
    const { text, sourceLang, targetLang, apiKey } = options;

    if (!apiKey) {
      throw new Error(
        'DeepL API key is required. Set DEEPL_API_KEY environment variable or provide apiKey in options.'
      );
    }

    // Extract and preserve interpolation variables
    const { textWithPlaceholders, variableMap } = preserveVariables(text);

    // Prepare request body
    const body = {
      text: [textWithPlaceholders],
      target_lang: normalizeLanguageCode(targetLang),
      ...(sourceLang && { source_lang: normalizeLanguageCode(sourceLang) })
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
      const errorData = (await response.json().catch(() => ({}))) as DeepLErrorResponse;
      throw new Error(`DeepL API error: ${errorData.message || response.statusText} (${response.status})`);
    }

    const data = (await response.json()) as DeepLTranslateResponse;

    if (!data.translations || data.translations.length === 0) {
      throw new Error('DeepL API returned no translations');
    }

    const translatedText = data.translations[0].text;

    // Restore original interpolation variables
    return restoreVariables(translatedText, variableMap);
  }

  async translateBatch(
    texts: string[],
    sourceLang: string,
    targetLang: string,
    apiKey?: string,
    delayMs = 100
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
