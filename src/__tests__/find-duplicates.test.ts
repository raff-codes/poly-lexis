import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { findDuplicates } from '../translations/cli/find-duplicates.js';
import { writeTranslation } from '../translations/utils/utils.js';

describe('Find Duplicate Translation Keys', () => {
  let testDir: string;
  let translationsPath: string;

  beforeEach(() => {
    testDir = fs.mkdtempSync(path.join(os.tmpdir(), 'lexis-test-'));
    translationsPath = path.join(testDir, 'locales');

    fs.mkdirSync(path.join(translationsPath, 'en'), { recursive: true });

    const config = {
      translationsPath: 'locales',
      languages: ['en', 'fr'],
      sourceLanguage: 'en',
      typesOutputPath: 'src/types/i18nTypes.ts',
      provider: 'deepl',
      useFallbackLanguages: true,
      searchPaths: ['src'],
      searchExtensions: ['.ts', '.tsx']
    };
    fs.writeFileSync(path.join(testDir, '.translationsrc.json'), JSON.stringify(config, null, 2));
  });

  afterEach(() => {
    fs.rmSync(testDir, { recursive: true, force: true });
  });

  test('should detect values duplicated from common namespace', () => {
    writeTranslation(translationsPath, 'en', 'common', {
      ERROR: 'Error',
      LOADING: 'Loading',
      SAVE: 'Save'
    });

    writeTranslation(translationsPath, 'en', 'errors', {
      ERROR_GENERIC: 'Error',
      LOADING_TEXT: 'Loading',
      SPECIFIC_ERROR: 'Something went wrong'
    });

    const result = findDuplicates(testDir);

    expect(result.duplicates.length).toBe(2);
    expect(result.totalKeysChecked).toBe(3);

    const errorDup = result.duplicates.find((d) => d.key === 'ERROR_GENERIC');
    expect(errorDup).toBeDefined();
    expect(errorDup?.namespace).toBe('errors');
    expect(errorDup?.commonKey).toBe('ERROR');
    expect(errorDup?.value).toBe('Error');

    const loadingDup = result.duplicates.find((d) => d.key === 'LOADING_TEXT');
    expect(loadingDup).toBeDefined();
    expect(loadingDup?.commonKey).toBe('LOADING');
  });

  test('should return no duplicates when values are unique', () => {
    writeTranslation(translationsPath, 'en', 'common', {
      SAVE: 'Save',
      CANCEL: 'Cancel'
    });

    writeTranslation(translationsPath, 'en', 'errors', {
      NOT_FOUND: 'Not found',
      FORBIDDEN: 'Forbidden'
    });

    const result = findDuplicates(testDir);

    expect(result.duplicates.length).toBe(0);
    expect(result.totalKeysChecked).toBe(2);
  });

  test('should check multiple non-common namespaces', () => {
    writeTranslation(translationsPath, 'en', 'common', {
      SAVE: 'Save',
      LOADING: 'Loading'
    });

    writeTranslation(translationsPath, 'en', 'errors', {
      SAVE_ERROR: 'Save error',
      LOADING_MSG: 'Loading'
    });

    writeTranslation(translationsPath, 'en', 'settings', {
      SAVE_BTN: 'Save',
      THEME: 'Theme'
    });

    const result = findDuplicates(testDir);

    expect(result.duplicates.length).toBe(2);
    expect(result.totalKeysChecked).toBe(4);

    const namespaces = result.duplicates.map((d) => d.namespace);
    expect(namespaces).toContain('errors');
    expect(namespaces).toContain('settings');
  });

  test('should not compare common namespace against itself', () => {
    writeTranslation(translationsPath, 'en', 'common', {
      SAVE: 'Save',
      CANCEL: 'Cancel'
    });

    const result = findDuplicates(testDir);

    expect(result.duplicates.length).toBe(0);
    expect(result.totalKeysChecked).toBe(0);
  });

  test('should handle empty common namespace', () => {
    writeTranslation(translationsPath, 'en', 'common', {});

    writeTranslation(translationsPath, 'en', 'errors', {
      ERROR: 'Error'
    });

    const result = findDuplicates(testDir);

    expect(result.duplicates.length).toBe(0);
    expect(result.totalKeysChecked).toBe(0);
  });

  test('should handle missing common namespace', () => {
    writeTranslation(translationsPath, 'en', 'errors', {
      ERROR: 'Error'
    });

    const result = findDuplicates(testDir);

    expect(result.duplicates.length).toBe(0);
    expect(result.totalKeysChecked).toBe(0);
  });

  test('should handle empty non-common namespaces', () => {
    writeTranslation(translationsPath, 'en', 'common', {
      SAVE: 'Save'
    });

    writeTranslation(translationsPath, 'en', 'errors', {});

    const result = findDuplicates(testDir);

    expect(result.duplicates.length).toBe(0);
    expect(result.totalKeysChecked).toBe(0);
  });

  test('should match by exact value only', () => {
    writeTranslation(translationsPath, 'en', 'common', {
      SAVE: 'Save'
    });

    writeTranslation(translationsPath, 'en', 'settings', {
      SAVE_CHANGES: 'Save changes',
      SAVE_DRAFT: 'Save draft',
      EXACT_SAVE: 'Save'
    });

    const result = findDuplicates(testDir);

    expect(result.duplicates.length).toBe(1);
    expect(result.duplicates[0].key).toBe('EXACT_SAVE');
    expect(result.duplicates[0].value).toBe('Save');
  });

  test('should handle nested translation structures', () => {
    // Write nested structure directly (flattened by readTranslations)
    const nestedCommon = { buttons: { SAVE: 'Save', CANCEL: 'Cancel' } };
    fs.writeFileSync(path.join(translationsPath, 'en', 'common.json'), JSON.stringify(nestedCommon, null, 2));

    writeTranslation(translationsPath, 'en', 'settings', {
      SAVE_BTN: 'Save'
    });

    const result = findDuplicates(testDir);

    expect(result.duplicates.length).toBe(1);
    expect(result.duplicates[0].key).toBe('SAVE_BTN');
    expect(result.duplicates[0].commonKey).toBe('buttons.SAVE');
  });

  test('should handle values with special characters', () => {
    writeTranslation(translationsPath, 'en', 'common', {
      GREETING: 'Hello, {{name}}!',
      QUOTE: 'It\'s a "test"'
    });

    writeTranslation(translationsPath, 'en', 'profile', {
      WELCOME: 'Hello, {{name}}!',
      BIO_QUOTE: 'Something else'
    });

    const result = findDuplicates(testDir);

    expect(result.duplicates.length).toBe(1);
    expect(result.duplicates[0].key).toBe('WELCOME');
    expect(result.duplicates[0].value).toBe('Hello, {{name}}!');
  });

  test('should use first common key when multiple common keys share the same value', () => {
    writeTranslation(translationsPath, 'en', 'common', {
      BTN_SAVE: 'Save',
      SAVE_ACTION: 'Save'
    });

    writeTranslation(translationsPath, 'en', 'settings', {
      SAVE_BTN: 'Save'
    });

    const result = findDuplicates(testDir);

    expect(result.duplicates.length).toBe(1);
    expect(result.duplicates[0].commonKey).toBe('BTN_SAVE');
  });
});
