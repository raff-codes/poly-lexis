import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { ensureBaselineMetadata, getMissingForLanguage, validateTranslations } from '../translations/cli/validate.js';
import {
  emptyMetadata,
  getMetadataPath,
  getSourceHash,
  hashSourceValue,
  pruneMetadata,
  readMetadata,
  setSourceHash,
  writeMetadata
} from '../translations/utils/metadata.js';
import { syncTranslationStructure, writeTranslation } from '../translations/utils/utils.js';

describe('Stale translation detection', () => {
  let testDir: string;
  let translationsPath: string;

  beforeEach(() => {
    testDir = fs.mkdtempSync(path.join(os.tmpdir(), 'lexis-stale-'));
    translationsPath = path.join(testDir, 'locales');

    fs.mkdirSync(path.join(translationsPath, 'en'), { recursive: true });
    fs.mkdirSync(path.join(translationsPath, 'fr'), { recursive: true });

    const config = {
      translationsPath: 'locales',
      languages: ['en', 'fr'],
      sourceLanguage: 'en',
      typesOutputPath: 'src/types/i18nTypes.ts',
      provider: 'deepl',
      useFallbackLanguages: true
    };
    fs.writeFileSync(path.join(testDir, '.translationsrc.json'), JSON.stringify(config, null, 2));
  });

  afterEach(() => {
    fs.rmSync(testDir, { recursive: true, force: true });
  });

  /** Write a metadata sidecar recording that fr.common.<key> was translated from `sourceValue`. */
  function recordHash(key: string, sourceValue: string, namespace = 'common'): void {
    const metadata = readMetadata(translationsPath);
    setSourceHash(metadata, 'fr', namespace, key, sourceValue);
    writeMetadata(translationsPath, metadata);
  }

  describe('metadata helpers', () => {
    test('setSourceHash / getSourceHash round-trip', () => {
      const metadata = emptyMetadata();
      setSourceHash(metadata, 'fr', 'common', 'HELLO', 'Hello');
      expect(getSourceHash(metadata, 'fr', 'common', 'HELLO')).toBe(hashSourceValue('Hello'));
      expect(getSourceHash(metadata, 'es', 'common', 'HELLO')).toBeUndefined();
    });

    test('hashSourceValue changes when the source changes', () => {
      expect(hashSourceValue('Hello')).toBe(hashSourceValue('Hello'));
      expect(hashSourceValue('Hello')).not.toBe(hashSourceValue('Hi'));
    });

    test('readMetadata returns empty structure when no file exists', () => {
      const metadata = readMetadata(translationsPath);
      expect(metadata.languages).toEqual({});
    });

    test('pruneMetadata removes keys and namespaces no longer in source', () => {
      const metadata = emptyMetadata();
      setSourceHash(metadata, 'fr', 'common', 'KEPT', 'a');
      setSourceHash(metadata, 'fr', 'common', 'GONE', 'b');
      setSourceHash(metadata, 'fr', 'removed', 'X', 'c');

      const changed = pruneMetadata(metadata, { common: new Set(['KEPT']) });

      expect(changed).toBe(true);
      expect(getSourceHash(metadata, 'fr', 'common', 'KEPT')).toBeDefined();
      expect(getSourceHash(metadata, 'fr', 'common', 'GONE')).toBeUndefined();
      expect(metadata.languages.fr?.removed).toBeUndefined();
    });
  });

  describe('validateTranslations', () => {
    test('flags a translation as stale when the source value changed', () => {
      writeTranslation(translationsPath, 'en', 'common', { HELLO: 'Hi there' });
      writeTranslation(translationsPath, 'fr', 'common', { HELLO: 'Bonjour' });
      // Recorded against the OLD source value
      recordHash('HELLO', 'Hello');

      const result = validateTranslations(testDir);

      expect(result.stale).toHaveLength(1);
      expect(result.stale[0]).toMatchObject({
        language: 'fr',
        namespace: 'common',
        key: 'HELLO',
        sourceValue: 'Hi there',
        currentValue: 'Bonjour'
      });
      // Stale alone does not make the set invalid
      expect(result.valid).toBe(true);
    });

    test('does not flag a translation when the source value is unchanged', () => {
      writeTranslation(translationsPath, 'en', 'common', { HELLO: 'Hello' });
      writeTranslation(translationsPath, 'fr', 'common', { HELLO: 'Bonjour' });
      recordHash('HELLO', 'Hello');

      const result = validateTranslations(testDir);

      expect(result.stale).toHaveLength(0);
      expect(result.valid).toBe(true);
    });

    test('does not flag translations with no recorded hash (pre-tracking)', () => {
      writeTranslation(translationsPath, 'en', 'common', { HELLO: 'Changed' });
      writeTranslation(translationsPath, 'fr', 'common', { HELLO: 'Bonjour' });
      // No metadata written at all

      const result = validateTranslations(testDir);

      expect(result.stale).toHaveLength(0);
    });

    test('a key that is empty is reported as empty, not stale', () => {
      writeTranslation(translationsPath, 'en', 'common', { HELLO: 'Changed' });
      writeTranslation(translationsPath, 'fr', 'common', { HELLO: '' });
      recordHash('HELLO', 'Hello');

      const result = validateTranslations(testDir);

      expect(result.stale).toHaveLength(0);
      expect(result.empty).toHaveLength(1);
    });
  });

  describe('getMissingForLanguage', () => {
    test('excludes stale items by default and includes them with includeStale', () => {
      writeTranslation(translationsPath, 'en', 'common', { HELLO: 'Changed', BYE: 'Bye' });
      writeTranslation(translationsPath, 'fr', 'common', { HELLO: 'Bonjour', BYE: '' });
      recordHash('HELLO', 'Hello');

      const withoutStale = getMissingForLanguage(testDir, 'fr');
      expect(withoutStale.map((i) => i.key)).toEqual(['BYE']);

      const withStale = getMissingForLanguage(testDir, 'fr', { includeStale: true });
      const stale = withStale.find((i) => i.key === 'HELLO');
      expect(stale).toMatchObject({ key: 'HELLO', type: 'stale', sourceValue: 'Changed' });
    });
  });

  describe('ensureBaselineMetadata (existing codebases)', () => {
    test('records hashes for already-translated keys and creates the file', () => {
      writeTranslation(translationsPath, 'en', 'common', { HELLO: 'Hello', BYE: 'Bye' });
      writeTranslation(translationsPath, 'fr', 'common', { HELLO: 'Bonjour', BYE: 'Au revoir' });
      expect(fs.existsSync(getMetadataPath(translationsPath))).toBe(false);

      const result = ensureBaselineMetadata(testDir);

      expect(result).toEqual({ recorded: 2, created: true });
      const metadata = readMetadata(translationsPath);
      expect(getSourceHash(metadata, 'fr', 'common', 'HELLO')).toBe(hashSourceValue('Hello'));
      expect(getSourceHash(metadata, 'fr', 'common', 'BYE')).toBe(hashSourceValue('Bye'));
    });

    test('baseline makes a subsequent source change detectable as stale', () => {
      writeTranslation(translationsPath, 'en', 'common', { HELLO: 'Hello' });
      writeTranslation(translationsPath, 'fr', 'common', { HELLO: 'Bonjour' });

      // Without a baseline, the source change is invisible
      writeTranslation(translationsPath, 'en', 'common', { HELLO: 'Hi there' });
      expect(validateTranslations(testDir).stale).toHaveLength(0);

      // Reset to original and baseline it, then change the source
      writeTranslation(translationsPath, 'en', 'common', { HELLO: 'Hello' });
      ensureBaselineMetadata(testDir);
      writeTranslation(translationsPath, 'en', 'common', { HELLO: 'Hi there' });

      expect(validateTranslations(testDir).stale).toHaveLength(1);
    });

    test('does not overwrite an existing hash (preserves stale detection)', () => {
      writeTranslation(translationsPath, 'en', 'common', { HELLO: 'Hi there' });
      writeTranslation(translationsPath, 'fr', 'common', { HELLO: 'Bonjour' });
      // Pre-existing hash recorded against the OLD source value
      recordHash('HELLO', 'Hello');

      const result = ensureBaselineMetadata(testDir);

      // Nothing recorded — the key was already tracked
      expect(result.recorded).toBe(0);
      const metadata = readMetadata(translationsPath);
      expect(getSourceHash(metadata, 'fr', 'common', 'HELLO')).toBe(hashSourceValue('Hello'));
      // Still flagged as stale
      expect(validateTranslations(testDir).stale).toHaveLength(1);
    });

    test('skips empty translations and does not create a file when nothing is translated', () => {
      writeTranslation(translationsPath, 'en', 'common', { HELLO: 'Hello' });
      writeTranslation(translationsPath, 'fr', 'common', { HELLO: '' });

      const result = ensureBaselineMetadata(testDir);

      expect(result).toEqual({ recorded: 0, created: false });
      expect(fs.existsSync(getMetadataPath(translationsPath))).toBe(false);
    });

    test('only baselines untracked keys, leaving tracked ones intact', () => {
      writeTranslation(translationsPath, 'en', 'common', { HELLO: 'Hello', BYE: 'Bye' });
      writeTranslation(translationsPath, 'fr', 'common', { HELLO: 'Bonjour', BYE: 'Au revoir' });
      // HELLO is already tracked; BYE is not
      recordHash('HELLO', 'Hello');

      const result = ensureBaselineMetadata(testDir);

      expect(result.recorded).toBe(1);
      const metadata = readMetadata(translationsPath);
      expect(getSourceHash(metadata, 'fr', 'common', 'BYE')).toBe(hashSourceValue('Bye'));
    });
  });

  describe('syncTranslationStructure metadata pruning', () => {
    test('prunes metadata for keys removed from source', () => {
      writeTranslation(translationsPath, 'en', 'common', { HELLO: 'Hello' });
      writeTranslation(translationsPath, 'fr', 'common', { HELLO: 'Bonjour' });
      const metadata = emptyMetadata();
      setSourceHash(metadata, 'fr', 'common', 'HELLO', 'Hello');
      setSourceHash(metadata, 'fr', 'common', 'OLD_KEY', 'Old');
      writeMetadata(translationsPath, metadata);

      syncTranslationStructure(translationsPath, ['en', 'fr'], 'en');

      const after = readMetadata(translationsPath);
      expect(getSourceHash(after, 'fr', 'common', 'HELLO')).toBeDefined();
      expect(getSourceHash(after, 'fr', 'common', 'OLD_KEY')).toBeUndefined();
    });

    test('does not create a metadata file when none exists', () => {
      writeTranslation(translationsPath, 'en', 'common', { HELLO: 'Hello' });
      writeTranslation(translationsPath, 'fr', 'common', { HELLO: 'Bonjour' });

      syncTranslationStructure(translationsPath, ['en', 'fr'], 'en');

      expect(fs.existsSync(getMetadataPath(translationsPath))).toBe(false);
    });
  });
});
