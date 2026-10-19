import type { FallbackProviderType, TranslationProviderType } from './schema.js';

/** Register to translate in. Providers map it to their own setting (DeepL `formality`, a Claude instruction). */
export type FormalityPreference = 'formal' | 'informal' | 'default';

/** Per-target-language translation settings */
export interface LanguageSettings {
  /** Register for this language (default: 'default') */
  formality?: FormalityPreference;
  /**
   * Style instructions for this language, e.g. "Use です/ます form for buttons and labels".
   * Only providers that accept instructions (Claude) use them.
   */
  instructions?: string[];
}

/** Maps translation keys matching `pattern` (a regular expression) to the UI role they play */
export interface KeyRoleRule {
  /** Regular expression tested against the key, e.g. "^COL_|_COL_" */
  pattern: string;
  /** Role description passed to the provider, e.g. "table column header" */
  role: string;
}

/** Settings for the Claude providers */
export interface ClaudeSettings {
  /** Model to use. claude-api defaults to claude-opus-5-5; claude-code defaults to the user's Claude Code model */
  model?: string;
  /** Maximum keys sent in one request (default: 40) */
  maxKeysPerRequest?: number;
  /**
   * Send code snippets showing where each key is used along with the request (default: true).
   * Turn off when source code must not be sent to Anthropic.
   */
  codeContext?: boolean;
  /**
   * claude-api only: let the API retry a declined request on a fallback model (default: on for
   * the models known to support it). Set true for a newer model, or false to never fall back.
   */
  serverFallbacks?: boolean;
}

export interface TranslationConfig {
  /** Path to the translations directory (default: public/static/locales) */
  translationsPath?: string;
  /** Languages to support (default: ['en']) */
  languages?: string[];
  /** Source language for translations (default: 'en') */
  sourceLanguage?: string;
  /** Path to output i18n types (default: src/types/i18nTypes.ts) */
  typesOutputPath?: string;
  /** Translation provider to use (default: 'deepl') */
  provider?: TranslationProviderType;
  /** Enable automatic language fallback for unsupported regional variants (default: true) */
  useFallbackLanguages?: boolean;
  /** Directories to search for translation key usage (default: ['src', 'app', 'pages', 'components']) */
  searchPaths?: string[];
  /** File extensions to search for key usage (default: ['.ts', '.tsx', '.js', '.jsx', '.vue', '.svelte']) */
  searchExtensions?: string[];
  /** Words or phrases that should never be translated (e.g. brand names, product names) */
  protectedTerms?: string[];
  /** What the app is and who uses it. Sent to the provider as context for every key. */
  context?: string;
  /** Fail validation when a source namespace has no `$context.description` (default: false, warn only) */
  contextRequired?: boolean;
  /** Path to a shared glossary JSON file, relative to the project root */
  glossary?: string;
  /** Settings per target language */
  languageSettings?: Record<string, LanguageSettings>;
  /** Extra key-name rules for inferring a key's UI role. Checked before the built-in rules. */
  keyRoles?: KeyRoleRule[];
  /** Provider to use when the main provider is unavailable or returns an unusable translation */
  fallbackProvider?: FallbackProviderType | null;
  /** Settings for the claude, claude-api and claude-code providers */
  claude?: ClaudeSettings;
}

/** Context a person wrote for one source namespace, stored under `$context` in the source-language file */
export interface NamespaceContext {
  /** What the namespace covers, e.g. "Checkout for spa bookings" */
  description?: string;
  /** Notes for individual keys, e.g. { BOOK: "Button that confirms the booking" } */
  keys: Record<string, string>;
}

export type ContextIssueType = 'missing-description' | 'unknown-key-note' | 'invalid-context';

export interface ContextIssue {
  namespace: string;
  type: ContextIssueType;
  /** Set for issues about one key's note */
  key?: string;
  message: string;
}

