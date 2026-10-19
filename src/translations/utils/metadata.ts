import { createHash } from 'node:crypto';
import * as fs from 'node:fs';
import * as path from 'node:path';

/**
 * Name of the sidecar file (stored at the root of the translations directory)
 * that records how each translation was produced: a hash of the source value it
 * was generated from, a hash of the value that was written, and which provider
 * wrote it. This lets us detect when a source string has changed since its
 * translations were written (stale), and when someone has edited a translation
 * by hand (so automatic runs leave it alone).
 */
export const METADATA_FILE_NAME = '.translations-meta.json';

/** What poly-lexis recorded about one translation */
export interface TranslationMetadataEntry {
  /** Hash of the source value the translation was generated from */
  sourceHash: string;
  /**
   * Hash of the translation as poly-lexis wrote it. When the file's value no
   * longer matches, a person has edited it and automatic runs skip it.
   */
  translationHash?: string;
  /** Hash of the context the translation was generated with */
  contextHash?: string;
  /** Provider that wrote it: 'deepl', 'google', 'claude-api', 'claude-code', 'review' or 'baseline' */
  provider?: string;
  /** Model that wrote it, for LLM providers */
  model?: string;
}

/**
 * Per-language map of namespace -> key -> entry.
 */
export interface TranslationMetadata {
  /** Schema version, for forward compatibility */
  version: number;
  /** language -> namespace -> key -> what was recorded at translation time */
  languages: {
    [language: string]: {
      [namespace: string]: {
        [key: string]: TranslationMetadataEntry;
      };
    };
  };
}

const CURRENT_VERSION = 2;

/**
 * Create an empty metadata structure
 */
export function emptyMetadata(): TranslationMetadata {
  return { version: CURRENT_VERSION, languages: {} };
}

/**
 * Compute a stable hash of a value. Used to detect changes to source strings
 * after their translations have been generated, and hand edits to translations.
 */
export function hashSourceValue(value: string): string {
  return createHash('sha256').update(value).digest('hex').slice(0, 16);
}

/**
 * Absolute path to the metadata sidecar file
 */
export function getMetadataPath(translationsPath: string): string {
  return path.join(translationsPath, METADATA_FILE_NAME);
}

/**
 * Whether a metadata sidecar file exists for this translations directory
 */
export function metadataExists(translationsPath: string): boolean {
  return fs.existsSync(getMetadataPath(translationsPath));
}

type StoredEntry = string | TranslationMetadataEntry;

/**
 * Version 1 stored a bare source hash per key. Read those as entries with only
 * a source hash so older sidecar files keep working and upgrade on next write.
 */
function normalizeLanguages(
  languages: Record<string, Record<string, Record<string, StoredEntry>>> | undefined
): TranslationMetadata['languages'] {
  const result: TranslationMetadata['languages'] = {};

  for (const [language, namespaces] of Object.entries(languages ?? {})) {
    result[language] = {};
    for (const [namespace, keys] of Object.entries(namespaces)) {
      result[language][namespace] = {};
      for (const [key, stored] of Object.entries(keys)) {
        result[language][namespace][key] = typeof stored === 'string' ? { sourceHash: stored } : stored;
      }
    }
  }

  return result;
}

/**
 * Read the metadata sidecar file. Returns an empty structure if it does not
 * exist or cannot be parsed.
 */
export function readMetadata(translationsPath: string): TranslationMetadata {
  const metadataPath = getMetadataPath(translationsPath);

  if (!fs.existsSync(metadataPath)) {
    return emptyMetadata();
  }

  try {
    const parsed = JSON.parse(fs.readFileSync(metadataPath, 'utf-8')) as {
      languages?: Record<string, Record<string, Record<string, StoredEntry>>>;
    };
    return {
      version: CURRENT_VERSION,
      languages: normalizeLanguages(parsed.languages)
    };
  } catch {
    // Corrupt metadata should never break translation operations
    return emptyMetadata();
  }
}

/**
 * Write the metadata sidecar file
 */
