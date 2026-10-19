import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { afterEach, beforeEach, describe, expect, jest, test } from '@jest/globals';
import { addTranslationKey } from '../translations/cli/add-key.js';
import { validateTranslations } from '../translations/cli/validate.js';
import { getMetadataEntry, readMetadata } from '../translations/utils/metadata.js';
import { CONTEXT_KEY } from '../translations/utils/source-context.js';
import { resetTranslationProvider, setTranslationProvider } from '../translations/utils/translator.js';
import type {
  ContextualTranslationProvider,
  TranslationRequest,
  TranslationResponseItem
} from '../translations/utils/translator-interface.js';

/** Stands in for an LLM: records each request and answers with `respond` */
class RecordingProvider implements ContextualTranslationProvider {
  readonly name = 'claude-code';
  readonly supports = { instructions: true, codeContext: true, review: true, maxItems: 40 };
  readonly requests: TranslationRequest[] = [];

  constructor(private readonly respond: (request: TranslationRequest) => TranslationResponseItem[]) {}

  async translateItems(request: TranslationRequest): Promise<TranslationResponseItem[]> {
    this.requests.push(request);
    return this.respond(request);
  }
}

const markAll = (request: TranslationRequest): TranslationResponseItem[] =>
  request.items.map((item) => ({ key: item.key, translation: `[${request.targetLang}] ${item.source}` }));