/** A glossary entry shared by every app that points at the glossary file */
export interface GlossaryTerm {
  /** The source-language term, matched case-insensitively on word boundaries */
  term: string;
  /** Keep the term exactly as written in every language (brand and product names) */
  doNotTranslate?: boolean;
  /** What the term means here, e.g. "A Lush shop, not an app store" */
  note?: string;
  /** Required translation per target language, e.g. { fr: "boutique" } */
  translations?: Record<string, string>;
}

export interface Glossary {
  terms: GlossaryTerm[];
}

/** One code location where a translation key is used */
export interface KeyUsage {
  /** Path relative to the project root */
  file: string;
  /** 1-based line of the match */
  line: number;
  /** The matching line with a little surrounding code */
  snippet: string;
}

/** Everything known about one key at translation time */
export interface KeyContext {
  key: string;
  /** Source-language value */
  source: string;
  /** UI role inferred from the key name */
  role?: string;
  /** Note a person wrote in `$context.keys` */
  note?: string;
  /** Keys next to this one in the source file */
  neighbours: Array<{ key: string; source: string }>;
  /** Where the key is used in code */
  usages: KeyUsage[];
  /** Interpolation placeholders in the source, e.g. ['{{month}}'] */
  placeholders: string[];
  /** Current translation in the target language, if any */
  existing?: string;
}

export interface TranslationEntry {
  namespace: string;
  key: string;
  value: string;
}

export interface TranslationFile {
  [key: string]: string;
}

export interface TranslationFiles {
  [namespace: string]: TranslationFile;
}

export interface MissingTranslation {
  namespace: string;
  key: string;
  language: string;
  sourceValue: string;
}

export interface OrphanedTranslation {
  namespace: string;
  key: string;
  language: string;
  value: string;
}

export interface StaleTranslation {
  namespace: string;
  key: string;
  language: string;
  /** Current source value (the translation should be regenerated from this) */
  sourceValue: string;
  /** The existing, potentially outdated, translated value */
  currentValue: string;
}

export interface UnusedTranslation {
  namespace: string;
  key: string;
  usageType: 'unused' | 'partial';
  partialMatches?: string[];
}

export interface ValidationResult {
  valid: boolean;
  missing: MissingTranslation[];
  empty: MissingTranslation[];
  orphaned: OrphanedTranslation[];
  /**
   * Translations whose source value has changed since they were generated.
   * Only detectable for translations written with source-hash tracking enabled.
   * Reported as a warning; does not affect `valid`.
   */
  stale: StaleTranslation[];
  /**
   * Problems with the `$context` blocks in source files.
   * Affect `valid` only when `contextRequired` is set in the config.
   */
  contextIssues: ContextIssue[];
}

export interface UnusedKeysResult {
  unused: UnusedTranslation[];
  totalKeys: number;
  searchedFiles: number;
}

export interface DuplicateTranslation {
  namespace: string; // the non-common namespace where the dup lives
  key: string; // the key in that namespace
  commonKey: string; // the matching key in common
  value: string; // the shared value
}

export interface DuplicateKeysResult {
  duplicates: DuplicateTranslation[];
  totalKeysChecked: number;
}

export const DEFAULT_CONFIG: Required<TranslationConfig> = {
  translationsPath: 'public/static/locales',
  languages: ['en'],
  sourceLanguage: 'en',
  typesOutputPath: 'src/types/i18nTypes.ts',
  provider: 'deepl',
  useFallbackLanguages: true,
  searchPaths: ['src', 'app', 'pages', 'components'],
  searchExtensions: ['.ts', '.tsx', '.js', '.jsx', '.vue', '.svelte'],
  protectedTerms: [],
  context: '',
  contextRequired: false,
  glossary: '',
  languageSettings: {},
  keyRoles: [],
  fallbackProvider: null,
  claude: {}
};

export const DEFAULT_LANGUAGES = ['en', 'fr', 'it', 'pl', 'es', 'pt', 'de', 'nl', 'sv', 'hu', 'cs', 'ja'] as const;
