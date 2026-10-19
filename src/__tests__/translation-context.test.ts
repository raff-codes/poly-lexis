import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { afterEach, beforeEach, describe, expect, test } from '@jest/globals';
import { generateTranslationTypes } from '../translations/cli/generate-types.js';
import { validateTranslations } from '../translations/cli/validate.js';
import type { KeyContext } from '../translations/core/types.js';
import { DEFAULT_CONFIG } from '../translations/core/types.js';
import { findTerm, loadGlossary, parseGlossary, termsInTexts } from '../translations/utils/glossary.js';
import {
  buildKeyContext,
  compileKeyRoles,
  extractPlaceholders,
  getNeighbours,
  hashKeyContext,
  inferKeyRole
} from '../translations/utils/key-context.js';
import {
  getMetadataEntry,
  getMetadataPath,
  getSourceHash,
  hashSourceValue,
  isManuallyEdited,
  readMetadata,
  setSourceHash,
  writeMetadata
} from '../translations/utils/metadata.js';
import {
  CONTEXT_KEY,
  findContextIssues,
  parseNamespaceContext,
  readNamespaceContexts,
  updateNamespaceContext
} from '../translations/utils/source-context.js';
import { checkTranslation } from '../translations/utils/translation-checks.js';
import { buildUsageIndex } from '../translations/utils/usage-index.js';
import { readTranslations, syncTranslationStructure, writeTranslation } from '../translations/utils/utils.js';

function makeProject(prefix: string, config: Record<string, unknown> = {}): { root: string; locales: string } {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), prefix));
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
      ...config
    })
  );
  return { root, locales };
}

function writeRaw(locales: string, language: string, namespace: string, content: unknown): void {
  fs.writeFileSync(path.join(locales, language, `${namespace}.json`), JSON.stringify(content, null, 2));
}

function readRaw(locales: string, language: string, namespace: string): Record<string, unknown> {
  return JSON.parse(fs.readFileSync(path.join(locales, language, `${namespace}.json`), 'utf-8'));
}

const TREATMENTS = {
  [CONTEXT_KEY]: {
    description: 'Booking a spa treatment for a customer',
    keys: { BOOK_CHECKOUT_SUBMIT: 'Button that confirms the booking' }
  },
  ANY_THERAPIST: 'Any therapist',
  BOOK_CHECKOUT_SUBMIT: 'Book',
  STATUS_OPEN: 'Open'
};

