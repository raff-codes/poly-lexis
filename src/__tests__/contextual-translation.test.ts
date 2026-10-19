import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { afterEach, beforeEach, describe, expect, jest, test } from '@jest/globals';
import { autoFillTranslations } from '../translations/cli/auto-fill.js';
import { loadConfig } from '../translations/cli/init.js';
import { applyReviewReport, reviewTranslations } from '../translations/cli/review.js';
import {
  buildTranslationPrompt,
  ClaudeApiProvider,
  ClaudeCodeProvider,
  parseClaudeCodeOutput
} from '../translations/utils/claude-provider.js';
import { adaptLegacyProvider } from '../translations/utils/contextual-provider.js';
import { DeepLTranslateProvider } from '../translations/utils/deepl-translate-provider.js';
import { getMetadataEntry, readMetadata, setSourceHash, writeMetadata } from '../translations/utils/metadata.js';
import { ProviderAuthError } from '../translations/utils/provider-errors.js';
import { createProvider } from '../translations/utils/provider-factory.js';
import { CONTEXT_KEY } from '../translations/utils/source-context.js';
import { runTranslations } from '../translations/utils/translation-runner.js';
import { resetTranslationProvider, setTranslationProvider } from '../translations/utils/translator.js';
import type {
  ContextualTranslationProvider,
  ProviderCapabilities,
  TranslationProvider,
  TranslationRequest,
  TranslationResponseItem
} from '../translations/utils/translator-interface.js';

/** Stands in for an LLM: records each request and answers with `respond` */
class RecordingProvider implements ContextualTranslationProvider {
  readonly supports: ProviderCapabilities;
  readonly requests: TranslationRequest[] = [];

  constructor(
    readonly name: string,
    private readonly respond: (request: TranslationRequest) => TranslationResponseItem[],
    supports: Partial<ProviderCapabilities> = {},
    readonly model?: string
  ) {
    this.supports = { instructions: true, codeContext: true, review: true, maxItems: 40, ...supports };
  }

  async translateItems(request: TranslationRequest): Promise<TranslationResponseItem[]> {
    this.requests.push(request);
    return this.respond(request);
  }
}

const markAll = (request: TranslationRequest): TranslationResponseItem[] =>
  request.items.map((item) => ({ key: item.key, translation: `[${request.targetLang}] ${item.source}` }));

function makeProject(config: Record<string, unknown> = {}): { root: string; locales: string } {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'lexis-contextual-'));
  const locales = path.join(root, 'locales');
  fs.mkdirSync(path.join(locales, 'en'), { recursive: true });
  fs.mkdirSync(path.join(locales, 'fr'), { recursive: true });
  fs.writeFileSync(
    path.join(root, '.translationsrc.json'),
    JSON.stringify({
      translationsPath: 'locales',
      languages: ['en', 'fr'],
      sourceLanguage: 'en',
      typesOutputPath: 'src/types/i18nTypes.ts',
      provider: 'claude',
      ...config
    })
  );
  return { root, locales };
}

function writeJson(filePath: string, content: unknown): void {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, JSON.stringify(content, null, 2));
}

function readJson(filePath: string): Record<string, unknown> {
  return JSON.parse(fs.readFileSync(filePath, 'utf-8'));
}

