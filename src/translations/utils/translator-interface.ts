/**
 * Translation provider interface
 * Implement this interface to create custom translation providers
 */

/**
 * Options for translating text
 */
export interface TranslateOptions {
  /** The text to translate */
  text: string;
  /** Source language code (e.g., 'en', 'fr') */
  sourceLang: string;
  /** Target language code (e.g., 'es', 'pt_BR') */
  targetLang: string;
  /** API key or credentials (optional, depending on provider) */
  apiKey?: string;
  /** Enable automatic language fallback for unsupported regional variants (default: true) */
  useFallbackLanguages?: boolean;
  /** Additional provider-specific options */
  [key: string]: unknown;
}

/**
 * Result of a translation operation
 */
export interface TranslationResult {
  /** The translated text */
  translatedText: string;
  /** Optional metadata from the translation service */
  metadata?: Record<string, unknown>;
}

/**
 * Translation provider interface
 * All custom translation providers must implement this interface
 */
export interface TranslationProvider {
  /**
   * Translate a single text string
   * @param options - Translation options
   * @returns Promise resolving to the translated text
   */
  translate(options: TranslateOptions): Promise<string>;

  /**
   * Translate multiple texts in batch
   * @param texts - Array of texts to translate
   * @param sourceLang - Source language code
   * @param targetLang - Target language code
   * @param apiKey - API key or credentials (optional)
   * @param delayMs - Optional delay between requests to avoid rate limiting
   * @returns Promise resolving to array of translated texts
   */
  translateBatch(
    texts: string[],
    sourceLang: string,
    targetLang: string,
    apiKey?: string,
    delayMs?: number
  ): Promise<string[]>;

  /**
   * Optional method to validate the provider configuration
   * @returns Promise resolving to true if configuration is valid
   */
  validateConfig?(): Promise<boolean>;
}

/**
 * Type for a function that creates a translation provider
 */
export type TranslationProviderFactory = () => TranslationProvider;
