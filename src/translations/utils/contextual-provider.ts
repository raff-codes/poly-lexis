import type { KeyContext } from '../core/types.js';
import { doNotTranslateTerms } from './glossary.js';
import { ProviderAuthError } from './provider-errors.js';
import type {
  ContextualTranslationProvider,
  TranslationProvider,
  TranslationRequest,
  TranslationResponseItem
} from './translator-interface.js';

/**
 * Context as plain prose, for engines whose context field takes surrounding
 * content rather than instructions (DeepL). Ordered from broad to specific.
 */
export function buildPlainContext(request: TranslationRequest, item: KeyContext): string {
  const parts = [request.app, request.namespace.description];

  if (item.role) {
    parts.push(`This text is a ${item.role}.`);
  }
  if (item.note) {
    parts.push(item.note);
  }

  const nearby = item.neighbours
    .filter((neighbour) => neighbour.source.trim())
    .map((neighbour) => `"${neighbour.source}"`)
    .join('; ');
  if (nearby) {
    parts.push(`Other text on the same screen: ${nearby}.`);
  }

  return parts
    .filter((part): part is string => Boolean(part?.trim()))
    .map((part) => {
      const trimmed = part.trim();
      return /[.!?]$/.test(trimmed) ? trimmed : `${trimmed}.`;
    })
    .join(' ');
}

/** DeepL's formality values that fall back silently for languages without formality */
const DEEPL_FORMALITY = { formal: 'prefer_more', informal: 'prefer_less' } as const;

export interface LegacyProviderOptions {
  /** Name recorded in metadata */
  name: string;
  apiKey?: string;
  useFallbackLanguages?: boolean;
  /** Strings translated in parallel within one request (default: 5) */
  concurrency?: number;
  /** Delay after each string, to stay under rate limits (default: 50ms) */
  delayMs?: number;
}

/**
 * Wrap a provider that translates one string per call. Each item is sent with
 * its context as prose (`context`) and the language's formality; providers that
 * don't understand those options ignore them.
 */
export function adaptLegacyProvider(
  provider: TranslationProvider,
  options: LegacyProviderOptions
): ContextualTranslationProvider {
  const { name, apiKey, useFallbackLanguages = true, concurrency = 5, delayMs = 50 } = options;

  return {
    name,
    supports: { instructions: false, codeContext: false, review: false, maxItems: Number.POSITIVE_INFINITY },
    async translateItems(request: TranslationRequest): Promise<TranslationResponseItem[]> {
      const protectedTerms = doNotTranslateTerms({ terms: request.glossary });
      const formality = request.language.formality === 'default' ? undefined : request.language.formality;
      const results: TranslationResponseItem[] = [];
      let next = 0;
      let authError: ProviderAuthError | undefined;

      // A key that fails comes back with its error so the failure report can show it.
      // A rejected key or quota stops every worker: the remaining keys would fail the same way.
      const worker = async (): Promise<void> => {
        while (next < request.items.length && !authError) {
          const item = request.items[next++];
          try {
            const translation = await provider.translate({
              text: item.source,
              sourceLang: request.sourceLang,
              targetLang: request.targetLang,
              apiKey,
              useFallbackLanguages,
              protectedTerms,
              context: buildPlainContext(request, item),
              ...(formality && { formality: DEEPL_FORMALITY[formality] })
            });
            results.push({ key: item.key, translation });
          } catch (error) {
            if (error instanceof ProviderAuthError) {
              authError = error;
              return;
            }
            results.push({
              key: item.key,
              translation: '',
              error: error instanceof Error ? error.message : 'Unknown error'
            });
          }
          if (delayMs > 0) {
            await new Promise((resolve) => setTimeout(resolve, delayMs));
          }
        }
      };

      await Promise.all(Array.from({ length: Math.min(concurrency, request.items.length) }, worker));
      if (authError) {
        throw authError;
      }
      return results;
    }
  };
}

/** Whether a provider object already implements the contextual interface */
export function isContextualProvider(
  provider: TranslationProvider | ContextualTranslationProvider
): provider is ContextualTranslationProvider {
  return typeof (provider as ContextualTranslationProvider).translateItems === 'function';
}