describe('adding keys and namespaces with context', () => {
  let root: string;
  let locales: string;

  const readJson = (language: string, namespace: string): Record<string, unknown> =>
    JSON.parse(fs.readFileSync(path.join(locales, language, `${namespace}.json`), 'utf-8'));

  const writeJson = (language: string, namespace: string, content: unknown): void => {
    fs.mkdirSync(path.join(locales, language), { recursive: true });
    fs.writeFileSync(path.join(locales, language, `${namespace}.json`), JSON.stringify(content, null, 2));
  };

  beforeEach(() => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), 'lexis-add-'));
    locales = path.join(root, 'locales');
    fs.mkdirSync(path.join(locales, 'en'), { recursive: true });
    fs.writeFileSync(
      path.join(root, '.translationsrc.json'),
      JSON.stringify({
        translationsPath: 'locales',
        languages: ['en', 'fr', 'de'],
        sourceLanguage: 'en',
        typesOutputPath: 'src/types/i18nTypes.ts',
        provider: 'claude',
        context: 'Lush Spa is the internal tool spa staff use to manage bookings.'
      })
    );
    jest.spyOn(console, 'log').mockImplementation(() => {});
    jest.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    resetTranslationProvider();
    jest.restoreAllMocks();
    fs.rmSync(root, { recursive: true, force: true });
  });

  test('a new namespace gets its description and key note, and translations use them', async () => {
    const provider = new RecordingProvider(markAll);
    setTranslationProvider(provider);

    await addTranslationKey(root, {
      namespace: 'checkout',
      key: 'PAY_BUTTON',
      value: 'Pay',
      description: 'Paying for a spa booking',
      note: 'Button that takes the payment',
      autoTranslate: true
    });

    expect(readJson('en', 'checkout')).toEqual({
      [CONTEXT_KEY]: { description: 'Paying for a spa booking', keys: { PAY_BUTTON: 'Button that takes the payment' } },
      PAY_BUTTON: 'Pay'
    });
    expect(readJson('fr', 'checkout')).toEqual({ PAY_BUTTON: '[fr] Pay' });
    expect(readJson('de', 'checkout')).toEqual({ PAY_BUTTON: '[de] Pay' });

    expect(provider.requests).toHaveLength(2);
    expect(provider.requests[0]).toMatchObject({
      app: 'Lush Spa is the internal tool spa staff use to manage bookings.',
      namespace: { name: 'checkout', description: 'Paying for a spa booking' },
      items: [{ key: 'PAY_BUTTON', note: 'Button that takes the payment', role: 'button label, an action' }]
    });
    expect(getMetadataEntry(readMetadata(locales), 'fr', 'checkout', 'PAY_BUTTON')).toMatchObject({
      provider: 'claude-code',
      contextHash: expect.any(String)
    });

    const result = validateTranslations(root);
    expect(result.valid).toBe(true);
    expect(result.contextIssues).toEqual([]);
  });

  test('a key added to an existing namespace keeps its description and other notes', async () => {
    writeJson('en', 'checkout', {
      [CONTEXT_KEY]: { description: 'Paying for a spa booking', keys: { PAY_BUTTON: 'Takes payment' } },
      PAY_BUTTON: 'Pay'
    });
    writeJson('fr', 'checkout', { PAY_BUTTON: 'Payer' });
    writeJson('de', 'checkout', { PAY_BUTTON: 'Bezahlen' });
    const provider = new RecordingProvider(markAll);
    setTranslationProvider(provider);

    await addTranslationKey(root, {
      namespace: 'checkout',
      key: 'CANCEL_BUTTON',
      value: 'Cancel',
      note: 'Abandons the booking',
      autoTranslate: true
    });

    expect(readJson('en', 'checkout')).toEqual({
      [CONTEXT_KEY]: {
        description: 'Paying for a spa booking',
        keys: { CANCEL_BUTTON: 'Abandons the booking', PAY_BUTTON: 'Takes payment' }
      },
      CANCEL_BUTTON: 'Cancel',
      PAY_BUTTON: 'Pay'
    });
    expect(readJson('fr', 'checkout')).toEqual({ CANCEL_BUTTON: '[fr] Cancel', PAY_BUTTON: 'Payer' });
    // The new key is translated next to the existing ones
    expect(provider.requests[0].items[0].neighbours).toEqual([{ key: 'PAY_BUTTON', source: 'Pay' }]);
    expect(provider.requests[0].namespace.description).toBe('Paying for a spa booking');
  });

  test('without auto-translate, other languages get empty values and $context stays in the source only', async () => {
    await addTranslationKey(root, {
      namespace: 'checkout',
      key: 'PAY_BUTTON',
      value: 'Pay',
      description: 'Paying for a spa booking'
    });

    expect(readJson('en', 'checkout')[CONTEXT_KEY]).toEqual({ description: 'Paying for a spa booking' });
    expect(readJson('fr', 'checkout')).toEqual({ PAY_BUTTON: '' });
    expect(readJson('de', 'checkout')).toEqual({ PAY_BUTTON: '' });
  });

  test('a key no provider could translate still ends up in every language', async () => {
    setTranslationProvider(new RecordingProvider(() => []));

    await addTranslationKey(root, { namespace: 'checkout', key: 'PAY_BUTTON', value: 'Pay', autoTranslate: true });

    expect(readJson('fr', 'checkout')).toEqual({ PAY_BUTTON: '' });
    expect(readJson('de', 'checkout')).toEqual({ PAY_BUTTON: '' });
  });

  test('changing the value of an existing key re-translates the translations it wrote', async () => {
    const provider = new RecordingProvider(markAll);
    setTranslationProvider(provider);
    await addTranslationKey(root, { namespace: 'checkout', key: 'PAY_BUTTON', value: 'Pay', autoTranslate: true });

    await addTranslationKey(root, {
      namespace: 'checkout',
      key: 'PAY_BUTTON',
      value: 'Pay now',
      autoTranslate: true
    });

    expect(readJson('fr', 'checkout')).toEqual({ PAY_BUTTON: '[fr] Pay now' });
    expect(validateTranslations(root).stale).toEqual([]);
  });

  test('changing the value leaves a hand-edited translation alone', async () => {
    setTranslationProvider(new RecordingProvider(markAll));
    await addTranslationKey(root, { namespace: 'checkout', key: 'PAY_BUTTON', value: 'Pay', autoTranslate: true });
    writeJson('fr', 'checkout', { PAY_BUTTON: 'Régler' });

    await addTranslationKey(root, {
      namespace: 'checkout',
      key: 'PAY_BUTTON',
      value: 'Pay now',
      autoTranslate: true
    });

    expect(readJson('fr', 'checkout')).toEqual({ PAY_BUTTON: 'Régler' });
    expect(readJson('de', 'checkout')).toEqual({ PAY_BUTTON: '[de] Pay now' });
  });
});
