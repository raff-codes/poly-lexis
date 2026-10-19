import * as fs from 'node:fs';
import * as path from 'node:path';
import { isManuallyEdited, readMetadata, setSourceHash, writeMetadata } from '../utils/metadata.js';
import { createProvider } from '../utils/provider-factory.js';
import { groupIntoJobs, printFailures, runTranslations } from '../utils/translation-runner.js';
import { readTranslations, sortKeys, writeTranslation } from '../utils/utils.js';
import { loadConfig } from './init.js';

export const DEFAULT_REVIEW_REPORT = 'translations-review.json';

export interface ReviewEntry {
  language: string;
  namespace: string;
  key: string;
  source: string;
  /** The translation when the review ran */
  current: string;
  /** The suggested replacement */
  proposed: string;
  reason?: string;
  warnings?: string[];
}

export interface ReviewReport {
  generatedAt: string;
  provider: string;
  model?: string;
  entries: ReviewEntry[];
}

export interface ReviewOptions {
  /** Review only this language */
  language?: string;
  /** Review only this namespace */
  namespace?: string;
  /** API key for the configured provider */
  apiKey?: string;
  /** Requests run in parallel (default: 5) */
  concurrency?: number;
  /** Where to write the report, relative to the project root (default: translations-review.json) */
  outputPath?: string;
  /** Also review translations someone edited by hand */
  includeManualEdits?: boolean;
}

/**
 * Ask the provider to check existing translations against their context and
 * write the suggested corrections to a report file. Nothing in the translation
 * files changes: read the report, delete entries you disagree with, then run
 * {@link applyReviewReport}.
 */