describe('auto-fill with a contextual provider', () => {
  let root: string;
  let locales: string;

  beforeEach(() => {
    ({ root, locales } = makeProject({
      context: 'Lush Spa is the internal tool spa staff use to manage bookings.',
      glossary: 'glossary.json',
      languageSettings: { fr: { formality: 'formal', instructions: ['Use "vous"'] } }
    }));
    writeJson(path.join(root, 'glossary.json'), {
      terms: [
        { term: 'Lush', doNotTranslate: true },
        { term: 'therapist', translations: { fr: 'praticien' } },
        { term: 'invoice', translations: { fr: 'facture' } }
      ]
    });
    writeJson(path.join(locales, 'en', 'treatments.json'), {
      [CONTEXT_KEY]: {
        description: 'Booking a spa treatment for a customer',
        keys: { BOOK_CHECKOUT_SUBMIT: 'Button that confirms the booking' }
      },
      ANY_THERAPIST: 'Any therapist',
      BOOK_CHECKOUT_SUBMIT: 'Book',
      STATUS_OPEN: 'Open'
    });
    fs.mkdirSync(path.join(root, 'src'), { recursive: true });
    fs.writeFileSync(
      path.join(root, 'src', 'Checkout.tsx'),
      "<Button type='submit'>{t('BOOK_CHECKOUT_SUBMIT')}</Button>"
    );
  });

  afterEach(() => {
    resetTranslationProvider();
    fs.rmSync(root, { recursive: true, force: true });
  });

  test('sends the app, namespace, key note, role, code usage, glossary and language settings', async () => {
    const provider = new RecordingProvider('claude-code', markAll);
    setTranslationProvider(provider);

    await autoFillTranslations(root, { delayMs: 0 });

    expect(provider.requests).toHaveLength(1);
    const [request] = provider.requests;
    expect(request.app).toBe('Lush Spa is the internal tool spa staff use to manage bookings.');
    expect(request.namespace).toEqual({ name: 'treatments', description: 'Booking a spa treatment for a customer' });
    expect(request.language).toEqual({ formality: 'formal', instructions: ['Use "vous"'] });
    // Only terms that occur in this batch are sent
    expect(request.glossary.map((term) => term.term)).toEqual(['therapist']);

    const submit = request.items.find((item) => item.key === 'BOOK_CHECKOUT_SUBMIT');
    expect(submit).toMatchObject({ note: 'Button that confirms the booking', role: 'button label, an action' });
    expect(submit?.usages[0]?.snippet).toContain("<Button type='submit'>");
    expect(request.items.find((item) => item.key === 'STATUS_OPEN')?.role).toBe(
      'status label describing a state, not an action'
    );
  });

  test('sends no code snippets when claude.codeContext is false', async () => {
    const configPath = path.join(root, '.translationsrc.json');
    writeJson(configPath, { ...readJson(configPath), claude: { codeContext: false } });
    const provider = new RecordingProvider('claude-code', markAll);
    setTranslationProvider(provider);

    await autoFillTranslations(root, { delayMs: 0 });

    expect(provider.requests[0].items.every((item) => !item.usages.length)).toBe(true);
  });

  test('writes every translation of the namespace and records how it was produced', async () => {
    setTranslationProvider(new RecordingProvider('claude-code', markAll, {}, 'sonnet'));

    await autoFillTranslations(root, { delayMs: 0 });

    expect(readJson(path.join(locales, 'fr', 'treatments.json'))).toEqual({
      ANY_THERAPIST: '[fr] Any therapist',
      BOOK_CHECKOUT_SUBMIT: '[fr] Book',
      STATUS_OPEN: '[fr] Open'
    });
    const entry = getMetadataEntry(readMetadata(locales), 'fr', 'treatments', 'BOOK_CHECKOUT_SUBMIT');
    expect(entry).toMatchObject({ provider: 'claude-code', model: 'sonnet' });
    expect(entry?.translationHash).toBeDefined();
    expect(entry?.contextHash).toBeDefined();
  });

  test('force leaves hand-edited translations alone unless asked to replace them', async () => {
    setTranslationProvider(new RecordingProvider('claude-code', markAll));
    await autoFillTranslations(root, { delayMs: 0 });

    const frPath = path.join(locales, 'fr', 'treatments.json');
    writeJson(frPath, { ...readJson(frPath), STATUS_OPEN: 'Ouvert' });

    await autoFillTranslations(root, { delayMs: 0, force: true });
    expect(readJson(frPath).STATUS_OPEN).toBe('Ouvert');

    await autoFillTranslations(root, { delayMs: 0, force: true, includeManualEdits: true });
    expect(readJson(frPath).STATUS_OPEN).toBe('[fr] Open');
  });
});