export function writeMetadata(translationsPath: string, metadata: TranslationMetadata): void {
  if (!fs.existsSync(translationsPath)) {
    fs.mkdirSync(translationsPath, { recursive: true });
  }

  const metadataPath = getMetadataPath(translationsPath);
  fs.writeFileSync(metadataPath, `${JSON.stringify(metadata, null, 2)}\n`, 'utf-8');
}

/** Details recorded alongside the source hash when a translation is written */
export interface TranslationRecordDetails {
  /** The translation that was written; its hash is used to spot hand edits */
  translation?: string;
  /** Hash of the context the translation was generated with */
  contextHash?: string;
  provider?: string;
  model?: string;
}

/**
 * Record (in memory) the source value a translation was generated from, plus
 * optional details about how it was produced. Mutates and returns the provided
 * metadata object so callers can batch many updates before a single
 * {@link writeMetadata} call.
 */
export function setSourceHash(
  metadata: TranslationMetadata,
  language: string,
  namespace: string,
  key: string,
  sourceValue: string,
  details: TranslationRecordDetails = {}
): TranslationMetadata {
  if (!metadata.languages[language]) {
    metadata.languages[language] = {};
  }
  if (!metadata.languages[language][namespace]) {
    metadata.languages[language][namespace] = {};
  }
  metadata.languages[language][namespace][key] = {
    sourceHash: hashSourceValue(sourceValue),
    ...(details.translation !== undefined && { translationHash: hashSourceValue(details.translation) }),
    ...(details.contextHash && { contextHash: details.contextHash }),
    ...(details.provider && { provider: details.provider }),
    ...(details.model && { model: details.model })
  };
  return metadata;
}

/**
 * Get everything recorded for a translation, or undefined if nothing was.
 */
export function getMetadataEntry(
  metadata: TranslationMetadata,
  language: string,
  namespace: string,
  key: string
): TranslationMetadataEntry | undefined {
  return metadata.languages[language]?.[namespace]?.[key];
}

/**
 * Get the stored source value hash for a translation, or undefined if none was
 * recorded (e.g. for translations written before tracking was enabled).
 */
export function getSourceHash(
  metadata: TranslationMetadata,
  language: string,
  namespace: string,
  key: string
): string | undefined {
  return getMetadataEntry(metadata, language, namespace, key)?.sourceHash;
}

/**
 * Whether a person has changed this translation since poly-lexis wrote it.
 * Only detectable for translations written with a translation hash.
 */
export function isManuallyEdited(
  metadata: TranslationMetadata,
  language: string,
  namespace: string,
  key: string,
  currentValue: string
): boolean {
  const translationHash = getMetadataEntry(metadata, language, namespace, key)?.translationHash;
  return translationHash !== undefined && translationHash !== hashSourceValue(currentValue);
}

/**
 * Remove any recorded hashes that no longer correspond to a key present in the
 * source translations. `sourceKeysByNamespace` maps each source namespace to the
 * set of keys it currently contains. Returns true if anything was pruned.
 */
export function pruneMetadata(
  metadata: TranslationMetadata,
  sourceKeysByNamespace: Record<string, Set<string>>
): boolean {
  let changed = false;

  for (const language of Object.keys(metadata.languages)) {
    const namespaces = metadata.languages[language];

    for (const namespace of Object.keys(namespaces)) {
      const sourceKeys = sourceKeysByNamespace[namespace];

      // Namespace removed from source entirely
      if (!sourceKeys) {
        delete namespaces[namespace];
        changed = true;
        continue;
      }

      for (const key of Object.keys(namespaces[namespace])) {
        if (!sourceKeys.has(key)) {
          delete namespaces[namespace][key];
          changed = true;
        }
      }

      if (Object.keys(namespaces[namespace]).length === 0) {
        delete namespaces[namespace];
        changed = true;
      }
    }

    if (Object.keys(namespaces).length === 0) {
      delete metadata.languages[language];
      changed = true;
    }
  }

  return changed;
}
