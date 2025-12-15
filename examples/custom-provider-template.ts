/**
 * Template for creating a custom translation provider
 *
 * Copy this file and implement your own translation logic.
 * Replace the API calls with your translation service of choice.
 */

import type { TranslateOptions, TranslationProvider } from 'lexis';

export class CustomTranslationProvider implements TranslationProvider {
  private apiKey: string;
  private apiUrl: string;

  constructor(apiKey?: string, apiUrl?: string) {
    this.apiKey = apiKey || process.env.YOUR_TRANSLATION_API_KEY || '';
    this.apiUrl = apiUrl || 'https://your-translation-api.com/translate';
  }

  async translate(options: TranslateOptions): Promise<string> {
    const { text, sourceLang, targetLang, apiKey } = options;
    const key = apiKey || this.apiKey;

    if (!key) {
      throw new Error(
        'API key is required. Set YOUR_TRANSLATION_API_KEY environment variable or provide apiKey in options.'
      );
    }

    // Step 1: Preserve {{variable}} interpolations
    const { textWithPlaceholders, variableMap } = this.preserveVariables(text);

    // Step 2: Call your translation API
    const response = await fetch(this.apiUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        // Add any authentication headers your API needs
        Authorization: `Bearer ${key}`
      },
      body: JSON.stringify({
        // Customize this based on your API's requirements
        text: textWithPlaceholders,
        source_language: sourceLang,
        target_language: targetLang
      })
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Translation API error: ${error}`);
    }

    const data = await response.json();

    // Step 3: Extract translated text (customize based on your API response format)
    const translatedText = data.translated_text || data.translation || data.result;

    if (!translatedText) {
      throw new Error('Translation API returned no translation');
    }

    // Step 4: Restore {{variable}} interpolations
    return this.restoreVariables(translatedText, variableMap);
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

  /**
   * Optional: Validate configuration
   */
  async validateConfig(): Promise<boolean> {
    return !!this.apiKey;
  }

  /**
   * Preserve {{variable}} interpolations by replacing with placeholders
   * IMPORTANT: This is required to prevent translation APIs from mangling variables
   * Uses a format that won't be translated (uppercase + underscores + numbers)
   */
  private preserveVariables(text: string): {
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
  private restoreVariables(text: string, variableMap: Map<string, string>): string {
    let result = text;
    for (const [placeholder, original] of variableMap) {
      result = result.replace(new RegExp(placeholder, 'g'), original);
    }
    return result;
  }
}

/**
 * Usage Example:
 *
 * import { setTranslationProvider } from 'lexis';
 * import { CustomTranslationProvider } from './custom-provider';
 *
 * // Set your custom provider
 * setTranslationProvider(new CustomTranslationProvider('your-api-key'));
 *
 * // Now all translation operations will use your provider
 * // This affects: auto-fill, add-key --auto-fill, etc.
 */