describe('runTranslations retry and fallback', () => {
  let root: string;
  let locales: string;

  beforeEach(() => {
    ({ root, locales } = makeProject());
    writeJson(path.join(locales, 'en', 'common.json'), { ITEMS: '{{count}} items', SAVE: 'Save' });
    writeJson(path.join(locales, 'fr', 'common.json'), { ITEMS: '', SAVE: '' });
  });

  afterEach(() => {
    fs.rmSync(root, { recursive: true, force: true });
  });

  const dropPlaceholders = (request: TranslationRequest): TranslationResponseItem[] =>
    request.items.map((item) => ({ key: item.key, translation: item.source.replace(/\{\{[^}]+\}\}/g, 'X') }));

  test('retries only the failed keys, then hands them to the fallback', async () => {
    const main = new RecordingProvider('claude-code', dropPlaceholders);
    const fallback = new RecordingProvider('deepl', markAll, { instructions: false, review: false });
    const metadata = readMetadata(locales);

    const result = await runTranslations({
      projectRoot: root,
      config: loadConfig(root),
      setup: { provider: main, fallback },
      jobs: [{ language: 'fr', namespace: 'common', keys: ['ITEMS', 'SAVE'] }],
      metadata
    });

    expect(main.requests.map((request) => request.items.map((item) => item.key))).toEqual([
      ['ITEMS', 'SAVE'],
      ['ITEMS']
    ]);
    expect(fallback.requests.map((request) => request.items.map((item) => item.key))).toEqual([['ITEMS']]);
    expect(result.failed).toEqual([]);
    expect(readJson(path.join(locales, 'fr', 'common.json'))).toEqual({ ITEMS: '[fr] {{count}} items', SAVE: 'Save' });
    expect(getMetadataEntry(metadata, 'fr', 'common', 'ITEMS')?.provider).toBe('deepl');
  });

  test('reports keys no provider could translate and leaves them empty', async () => {
    const main = new RecordingProvider('claude-code', dropPlaceholders);

    const result = await runTranslations({
      projectRoot: root,
      config: loadConfig(root),
      setup: { provider: main },
      jobs: [{ language: 'fr', namespace: 'common', keys: ['ITEMS', 'SAVE'] }],
      metadata: readMetadata(locales)
    });

    expect(result.failed.map((failure) => failure.key)).toEqual(['ITEMS']);
    expect(result.failed[0].errors[0]).toContain('placeholders differ');
    expect(readJson(path.join(locales, 'fr', 'common.json')).ITEMS).toBe('');
  });

  test('a request that throws is retried, and its error is reported when it keeps failing', async () => {
    const main = new RecordingProvider('claude-code', () => {
      throw new Error('rate limited');
    });

    const result = await runTranslations({
      projectRoot: root,
      config: loadConfig(root),
      setup: { provider: main },
      jobs: [{ language: 'fr', namespace: 'common', keys: ['SAVE'] }],
      metadata: readMetadata(locales)
    });

    expect(main.requests).toHaveLength(2);
    expect(result.failed).toEqual([
      { language: 'fr', namespace: 'common', key: 'SAVE', source: 'Save', errors: ['rate limited'] }
    ]);
  });

  /** A one-string-at-a-time provider that answers with `respond` and counts its calls */
  const legacyProvider = (respond: (text: string) => string): TranslationProvider & { calls: number } => {
    const provider = {
      calls: 0,
      async translate({ text }: { text: string }): Promise<string> {
        provider.calls++;
        return respond(text);
      },
      async translateBatch(): Promise<string[]> {
        return [];
      }
    };
    return provider;
  };

  test("reports a legacy provider's own error for the key it failed on", async () => {
    const deepl = legacyProvider((text) => {
      if (text === 'Save') throw new Error('DeepL API error: Too many requests (429)');
      return `[fr] ${text}`;
    });

    const result = await runTranslations({
      projectRoot: root,
      config: loadConfig(root),
      setup: { provider: adaptLegacyProvider(deepl, { name: 'deepl', delayMs: 0 }) },
      jobs: [{ language: 'fr', namespace: 'common', keys: ['ITEMS', 'SAVE'] }],
      metadata: readMetadata(locales)
    });

    expect(result.failed).toEqual([
      {
        language: 'fr',
        namespace: 'common',
        key: 'SAVE',
        source: 'Save',
        errors: ['DeepL API error: Too many requests (429)']
      }
    ]);
    expect(readJson(path.join(locales, 'fr', 'common.json')).ITEMS).toBe('[fr] {{count}} items');
  });

  test('stops sending requests to a provider that rejected its key, and uses the fallback', async () => {
    writeJson(path.join(locales, 'en', 'settings.json'), { TITLE: 'Settings' });
    const deepl = legacyProvider(() => {
      throw new ProviderAuthError('DeepL API error: Forbidden (403)', 403);
    });
    const fallback = new RecordingProvider('google', markAll, { instructions: false, review: false });

    const result = await runTranslations({
      projectRoot: root,
      config: loadConfig(root),
      setup: { provider: adaptLegacyProvider(deepl, { name: 'deepl', concurrency: 1, delayMs: 0 }), fallback },
      jobs: [
        { language: 'fr', namespace: 'common', keys: ['ITEMS', 'SAVE'] },
        { language: 'fr', namespace: 'settings', keys: ['TITLE'] }
      ],
      metadata: readMetadata(locales)
    });

    // One rejected request, not one per key and retry
    expect(deepl.calls).toBe(1);
    expect(fallback.requests.map((request) => request.items.map((item) => item.key))).toEqual([
      ['ITEMS', 'SAVE'],
      ['TITLE']
    ]);
    expect(result.failed).toEqual([]);
  });

  test('an invalid keyRoles pattern stops the run before any request', async () => {
    const configPath = path.join(root, '.translationsrc.json');
    writeJson(configPath, { ...readJson(configPath), keyRoles: [{ pattern: '(COL_', role: 'broken' }] });
    const main = new RecordingProvider('claude-code', markAll);

    await expect(
      runTranslations({
        projectRoot: root,
        config: loadConfig(root),
        setup: { provider: main },
        jobs: [{ language: 'fr', namespace: 'common', keys: ['SAVE'] }],
        metadata: readMetadata(locales)
      })
    ).rejects.toThrow('keyRoles[0] has an invalid pattern "(COL_"');
    expect(main.requests).toHaveLength(0);
    expect(readJson(path.join(locales, 'fr', 'common.json')).SAVE).toBe('');
  });

  test('records the model that answered when a server-side fallback replied', async () => {
    const main = new RecordingProvider(
      'claude-api',
      (request) => markAll(request).map((item) => ({ ...item, model: 'claude-sonnet-5-5' })),
      {},
      'claude-opus-5-5'
    );
    const metadata = readMetadata(locales);

    await runTranslations({
      projectRoot: root,
      config: loadConfig(root),
      setup: { provider: main },
      jobs: [{ language: 'fr', namespace: 'common', keys: ['SAVE'] }],
      metadata
    });

    expect(getMetadataEntry(metadata, 'fr', 'common', 'SAVE')?.model).toBe('claude-sonnet-5-5');
  });
});

