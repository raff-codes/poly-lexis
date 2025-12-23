import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { validateTranslations } from '../translations/cli/validate.js';
import { syncTranslationStructure, writeTranslation } from '../translations/utils/utils.js';

describe('Orphaned Keys Detection and Removal', () => {
  let testDir: string;
  let translationsPath: string;

  beforeEach(() => {
    // Create a temporary directory for each test
    testDir = fs.mkdtempSync(path.join(os.tmpdir(), 'lexis-test-'));
    translationsPath = path.join(testDir, 'locales');

    // Create directory structure
    fs.mkdirSync(translationsPath, { recursive: true });
    fs.mkdirSync(path.join(translationsPath, 'en'), { recursive: true });
    fs.mkdirSync(path.join(translationsPath, 'fr'), { recursive: true });
    fs.mkdirSync(path.join(translationsPath, 'es'), { recursive: true });

    // Create config file
    const config = {
      translationsPath: 'locales',
      languages: ['en', 'fr', 'es'],
      sourceLanguage: 'en',
      typesOutputPath: 'src/types/i18nTypes.ts',
      provider: 'deepl',
      useFallbackLanguages: true
    };
    fs.writeFileSync(path.join(testDir, '.translationsrc.json'), JSON.stringify(config, null, 2));
  });

  afterEach(() => {
    // Clean up temporary directory
    fs.rmSync(testDir, { recursive: true, force: true });
  });

  describe('Detection', () => {
    test('should detect and clean orphaned keys during validation', () => {
      // Setup: Create source translations
      writeTranslation(translationsPath, 'en', 'common', {
        hello: 'Hello',
        goodbye: 'Goodbye'
      });

      // Setup: Create target translations with an orphaned key
      writeTranslation(translationsPath, 'fr', 'common', {
        hello: 'Bonjour',
        goodbye: 'Au revoir',
        orphanedKey: 'This key does not exist in source'
      });

      writeTranslation(translationsPath, 'es', 'common', {
        hello: 'Hola',
        goodbye: 'Adiós',
        anotherOrphan: 'Another orphaned key'
      });

      // First, verify orphaned keys exist in files
      const frBeforeSync = JSON.parse(fs.readFileSync(path.join(translationsPath, 'fr', 'common.json'), 'utf-8'));
      expect(frBeforeSync.orphanedKey).toBe('This key does not exist in source');

      // Execute validation (which auto-cleans orphaned keys via sync)
      const result = validateTranslations(testDir);

      // Assert: After validation with auto-clean, should be valid
      expect(result.valid).toBe(true);
      expect(result.orphaned).toHaveLength(0);

      // Verify orphaned keys were removed from files
      const frAfterSync = JSON.parse(fs.readFileSync(path.join(translationsPath, 'fr', 'common.json'), 'utf-8'));
      expect(frAfterSync.orphanedKey).toBeUndefined();
      expect(frAfterSync).toEqual({
        hello: 'Bonjour',
        goodbye: 'Au revoir'
      });
    });

    test('should not detect orphaned keys when all keys match source', () => {
      // Setup: Create matching translations
      writeTranslation(translationsPath, 'en', 'common', {
        hello: 'Hello',
        goodbye: 'Goodbye'
      });

      writeTranslation(translationsPath, 'fr', 'common', {
        hello: 'Bonjour',
        goodbye: 'Au revoir'
      });

      writeTranslation(translationsPath, 'es', 'common', {
        hello: 'Hola',
        goodbye: 'Adiós'
      });

      // Execute validation
      const result = validateTranslations(testDir);

      // Assert: Should not detect orphaned keys
      expect(result.orphaned).toHaveLength(0);
      expect(result.valid).toBe(true);
    });

    test('should detect and clean orphaned keys across multiple namespaces', () => {
      // Setup: Create source translations with multiple namespaces
      writeTranslation(translationsPath, 'en', 'common', {
        hello: 'Hello'
      });

      writeTranslation(translationsPath, 'en', 'errors', {
        notFound: 'Not found'
      });

      // Setup: Create target translations with orphaned keys in different namespaces
      writeTranslation(translationsPath, 'fr', 'common', {
        hello: 'Bonjour',
        oldKey: 'Old key'
      });

      writeTranslation(translationsPath, 'fr', 'errors', {
        notFound: 'Non trouvé',
        deprecatedError: 'Deprecated'
      });

      // Verify orphaned keys exist before sync
      const frCommonBefore = JSON.parse(fs.readFileSync(path.join(translationsPath, 'fr', 'common.json'), 'utf-8'));
      const frErrorsBefore = JSON.parse(fs.readFileSync(path.join(translationsPath, 'fr', 'errors.json'), 'utf-8'));
      expect(frCommonBefore.oldKey).toBe('Old key');
      expect(frErrorsBefore.deprecatedError).toBe('Deprecated');

      // Execute validation (auto-cleans via sync)
      const result = validateTranslations(testDir);

      // Assert: Should have cleaned orphaned keys
      expect(result.orphaned).toHaveLength(0);

      // Verify orphaned keys were removed
      const frCommonAfter = JSON.parse(fs.readFileSync(path.join(translationsPath, 'fr', 'common.json'), 'utf-8'));
      const frErrorsAfter = JSON.parse(fs.readFileSync(path.join(translationsPath, 'fr', 'errors.json'), 'utf-8'));
      expect(frCommonAfter.oldKey).toBeUndefined();
      expect(frErrorsAfter.deprecatedError).toBeUndefined();
    });
  });

  describe('Removal', () => {
    test('should remove orphaned keys during sync', () => {
      // Setup: Create source translations
      writeTranslation(translationsPath, 'en', 'common', {
        hello: 'Hello',
        goodbye: 'Goodbye'
      });

      // Setup: Create target translations with orphaned keys
      writeTranslation(translationsPath, 'fr', 'common', {
        hello: 'Bonjour',
        goodbye: 'Au revoir',
        orphanedKey: 'This should be removed'
      });

      // Execute sync
      const syncResult = syncTranslationStructure(translationsPath, ['en', 'fr', 'es'], 'en');

      // Assert: Should report cleaned keys
      expect(syncResult.cleanedKeys).toHaveLength(1);
      expect(syncResult.cleanedKeys[0]).toEqual({
        language: 'fr',
        namespace: 'common',
        key: 'orphanedKey'
      });

      // Assert: File should no longer contain the orphaned key
      const frCommon = JSON.parse(fs.readFileSync(path.join(translationsPath, 'fr', 'common.json'), 'utf-8'));
      expect(frCommon).toEqual({
        hello: 'Bonjour',
        goodbye: 'Au revoir'
      });
      expect(frCommon.orphanedKey).toBeUndefined();
    });

    test('should remove multiple orphaned keys from multiple languages', () => {
      // Setup: Create source with only valid keys
      writeTranslation(translationsPath, 'en', 'common', {
        currentKey: 'Current'
      });

      // Setup: Create targets with orphaned keys
      writeTranslation(translationsPath, 'fr', 'common', {
        currentKey: 'Actuel',
        oldKey1: 'Old 1',
        oldKey2: 'Old 2'
      });

      writeTranslation(translationsPath, 'es', 'common', {
        currentKey: 'Actual',
        deprecatedKey: 'Deprecated'
      });

      // Execute sync
      const syncResult = syncTranslationStructure(translationsPath, ['en', 'fr', 'es'], 'en');

      // Assert: Should report all cleaned keys
      expect(syncResult.cleanedKeys).toHaveLength(3);

      // Assert: Files should only contain valid keys
      const frCommon = JSON.parse(fs.readFileSync(path.join(translationsPath, 'fr', 'common.json'), 'utf-8'));
      expect(Object.keys(frCommon)).toEqual(['currentKey']);

      const esCommon = JSON.parse(fs.readFileSync(path.join(translationsPath, 'es', 'common.json'), 'utf-8'));
      expect(Object.keys(esCommon)).toEqual(['currentKey']);
    });

    test('should add missing keys while removing orphaned keys', () => {
      // Setup: Create source with new key
      writeTranslation(translationsPath, 'en', 'common', {
        hello: 'Hello',
        newKey: 'New Key'
      });

      // Setup: Create target with old key but missing new key
      writeTranslation(translationsPath, 'fr', 'common', {
        hello: 'Bonjour',
        oldKey: 'Old Key'
      });

      // Execute sync
      const syncResult = syncTranslationStructure(translationsPath, ['en', 'fr'], 'en');

      // Assert: Should clean orphaned key
      expect(syncResult.cleanedKeys).toHaveLength(1);

      // Assert: File should have correct keys
      const frCommon = JSON.parse(fs.readFileSync(path.join(translationsPath, 'fr', 'common.json'), 'utf-8'));
      expect(frCommon).toEqual({
        hello: 'Bonjour',
        newKey: '' // Missing key added with empty value
      });
      expect(frCommon.oldKey).toBeUndefined();
    });

    test('should not modify files when no orphaned keys exist', () => {
      // Setup: Create matching translations
      writeTranslation(translationsPath, 'en', 'common', {
        hello: 'Hello',
        goodbye: 'Goodbye'
      });

      writeTranslation(translationsPath, 'fr', 'common', {
        hello: 'Bonjour',
        goodbye: 'Au revoir'
      });

      // Get file path
      const frFilePath = path.join(translationsPath, 'fr', 'common.json');

      // Execute sync
      const syncResult = syncTranslationStructure(translationsPath, ['en', 'fr'], 'en');

      // Assert: No keys should be cleaned
      expect(syncResult.cleanedKeys).toHaveLength(0);

      // Assert: File content unchanged
      const frCommon = JSON.parse(fs.readFileSync(frFilePath, 'utf-8'));
      expect(frCommon).toEqual({
        hello: 'Bonjour',
        goodbye: 'Au revoir'
      });
    });
  });

  describe('Validation after sync', () => {
    test('should pass validation after sync removes orphaned keys', () => {
      // Setup: Create source
      writeTranslation(translationsPath, 'en', 'common', {
        hello: 'Hello'
      });

      // Setup: Create target with orphaned key
      writeTranslation(translationsPath, 'fr', 'common', {
        hello: 'Bonjour',
        orphanedKey: 'Should be removed'
      });

      // Setup: Create es with matching keys
      writeTranslation(translationsPath, 'es', 'common', {
        hello: 'Hola'
      });

      // Execute validation (which triggers sync)
      const result = validateTranslations(testDir);

      // Assert: Validation should pass after sync
      expect(result.valid).toBe(true);
      expect(result.orphaned).toHaveLength(0);

      // Verify the orphaned key was removed
      const frCommon = JSON.parse(fs.readFileSync(path.join(translationsPath, 'fr', 'common.json'), 'utf-8'));
      expect(frCommon.orphanedKey).toBeUndefined();
      expect(frCommon).toEqual({ hello: 'Bonjour' });
    });
  });
});
