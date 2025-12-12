/**
 * Translation utilities for translating text using Google Translate API
 * Only translates content outside of {{variable}} interpolations
 */

interface TranslateResponse {
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
 * Translate text using Google Translate API
 * Preserves {{variable}} interpolations by temporarily replacing them
 */
export async function translateText(
  text: string,
  targetLang: string,
  sourceLang: string = 'en',
  apiKey?: string
): Promise<string> {
  if (!apiKey) {
    throw new Error('Google Translate API key is required. Set GOOGLE_TRANSLATE_API_KEY environment variable.');
  }

  // Extract and preserve interpolation variables
  const variableMap = new Map<string, string>();
  let placeholderIndex = 0;

  // Replace {{variable}} with unique placeholders
  const textWithPlaceholders = text.replace(/\{\{([^}]+)\}\}/g, (match) => {
    const placeholder = `__PLACEHOLDER_${placeholderIndex}__`;
    variableMap.set(placeholder, match);
    placeholderIndex++;
    return placeholder;
  });

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

  const data = (await response.json()) as TranslateResponse;

  if (data.error) {
    throw new Error(`Google Translate API error: ${data.error.message}`);
  }

  let translatedText = data.data.translations[0].translatedText;

  // Restore original interpolation variables
  for (const [placeholder, original] of variableMap) {
    translatedText = translatedText.replace(new RegExp(placeholder, 'g'), original);
  }

  return translatedText;
}

/**
 * Translate multiple texts in batch
 */
export async function translateBatch(
  texts: string[],
  targetLang: string,
  sourceLang: string = 'en',
  apiKey?: string,
  delayMs: number = 100
): Promise<string[]> {
  const results: string[] = [];

  for (const text of texts) {
    const translated = await translateText(text, targetLang, sourceLang, apiKey);
    results.push(translated);

    // Add delay to avoid rate limiting
    if (delayMs > 0) {
      await new Promise((resolve) => setTimeout(resolve, delayMs));
    }
  }

  return results;
}