describe('review', () => {
  let root: string;
  let locales: string;

  beforeEach(() => {
    ({ root, locales } = makeProject());
    writeJson(path.join(locales, 'en', 'stocktake.json'), { STATUS_OPEN: 'Open', COL_COUNTED: 'Counted' });
    writeJson(path.join(locales, 'fr', 'stocktake.json'), { STATUS_OPEN: 'Ouvrir', COL_COUNTED: 'Comptés' });
  });

  afterEach(() => {
    resetTranslationProvider();
    fs.rmSync(root, { recursive: true, force: true });
  });

  const fixOpen = (request: TranslationRequest): TranslationResponseItem[] =>
    request.items.map((item) =>
      item.key === 'STATUS_OPEN'
        ? { key: item.key, translation: 'Ouvert', changed: true, reason: 'A status, not the verb' }
        : { key: item.key, translation: item.existing ?? '', changed: false }
    );

  test('writes only the corrections to the report and leaves the translations as they are', async () => {
    const provider = new RecordingProvider('claude-code', fixOpen);
    setTranslationProvider(provider);

    const report = await reviewTranslations(root);

    expect(provider.requests[0].mode).toBe('review');
    expect(provider.requests[0].items.map((item) => item.existing).sort()).toEqual(['Comptés', 'Ouvrir']);
    expect(report.entries).toEqual([
      {
        language: 'fr',
        namespace: 'stocktake',
        key: 'STATUS_OPEN',
        source: 'Open',
        current: 'Ouvrir',
        proposed: 'Ouvert',
        reason: 'A status, not the verb'
      }
    ]);
    expect(readJson(path.join(root, 'translations-review.json')).entries).toEqual(report.entries);
    expect(readJson(path.join(locales, 'fr', 'stocktake.json')).STATUS_OPEN).toBe('Ouvrir');
  });

  test('apply writes the kept corrections and skips any edited since the review', async () => {
    setTranslationProvider(new RecordingProvider('claude-code', fixOpen));
    await reviewTranslations(root);

    const applied = applyReviewReport(root);
    expect(applied).toEqual({ applied: 1, skipped: [] });
    expect(readJson(path.join(locales, 'fr', 'stocktake.json')).STATUS_OPEN).toBe('Ouvert');

    // A second review proposes a change, then someone edits the file before applying
    await reviewTranslations(root);
    writeJson(path.join(root, 'translations-review.json'), {
      generatedAt: '',
      provider: 'claude-code',
      entries: [
        {
          language: 'fr',
          namespace: 'stocktake',
          key: 'COL_COUNTED',
          source: 'Counted',
          current: 'Comptés',
          proposed: 'Compté'
        }
      ]
    });
    writeJson(path.join(locales, 'fr', 'stocktake.json'), { STATUS_OPEN: 'Ouvert', COL_COUNTED: 'Quantité comptée' });

    expect(applyReviewReport(root).skipped.map((entry) => entry.key)).toEqual(['COL_COUNTED']);
    expect(readJson(path.join(locales, 'fr', 'stocktake.json')).COL_COUNTED).toBe('Quantité comptée');
  });

  test('apply skips a correction whose source string changed after the review', async () => {
    setTranslationProvider(new RecordingProvider('claude-code', fixOpen));
    await reviewTranslations(root);
    writeJson(path.join(locales, 'en', 'stocktake.json'), { STATUS_OPEN: 'Opened', COL_COUNTED: 'Counted' });

    const result = applyReviewReport(root);

    expect(result.applied).toBe(0);
    expect(result.skipped.map((entry) => [entry.key, entry.skipReason])).toEqual([['STATUS_OPEN', 'source-changed']]);
    expect(readJson(path.join(locales, 'fr', 'stocktake.json')).STATUS_OPEN).toBe('Ouvrir');
  });

  test('apply names the broken entry in a hand-edited report', () => {
    writeJson(path.join(root, 'translations-review.json'), {
      entries: [{ language: 'fr', namespace: 'stocktake', key: 'STATUS_OPEN', source: 'Open', current: 'Ouvrir' }]
    });

    expect(() => applyReviewReport(root)).toThrow('translations-review.json entries[0] needs "proposed" as a string');
  });

  test('apply says which file is not valid JSON', () => {
    fs.writeFileSync(path.join(root, 'translations-review.json'), '{ "entries": [], }');

    expect(() => applyReviewReport(root)).toThrow('translations-review.json is not valid JSON');
  });

  test('skips translations edited by hand unless asked to include them', async () => {
    const metadata = readMetadata(locales);
    setSourceHash(metadata, 'fr', 'stocktake', 'STATUS_OPEN', 'Open', { translation: 'Ouvert (machine)' });
    writeMetadata(locales, metadata);
    const provider = new RecordingProvider('claude-code', fixOpen);
    setTranslationProvider(provider);

    await reviewTranslations(root);

    expect(provider.requests[0].items.map((item) => item.key)).toEqual(['COL_COUNTED']);
  });

  test('refuses a provider that cannot follow review instructions', async () => {
    setTranslationProvider(new RecordingProvider('deepl', markAll, { review: false }));

    await expect(reviewTranslations(root)).rejects.toThrow('Reviewing needs a provider that can follow instructions');
  });
});

