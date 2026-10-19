import * as path from 'node:path';
import type { KeyContext, NamespaceContext, TranslationConfig } from '../core/types.js';
import { loadGlossary, termsInTexts } from './glossary.js';
import { buildKeyContext, compileKeyRoles, hashKeyContext } from './key-context.js';
import { setSourceHash, type TranslationMetadata, writeMetadata } from './metadata.js';
import { ProviderAuthError } from './provider-errors.js';
import type { ProviderSetup } from './provider-factory.js';
import { readNamespaceContexts } from './source-context.js';
import { checkTranslation } from './translation-checks.js';
import type {
  ContextualTranslationProvider,
  TranslationMode,
  TranslationRequest,
  TranslationResponseItem
} from './translator-interface.js';
import { buildUsageIndex, EMPTY_USAGE_INDEX } from './usage-index.js';
import { readTranslations, sortKeys, writeTranslation } from './utils.js';

/** Keys of one namespace to translate into one language */
export interface TranslationJob {
  language: string;
  namespace: string;
  keys: string[];
}

export interface TranslatedKey {
  language: string;
  namespace: string;
  key: string;
  source: string;
  translation: string;
  /** Value in the target file before this run */
  previous?: string;
  /** Provider that produced the translation */
  provider: string;
  /** Review mode: why the translation was changed */
  reason?: string;
  warnings: string[];
}

export interface FailedKey {
  language: string;
  namespace: string;
  key: string;
  source: string;
  errors: string[];
}

export interface RunTranslationsResult {
  /** Translate mode: keys translated (and written unless dry run). Review mode: proposed corrections. */
  translated: TranslatedKey[];
  /** Keys no provider produced a usable translation for */
  failed: FailedKey[];
}

export interface RunTranslationsOptions {
  projectRoot: string;
  config: Required<TranslationConfig>;
  setup: ProviderSetup;
  jobs: TranslationJob[];
  /** Updated for every written translation and saved after each namespace is written */
  metadata: TranslationMetadata;
  mode?: TranslationMode;
  dryRun?: boolean;
  /** Jobs run in parallel for batch providers (default: 5) */
  concurrency?: number;
}

interface Success {
  item: KeyContext;
  response: TranslationResponseItem;
  provider: ContextualTranslationProvider;
  warnings: string[];
}

interface Failure {
  item: KeyContext;
  errors: string[];
}

function chunk<T>(items: T[], size: number): T[][] {
  if (!Number.isFinite(size)) {
    return [items];
  }
  const chunks: T[][] = [];
  for (let index = 0; index < items.length; index += size) {
    chunks.push(items.slice(index, index + size));
  }
  return chunks;
}

async function forEachConcurrently<T>(items: T[], concurrency: number, run: (item: T) => Promise<void>): Promise<void> {
  let next = 0;
  const worker = async (): Promise<void> => {
    while (next < items.length) {
      await run(items[next++]);
    }
  };
  await Promise.all(Array.from({ length: Math.max(1, Math.min(concurrency, items.length)) }, worker));
}

/**
 * Translate the requested keys with their context, check every result, retry
 * keys that failed once, then hand what is still failing to the fallback
 * provider. In translate mode results are written per namespace file; in review
 * mode they are only returned.
 */
