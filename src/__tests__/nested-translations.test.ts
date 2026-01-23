import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { validateTranslations } from '../translations/cli/validate.js';
import {
  flattenObject,
  isNestedObject,
  readTranslations,
  syncTranslationStructure,
  unflattenObject,
  writeTranslation
} from '../translations/utils/utils.js';

describe('Flatten/Unflatten Utilities', () => {
  describe('flattenObject', () => {
    test('should return flat object unchanged', () => {
      const flat = {
        HELLO: 'Hello',
        GOODBYE: 'Goodbye'
      };

      const result = flattenObject(flat);

      expect(result).toEqual(flat);
    });

    test('should flatten single level nesting', () => {
      const nested = {
        home: {
          title: 'Home',
          subtitle: 'Welcome'
        }
      };

      const result = flattenObject(nested);

      expect(result).toEqual({
        'home.title': 'Home',
        'home.subtitle': 'Welcome'
      });
    });

    test('should flatten deeply nested objects', () => {
      const nested = {
        pages: {
          home: {
            header: {
              title: 'Welcome',
              description: 'Hello world'
            }
          }
        }
      };

      const result = flattenObject(nested);

      expect(result).toEqual({
        'pages.home.header.title': 'Welcome',
        'pages.home.header.description': 'Hello world'
      });
    });

    test('should handle mixed flat and nested keys', () => {
      const mixed = {
        SIMPLE_KEY: 'Simple',
        nested: {
          key1: 'Nested 1',
          key2: 'Nested 2'
        },
        ANOTHER_SIMPLE: 'Another'
      };

      const result = flattenObject(mixed);

      expect(result).toEqual({
        SIMPLE_KEY: 'Simple',
        'nested.key1': 'Nested 1',
        'nested.key2': 'Nested 2',
        ANOTHER_SIMPLE: 'Another'
      });
    });

    test('should handle empty nested objects', () => {
      const obj = {
        empty: {},
        filled: {
          key: 'value'
        }
      };

      const result = flattenObject(obj);

      expect(result).toEqual({
        'filled.key': 'value'
      });
    });
  });

  describe('unflattenObject', () => {
    test('should return simple flat object as nested', () => {
      const flat = {
        HELLO: 'Hello',
        GOODBYE: 'Goodbye'
      };

      const result = unflattenObject(flat);

      expect(result).toEqual(flat);
    });

    test('should unflatten dot notation keys', () => {
      const flat = {
        'home.title': 'Home',
        'home.subtitle': 'Welcome'
      };

      const result = unflattenObject(flat);

      expect(result).toEqual({
        home: {
          title: 'Home',
          subtitle: 'Welcome'
        }
      });
    });

    test('should unflatten deeply nested keys', () => {
      const flat = {
        'pages.home.header.title': 'Welcome',
        'pages.home.header.description': 'Hello world'
      };

      const result = unflattenObject(flat);

      expect(result).toEqual({
        pages: {
          home: {
            header: {
              title: 'Welcome',
              description: 'Hello world'
            }
          }
        }
      });
    });

    test('should handle mixed flat and nested keys', () => {
      const flat = {
        SIMPLE_KEY: 'Simple',
        'nested.key1': 'Nested 1',
        'nested.key2': 'Nested 2'
      };

      const result = unflattenObject(flat);

      expect(result).toEqual({
        SIMPLE_KEY: 'Simple',
        nested: {
          key1: 'Nested 1',
          key2: 'Nested 2'
        }
      });
    });
  });

  describe('isNestedObject', () => {
    test('should return false for flat objects', () => {
      const flat = {
        HELLO: 'Hello',
        GOODBYE: 'Goodbye'
      };

      expect(isNestedObject(flat)).toBe(false);
    });

    test('should return true for nested objects', () => {
      const nested = {
        home: {
          title: 'Home'
        }
      };

      expect(isNestedObject(nested)).toBe(true);
    });

    test('should return true for mixed flat and nested objects', () => {
      const mixed = {
        SIMPLE: 'Simple',
        nested: {
          key: 'value'
        }
      };

      expect(isNestedObject(mixed)).toBe(true);
    });

    test('should return false for empty object', () => {
      expect(isNestedObject({})).toBe(false);
    });
  });

  describe('roundtrip flatten -> unflatten', () => {
    test('should preserve data through flatten -> unflatten', () => {
      const nested = {
        pages: {
          home: {
            title: 'Home',
            header: {
              nav: {
                item1: 'Item 1',
                item2: 'Item 2'
              }
            }
          },
          about: {
            title: 'About'
          }
        },
        SIMPLE_KEY: 'Simple'
      };

      const flattened = flattenObject(nested);
      const unflattened = unflattenObject(flattened);

      expect(unflattened).toEqual(nested);
    });
  });
});

