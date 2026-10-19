/**
 * Translation provider interface
 * Implement this interface to create custom translation providers
 */

import type { FormalityPreference, GlossaryTerm, KeyContext } from '../core/types.js';

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
  /** Words or phrases that should never be translated (e.g. brand names, product names) */
  protectedTerms?: string[];
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

/**
 * - `translate`: produce translations for keys that need one.
 * - `review`: each item carries its `existing` translation; keep it when it is right,
 *   otherwise return a correction with `changed: true` and a `reason`.
 */
export type TranslationMode = 'translate' | 'review';

/** One batch of keys from a single namespace, translated into a single language */
export interface TranslationRequest {
  mode: TranslationMode;
  sourceLang: string;
  targetLang: string;
  /** What the app is and who uses it (`context` in .translationsrc.json) */
  app: string;
  namespace: { name: string; description?: string };
  language: { formality: FormalityPreference; instructions: string[] };
  /** Glossary terms that occur in this batch's source strings */
  glossary: GlossaryTerm[];
  items: KeyContext[];
}

export interface TranslationResponseItem {
  key: string;
  translation: string;
  /** Review mode: whether the translation differs from `existing` */
  changed?: boolean;
  /** Review mode: why it was changed */
  reason?: string;
  /**
   * Set instead of a usable translation when the provider failed on this key,
   * so the failure report shows the provider's own error
   */
  error?: string;
  /** Model that produced this item, when it isn't the provider's configured model (a server-side fallback) */
  model?: string;
}

/** What a contextual provider can make use of */
export interface ProviderCapabilities {
  /** Follows written instructions (role, tone, language instructions) */
  instructions: boolean;
  /** Can use code snippets showing where a key is used */
  codeContext: boolean;
  /** Supports review mode */
  review: boolean;
  /** Maximum items per request; Infinity for providers that translate one string at a time */
  maxItems: number;
}

/**
 * Provider that translates a batch of keys with their context. Every built-in
 * provider is used through this interface; a plain {@link TranslationProvider}
 * is wrapped by `adaptLegacyProvider`.
 */
export interface ContextualTranslationProvider {
  /** Recorded in metadata, e.g. 'deepl' or 'claude-code' */
  readonly name: string;
  /** Model used, for LLM providers */
  readonly model?: string;
  readonly supports: ProviderCapabilities;
  translateItems(request: TranslationRequest): Promise<TranslationResponseItem[]>;
}