describe('$context in source files', () => {
  let root: string;
  let locales: string;

  beforeEach(() => {
    ({ root, locales } = makeProject('lexis-context-'));
    writeRaw(locales, 'en', 'treatments', TREATMENTS);
  });

  afterEach(() => {
    fs.rmSync(root, { recursive: true, force: true });
  });

  test('is not read as translation keys, even though it is a nested object', () => {
    const keys = Object.keys(readTranslations(locales, 'en').treatments);

    expect(keys).toEqual(['ANY_THERAPIST', 'BOOK_CHECKOUT_SUBMIT', 'STATUS_OPEN']);
  });

  test('is never synced into target languages', () => {
    syncTranslationStructure(locales, ['en', 'fr'], 'en');

    expect(readRaw(locales, 'fr', 'treatments')).toEqual({
      ANY_THERAPIST: '',
      BOOK_CHECKOUT_SUBMIT: '',
      STATUS_OPEN: ''
    });
  });

  test('survives rewriting the source file and stays the first entry', () => {
    writeTranslation(locales, 'en', 'treatments', { ...readTranslations(locales, 'en').treatments, NEW_KEY: 'New' });

    const raw = readRaw(locales, 'en', 'treatments');
    expect(Object.keys(raw)[0]).toBe(CONTEXT_KEY);
    expect(raw[CONTEXT_KEY]).toEqual(TREATMENTS[CONTEXT_KEY]);
    expect(raw.NEW_KEY).toBe('New');
  });

  test('is left out of the generated types', () => {
    generateTranslationTypes(root);

    const types = fs.readFileSync(path.join(root, 'src/types/i18nTypes.ts'), 'utf-8');
    expect(types).toContain('"BOOK_CHECKOUT_SUBMIT"');
    expect(types).not.toContain('$context');
    expect(types).not.toContain('description');
  });

  test('updateNamespaceContext adds a note without touching translations', () => {
    updateNamespaceContext(locales, 'en', 'treatments', { keyNotes: { STATUS_OPEN: 'Booking status' } });

    const { context } = readNamespaceContexts(locales, 'en').treatments;
    expect(context.description).toBe('Booking a spa treatment for a customer');
    expect(context.keys).toEqual({
      BOOK_CHECKOUT_SUBMIT: 'Button that confirms the booking',
      STATUS_OPEN: 'Booking status'
    });
    expect(readTranslations(locales, 'en').treatments.STATUS_OPEN).toBe('Open');
  });

  test('validation reports a missing description and a note for a removed key when the app has context', () => {
    fs.rmSync(root, { recursive: true, force: true });
    ({ root, locales } = makeProject('lexis-context-app-', { context: 'Lush Spa manages spa bookings' }));
    writeRaw(locales, 'en', 'treatments', TREATMENTS);
    writeRaw(locales, 'en', 'common', { [CONTEXT_KEY]: { keys: { GONE: 'Used to exist' } }, SAVE: 'Save' });
    writeRaw(locales, 'fr', 'common', { SAVE: 'Enregistrer' });
    writeRaw(locales, 'fr', 'treatments', { ANY_THERAPIST: 'a', BOOK_CHECKOUT_SUBMIT: 'b', STATUS_OPEN: 'c' });

    const result = validateTranslations(root);

    expect(result.contextIssues.map((issue) => [issue.namespace, issue.type, issue.key])).toEqual([
      ['common', 'missing-description', undefined],
      ['common', 'unknown-key-note', 'GONE']
    ]);
    // Context is advisory unless the config requires it
    expect(result.valid).toBe(true);
  });

  test('a project that does not use context is not asked for descriptions', () => {
    writeRaw(locales, 'en', 'common', { [CONTEXT_KEY]: { keys: { GONE: 'Used to exist' } }, SAVE: 'Save' });
    writeRaw(locales, 'fr', 'common', { SAVE: 'Enregistrer' });
    writeRaw(locales, 'fr', 'treatments', { ANY_THERAPIST: 'a', BOOK_CHECKOUT_SUBMIT: 'b', STATUS_OPEN: 'c' });

    const types = validateTranslations(root).contextIssues.map((issue) => issue.type);

    expect(types).toEqual(['unknown-key-note']);
  });

  test('contextRequired makes a missing description fail validation', () => {
    fs.rmSync(root, { recursive: true, force: true });
    ({ root, locales } = makeProject('lexis-context-required-', { contextRequired: true }));
    writeRaw(locales, 'en', 'common', { SAVE: 'Save' });
    writeRaw(locales, 'fr', 'common', { SAVE: 'Enregistrer' });

    expect(validateTranslations(root).valid).toBe(false);
  });

  test('a malformed $context is reported instead of breaking reads', () => {
    writeRaw(locales, 'en', 'common', { [CONTEXT_KEY]: 'not an object', SAVE: 'Save' });

    expect(readTranslations(locales, 'en').common).toEqual({ SAVE: 'Save' });
    expect(readNamespaceContexts(locales, 'en').common.problems).toHaveLength(1);
  });

  test('updateNamespaceContext creates the file, replaces the description and ignores blank notes', () => {
    updateNamespaceContext(locales, 'en', 'checkout', {
      description: '  Paying for a booking  ',
      keyNotes: { PAY: 'Button that takes payment', BLANK: '   ' }
    });
    updateNamespaceContext(locales, 'en', 'checkout', { description: 'Paying for a spa booking' });

    expect(readRaw(locales, 'en', 'checkout')).toEqual({
      [CONTEXT_KEY]: { description: 'Paying for a spa booking', keys: { PAY: 'Button that takes payment' } }
    });
  });

  test('updateNamespaceContext with nothing to write leaves no $context behind', () => {
    writeRaw(locales, 'en', 'common', { SAVE: 'Save' });

    updateNamespaceContext(locales, 'en', 'common', { description: ' ', keyNotes: { SAVE: '' } });

    expect(readRaw(locales, 'en', 'common')).toEqual({ SAVE: 'Save' });
  });
});

