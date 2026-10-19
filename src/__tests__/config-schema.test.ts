import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { afterEach, beforeEach, describe, expect, test } from '@jest/globals';
import { loadConfig } from '../translations/cli/init.js';
import {
  DEEPL_LANGUAGES,
  FALLBACK_PROVIDERS,
  getSupportedLanguages,
  isClaudeProvider,
  isValidLanguageForProvider,
  SUPPORTED_LANGUAGES,
  TRANSLATION_CONFIG_SCHEMA,
  TRANSLATION_PROVIDERS
} from '../translations/core/schema.js';
import { DEFAULT_CONFIG } from '../translations/core/types.js';
import {
  ClaudeApiProvider,
  ClaudeCodeProvider,
  DEFAULT_CLAUDE_API_MODEL
} from '../translations/utils/claude-provider.js';
import { createProvider, getApiKeyEnvVar, ProviderUnavailableError } from '../translations/utils/provider-factory.js';

const SCHEMA_JSON_PATH = path.join(process.cwd(), 'src/translations/core/translations-config.schema.json');
const CLAUDE_PROVIDERS = ['claude', 'claude-api', 'claude-code'] as const;

type SchemaNode = {
  type?: string | string[];
  enum?: readonly unknown[];
  default?: unknown;
  properties?: Record<string, SchemaNode>;
  items?: SchemaNode;
  required?: string[];
  additionalProperties?: boolean | SchemaNode;
};

const properties = TRANSLATION_CONFIG_SCHEMA.properties as Record<string, SchemaNode>;

function makeProject(config: Record<string, unknown>): string {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'lexis-config-'));
  fs.mkdirSync(path.join(root, 'locales', 'en'), { recursive: true });
  fs.writeFileSync(
    path.join(root, '.translationsrc.json'),
    JSON.stringify({ translationsPath: 'locales', languages: ['en', 'fr'], sourceLanguage: 'en', ...config })
  );
  return root;
}

describe('config schema', () => {
  test('has a property for every TranslationConfig field, and no others', () => {
    const schemaFields = Object.keys(properties).filter((field) => field !== '$schema');

    expect(schemaFields.sort()).toEqual(Object.keys(DEFAULT_CONFIG).sort());
  });

  test('the committed JSON schema was regenerated from TRANSLATION_CONFIG_SCHEMA (run npm run build)', () => {
    const { $schema: _schema, $id: _id, ...committed } = JSON.parse(fs.readFileSync(SCHEMA_JSON_PATH, 'utf-8'));

    expect(committed).toEqual(JSON.parse(JSON.stringify(TRANSLATION_CONFIG_SCHEMA)));
  });

  test.each([
    'provider',
    'fallbackProvider',
    'contextRequired'
  ] as const)('the schema default for %s matches DEFAULT_CONFIG', (field) => {
    expect(properties[field].default).toEqual(DEFAULT_CONFIG[field]);
  });

  test('provider lists every provider, including the Claude ones', () => {
    expect(properties.provider.enum).toEqual([...TRANSLATION_PROVIDERS]);
    expect(TRANSLATION_PROVIDERS).toEqual(expect.arrayContaining([...CLAUDE_PROVIDERS]));
  });

  test('fallbackProvider accepts only non-Claude providers, or null', () => {
    expect(properties.fallbackProvider.enum).toEqual([...FALLBACK_PROVIDERS, null]);
    expect(properties.fallbackProvider.type).toEqual(['string', 'null']);
    for (const provider of FALLBACK_PROVIDERS) {
      expect(TRANSLATION_PROVIDERS).toContain(provider);
      expect(isClaudeProvider(provider)).toBe(false);
    }
  });

  test('languageSettings allows formality and instructions per language and nothing else', () => {
    const perLanguage = properties.languageSettings.additionalProperties as SchemaNode;

    expect(perLanguage.properties?.formality.enum).toEqual(['formal', 'informal', 'default']);
    expect(perLanguage.properties?.instructions).toMatchObject({ type: 'array', items: { type: 'string' } });
    expect(perLanguage.additionalProperties).toBe(false);
  });

  test('keyRoles entries need a pattern and a role', () => {
    expect(properties.keyRoles.items).toMatchObject({
      required: ['pattern', 'role'],
      additionalProperties: false
    });
  });

  test('claude settings allow a model and a key limit whose default matches the providers', () => {
    const claude = properties.claude;

    expect(Object.keys(claude.properties ?? {}).sort()).toEqual([
      'codeContext',
      'maxKeysPerRequest',
      'model',
      'serverFallbacks'
    ]);
    expect(claude.additionalProperties).toBe(false);
    expect(claude.properties?.maxKeysPerRequest.default).toBe(new ClaudeCodeProvider().supports.maxItems);
  });
});

