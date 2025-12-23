import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { findUnusedKeys } from '../translations/cli/find-unused.js';
import { writeTranslation } from '../translations/utils/utils.js';

describe('Find Unused Translation Keys', () => {
  let testDir: string;
  let translationsPath: string;
  let srcPath: string;

  beforeEach(() => {
    // Create a temporary directory for each test
    testDir = fs.mkdtempSync(path.join(os.tmpdir(), 'lexis-test-'));
    translationsPath = path.join(testDir, 'locales');
    srcPath = path.join(testDir, 'src');

    // Create directory structure
    fs.mkdirSync(translationsPath, { recursive: true });
    fs.mkdirSync(path.join(translationsPath, 'en'), { recursive: true });
    fs.mkdirSync(srcPath, { recursive: true });

    // Create config file with search paths
    const config = {
      translationsPath: 'locales',
      languages: ['en', 'fr'],
      sourceLanguage: 'en',
      typesOutputPath: 'src/types/i18nTypes.ts',
      provider: 'deepl',
      useFallbackLanguages: true,
      searchPaths: ['src'],
      searchExtensions: ['.ts', '.tsx', '.js', '.jsx']
    };
    fs.writeFileSync(path.join(testDir, '.translationsrc.json'), JSON.stringify(config, null, 2));
  });

  afterEach(() => {
    // Clean up temporary directory
    fs.rmSync(testDir, { recursive: true, force: true });
  });

  test('should detect unused keys when not referenced in code', () => {
    // Setup: Create translations
    writeTranslation(translationsPath, 'en', 'common', {
      HELLO: 'Hello',
      GOODBYE: 'Goodbye',
      UNUSED_KEY: 'This is not used'
    });

    // Setup: Create source file that uses some keys
    const sourceCode = `
      import { t } from 'i18n';

      function greeting() {
        return t('HELLO');
      }

      function farewell() {
        return t('GOODBYE');
      }
    `;
    fs.writeFileSync(path.join(srcPath, 'example.ts'), sourceCode);

    // Execute
    const result = findUnusedKeys(testDir);

    // Assert
    expect(result.totalKeys).toBe(3);
    expect(result.unused.length).toBe(1);
    expect(result.unused[0].key).toBe('UNUSED_KEY');
    expect(result.unused[0].namespace).toBe('common');
    expect(result.unused[0].usageType).toBe('unused');
  });

  test('should detect all keys as used when all are referenced', () => {
    // Setup: Create translations
    writeTranslation(translationsPath, 'en', 'common', {
      HELLO: 'Hello',
      GOODBYE: 'Goodbye'
    });

    // Setup: Create source file that uses all keys
    const sourceCode = `
      import { t } from 'i18n';

      const greeting = t('HELLO');
      const farewell = t('GOODBYE');
    `;
    fs.writeFileSync(path.join(srcPath, 'example.ts'), sourceCode);

    // Execute
    const result = findUnusedKeys(testDir);

    // Assert
    expect(result.totalKeys).toBe(2);
    expect(result.unused.length).toBe(0);
  });

  test('should detect keys with partial word matches', () => {
    // Setup: Create translations with keys that might be used dynamically
    writeTranslation(translationsPath, 'en', 'settings', {
      VERY_LONG_SPECIFIC_KEY_NAME: 'Very long name',
      COMPLETELY_UNUSED_KEY: 'Unused'
    });

    // Setup: Create source file with partial key usage (parts appear in code)
    const sourceCode = `
      // If significant parts of the key appear, it suggests possible dynamic usage
      const config = {
        specificKey: 'SPECIFIC',
        keyType: 'KEY',
        prefix: 'VERY'
      };
    `;
    fs.writeFileSync(path.join(srcPath, 'settings.ts'), sourceCode);

    // Execute
    const result = findUnusedKeys(testDir);

    // Assert
    expect(result.totalKeys).toBe(2);

    // The algorithm should detect these - at minimum COMPLETELY_UNUSED_KEY should be unused
    const completelyUnused = result.unused.find((u) => u.key === 'COMPLETELY_UNUSED_KEY');
    expect(completelyUnused).toBeDefined();
    expect(completelyUnused?.usageType).toBe('unused');

    // VERY_LONG_SPECIFIC_KEY_NAME might be detected as partial since SPECIFIC, KEY, VERY appear
    const specificKey = result.unused.find((u) => u.key === 'VERY_LONG_SPECIFIC_KEY_NAME');
    if (specificKey) {
      // If it's detected as unused, it should be partial since parts exist
      expect(['unused', 'partial']).toContain(specificKey.usageType);
    }
  });

  test('should handle multiple namespaces', () => {
    // Setup: Create translations in multiple namespaces
    writeTranslation(translationsPath, 'en', 'common', {
      HELLO: 'Hello',
      UNUSED_COMMON: 'Unused in common'
    });

    writeTranslation(translationsPath, 'en', 'errors', {
      ERROR_MESSAGE: 'Error',
      UNUSED_ERROR: 'Unused in errors'
    });

    // Setup: Create source file using only some keys
    const sourceCode = `
      const greeting = t('common', 'HELLO');
      const error = t('errors', 'ERROR_MESSAGE');
    `;
    fs.writeFileSync(path.join(srcPath, 'app.ts'), sourceCode);

    // Execute
    const result = findUnusedKeys(testDir);

    // Assert
    expect(result.totalKeys).toBe(4);
    expect(result.unused.length).toBe(2);

    const unusedKeys = result.unused.map((u) => ({ ns: u.namespace, key: u.key }));
    expect(unusedKeys).toContainEqual({ ns: 'common', key: 'UNUSED_COMMON' });
    expect(unusedKeys).toContainEqual({ ns: 'errors', key: 'UNUSED_ERROR' });
  });

  test('should search multiple file types', () => {
    // Setup: Create translations
    writeTranslation(translationsPath, 'en', 'common', {
      TS_KEY: 'TypeScript',
      JSX_KEY: 'JSX',
      UNUSED_KEY: 'Unused'
    });

    // Setup: Create different file types
    fs.writeFileSync(path.join(srcPath, 'file1.ts'), 'const x = t("TS_KEY");');
    fs.writeFileSync(path.join(srcPath, 'file2.jsx'), 'const y = t("JSX_KEY");');

    // Execute
    const result = findUnusedKeys(testDir);

    // Assert
    expect(result.searchedFiles).toBe(2);
    expect(result.unused.length).toBe(1);
    expect(result.unused[0].key).toBe('UNUSED_KEY');
  });

  test('should handle empty translations', () => {
    // Setup: Create empty translation file
    writeTranslation(translationsPath, 'en', 'common', {});

    // Execute
    const result = findUnusedKeys(testDir);

    // Assert
    expect(result.totalKeys).toBe(0);
    expect(result.unused.length).toBe(0);
  });

  test('should detect keys with different quote styles', () => {
    // Setup: Create translations
    writeTranslation(translationsPath, 'en', 'common', {
      SINGLE_QUOTE: 'Single',
      DOUBLE_QUOTE: 'Double',
      BACKTICK: 'Backtick',
      UNUSED: 'Unused'
    });

    // Setup: Create source with different quote styles
    const sourceCode = `
      const a = t('SINGLE_QUOTE');
      const b = t("DOUBLE_QUOTE");
      const c = t(\`BACKTICK\`);
    `;
    fs.writeFileSync(path.join(srcPath, 'quotes.ts'), sourceCode);

    // Execute
    const result = findUnusedKeys(testDir);

    // Assert
    expect(result.unused.length).toBe(1);
    expect(result.unused[0].key).toBe('UNUSED');
  });

  test('should exclude common build directories from search', () => {
    // Setup: Create translations
    writeTranslation(translationsPath, 'en', 'common', {
      USED_KEY: 'Used',
      FAKE_USED_KEY: 'Fake used'
    });

    // Setup: Create source file in src
    fs.writeFileSync(path.join(srcPath, 'app.ts'), 'const x = t("USED_KEY");');

    // Setup: Create file in node_modules (should be ignored)
    const nodeModulesPath = path.join(testDir, 'node_modules');
    fs.mkdirSync(nodeModulesPath, { recursive: true });
    fs.writeFileSync(path.join(nodeModulesPath, 'lib.js'), 'const y = t("FAKE_USED_KEY");');

    // Execute
    const result = findUnusedKeys(testDir);

    // Assert: FAKE_USED_KEY should be marked as unused because node_modules was excluded
    expect(result.unused.length).toBe(1);
    expect(result.unused[0].key).toBe('FAKE_USED_KEY');
  });
});