describe('parseNamespaceContext', () => {
  test('a missing $context is an empty context with no problems', () => {
    expect(parseNamespaceContext(undefined)).toEqual({ context: { keys: {} }, problems: [] });
  });

  test.each([
    ['a string', 'text', ['$context must be an object with "description" and "keys"']],
    ['an array', [], ['$context must be an object with "description" and "keys"']],
    ['a blank description', { description: '  ' }, ['$context.description must be a non-empty string']],
    ['a numeric description', { description: 3 }, ['$context.description must be a non-empty string']],
    ['keys as an array', { keys: ['A'] }, ['$context.keys must be an object mapping keys to notes']]
  ])('reports %s', (_label, raw, problems) => {
    expect(parseNamespaceContext(raw).problems).toEqual(problems);
  });

  test('keeps the valid notes, trimmed, and reports each bad one by key', () => {
    const parsed = parseNamespaceContext({
      description: ' Checkout ',
      keys: { PAY: ' Pay button ', EMPTY: '', COUNT: 3 }
    });

    expect(parsed.context).toEqual({ description: 'Checkout', keys: { PAY: 'Pay button' } });
    expect(parsed.problems).toEqual([
      '$context.keys.EMPTY must be a non-empty string',
      '$context.keys.COUNT must be a non-empty string'
    ]);
  });

  test('findContextIssues turns parse problems into invalid-context issues', () => {
    const issues = findContextIssues(
      { common: parseNamespaceContext({ description: 'Shared', keys: [] }) },
      {
        common: { SAVE: 'Save' }
      }
    );

    expect(issues).toEqual([
      {
        namespace: 'common',
        type: 'invalid-context',
        message: '$context.keys must be an object mapping keys to notes'
      }
    ]);
  });
});