describe('provider helpers', () => {
  test.each([...TRANSLATION_PROVIDERS])('isClaudeProvider(%s) matches the Claude provider list', (provider) => {
    expect(isClaudeProvider(provider)).toBe(CLAUDE_PROVIDERS.some((claude) => claude === provider));
  });

  test.each(CLAUDE_PROVIDERS)('%s accepts every supported language, including ones DeepL lacks', (provider) => {
    const notInDeepL = SUPPORTED_LANGUAGES.find(
      (language) => !(DEEPL_LANGUAGES as readonly string[]).includes(language)
    );

    expect(getSupportedLanguages(provider)).toEqual(SUPPORTED_LANGUAGES);
    expect(notInDeepL).toBeDefined();
    expect(isValidLanguageForProvider(notInDeepL as string, provider)).toBe(true);
    expect(isValidLanguageForProvider('not-a-language', provider)).toBe(false);
  });

  test.each([
    ['deepl', 'DEEPL_API_KEY'],
    ['google', 'GOOGLE_TRANSLATE_API_KEY'],
    ['claude-api', 'ANTHROPIC_API_KEY'],
    ['claude-code', undefined],
    ['claude', undefined]
  ] as const)('%s reads its API key from %s', (provider, envVar) => {
    expect(getApiKeyEnvVar(provider)).toBe(envVar);
  });
});

describe('loadConfig with the context settings', () => {
  let root: string;

  afterEach(() => {
    fs.rmSync(root, { recursive: true, force: true });
  });

  test('fills every new field with its default when the config leaves it out', () => {
    root = makeProject({});

    expect(loadConfig(root)).toMatchObject({
      context: '',
      contextRequired: false,
      glossary: '',
      languageSettings: {},
      keyRoles: [],
      fallbackProvider: null,
      claude: {}
    });
  });

  test('keeps the new fields as written', () => {
    const settings = {
      provider: 'claude',
      fallbackProvider: 'google',
      context: 'SAM is the stock app used in Lush shops',
      contextRequired: true,
      glossary: '../glossary.json',
      languageSettings: { ja: { formality: 'formal', instructions: ['Use です/ます form'] } },
      keyRoles: [{ pattern: '^GRID_', role: 'grid heading' }],
      claude: { model: 'claude-sonnet-5-5', maxKeysPerRequest: 10 }
    };
    root = makeProject(settings);

    expect(loadConfig(root)).toMatchObject(settings);
  });
});

describe('createProvider with claude settings', () => {
  const saved = { ...process.env };
  let root: string;

  beforeEach(() => {
    delete process.env.ANTHROPIC_API_KEY;
    delete process.env.DEEPL_API_KEY;
    delete process.env.GOOGLE_TRANSLATE_API_KEY;
  });

  afterEach(() => {
    process.env = { ...saved };
    fs.rmSync(root, { recursive: true, force: true });
  });

  test('claude-api uses the configured model and key limit', () => {
    root = makeProject({ provider: 'claude-api', claude: { model: 'claude-sonnet-5-5', maxKeysPerRequest: 12 } });

    const { provider } = createProvider(loadConfig(root), { apiKey: 'sk-test' });

    expect(provider).toBeInstanceOf(ClaudeApiProvider);
    expect(provider.model).toBe('claude-sonnet-5-5');
    expect(provider.supports.maxItems).toBe(12);
  });

  test('claude-api defaults the model and key limit when claude settings are left out', () => {
    root = makeProject({ provider: 'claude-api' });
    process.env.ANTHROPIC_API_KEY = 'sk-test';

    const { provider } = createProvider(loadConfig(root));

    expect(provider.model).toBe(DEFAULT_CLAUDE_API_MODEL);
    expect(provider.supports.maxItems).toBe(properties.claude.properties?.maxKeysPerRequest.default);
  });

  test('claude-code passes the configured model and leaves it unset otherwise', () => {
    root = makeProject({ provider: 'claude-code', claude: { model: 'sonnet' } });

    expect(createProvider(loadConfig(root), { claudeCodeAvailable: () => true }).provider.model).toBe('sonnet');

    fs.writeFileSync(
      path.join(root, '.translationsrc.json'),
      JSON.stringify({ translationsPath: 'locales', languages: ['en'], sourceLanguage: 'en', provider: 'claude-code' })
    );
    expect(createProvider(loadConfig(root), { claudeCodeAvailable: () => true }).provider.model).toBeUndefined();
  });

  test.each([
    ['claude-api', 'ANTHROPIC_API_KEY'],
    ['claude-code', 'signed in'],
    ['deepl', 'DEEPL_API_KEY'],
    ['google', 'GOOGLE_TRANSLATE_API_KEY']
  ])('%s says what is missing when it cannot run', (provider, hint) => {
    root = makeProject({ provider });

    const create = () => createProvider(loadConfig(root), { claudeCodeAvailable: () => false });

    expect(create).toThrow(ProviderUnavailableError);
    expect(create).toThrow(hint);
  });

  test('a fallbackProvider that matches the main provider is not used as a fallback', () => {
    root = makeProject({ provider: 'deepl', fallbackProvider: 'deepl' });
    process.env.DEEPL_API_KEY = 'deepl-key';

    expect(createProvider(loadConfig(root)).fallback).toBeUndefined();
  });

  test('a google fallback reads GOOGLE_TRANSLATE_API_KEY', () => {
    root = makeProject({ provider: 'claude-api', fallbackProvider: 'google' });
    process.env.ANTHROPIC_API_KEY = 'sk-test';
    process.env.GOOGLE_TRANSLATE_API_KEY = 'google-key';

    expect(createProvider(loadConfig(root)).fallback?.name).toBe('google');
  });
});