describe('Nested Translation Validation', () => {
  let testDir: string;
  let translationsPath: string;

  beforeEach(() => {
    testDir = fs.mkdtempSync(path.join(os.tmpdir(), 'lexis-nested-test-'));
    translationsPath = path.join(testDir, 'locales');

    fs.mkdirSync(translationsPath, { recursive: true });
    fs.mkdirSync(path.join(translationsPath, 'en'), { recursive: true });
    fs.mkdirSync(path.join(translationsPath, 'fr'), { recursive: true });
    fs.mkdirSync(path.join(translationsPath, 'es'), { recursive: true });

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
    fs.rmSync(testDir, { recursive: true, force: true });
  });

  describe('Flat Structure (existing behavior)', () => {
    test('should validate flat structure translations correctly', () => {
      // Source with flat structure
      writeTranslation(translationsPath, 'en', 'common', {
        HELLO: 'Hello',
        GOODBYE: 'Goodbye'
      });

      writeTranslation(translationsPath, 'fr', 'common', {
        HELLO: 'Bonjour',
        GOODBYE: 'Au revoir'
      });

      writeTranslation(translationsPath, 'es', 'common', {
        HELLO: 'Hola',
        GOODBYE: 'Adiós'
      });

      const result = validateTranslations(testDir);

      expect(result.valid).toBe(true);
      expect(result.missing).toHaveLength(0);
      expect(result.empty).toHaveLength(0);
    });

    test('should detect missing keys in flat structure', () => {
      writeTranslation(translationsPath, 'en', 'common', {
        HELLO: 'Hello',
        GOODBYE: 'Goodbye',
        WELCOME: 'Welcome'
      });

      writeTranslation(translationsPath, 'fr', 'common', {
        HELLO: 'Bonjour'
        // Missing GOODBYE and WELCOME
      });

      writeTranslation(translationsPath, 'es', 'common', {
        HELLO: 'Hola',
        GOODBYE: 'Adiós',
        WELCOME: 'Bienvenido'
      });

      const result = validateTranslations(testDir);

      expect(result.valid).toBe(false);
      // Should detect 2 missing in French
      expect(result.missing.filter((m) => m.language === 'fr')).toHaveLength(2);
    });

    test('should detect empty translations in flat structure', () => {
      writeTranslation(translationsPath, 'en', 'common', {
        HELLO: 'Hello',
        GOODBYE: 'Goodbye'
      });

      writeTranslation(translationsPath, 'fr', 'common', {
        HELLO: 'Bonjour',
        GOODBYE: '' // Empty
      });

      writeTranslation(translationsPath, 'es', 'common', {
        HELLO: 'Hola',
        GOODBYE: '   ' // Whitespace only
      });

      const result = validateTranslations(testDir);

      expect(result.valid).toBe(false);
      expect(result.empty).toHaveLength(2);
    });
  });

  describe('Nested Structure (new behavior)', () => {
    test('should read and flatten nested structures', () => {
      // Write nested structure directly as JSON
      const nestedContent = {
        home: {
          title: 'Home',
          subtitle: 'Welcome to our site'
        },
        SIMPLE_KEY: 'Simple'
      };

      fs.writeFileSync(path.join(translationsPath, 'en', 'common.json'), JSON.stringify(nestedContent, null, 2));

      const translations = readTranslations(translationsPath, 'en');

      expect(translations.common).toEqual({
        'home.title': 'Home',
        'home.subtitle': 'Welcome to our site',
        SIMPLE_KEY: 'Simple'
      });
    });

    test('should validate nested structure translations', () => {
      // Source with nested structure
      const sourceNested = {
        home: {
          title: 'Home',
          description: 'Welcome'
        }
      };

      fs.writeFileSync(path.join(translationsPath, 'en', 'common.json'), JSON.stringify(sourceNested, null, 2));

      // Target with matching nested structure
      const targetNested = {
        home: {
          title: 'Accueil',
          description: 'Bienvenue'
        }
      };

      fs.writeFileSync(path.join(translationsPath, 'fr', 'common.json'), JSON.stringify(targetNested, null, 2));

      fs.writeFileSync(
        path.join(translationsPath, 'es', 'common.json'),
        JSON.stringify(
          {
            home: {
              title: 'Inicio',
              description: 'Bienvenido'
            }
          },
          null,
          2
        )
      );

      const result = validateTranslations(testDir);

      expect(result.valid).toBe(true);
      expect(result.missing).toHaveLength(0);
      expect(result.empty).toHaveLength(0);
    });

    test('should detect missing keys in nested structure', () => {
      // Source with nested structure
      const sourceNested = {
        home: {
          title: 'Home',
          description: 'Welcome',
          meta: {
            keywords: 'home, welcome'
          }
        }
      };

      fs.writeFileSync(path.join(translationsPath, 'en', 'common.json'), JSON.stringify(sourceNested, null, 2));

      // Target missing some nested keys
      const targetPartial = {
        home: {
          title: 'Accueil'
          // Missing description and meta.keywords
        }
      };

      fs.writeFileSync(path.join(translationsPath, 'fr', 'common.json'), JSON.stringify(targetPartial, null, 2));

      // ES has all keys
      fs.writeFileSync(
        path.join(translationsPath, 'es', 'common.json'),
        JSON.stringify(
          {
            home: {
              title: 'Inicio',
              description: 'Bienvenido',
              meta: {
                keywords: 'inicio, bienvenido'
              }
            }
          },
          null,
          2
        )
      );

      const result = validateTranslations(testDir);

      expect(result.valid).toBe(false);
      // Should detect 2 missing in French (home.description and home.meta.keywords)
      const frMissing = result.missing.filter((m) => m.language === 'fr');
      expect(frMissing).toHaveLength(2);
      expect(frMissing.map((m) => m.key).sort()).toEqual(['home.description', 'home.meta.keywords']);
    });

    test('should detect empty translations in nested structure', () => {
      const sourceNested = {
        home: {
          title: 'Home',
          description: 'Welcome'
        }
      };

      fs.writeFileSync(path.join(translationsPath, 'en', 'common.json'), JSON.stringify(sourceNested, null, 2));

      // Target with empty nested value
      const targetEmpty = {
        home: {
          title: 'Accueil',
          description: '' // Empty
        }
      };

      fs.writeFileSync(path.join(translationsPath, 'fr', 'common.json'), JSON.stringify(targetEmpty, null, 2));

      fs.writeFileSync(
        path.join(translationsPath, 'es', 'common.json'),
        JSON.stringify(
          {
            home: {
              title: 'Inicio',
              description: 'Bienvenido'
            }
          },
          null,
          2
        )
      );

      const result = validateTranslations(testDir);

      expect(result.valid).toBe(false);
      expect(result.empty).toHaveLength(1);
      expect(result.empty[0].key).toBe('home.description');
      expect(result.empty[0].language).toBe('fr');
    });

    test('should handle deeply nested structures', () => {
      const sourceDeep = {
        pages: {
          home: {
            sections: {
              hero: {
                title: 'Hero Title',
                cta: 'Click me'
              },
              features: {
                title: 'Features'
              }
            }
          }
        }
      };

      fs.writeFileSync(path.join(translationsPath, 'en', 'common.json'), JSON.stringify(sourceDeep, null, 2));

      const targetDeep = {
        pages: {
          home: {
            sections: {
              hero: {
                title: 'Titre Hero',
                cta: 'Cliquez ici'
              },
              features: {
                title: 'Fonctionnalités'
              }
            }
          }
        }
      };

      fs.writeFileSync(path.join(translationsPath, 'fr', 'common.json'), JSON.stringify(targetDeep, null, 2));

      fs.writeFileSync(
        path.join(translationsPath, 'es', 'common.json'),
        JSON.stringify(
          {
            pages: {
              home: {
                sections: {
                  hero: {
                    title: 'Título Hero',
                    cta: 'Haz clic'
                  },
                  features: {
                    title: 'Características'
                  }
                }
              }
            }
          },
          null,
          2
        )
      );

      const result = validateTranslations(testDir);

      expect(result.valid).toBe(true);
    });

    test('should handle mixed flat and nested structures', () => {
      const sourceMixed = {
        SIMPLE_KEY: 'Simple',
        home: {
          title: 'Home'
        },
        ANOTHER_SIMPLE: 'Another'
      };

      fs.writeFileSync(path.join(translationsPath, 'en', 'common.json'), JSON.stringify(sourceMixed, null, 2));

      const targetMixed = {
        SIMPLE_KEY: 'Simple FR',
        home: {
          title: 'Accueil'
        },
        ANOTHER_SIMPLE: 'Autre'
      };

      fs.writeFileSync(path.join(translationsPath, 'fr', 'common.json'), JSON.stringify(targetMixed, null, 2));

      fs.writeFileSync(
        path.join(translationsPath, 'es', 'common.json'),
        JSON.stringify(
          {
            SIMPLE_KEY: 'Simple ES',
            home: {
              title: 'Inicio'
            },
            ANOTHER_SIMPLE: 'Otro'
          },
          null,
          2
        )
      );

      const result = validateTranslations(testDir);

      expect(result.valid).toBe(true);
    });
  });

  describe('Sync with nested structures', () => {
    test('should sync and add missing nested keys as flat keys', () => {
      // Source with nested structure
      const sourceNested = {
        home: {
          title: 'Home',
          description: 'Welcome'
        }
      };

      fs.writeFileSync(path.join(translationsPath, 'en', 'common.json'), JSON.stringify(sourceNested, null, 2));

      // Remove fr/common.json if it exists (so sync creates it fresh)
      const frCommonPath = path.join(translationsPath, 'fr', 'common.json');
      if (fs.existsSync(frCommonPath)) {
        fs.unlinkSync(frCommonPath);
      }

      syncTranslationStructure(translationsPath, ['en', 'fr'], 'en');

      // After sync, French should have the flattened keys with empty values
      const frContent = JSON.parse(fs.readFileSync(frCommonPath, 'utf-8'));

      // The sync adds missing keys with empty values (flattened from nested source)
      expect(frContent['home.title']).toBe('');
      expect(frContent['home.description']).toBe('');
    });

    test('should clean orphaned nested keys', () => {
      // Source with nested structure
      const sourceNested = {
        home: {
          title: 'Home'
        }
      };

      fs.writeFileSync(path.join(translationsPath, 'en', 'common.json'), JSON.stringify(sourceNested, null, 2));

      // Target with extra nested key that doesn't exist in source
      const targetWithOrphan = {
        home: {
          title: 'Accueil',
          orphanedKey: 'Should be removed'
        }
      };

      fs.writeFileSync(path.join(translationsPath, 'fr', 'common.json'), JSON.stringify(targetWithOrphan, null, 2));

      const syncResult = syncTranslationStructure(translationsPath, ['en', 'fr'], 'en');

      // Should report cleaned orphaned key
      expect(syncResult.cleanedKeys).toHaveLength(1);
      expect(syncResult.cleanedKeys[0].key).toBe('home.orphanedKey');

      // Verify file no longer contains orphaned key
      const frContent = JSON.parse(fs.readFileSync(path.join(translationsPath, 'fr', 'common.json'), 'utf-8'));
      expect(frContent['home.orphanedKey']).toBeUndefined();
      expect(frContent['home.title']).toBe('Accueil');
    });
  });
});