describe('key context', () => {
  test('compileKeyRoles names the rule whose pattern is not a valid regular expression', () => {
    expect(() =>
      compileKeyRoles([
        { pattern: '^COL_', role: 'grid heading' },
        { pattern: '(COL_', role: 'broken' }
      ])
    ).toThrow('keyRoles[1] has an invalid pattern "(COL_"');
  });

  test('inferKeyRole gives the same role from compiled rules as from raw rules', () => {
    const rules = [{ pattern: '^COL_', role: 'grid heading' }];

    expect(inferKeyRole('COL_COUNTED', compileKeyRoles(rules))).toBe(inferKeyRole('COL_COUNTED', rules));
  });

  test.each([
    ['COL_COUNTED', 'table column header'],
    ['ADMIN_STOCKTAKES_COL_STATUS', 'table column header'],
    ['STATUS_OPEN', 'status label describing a state, not an action'],
    ['BOOK_CHECKOUT_SUBMIT', 'button label, an action'],
    ['NAVIGATION_SHIP_TITLE', 'navigation item'],
    ['ADMIN_SAFETY_STOCK_TITLE', 'heading'],
    ['SEARCH_PLACEHOLDER', 'placeholder text inside an empty input'],
    ['ANY_THERAPIST', undefined]
  ])('infers the role of %s', (key, role) => {
    expect(inferKeyRole(key)).toBe(role);
  });

  test('plural keys get the role of their base key plus the plural form', () => {
    expect(inferKeyRole('COL_ITEMS_one')).toBe('table column header; plural form "one" (i18next count category)');
  });

  test('project rules win over the built-in rules', () => {
    expect(inferKeyRole('COL_COUNTED', [{ pattern: '^COL_', role: 'grid heading' }])).toBe('grid heading');
  });

  test('extracts both placeholder styles', () => {
    expect(extractPlaceholders('{{count}} items in {zone}')).toEqual(['{{count}}', '{zone}']);
  });

  test('neighbours are the keys either side in file order', () => {
    const entries = { A: 'a', B: 'b', C: 'c', D: 'd', E: 'e' };

    expect(getNeighbours(entries, 'C', 1)).toEqual([
      { key: 'B', source: 'b' },
      { key: 'D', source: 'd' }
    ]);
    expect(getNeighbours(entries, 'A', 2).map((neighbour) => neighbour.key)).toEqual(['B', 'C']);
  });

  test('buildKeyContext carries the note written for the key', () => {
    const item = buildKeyContext({
      key: 'BOOK_CHECKOUT_SUBMIT',
      sourceEntries: { BOOK_CHECKOUT_SUBMIT: 'Book' },
      namespaceContext: { keys: { BOOK_CHECKOUT_SUBMIT: 'Button that confirms the booking' } },
      keyRoles: []
    });

    expect(item).toMatchObject({ note: 'Button that confirms the booking', role: 'button label, an action' });
  });

  test('buildKeyContext leaves out a blank existing translation', () => {
    const build = (existing: string) =>
      buildKeyContext({
        key: 'SAVE',
        sourceEntries: { SAVE: 'Save {{name}}' },
        namespaceContext: { keys: {} },
        keyRoles: [],
        existing
      });

    expect(build('  ')).not.toHaveProperty('existing');
    expect(build('Enregistrer {{name}}')).toMatchObject({
      existing: 'Enregistrer {{name}}',
      placeholders: ['{{name}}']
    });
  });

  describe('hashKeyContext', () => {
    const item: KeyContext = {
      key: 'STATUS_OPEN',
      source: 'Open',
      role: 'status label',
      note: 'Booking status',
      neighbours: [{ key: 'STATUS_CLOSED', source: 'Closed' }],
      usages: [],
      placeholders: []
    };
    const base = hashKeyContext('Spa app', 'Bookings', item);

    test.each([
      ['the app context', () => hashKeyContext('Stock app', 'Bookings', item)],
      ['the namespace description', () => hashKeyContext('Spa app', 'Orders', item)],
      ['the key note', () => hashKeyContext('Spa app', 'Bookings', { ...item, note: 'Shop status' })],
      ['the role', () => hashKeyContext('Spa app', 'Bookings', { ...item, role: 'button' })]
    ])('changes with %s', (_label, rehash) => {
      expect(rehash()).not.toBe(base);
    });

    test('ignores neighbours, usages and the existing translation', () => {
      const moved: KeyContext = {
        ...item,
        neighbours: [],
        usages: [{ file: 'src/a.tsx', line: 1, snippet: "t('STATUS_OPEN')" }],
        existing: 'Ouvert'
      };

      expect(hashKeyContext('Spa app', 'Bookings', moved)).toBe(base);
    });
  });
});

describe('translation checks', () => {
  const glossary = [
    { term: 'Lush', doNotTranslate: true },
    { term: 'store', translations: { fr: 'boutique' } }
  ];

  test('accepts a translation that keeps placeholders and terms', () => {
    expect(checkTranslation('{{count}} items at Lush', '{{count}} articles chez Lush', 'fr', glossary)).toEqual({
      errors: [],
      warnings: []
    });
  });

  test('rejects a dropped or renamed placeholder', () => {
    expect(checkTranslation('{{count}} items', '{{nombre}} articles', 'fr', []).errors).toHaveLength(1);
    expect(checkTranslation('{{count}} items', 'articles', 'fr', []).errors).toHaveLength(1);
  });

  test('rejects a translated do-not-translate term', () => {
    expect(checkTranslation('Welcome to Lush', 'Bienvenue chez Luxuriant', 'fr', glossary).errors).toEqual([
      '"Lush" must stay untranslated'
    ]);
  });

  test("accepts a do-not-translate term kept in the source's own casing", () => {
    expect(checkTranslation('WELCOME TO LUSH', 'BIENVENUE CHEZ LUSH', 'fr', glossary).errors).toEqual([]);
  });

  test('warns when a glossary translation is not used', () => {
    expect(checkTranslation('Choose a store', 'Choisissez un magasin', 'fr', glossary)).toEqual({
      errors: [],
      warnings: ['glossary says "store" is "boutique" in fr']
    });
  });

  test('rejects an empty translation of a non-empty source', () => {
    expect(checkTranslation('Save', '  ', 'fr', []).errors).toEqual(['no translation returned']);
  });

  test('rejects a missing translation but accepts an empty one for an empty source', () => {
    expect(checkTranslation('', undefined, 'fr', []).errors).toEqual(['no translation returned']);
    expect(checkTranslation('', '', 'fr', []).errors).toEqual([]);
  });

  test('ignores glossary terms that are not in the source', () => {
    expect(checkTranslation('Save', 'Enregistrer', 'fr', glossary)).toEqual({ errors: [], warnings: [] });
  });
});

