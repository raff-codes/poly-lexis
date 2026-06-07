import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { afterEach, beforeEach, describe, expect, test } from '@jest/globals';
import { autoFillTranslations } from '../translations/cli/auto-fill.js';
import { validateTranslations } from '../translations/cli/validate.js';
import { getSourceHash, hashSourceValue, readMetadata } from '../translations/utils/metadata.js';
import { resetTranslationProvider, setTranslationProvider } from '../translations/utils/translator.js';
import type { TranslateOptions, TranslationProvider } from '../translations/utils/translator-interface.js';
import { writeTranslation } from '../translations/utils/utils.js';

/** Deterministic provider: records calls and returns a marked translation. */
class FakeProvider implements TranslationProvider {
  public calls: string[] = [];

  async translate(options: TranslateOptions): Promise<string> {
    this.calls.push(options.text);
    return `[${options.targetLang}] ${options.text}`;
  }

  async translateBatch(texts: string[], _s: string, targetLang: string): Promise<string[]> {
    return texts.map((t) => `[${targetLang}] ${t}`);
  }
}

describe('Auto-fill re-translation of changed source strings', () => {
  let testDir: string;
  let translationsPath: string;
  let provider: FakeProvider;

  beforeEach(() => {
    testDir = fs.mkdtempSync(path.join(os.tmpdir(), 'lexis-autofill-'));
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

    provider = new FakeProvider();
    setTranslationProvider(provider);
  });

  afterEach(() => {
    resetTranslationProvider();
    fs.rmSync(testDir, { recursive: true, force: true });
  });

  function readFr(): Record<string, string> {
    return JSON.parse(fs.readFileSync(path.join(translationsPath, 'fr', 'common.json'), 'utf-8'));
  }

  test('records a source hash when filling a missing translation', async () => {
    writeTranslation(translationsPath, 'en', 'common', { HELLO: 'Hello' });

    await autoFillTranslations(testDir, { apiKey: 'k', delayMs: 0 });

    expect(readFr().HELLO).toBe('[fr] Hello');
    const metadata = readMetadata(translationsPath);
    expect(getSourceHash(metadata, 'fr', 'common', 'HELLO')).toBe(hashSourceValue('Hello'));
  });

  test('default auto-fill does not re-translate keys that already have a value', async () => {
    writeTranslation(translationsPath, 'en', 'common', { HELLO: 'Hello' });
    await autoFillTranslations(testDir, { apiKey: 'k', delayMs: 0 });

    // Source changes; existing translation becomes stale
    writeTranslation(translationsPath, 'en', 'common', { HELLO: 'Hi there' });
    provider.calls = [];

    await autoFillTranslations(testDir, { apiKey: 'k', delayMs: 0 });

    // Stale key was NOT re-translated by default
    expect(provider.calls).toHaveLength(0);
    expect(validateTranslations(testDir).stale).toHaveLength(1);
  });

  test('retranslateChanged re-translates stale keys and refreshes the hash', async () => {
    writeTranslation(translationsPath, 'en', 'common', { HELLO: 'Hello' });
    await autoFillTranslations(testDir, { apiKey: 'k', delayMs: 0 });

    writeTranslation(translationsPath, 'en', 'common', { HELLO: 'Hi there' });
    provider.calls = [];

    await autoFillTranslations(testDir, { apiKey: 'k', delayMs: 0, retranslateChanged: true });

    expect(provider.calls).toEqual(['Hi there']);
    expect(readFr().HELLO).toBe('[fr] Hi there');
    // No longer stale
    expect(validateTranslations(testDir).stale).toHaveLength(0);
    const metadata = readMetadata(translationsPath);
    expect(getSourceHash(metadata, 'fr', 'common', 'HELLO')).toBe(hashSourceValue('Hi there'));
  });

  test('force re-translates every key regardless of current value', async () => {
    writeTranslation(translationsPath, 'en', 'common', { HELLO: 'Hello', BYE: 'Bye' });
    writeTranslation(translationsPath, 'fr', 'common', { HELLO: 'Bonjour', BYE: 'Au revoir' });

    await autoFillTranslations(testDir, { apiKey: 'k', delayMs: 0, force: true });

    expect(provider.calls.sort()).toEqual(['Bye', 'Hello']);
    expect(readFr()).toEqual({ HELLO: '[fr] Hello', BYE: '[fr] Bye' });
  });

  test('dry run does not write translations or metadata', async () => {
    writeTranslation(translationsPath, 'en', 'common', { HELLO: 'Hello' });

    await autoFillTranslations(testDir, { apiKey: 'k', delayMs: 0, dryRun: true });

    expect(readFr().HELLO).toBe('');
    expect(readMetadata(translationsPath).languages).toEqual({});
  });
});
