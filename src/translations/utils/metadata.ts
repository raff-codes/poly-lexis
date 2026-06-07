import { createHash } from 'node:crypto';
import * as fs from 'node:fs';
import * as path from 'node:path';

/**
 * Name of the sidecar file (stored at the root of the translations directory)
 * that records a hash of the source value each translation was generated from.
 * This lets us detect when a source string has changed since its translations
 * were written, so we can flag stale translations and optionally re-translate them.
 */
export const METADATA_FILE_NAME = '.translations-meta.json';

/**
 * Per-language map of namespace -> key -> source value hash.
 */
export interface TranslationMetadata {
  /** Schema version, for forward compatibility */
  version: number;
  /** language -> namespace -> key -> hash of the source value at translation time */
  languages: {
    [language: string]: {
      [namespace: string]: {
        [key: string]: string;
      };
    };
  };
}

const CURRENT_VERSION = 1;

/**
 * Create an empty metadata structure
 */
export function emptyMetadata(): TranslationMetadata {
  return { version: CURRENT_VERSION, languages: {} };
}

/**
 * Compute a stable hash of a source value. Used to detect changes to source
 * strings after their translations have been generated.
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
    const parsed = JSON.parse(fs.readFileSync(metadataPath, 'utf-8')) as Partial<TranslationMetadata>;
    return {
      version: parsed.version ?? CURRENT_VERSION,
      languages: parsed.languages ?? {}
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

/**
 * Record (in memory) the source value a translation was generated from.
 * Mutates and returns the provided metadata object so callers can batch many
 * updates before a single {@link writeMetadata} call.
 */
export function setSourceHash(
  metadata: TranslationMetadata,
  language: string,
  namespace: string,
  key: string,
  sourceValue: string
): TranslationMetadata {
  if (!metadata.languages[language]) {
    metadata.languages[language] = {};
  }
  if (!metadata.languages[language][namespace]) {
    metadata.languages[language][namespace] = {};
  }
  metadata.languages[language][namespace][key] = hashSourceValue(sourceValue);
  return metadata;
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
  return metadata.languages[language]?.[namespace]?.[key];
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