describe('glossary', () => {
  let root: string;

  beforeEach(() => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), 'lexis-glossary-'));
  });

  afterEach(() => {
    fs.rmSync(root, { recursive: true, force: true });
  });

  test('merges protectedTerms as do-not-translate terms without duplicating glossary entries', () => {
    fs.writeFileSync(
      path.join(root, 'glossary.json'),
      JSON.stringify({
        terms: [
          { term: 'Lush', doNotTranslate: true },
          { term: 'credit', note: 'Credit note' }
        ]
      })
    );

    const glossary = loadGlossary(root, {
      ...DEFAULT_CONFIG,
      glossary: 'glossary.json',
      protectedTerms: ['lush', 'SAM']
    });

    expect(glossary.terms.map((term) => term.term)).toEqual(['Lush', 'credit', 'SAM']);
  });

  test('names the broken entry when the file is malformed', () => {
    expect(() => parseGlossary({ terms: [{ term: 'ok' }, { term: '' }] }, 'glossary.json')).toThrow(
      'glossary.json terms[1] needs a non-empty "term"'
    );
  });

  test.each([
    ['a non-object', [], 'glossary.json must be an object with a "terms" array'],
    ['terms that are not an array', { terms: {} }, 'glossary.json must be an object with a "terms" array'],
    ['an entry that is not an object', { terms: ['Lush'] }, 'glossary.json terms[0] needs a non-empty "term"'],
    [
      'a non-boolean doNotTranslate',
      { terms: [{ term: 'Lush', doNotTranslate: 'yes' }] },
      'glossary.json terms[0] "doNotTranslate" must be true or false'
    ],
    ['a non-string note', { terms: [{ term: 'Lush', note: 1 }] }, 'glossary.json terms[0] "note" must be a string'],
    [
      'translations that are not strings',
      { terms: [{ term: 'store', translations: { fr: 1 } }] },
      'glossary.json terms[0] "translations" must map language codes to strings'
    ],
    [
      'translations as an array',
      { terms: [{ term: 'store', translations: ['boutique'] }] },
      'glossary.json terms[0] "translations" must map language codes to strings'
    ]
  ])('rejects %s', (_label, raw, message) => {
    expect(() => parseGlossary(raw, 'glossary.json')).toThrow(message);
  });

  test('trims terms and notes, and drops a false doNotTranslate and a blank note', () => {
    const glossary = parseGlossary({
      terms: [
        { term: ' Lush ', doNotTranslate: true, note: ' Brand ' },
        { term: 'store', doNotTranslate: false, note: ' ', translations: { fr: 'boutique' } }
      ]
    });

    expect(glossary.terms).toEqual([
      { term: 'Lush', doNotTranslate: true, note: 'Brand' },
      { term: 'store', translations: { fr: 'boutique' } }
    ]);
  });

  test('says which config field to fix when the glossary file is missing', () => {
    expect(() => loadGlossary(root, { ...DEFAULT_CONFIG, glossary: 'missing.json' })).toThrow(
      'Fix "glossary" in .translationsrc.json'
    );
  });

  test('without a glossary file, protectedTerms become the glossary', () => {
    expect(loadGlossary(root, { ...DEFAULT_CONFIG, protectedTerms: ['SAM'] })).toEqual({
      terms: [{ term: 'SAM', doNotTranslate: true }]
    });
  });

  test('only matches whole words', () => {
    const glossary = { terms: [{ term: 'store' }] };

    expect(termsInTexts(glossary, ['Storefront settings'])).toEqual([]);
    expect(termsInTexts(glossary, ['Choose a Store'])).toEqual([{ term: 'store' }]);
  });
});