export async function runTranslations(options: RunTranslationsOptions): Promise<RunTranslationsResult> {
  const { projectRoot, config, setup, jobs, metadata, mode = 'translate', dryRun = false, concurrency = 5 } = options;
  const translationsPath = path.join(projectRoot, config.translationsPath);
  const sourceTranslations = readTranslations(translationsPath, config.sourceLanguage);
  const contexts = readNamespaceContexts(translationsPath, config.sourceLanguage);
  const glossary = loadGlossary(projectRoot, config);
  // Compiled before any request so an invalid pattern stops the run before anything is written
  const keyRoles = compileKeyRoles(config.keyRoles);
  const { provider, fallback } = setup;

  // Code snippets leave the machine with the request, so projects can turn them off
  const usageIndex =
    provider.supports.codeContext && config.claude.codeContext !== false
      ? buildUsageIndex({
          projectRoot,
          searchPaths: config.searchPaths,
          searchExtensions: config.searchExtensions,
          // Only the keys being translated: adding one key shouldn't search for every key
          keys: jobs.flatMap((job) => job.keys),
          namespaces: Object.keys(sourceTranslations),
          excludeFiles: [config.typesOutputPath]
        })
      : EMPTY_USAGE_INDEX;
  // A long context made DeepL override the domain meaning in testing; keep it shorter for prose context
  const neighbourCount = provider.supports.instructions ? 3 : 2;

  const result: RunTranslationsResult = { translated: [], failed: [] };
  const jobConcurrency = Number.isFinite(provider.supports.maxItems) ? concurrency : 1;
  // Providers that rejected their credentials or quota; later attempts fail straight away
  const rejectedProviders = new Map<ContextualTranslationProvider, string>();

  await forEachConcurrently(jobs, jobConcurrency, async (job) => {
    const sourceEntries = sourceTranslations[job.namespace] ?? {};
    const namespaceContext: NamespaceContext = contexts[job.namespace]?.context ?? { keys: {} };
    const targetEntries = readTranslations(translationsPath, job.language)[job.namespace] ?? {};
    const settings = config.languageSettings[job.language] ?? {};

    const items = job.keys
      .filter((key) => sourceEntries[key] !== undefined)
      .map((key) =>
        buildKeyContext({
          key,
          sourceEntries,
          namespaceContext,
          keyRoles,
          usages: usageIndex.getUsages(key, job.namespace),
          existing: targetEntries[key],
          neighbourCount
        })
      );

    const requestFor = (batch: KeyContext[]): TranslationRequest => ({
      mode,
      sourceLang: config.sourceLanguage,
      targetLang: job.language,
      app: config.context,
      namespace: {
        name: job.namespace,
        ...(namespaceContext.description && { description: namespaceContext.description })
      },
      language: { formality: settings.formality ?? 'default', instructions: settings.instructions ?? [] },
      glossary: termsInTexts(
        glossary,
        batch.map((item) => item.source)
      ),
      items: batch
    });

    const attempt = async (
      attemptProvider: ContextualTranslationProvider,
      batch: KeyContext[]
    ): Promise<{ successes: Success[]; failures: Failure[] }> => {
      const request = requestFor(batch);
      const rejection = rejectedProviders.get(attemptProvider);
      if (rejection) {
        return { successes: [], failures: batch.map((item) => ({ item, errors: [rejection] })) };
      }

      let responses: TranslationResponseItem[] = [];
      let requestError: string | undefined;

      try {
        responses = await attemptProvider.translateItems(request);
      } catch (error) {
        requestError = error instanceof Error ? error.message : 'Unknown error';
        if (error instanceof ProviderAuthError) {
          rejectedProviders.set(attemptProvider, requestError);
          console.error(`  ✗ ${attemptProvider.name}: ${requestError}. Not sending it any more requests this run.`);
        } else {
          console.error(`  ✗ ${job.language}/${job.namespace} (${attemptProvider.name}): ${requestError}`);
        }
      }

      const byKey = new Map(responses.map((response) => [response.key, response]));
      const successes: Success[] = [];
      const failures: Failure[] = [];

      for (const item of batch) {
        const response = byKey.get(item.key);
        if (response?.error) {
          failures.push({ item, errors: [response.error] });
          continue;
        }
        const check = checkTranslation(item.source, response?.translation, job.language, request.glossary);
        if (response && !check.errors.length) {
          successes.push({ item, response, provider: attemptProvider, warnings: check.warnings });
        } else {
          failures.push({ item, errors: requestError && !response ? [requestError] : check.errors });
        }
      }

      return { successes, failures };
    };

    const successes: Success[] = [];

    for (const batch of chunk(items, provider.supports.maxItems)) {
      const first = await attempt(provider, batch);
      successes.push(...first.successes);

      // One retry with only the failed keys: a smaller batch often fixes a dropped key
      const retry = first.failures.length
        ? await attempt(
            provider,
            first.failures.map((failure) => failure.item)
          )
        : { successes: [], failures: [] };
      successes.push(...retry.successes);

      // The fallback can't review, so in review mode failures stay failures
      const useFallback = fallback && retry.failures.length && (mode === 'translate' || fallback.supports.review);
      const last = useFallback
        ? await attempt(
            fallback,
            retry.failures.map((failure) => failure.item)
          )
        : retry;
      successes.push(...(useFallback ? last.successes : []));

      for (const failure of last.failures) {
        result.failed.push({
          language: job.language,
          namespace: job.namespace,
          key: failure.item.key,
          source: failure.item.source,
          errors: failure.errors
        });
      }
    }

    const toRecord = successes.filter(
      ({ item, response }) => mode === 'translate' || (response.changed && response.translation !== item.existing)
    );

    for (const { item, response, provider: usedProvider, warnings } of toRecord) {
      result.translated.push({
        language: job.language,
        namespace: job.namespace,
        key: item.key,
        source: item.source,
        translation: response.translation,
        ...(item.existing !== undefined && { previous: item.existing }),
        provider: usedProvider.name,
        ...(response.reason && { reason: response.reason }),
        warnings
      });

      const arrow = mode === 'review' ? `"${item.existing}" → "${response.translation}"` : `"${response.translation}"`;
      console.log(`  ${job.language} ${job.namespace}.${item.key}: "${item.source}" → ${arrow}`);
      if (response.reason) {
        console.log(`    ${response.reason}`);
      }
      for (const warning of warnings) {
        console.log(`    ⚠ ${warning}`);
      }
    }

    if (mode !== 'translate' || dryRun || !toRecord.length) {
      return;
    }

    // Re-read so the write starts from the file as it is now, then write the namespace once
    const latest = readTranslations(translationsPath, job.language)[job.namespace] ?? {};
    for (const { item, response, provider: usedProvider } of toRecord) {
      latest[item.key] = response.translation;
      setSourceHash(metadata, job.language, job.namespace, item.key, item.source, {
        translation: response.translation,
        contextHash: hashKeyContext(config.context, namespaceContext.description, item),
        provider: usedProvider.name,
        model: response.model ?? usedProvider.model
      });
    }
    writeTranslation(translationsPath, job.language, job.namespace, sortKeys(latest));
    // Saved with each namespace so an interrupted run keeps the record of what it wrote
    writeMetadata(translationsPath, metadata);
  });

  return result;
}

/** Group (language, namespace, key) items into one job per language and namespace */
export function groupIntoJobs(items: Array<{ language: string; namespace: string; key: string }>): TranslationJob[] {
  const jobs = new Map<string, TranslationJob>();
  for (const { language, namespace, key } of items) {
    const id = `${language}\u0000${namespace}`;
    const job = jobs.get(id) ?? { language, namespace, keys: [] };
    if (!job.keys.includes(key)) {
      job.keys.push(key);
    }
    jobs.set(id, job);
  }
  return [...jobs.values()];
}

/** Print the keys that could not be translated */
export function printFailures(failed: FailedKey[]): void {
  if (!failed.length) {
    return;
  }
  console.log(`\n⚠ ${failed.length} keys could not be translated:`);
  for (const failure of failed.slice(0, 10)) {
    console.log(`  ${failure.language}/${failure.namespace}.json -> ${failure.key}: ${failure.errors.join('; ')}`);
  }
  if (failed.length > 10) {
    console.log(`  ... and ${failed.length - 10} more`);
  }
}
