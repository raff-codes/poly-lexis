import type { TranslationProviderType } from '../core/schema.js';
import type { TranslationConfig } from '../core/types.js';
import { ClaudeApiProvider, ClaudeCodeProvider, isClaudeCodeAvailable } from './claude-provider.js';
import { adaptLegacyProvider, isContextualProvider } from './contextual-provider.js';
import { DeepLTranslateProvider } from './deepl-translate-provider.js';
import { GoogleTranslateProvider } from './google-translate-provider.js';
import { getCustomTranslationProvider } from './translator.js';
import type { ContextualTranslationProvider } from './translator-interface.js';

/** Environment variable holding the API key a provider needs, or undefined when it needs none */
export function getApiKeyEnvVar(provider: TranslationProviderType): string | undefined {
  switch (provider) {
    case 'deepl':
      return 'DEEPL_API_KEY';
    case 'google':
      return 'GOOGLE_TRANSLATE_API_KEY';
    case 'claude-api':
      return 'ANTHROPIC_API_KEY';
    default:
      // claude-code uses the local sign-in; claude picks a route at run time
      return undefined;
  }
}

/** Thrown by {@link createProvider} when the configured provider can't run (missing key, Claude Code not signed in) */
export class ProviderUnavailableError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ProviderUnavailableError';
  }
}

export interface ProviderSetup {
  provider: ContextualTranslationProvider;
  /** Used for keys the main provider couldn't translate */
  fallback?: ContextualTranslationProvider;
}

export interface CreateProviderOptions {
  /** API key from --api-key; applies to the configured provider */
  apiKey?: string;
  /** Parallel strings for one-string-at-a-time providers */
  concurrency?: number;
  /** Delay after each string for one-string-at-a-time providers, to stay under rate limits */
  delayMs?: number;
  /** Override for tests: whether Claude Code is installed and signed in */
  claudeCodeAvailable?: () => boolean;
}

interface SimpleProviderOptions {
  concurrency?: number;
  delayMs?: number;
}

function createSimpleProvider(
  provider: 'deepl' | 'google',
  apiKey: string,
  config: Required<TranslationConfig>,
  options: SimpleProviderOptions
): ContextualTranslationProvider {
  const instance = provider === 'deepl' ? new DeepLTranslateProvider() : new GoogleTranslateProvider();
  return adaptLegacyProvider(instance, {
    name: provider,
    apiKey,
    useFallbackLanguages: config.useFallbackLanguages,
    ...options
  });
}

function createFallback(
  config: Required<TranslationConfig>,
  mainName: string,
  options: SimpleProviderOptions
): ContextualTranslationProvider | undefined {
  const fallbackName = config.fallbackProvider;
  if (!fallbackName || fallbackName === mainName) {
    return undefined;
  }
  const envVar = getApiKeyEnvVar(fallbackName);
  const apiKey = envVar ? process.env[envVar] : undefined;
  if (!apiKey) {
    // Otherwise the configured safety net is silently missing
    console.warn(
      `⚠ fallbackProvider "${fallbackName}" is configured but ${envVar} isn't set; running without a fallback`
    );
    return undefined;
  }
  return createSimpleProvider(fallbackName, apiKey, config, options);
}

/**
 * Create the provider the config asks for.
 *
 * `claude` picks a route: the local Claude Code CLI when it is signed in, else
 * the Claude API when ANTHROPIC_API_KEY (or --api-key) is set, else the
 * fallback provider. A provider set with `setTranslationProvider` always wins.
 *
 * Throws a {@link ProviderUnavailableError} saying what to set when no provider can run.
 */
export function createProvider(
  config: Required<TranslationConfig>,
  options: CreateProviderOptions = {}
): ProviderSetup {
  const { apiKey, concurrency, delayMs, claudeCodeAvailable = isClaudeCodeAvailable } = options;
  const simpleOptions: SimpleProviderOptions = { concurrency, delayMs };
  const custom = getCustomTranslationProvider();

  if (custom) {
    const provider = isContextualProvider(custom)
      ? custom
      : adaptLegacyProvider(custom, {
          name: custom.constructor.name || 'custom',
          apiKey,
          useFallbackLanguages: config.useFallbackLanguages,
          ...simpleOptions
        });
    return { provider, fallback: createFallback(config, provider.name, simpleOptions) };
  }

  const claudeOptions = {
    model: config.claude.model,
    maxKeysPerRequest: config.claude.maxKeysPerRequest,
    serverFallbacks: config.claude.serverFallbacks
  };

  switch (config.provider) {
    case 'deepl':
    case 'google': {
      const envVar = getApiKeyEnvVar(config.provider) as string;
      const key = apiKey || process.env[envVar];
      if (!key) {
        throw new ProviderUnavailableError(`Translation API key is required. Set ${envVar} or pass --api-key`);
      }
      return {
        provider: createSimpleProvider(config.provider, key, config, simpleOptions),
        fallback: createFallback(config, config.provider, simpleOptions)
      };
    }

    case 'claude-api': {
      const key = apiKey || process.env.ANTHROPIC_API_KEY;
      if (!key) {
        throw new ProviderUnavailableError('The claude-api provider needs ANTHROPIC_API_KEY or --api-key');
      }
      return {
        provider: new ClaudeApiProvider(key, claudeOptions),
        fallback: createFallback(config, 'claude-api', simpleOptions)
      };
    }

    case 'claude-code': {
      if (!claudeCodeAvailable()) {
        throw new ProviderUnavailableError(
          'The claude-code provider needs Claude Code installed and signed in. Run "claude" to sign in.'
        );
      }
      return {
        provider: new ClaudeCodeProvider(claudeOptions),
        fallback: createFallback(config, 'claude-code', simpleOptions)
      };
    }

    case 'claude': {
      if (claudeCodeAvailable()) {
        return {
          provider: new ClaudeCodeProvider(claudeOptions),
          fallback: createFallback(config, 'claude-code', simpleOptions)
        };
      }

      const key = apiKey || process.env.ANTHROPIC_API_KEY;
      if (key) {
        return {
          provider: new ClaudeApiProvider(key, claudeOptions),
          fallback: createFallback(config, 'claude-api', simpleOptions)
        };
      }

      const fallback = createFallback(config, 'claude', simpleOptions);
      if (fallback) {
        console.log(`ℹ Claude Code isn't signed in and ANTHROPIC_API_KEY isn't set; using ${fallback.name} instead`);
        return { provider: fallback };
      }

      throw new ProviderUnavailableError(
        'The claude provider needs Claude Code signed in ("claude" to sign in), ANTHROPIC_API_KEY, or a fallbackProvider with its API key set'
      );
    }

    default:
      throw new Error(`Unknown translation provider "${config.provider}" in .translationsrc.json`);
  }
}