describe('findTerm', () => {
  test('reuses its pattern without carrying match state between calls', () => {
    expect(findTerm('Visit Lush today', 'lush')).toBe('Lush');
    expect(findTerm('LUSH shops', 'lush')).toBe('LUSH');
    expect(findTerm('Lushness', 'lush')).toBeUndefined();
  });
});

describe('usage index', () => {
  let root: string;

  beforeEach(() => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), 'lexis-usage-'));
    fs.mkdirSync(path.join(root, 'src/views/stocktakes'), { recursive: true });
    fs.mkdirSync(path.join(root, 'src/views/orders/__tests__'), { recursive: true });
    fs.mkdirSync(path.join(root, 'src/types'), { recursive: true });

    fs.writeFileSync(
      path.join(root, 'src/views/stocktakes/StatusCell.tsx'),
      [
        "const { t } = useTranslation('admin_stocktakes');",
        '',
        'export const StatusCell = () => (',
        "  <Badge variant='warning'>{t('STATUS_OPEN')}</Badge>",
        ');'
      ].join('\n')
    );
    fs.writeFileSync(
      path.join(root, 'src/views/orders/OrderStatus.tsx'),
      "const label = t('STATUS_OPEN');\nconst items = t('ITEMS', { count });\n"
    );
    fs.writeFileSync(
      path.join(root, 'src/views/orders/__tests__/OrderStatus.test.tsx'),
      "expect(screen.getByText('STATUS_OPEN')).toBeVisible();"
    );
    fs.writeFileSync(path.join(root, 'src/types/i18nTypes.ts'), "export const translationKeys = ['STATUS_OPEN'];");
  });

  afterEach(() => {
    fs.rmSync(root, { recursive: true, force: true });
  });

  function index() {
    return buildUsageIndex({
      projectRoot: root,
      searchPaths: ['src'],
      searchExtensions: ['.ts', '.tsx'],
      keys: ['STATUS_OPEN', 'ITEMS_one', 'ITEMS_other'],
      namespaces: ['admin_stocktakes', 'orders'],
      excludeFiles: ['src/types/i18nTypes.ts']
    });
  }

  test('finds real usages and skips tests and the generated types file', () => {
    const files = index()
      .getUsages('STATUS_OPEN', 'orders')
      .map((usage) => usage.file);

    expect(files.sort()).toEqual([
      path.join('src', 'views', 'orders', 'OrderStatus.tsx'),
      path.join('src', 'views', 'stocktakes', 'StatusCell.tsx')
    ]);
  });

  test('puts usages from files that load the namespace first, with the line and surrounding code', () => {
    const [first] = index().getUsages('STATUS_OPEN', 'admin_stocktakes');

    expect(first.file).toBe(path.join('src', 'views', 'stocktakes', 'StatusCell.tsx'));
    expect(first.line).toBe(4);
    expect(first.snippet).toContain("<Badge variant='warning'>{t('STATUS_OPEN')}</Badge>");
  });

  test('plural keys resolve to their base key usage', () => {
    expect(index().getUsages('ITEMS_other', 'orders')).toHaveLength(1);
  });

  test('finds keys written with a namespace prefix and ranks the matching prefix first', () => {
    fs.writeFileSync(
      path.join(root, 'src/views/orders/OrderHeader.tsx'),
      "const open = t('orders:STATUS_OPEN');\nconst other = t('admin_stocktakes.STATUS_OPEN');\n"
    );

    const usages = index().getUsages('STATUS_OPEN', 'orders', 10);
    const header = path.join('src', 'views', 'orders', 'OrderHeader.tsx');

    expect(usages.filter((usage) => usage.file === header).map((usage) => usage.line)).toEqual([1, 2]);
    expect(usages[0]).toMatchObject({ file: header, line: 1 });
  });
});