describe('Claude prompt and output parsing', () => {
  const request: TranslationRequest = {
    mode: 'translate',
    sourceLang: 'en',
    targetLang: 'ja',
    app: 'SAM is the stock management app used in Lush shops.',
    namespace: { name: 'stocktake', description: 'Counting stock' },
    language: { formality: 'default', instructions: [] },
    glossary: [],
    items: [{ key: 'STATUS_OPEN', source: 'Open', neighbours: [], usages: [], placeholders: [], existing: 'オープン' }]
  };

  test('only includes existing translations in review mode', () => {
    expect(buildTranslationPrompt(request)).not.toContain('オープン');
    expect(buildTranslationPrompt({ ...request, mode: 'review' })).toContain('"existing": "オープン"');
  });

  test('reads the structured output of a successful claude -p run', () => {
    const stdout = JSON.stringify({
      type: 'result',
      subtype: 'success',
      is_error: false,
      result: '',
      structured_output: { items: [{ key: 'STATUS_OPEN', translation: '受付中', changed: false, reason: '' }] }
    });

    expect(parseClaudeCodeOutput(stdout, 0)).toEqual([{ key: 'STATUS_OPEN', translation: '受付中', changed: false }]);
  });

  test('turns a failed run into an error with its message', () => {
    const stdout = JSON.stringify({ is_error: true, result: 'Not logged in · Please run /login' });

    expect(() => parseClaudeCodeOutput(stdout, 1)).toThrow('Claude Code failed: Not logged in · Please run /login');
    expect(() => parseClaudeCodeOutput('', 1)).toThrow('exited with code 1');
  });
});