export async function reviewTranslations(
  projectRoot: string = process.cwd(),
  options: ReviewOptions = {}
): Promise<ReviewReport> {
  const config = loadConfig(projectRoot);
  const translationsPath = path.join(projectRoot, config.translationsPath);
  const { language, namespace, apiKey, concurrency = 5, outputPath = DEFAULT_REVIEW_REPORT } = options;

  const setup = createProvider(config, { apiKey, concurrency });
  if (!setup.provider.supports.review) {
    throw new Error(
      `Reviewing needs a provider that can follow instructions; ${setup.provider.name} can't. Set "provider" to "claude".`
    );
  }

  const sourceTranslations = readTranslations(translationsPath, config.sourceLanguage);
  const metadata = readMetadata(translationsPath);
  const languages = language ? [language] : config.languages.filter((lang) => lang !== config.sourceLanguage);
  const selected: Array<{ language: string; namespace: string; key: string }> = [];
  let skippedManual = 0;

  for (const lang of languages) {
    const targetTranslations = readTranslations(translationsPath, lang);
    for (const [ns, entries] of Object.entries(sourceTranslations)) {
      if (namespace && ns !== namespace) {
        continue;
      }
      for (const key of Object.keys(entries)) {
        const current = targetTranslations[ns]?.[key];
        if (!current?.trim()) {
          continue;
        }
        if (!options.includeManualEdits && isManuallyEdited(metadata, lang, ns, key, current)) {
          skippedManual++;
          continue;
        }
        selected.push({ language: lang, namespace: ns, key });
      }
    }
  }

  console.log('=====');
  console.log('Reviewing translations');
  console.log('=====');
  console.log(`Provider: ${setup.provider.name}${setup.provider.model ? ` (${setup.provider.model})` : ''}`);
  console.log(`Languages: ${languages.join(', ')}`);
  console.log(`Translations to review: ${selected.length}`);
  if (skippedManual > 0) {
    console.log(`Skipped ${skippedManual} translations edited by hand (use --include-manual-edits to review them)`);
  }
  console.log('=====');

  const result = await runTranslations({
    projectRoot,
    config,
    setup,
    jobs: groupIntoJobs(selected),
    metadata,
    mode: 'review',
    concurrency
  });

  const report: ReviewReport = {
    generatedAt: new Date().toISOString(),
    provider: setup.provider.name,
    ...(setup.provider.model && { model: setup.provider.model }),
    entries: result.translated
      .map((item) => ({
        language: item.language,
        namespace: item.namespace,
        key: item.key,
        source: item.source,
        current: item.previous ?? '',
        proposed: item.translation,
        ...(item.reason && { reason: item.reason }),
        ...(item.warnings.length && { warnings: item.warnings })
      }))
      .sort((first, second) =>
        `${first.language}/${first.namespace}/${first.key}`.localeCompare(
          `${second.language}/${second.namespace}/${second.key}`
        )
      )
  };

  const reportPath = path.resolve(projectRoot, outputPath);
  fs.writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`, 'utf-8');

  printFailures(result.failed);
  console.log(`\n${report.entries.length} suggested corrections written to ${reportPath}`);
  console.log('Delete any entries you disagree with, then run: poly-lexis review --apply');

  return report;
}

const REQUIRED_ENTRY_FIELDS = ['language', 'namespace', 'key', 'source', 'current', 'proposed'] as const;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/**
 * Check a review report's shape. People edit the report by hand before
 * applying it, so a broken entry is named by index instead of failing later.
 */
export function parseReviewReport(raw: unknown, source = DEFAULT_REVIEW_REPORT): ReviewReport {
  if (!isRecord(raw) || !Array.isArray(raw.entries)) {
    throw new Error(`${source} must be an object with an "entries" array`);
  }

  const entries = raw.entries.map((entry, index): ReviewEntry => {
    const where = `${source} entries[${index}]`;
    if (!isRecord(entry)) {
      throw new Error(`${where} must be an object`);
    }
    for (const field of REQUIRED_ENTRY_FIELDS) {
      if (typeof entry[field] !== 'string') {
        throw new Error(`${where} needs "${field}" as a string`);
      }
    }
    if (entry.reason !== undefined && typeof entry.reason !== 'string') {
      throw new Error(`${where} "reason" must be a string`);
    }
    if (
      entry.warnings !== undefined &&
      (!Array.isArray(entry.warnings) || entry.warnings.some((warning) => typeof warning !== 'string'))
    ) {
      throw new Error(`${where} "warnings" must be an array of strings`);
    }
    return entry as unknown as ReviewEntry;
  });

  return {
    generatedAt: typeof raw.generatedAt === 'string' ? raw.generatedAt : '',
    provider: typeof raw.provider === 'string' ? raw.provider : 'unknown',
    ...(typeof raw.model === 'string' && { model: raw.model }),
    entries
  };
}

/** Why an entry in a review report wasn't applied */
export type ReviewSkipReason = 'translation-changed' | 'source-changed';

export type SkippedReviewEntry = ReviewEntry & { skipReason: ReviewSkipReason };

export interface ApplyReviewResult {
  applied: number;
  /** Entries whose translation or source string changed after the review ran */
  skipped: SkippedReviewEntry[];
}

const SKIP_REASON_LABEL: Record<ReviewSkipReason, string> = {
  'translation-changed': 'translation edited since the review',
  'source-changed': 'source string changed since the review'
};

/**
 * Write the corrections in a review report. An entry is skipped when its
 * translation no longer matches `current` (an edit made after the review is
 * never overwritten), or its source string no longer matches `source` (the
 * correction was for text that has since changed).
 */
export function applyReviewReport(
  projectRoot: string = process.cwd(),
  reportPath: string = DEFAULT_REVIEW_REPORT
): ApplyReviewResult {
  const config = loadConfig(projectRoot);
  const translationsPath = path.join(projectRoot, config.translationsPath);
  const resolvedReport = path.resolve(projectRoot, reportPath);

  if (!fs.existsSync(resolvedReport)) {
    throw new Error(`No review report at ${resolvedReport}. Run "poly-lexis review" first.`);
  }

  const report = parseReviewReport(readJsonFile(resolvedReport), reportPath);
  const sourceTranslations = readTranslations(translationsPath, config.sourceLanguage);
  const metadata = readMetadata(translationsPath);
  const skipped: SkippedReviewEntry[] = [];
  const toWrite = new Map<string, Record<string, string>>();
  let applied = 0;

  for (const entry of report.entries) {
    const fileKey = `${entry.language}\u0000${entry.namespace}`;
    const translations =
      toWrite.get(fileKey) ?? readTranslations(translationsPath, entry.language)[entry.namespace] ?? {};

    if (translations[entry.key] !== entry.current) {
      skipped.push({ ...entry, skipReason: 'translation-changed' });
      continue;
    }
    if (sourceTranslations[entry.namespace]?.[entry.key] !== entry.source) {
      skipped.push({ ...entry, skipReason: 'source-changed' });
      continue;
    }

    translations[entry.key] = entry.proposed;
    toWrite.set(fileKey, translations);
    setSourceHash(metadata, entry.language, entry.namespace, entry.key, entry.source, {
      translation: entry.proposed,
      provider: 'review',
      model: report.model
    });
    applied++;
  }

  for (const [fileKey, translations] of toWrite) {
    const [language, namespace] = fileKey.split('\u0000');
    writeTranslation(translationsPath, language, namespace, sortKeys(translations));
  }
  if (applied > 0) {
    writeMetadata(translationsPath, metadata);
  }

  console.log(`✓ Applied ${applied} corrections from ${resolvedReport}`);
  if (skipped.length > 0) {
    console.log(`⚠ Skipped ${skipped.length} entries changed after the review:`);
    for (const entry of skipped.slice(0, 10)) {
      console.log(
        `  ${entry.language}/${entry.namespace}.json -> ${entry.key} (${SKIP_REASON_LABEL[entry.skipReason]})`
      );
    }
    if (skipped.length > 10) {
      console.log(`  ... and ${skipped.length - 10} more`);
    }
  }

  return { applied, skipped };
}

/** JSON.parse that names the file when it was broken by a hand edit */
function readJsonFile(filePath: string): unknown {
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf-8'));
  } catch (error) {
    throw new Error(`${filePath} is not valid JSON: ${error instanceof Error ? error.message : String(error)}`);
  }
}