describe('metadata v2', () => {
  let root: string;
  let locales: string;

  beforeEach(() => {
    ({ root, locales } = makeProject('lexis-meta-'));
  });

  afterEach(() => {
    fs.rmSync(root, { recursive: true, force: true });
  });

  test('reads version 1 files, where each key stored a bare source hash', () => {
    fs.writeFileSync(
      getMetadataPath(locales),
      JSON.stringify({ version: 1, languages: { fr: { common: { SAVE: hashSourceValue('Save') } } } })
    );

    const metadata = readMetadata(locales);

    expect(getSourceHash(metadata, 'fr', 'common', 'SAVE')).toBe(hashSourceValue('Save'));
    expect(isManuallyEdited(metadata, 'fr', 'common', 'SAVE', 'Sauver')).toBe(false);
  });

  test('detects a hand edit of a translation poly-lexis wrote', () => {
    const metadata = readMetadata(locales);
    setSourceHash(metadata, 'fr', 'common', 'SAVE', 'Save', { translation: 'Enregistrer', provider: 'deepl' });

    expect(isManuallyEdited(metadata, 'fr', 'common', 'SAVE', 'Enregistrer')).toBe(false);
    expect(isManuallyEdited(metadata, 'fr', 'common', 'SAVE', 'Sauvegarder')).toBe(true);
  });

  test('a key with nothing recorded is never treated as hand-edited', () => {
    expect(isManuallyEdited(readMetadata(locales), 'fr', 'common', 'SAVE', 'Sauver')).toBe(false);
  });

  test('records how a translation was produced and writes version 2', () => {
    const metadata = readMetadata(locales);
    setSourceHash(metadata, 'fr', 'common', 'SAVE', 'Save', {
      translation: 'Enregistrer',
      contextHash: 'ctx123',
      provider: 'claude-api',
      model: 'claude-opus-5-5'
    });
    writeMetadata(locales, metadata);

    const written = JSON.parse(fs.readFileSync(getMetadataPath(locales), 'utf-8'));
    expect(written.version).toBe(2);
    expect(getMetadataEntry(readMetadata(locales), 'fr', 'common', 'SAVE')).toEqual({
      sourceHash: hashSourceValue('Save'),
      translationHash: hashSourceValue('Enregistrer'),
      contextHash: 'ctx123',
      provider: 'claude-api',
      model: 'claude-opus-5-5'
    });
  });

  test('records only the source hash when no details are given, and an empty translation still gets a hash', () => {
    const metadata = readMetadata(locales);
    setSourceHash(metadata, 'fr', 'common', 'SAVE', 'Save');
    setSourceHash(metadata, 'fr', 'common', 'EMPTY', '', { translation: '' });

    expect(getMetadataEntry(metadata, 'fr', 'common', 'SAVE')).toEqual({ sourceHash: hashSourceValue('Save') });
    expect(getMetadataEntry(metadata, 'fr', 'common', 'EMPTY')?.translationHash).toBe(hashSourceValue(''));
  });

  test('a version 1 file is upgraded to version 2 entries on the next write', () => {
    fs.writeFileSync(
      getMetadataPath(locales),
      JSON.stringify({ version: 1, languages: { fr: { common: { SAVE: hashSourceValue('Save') } } } })
    );

    writeMetadata(locales, readMetadata(locales));

    expect(JSON.parse(fs.readFileSync(getMetadataPath(locales), 'utf-8'))).toEqual({
      version: 2,
      languages: { fr: { common: { SAVE: { sourceHash: hashSourceValue('Save') } } } }
    });
  });
});