describe('ClaudeApiProvider', () => {
  const request: TranslationRequest = {
    mode: 'translate',
    sourceLang: 'en',
    targetLang: 'fr',
    app: '',
    namespace: { name: 'common' },
    language: { formality: 'default', instructions: [] },
    glossary: [],
    items: [{ key: 'SAVE', source: 'Save', neighbours: [], usages: [], placeholders: [] }]
  };

  /** Replace the SDK client with a stub answering as `model` and return the stub */
  const stubClient = (provider: ClaudeApiProvider, model: string) => {
    const create = jest.fn(async (_body: Record<string, unknown>) => ({
      model,
      stop_reason: 'end_turn',
      content: [
        {
          type: 'text',
          text: JSON.stringify({ items: [{ key: 'SAVE', translation: 'Enregistrer', changed: false, reason: '' }] })
        }
      ]
    }));
    Reflect.set(provider, 'client', { beta: { messages: { create } } });
    return create;
  };

  test('sends server-side fallbacks for known models and records the model that answered', async () => {
    const provider = new ClaudeApiProvider('sk-test', { model: 'claude-opus-5-5' });
    const create = stubClient(provider, 'claude-sonnet-5-5');

    const items = await provider.translateItems(request);

    expect(create.mock.calls[0][0]).toMatchObject({ fallbacks: 'default' });
    expect(items).toEqual([{ key: 'SAVE', translation: 'Enregistrer', changed: false, model: 'claude-sonnet-5-5' }]);
  });

  test('claude.serverFallbacks overrides the known-model list either way', async () => {
    const off = new ClaudeApiProvider('sk-test', { model: 'claude-opus-5-5', serverFallbacks: false });
    const on = new ClaudeApiProvider('sk-test', { model: 'claude-future-6', serverFallbacks: true });
    const offCreate = stubClient(off, 'claude-opus-5-5');
    const onCreate = stubClient(on, 'claude-future-6');

    const [offItems] = await Promise.all([off.translateItems(request), on.translateItems(request)]);

    expect(offCreate.mock.calls[0][0]).not.toHaveProperty('fallbacks');
    expect(onCreate.mock.calls[0][0]).toMatchObject({ fallbacks: 'default' });
    // Same model as configured: nothing extra to record
    expect(offItems[0]).not.toHaveProperty('model');
  });
});

describe('ClaudeCodeProvider process', () => {
  let binDir: string;
  const savedApiKey = process.env.ANTHROPIC_API_KEY;

  beforeEach(() => {
    binDir = fs.mkdtempSync(path.join(os.tmpdir(), 'lexis-fake-claude-'));
    // A stand-in `claude` binary: records what it received, answers like `claude -p --output-format json`
    fs.writeFileSync(
      path.join(binDir, 'claude'),
      `#!/usr/bin/env node
const fs = require('node:fs');
let input = '';
process.stdin.on('data', (chunk) => { input += chunk; });
process.stdin.on('end', () => {
  fs.writeFileSync(${JSON.stringify(path.join(binDir, 'received.json'))}, JSON.stringify({
    args: process.argv.slice(2),
    stdin: input,
    apiKey: process.env.ANTHROPIC_API_KEY ?? null
  }));
  const keys = JSON.parse(input).items.map((item) => item.key);
  process.stdout.write(JSON.stringify({
    is_error: false,
    structured_output: { items: keys.map((key) => ({ key, translation: 'Ouvert', changed: false, reason: '' })) }
  }));
});
`,
      { mode: 0o755 }
    );
    process.env.ANTHROPIC_API_KEY = 'sk-should-not-reach-claude-code';
  });

  afterEach(() => {
    fs.rmSync(binDir, { recursive: true, force: true });
    if (savedApiKey === undefined) {
      delete process.env.ANTHROPIC_API_KEY;
    } else {
      process.env.ANTHROPIC_API_KEY = savedApiKey;
    }
  });

  test('sends the batch over stdin and never passes API credentials to the CLI', async () => {
    const provider = new ClaudeCodeProvider({ command: path.join(binDir, 'claude'), model: 'sonnet' });

    const result = await provider.translateItems({
      mode: 'translate',
      sourceLang: 'en',
      targetLang: 'fr',
      app: '',
      namespace: { name: 'stocktake' },
      language: { formality: 'default', instructions: [] },
      glossary: [],
      items: [{ key: 'STATUS_OPEN', source: 'Open', neighbours: [], usages: [], placeholders: [] }]
    });

    expect(result).toEqual([{ key: 'STATUS_OPEN', translation: 'Ouvert', changed: false }]);
    const received = readJson(path.join(binDir, 'received.json')) as { args: string[]; stdin: string; apiKey: null };
    expect(received.apiKey).toBeNull();
    expect(JSON.parse(received.stdin).items[0].key).toBe('STATUS_OPEN');
    expect(received.args).toEqual(expect.arrayContaining(['-p', '--tools', '', '--model', 'sonnet']));
  });
});

describe('createProvider', () => {
  const saved = { ...process.env };
  let root: string;

  beforeEach(() => {
    delete process.env.ANTHROPIC_API_KEY;
    delete process.env.DEEPL_API_KEY;
    ({ root } = makeProject({ fallbackProvider: 'deepl' }));
  });

  afterEach(() => {
    process.env = { ...saved };
    fs.rmSync(root, { recursive: true, force: true });
  });

  test('claude uses the local Claude Code sign-in when it is available', () => {
    const { provider } = createProvider(loadConfig(root), { claudeCodeAvailable: () => true });

    expect(provider).toBeInstanceOf(ClaudeCodeProvider);
  });

  test('claude uses the API when Claude Code is not signed in and an API key is set', () => {
    process.env.ANTHROPIC_API_KEY = 'sk-test';

    const { provider } = createProvider(loadConfig(root), { claudeCodeAvailable: () => false });

    expect(provider).toBeInstanceOf(ClaudeApiProvider);
  });

  test('claude falls back to the fallback provider when neither route is available', () => {
    process.env.DEEPL_API_KEY = 'deepl-key';

    const setup = createProvider(loadConfig(root), { claudeCodeAvailable: () => false });

    expect(setup.provider.name).toBe('deepl');
    expect(setup.fallback).toBeUndefined();
  });

  test('says what to set when nothing can run', () => {
    expect(() => createProvider(loadConfig(root), { claudeCodeAvailable: () => false })).toThrow(
      'The claude provider needs Claude Code signed in'
    );
  });

  test('warns when the configured fallback has no API key', () => {
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});

    createProvider(loadConfig(root), { claudeCodeAvailable: () => true });

    expect(warn).toHaveBeenCalledWith(
      expect.stringContaining('fallbackProvider "deepl" is configured but DEEPL_API_KEY')
    );
    warn.mockRestore();
  });

  test('the fallback is only created when its API key is set', () => {
    expect(createProvider(loadConfig(root), { claudeCodeAvailable: () => true }).fallback).toBeUndefined();

    process.env.DEEPL_API_KEY = 'deepl-key';
    expect(createProvider(loadConfig(root), { claudeCodeAvailable: () => true }).fallback?.name).toBe('deepl');
  });
});

describe('DeepL with context', () => {
  const mockFetch = jest.fn<typeof fetch>();
  const realFetch = global.fetch;

  beforeEach(() => {
    global.fetch = mockFetch;
    mockFetch.mockReset();
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => ({ translations: [{ text: 'Ouvert', detected_source_language: 'EN' }] })
    } as unknown as Response);
  });

  afterEach(() => {
    global.fetch = realFetch;
  });

  test('sends the namespace, role and neighbours as context, and formality as a soft preference', async () => {
    const provider = adaptLegacyProvider(new DeepLTranslateProvider(), { name: 'deepl', apiKey: 'k', delayMs: 0 });

    await provider.translateItems({
      mode: 'translate',
      sourceLang: 'en',
      targetLang: 'fr',
      app: 'SAM is the stock management app used in Lush shops',
      namespace: { name: 'admin_stocktakes', description: 'Admin table to review stocktakes' },
      language: { formality: 'formal', instructions: ['ignored by DeepL'] },
      glossary: [],
      items: [
        {
          key: 'STATUS_OPEN',
          source: 'Open',
          role: 'status label describing a state, not an action',
          neighbours: [{ key: 'STATUS_CLOSED', source: 'Closed' }],
          usages: [],
          placeholders: []
        }
      ]
    });

    const body = JSON.parse((mockFetch.mock.calls[0][1] as RequestInit).body as string);
    expect(body.context).toBe(
      'SAM is the stock management app used in Lush shops. Admin table to review stocktakes. This text is a status label describing a state, not an action. Other text on the same screen: "Closed".'
    );
    expect(body.formality).toBe('prefer_more');
    expect(body.context).not.toContain('ignored by DeepL');
  });
});
