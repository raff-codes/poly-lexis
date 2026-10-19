# poly-lexis

A CLI and library for managing i18n translations: validation, context-aware auto-translation, review of existing translations, and TypeScript type generation.

## Overview

poly-lexis manages internationalization (i18n) for your applications. It validates your translation files, fills
missing translations with DeepL, Google Translate or Claude, and generates TypeScript types for type-safe keys.

Short UI strings are ambiguous on their own: "Open" can be a verb or a status, "Book" an action or a noun. poly-lexis
sends each string with context (what the app is, which screen it's on, what kind of text it is, the strings around
it) so it comes out right, and it can review the translations you already have against that context.

## Installation

```bash
npm install poly-lexis
# or
yarn add poly-lexis
# or
pnpm add poly-lexis
```

## Quick Start

```bash
# Initialize translations in your project (interactive setup)
npx poly-lexis

# Add a new translation key
npx poly-lexis add

# Auto-fill missing translations with the provider in .translationsrc.json
export DEEPL_API_KEY=your_key            # "provider": "deepl"
# export GOOGLE_TRANSLATE_API_KEY=...    # "provider": "google"
# export ANTHROPIC_API_KEY=...           # "provider": "claude" (or sign into Claude Code, no key needed)
npx poly-lexis --auto-fill

# Check existing translations against their context (Claude providers)
npx poly-lexis review

# Validate and generate types
npx poly-lexis
```

For better translations, describe your app and screens: see [Getting Better Translations](#getting-better-translations).

## Features

- ✅ **Smart translation management** - Automatic initialization and validation
- ✅ **Interactive CLI** - User-friendly prompts for all operations
- ✅ **Multiple providers** - DeepL, Google Translate or Claude (through Claude Code or the Claude API), with a fallback
- ✅ **Translation context** - Each string is sent with what the app and screen are, its UI role and nearby strings
- ✅ **Glossary** - Shared terms with required translations, and brand names that are never translated
- ✅ **Review** - Check existing translations against their context and apply the corrections you keep
- ✅ **Safe writes** - Translations that lose a placeholder or change a brand name are never written; hand edits are kept
- ✅ **Custom providers** - Extensible architecture for custom translation services
- ✅ **Type generation** - Generate TypeScript types for type-safe translations
- ✅ **Validation** - Detect missing, empty, orphaned and stale translation keys
- ✅ **Multiple namespaces** - Organize translations by feature/domain
- ✅ **Programmatic API** - Use as a library in your Node.js code

## CLI Usage

### Smart Mode (Default)

Run without any command to validate, auto-fill (optional), and generate types:

```bash
# Basic validation and type generation
poly-lexis

# With auto-translation
poly-lexis --auto-fill

# Auto-fill only specific language
poly-lexis --auto-fill --language fr

# Dry run to preview changes
poly-lexis --auto-fill --dry-run

# Skip type generation
poly-lexis --skip-types
```

### Getting Better Translations

Context is optional, and every step below improves the result on its own. A suggested order:

1. **Describe the app** in `.translationsrc.json`. One sentence is enough:
   ```json
   "context": "Lush Spa is the internal tool spa staff use to manage treatments and bookings."
   ```
2. **Describe each screen.** Add a `$context` block to the top of each source-language file
   (see [Translation Context](#translation-context)), or pass `--description` to `poly-lexis add`.
   Once `context` is set, validation lists the namespaces that still need a description.
3. **Add notes for ambiguous keys**, such as a word that's both a verb and a noun:
   ```bash
   poly-lexis add -n treatments -k BOOK -v "Book" --note "Button that confirms the booking"
   ```
4. **Add a glossary** for brand names and terms that must be translated one way
   (see [Glossary](#glossary)).
5. **Use Claude** (`"provider": "claude"`) to get the most out of the context. DeepL also gets it, as plain text.
6. **Review what you already have:** `poly-lexis review`, then `poly-lexis review --apply`
   (see [Reviewing Existing Translations](#reviewing-existing-translations)).

To make descriptions mandatory in CI, set `"contextRequired": true`. Validation then fails for a namespace without one.

### Re-translating Changed Source Strings

When you edit a source string (e.g. in `en/`) after it has already been translated, the
existing translations in other languages become stale. poly-lexis detects this by recording
a hash of the source value each translation was generated from (in a `.translations-meta.json`
sidecar file inside your translations directory — commit it alongside your translation files).

```bash
# Validation warns about translations whose source string has changed
poly-lexis

# Re-translate only the keys whose source value changed
poly-lexis --auto-fill --retranslate-changed

# Re-translate everything from scratch (ignores existing values)
poly-lexis --auto-fill --force
```

Notes:

- Plain `--auto-fill` only fills missing/empty keys; it never overwrites an existing
  translation. Use `--retranslate-changed` to refresh stale ones.
- **Existing codebases are handled automatically.** Any normal run (e.g. `poly-lexis`, the
  "Full check" menu option, or validation) records a baseline hash for every key that is
  already translated but not yet tracked, then creates/updates `.translations-meta.json`.
  From that point on, source changes to those keys are detected. The baseline treats whatever
  is in your repo at that moment as up to date, so a translation that is *already* stale when
  you first adopt the feature is accepted as current. A dry run (`--dry-run`) never writes the
  baseline.
- Stale translations are reported as a warning and do **not** fail validation on their own.

### Add Translation Keys

```bash
# Interactive mode
poly-lexis add

# With flags
poly-lexis add --namespace common --key HELLO --value "Hello"

# With auto-translation
poly-lexis add -n common -k WELCOME -v "Welcome" --auto-fill

# With a note for translators, and a description of a new namespace
poly-lexis add -n checkout -k BOOK -v "Book" --note "Button that confirms the booking" \
  --description "Checkout for spa bookings" --auto-fill
```

Interactive mode asks for the note, and for a description when the namespace doesn't have one yet. Notes and
descriptions are saved in the namespace's `$context`.

Changing the value of an existing key re-translates the languages whose translation came from the old value.
Translations edited by hand are kept.

### Verify Translations (CI/CD)

For CI/CD pipelines, you can validate translations and fail the build if any are missing:

```bash
# In your project that uses poly-lexis
npx poly-lexis --skip-types  # Validates translations, exits with code 1 if invalid

# Or create a script in your package.json:
{
  "scripts": {
    "verify-translations": "poly-lexis --skip-types"
  }
}

# Then run in your CI/CD pipeline:
npm run verify-translations
```

The command will:
- ✅ Exit with code 0 if all translations are valid
- ❌ Exit with code 1 if any translations are missing or empty

This makes it perfect for CI/CD checks to prevent incomplete translations from being deployed.

**Example CI/CD workflow (GitHub Actions):**

```yaml
name: Verify Translations
on: [push, pull_request]
jobs:
  verify:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - uses: actions/setup-node@v3
      - run: npm install
      - run: npx poly-lexis --skip-types
```

### CLI Options

**Smart Mode:**
- `-a, --auto-fill` - Auto-fill missing translations with the configured provider
- `--api-key <key>` - API key for the configured provider (or set `DEEPL_API_KEY`, `GOOGLE_TRANSLATE_API_KEY` or `ANTHROPIC_API_KEY`)
- `-l, --language <lang>` - Process only this language
- `--limit <number>` - Max translations to process (default: unlimited)
- `--retranslate-changed` - Re-translate keys whose source value changed since last run (implies `--auto-fill`)
- `--force` - Re-translate every key, even ones already translated (implies `--auto-fill`)
- `--include-manual-edits` - Also replace translations someone edited by hand (skipped by default)
- `--skip-types` - Skip TypeScript type generation
- `-d, --dry-run` - Preview changes without saving

**Add Mode:**
- `-n, --namespace <name>` - Namespace for the translation
- `-k, --key <key>` - Translation key
- `-v, --value <value>` - Translation value in source language
- `--note <text>` - Note for translators about this key (saved in the namespace's `$context`)
- `--description <text>` - Description of the namespace (saved in its `$context`)
- `-a, --auto-fill` - Auto-translate to all languages

**Review Mode** (`poly-lexis review`, Claude providers only):
- `-l, --language <lang>` - Review only this language
- `-n, --namespace <name>` - Review only this namespace
- `--output <file>` - Report file (default: `translations-review.json`)
- `--apply` - Apply the corrections left in the report file
- `--include-manual-edits` - Also review translations someone edited by hand

### Reviewing Existing Translations

Translations made without context are often wrong for short strings: a status "Open" becomes the verb,
"Book" becomes a book. `review` sends your existing translations to Claude with their context and writes
the suggested corrections to a report. Nothing changes until you apply it:

```bash
poly-lexis review --language fr      # writes translations-review.json
# read the report, delete entries you disagree with
poly-lexis review --apply            # writes the corrections you kept
```

An entry is skipped on apply when its translation changed after the review ran, so a later edit is never
overwritten, or when its source string changed, so a correction for old text isn't written. A report broken
by a hand edit is rejected with the index of the bad entry.

The report is written to the project root. Add `translations-review.json` to `.gitignore` unless you want to
keep reviews in version control.

### Hand Edits Are Kept

poly-lexis records a hash of every translation it writes. When someone later edits that translation by hand,
`--force`, `--retranslate-changed` and `review` leave it alone. Pass `--include-manual-edits` to include them.

## Configuration

poly-lexis uses a `.translationsrc.json` file in your project root for configuration:

```json
{
  "$schema": "./node_modules/poly-lexis/dist/translations/core/translations-config.schema.json",
  "translationsPath": "public/static/locales",
  "languages": ["en", "es", "fr", "de"],
  "sourceLanguage": "en",
  "typesOutputPath": "src/types/i18nTypes.ts",
  "provider": "deepl",
  "protectedTerms": ["MyBrand", "ProductName"]
}
```

A fuller example using context and Claude:

```json
{
  "translationsPath": "public/static/locales",
  "languages": ["en", "fr", "de", "ja"],
  "sourceLanguage": "en",
  "provider": "claude",
  "fallbackProvider": "deepl",
  "context": "Lush Spa is the internal tool spa staff use to manage treatments and bookings.",
  "glossary": "../../translations.glossary.json",
  "languageSettings": {
    "fr": { "formality": "formal" },
    "ja": { "formality": "formal", "instructions": ["Use です/ます form for buttons and labels"] }
  },
  "keyRoles": [{ "pattern": "_CHIP$", "role": "short filter chip label" }],
  "claude": { "maxKeysPerRequest": 40, "codeContext": true }
}
```

The config is checked when it's loaded. A wrong type, an unknown provider, or invalid JSON stops the command with
the field and what it should be.

### Configuration Options

- `translationsPath` - Path to the translations directory (default: `public/static/locales`)
- `languages` - Array of language codes to support (default: `["en"]`)
- `sourceLanguage` - Source language for translations (default: `"en"`)
- `typesOutputPath` - Path to output TypeScript types (default: `src/types/i18nTypes.ts`)
- `provider` - Translation provider: `"deepl"`, `"google"`, `"claude"`, `"claude-api"` or `"claude-code"` (default: `"deepl"`)
- `fallbackProvider` - `"deepl"` or `"google"`, used when the main provider is unavailable or returns an unusable translation (default: none)
- `protectedTerms` - Words or phrases that should never be translated (default: `[]`)
- `context` - What the app is and who uses it, sent with every key
- `contextRequired` - Fail validation when a namespace has no `$context.description` (default: `false`, warn only)
- `glossary` - Path to a shared glossary file, relative to the project root
- `languageSettings` - Per-language `formality` (`"formal"`, `"informal"`) and `instructions` (Claude only)
- `keyRoles` - Extra `{ pattern, role }` rules for inferring what a key is from its name
- `claude` - Settings for the Claude providers:
  - `model` - claude-api defaults to `claude-opus-5-5`; claude-code uses your Claude Code model
  - `maxKeysPerRequest` - keys per request (default `40`)
  - `codeContext` - send code snippets showing where each key is used (default `true`); see [What is sent to Claude](#what-is-sent-to-claude)
  - `serverFallbacks` - claude-api only: let the API retry a declined request on another model. On by default for
    the models known to support it; set `true` for a newer model, `false` to never fall back

`keyRoles` patterns are checked before anything is translated; an invalid one stops the run and names the rule.
A `fallbackProvider` whose API key isn't set is skipped with a warning.

### Protected Terms

Use `protectedTerms` to prevent specific words or phrases from being translated — useful for brand names, product names, or any term that must remain unchanged across all languages.

```json
{
  "protectedTerms": ["Vandelay Industries", "MyProduct"]
}
```

These terms are replaced with placeholders before the text is sent to the translation API and restored afterwards, so the translation service never sees them.

Protected terms are merged into the glossary as do-not-translate terms. New projects can list them in the
glossary instead.

### Translation Context

Short UI strings are ambiguous on their own. poly-lexis sends each key with context so it is translated for
the screen it appears on. Most of it is worked out for you:

| Context | Where it comes from |
|---|---|
| App description | `context` in `.translationsrc.json` |
| Namespace description | `$context.description` in the source-language file |
| Note for one key | `$context.keys.<KEY>` in the source-language file |
| UI role | Inferred from the key name: `COL_*` is a column header, `STATUS_*` a status label, `*_PLACEHOLDER` placeholder text… (extend with `keyRoles`) |
| Surrounding strings | The keys next to it in the file |
| Code usage | The lines of code that use the key, including `t('ns:KEY')` and `t('ns.KEY')` (Claude providers only; turn off with `claude.codeContext`) |
| Glossary | Terms from the `glossary` file that appear in the string |

Context written by people lives in a reserved `$context` entry at the top of the **source-language** file:

```json
{
  "$context": {
    "description": "Booking a spa treatment for a customer: choosing treatment, time and therapist, then checking out",
    "keys": {
      "BOOK_CHECKOUT_SUBMIT": "Button that confirms the booking"
    }
  },
  "BOOK_CHECKOUT_SUBMIT": "Book"
}
```

i18next only looks up the keys it is asked for, so `$context` needs no change in your app. poly-lexis never
translates it, never copies it into other languages and leaves it out of the generated types. Validation warns
about notes for keys that no longer exist and malformed `$context` entries. Once the project uses context (`context`
or `contextRequired` is set), it also warns about namespaces without a description. Interactive `add` asks for a
description when the namespace doesn't have one yet.

Write descriptions as plain statements of what the screen is ("Admin table to review stocktakes"), not as
instructions ("Translate formally"). DeepL uses context as surrounding text and does not follow instructions.

### Glossary

A glossary keeps terms consistent across apps. Point every app at the same file:

```json
{
  "terms": [
    { "term": "Lush", "doNotTranslate": true },
    { "term": "store", "note": "A Lush shop, not an app store", "translations": { "fr": "boutique", "ja": "店舗" } }
  ]
}
```

Only the terms that appear in a batch are sent with it. A translation that changes a `doNotTranslate` term is
rejected; one that doesn't use a term's required translation is written with a warning.

### Checks on Every Translation

Before anything is written, each translation is checked: it must not be empty, must keep every `{{placeholder}}`
and `{placeholder}`, and must keep do-not-translate terms. Keys that fail are retried once, then sent to
`fallbackProvider`; any still failing are reported and left untouched.

### Environment Variables

- `DEEPL_API_KEY` - DeepL API key for auto-translation (when provider is "deepl")
- `GOOGLE_TRANSLATE_API_KEY` - Google Translate API key for auto-translation (when provider is "google")
- `ANTHROPIC_API_KEY` - Claude API key (when provider is "claude-api", or "claude" without Claude Code)

### Translation Providers

**DeepL (Recommended)**
- Higher translation quality
- Supports 30+ languages
- Requires DeepL API key from https://www.deepl.com/pro-api
- Set `"provider": "deepl"` in config and `DEEPL_API_KEY` environment variable

**Google Translate**
- Supports 100+ languages
- Requires Google Cloud Translation API key
- Set `"provider": "google"` in config and `GOOGLE_TRANSLATE_API_KEY` environment variable

**Claude**
- Uses all of the context above, including the code that uses each key, and supports `review`
- Translates a namespace in batches of up to `claude.maxKeysPerRequest` keys
- `"provider": "claude"` picks a route at run time:
  1. `claude-code`: your locally installed Claude Code, when you are signed in (`claude auth status`). No API key needed.
     Runs `claude -p` with no tools, no project settings and no saved session.
  2. `claude-api`: the Claude API, when `ANTHROPIC_API_KEY` is set. Use this in CI.
  3. `fallbackProvider`, when neither is available.
- Set `"provider": "claude-code"` or `"claude-api"` to require one route
- Claude Code sign-in is for your own local use; use `claude-api` with an API key in CI and shared pipelines

#### What is sent to Claude

Each request carries the source strings and their context: the app and namespace descriptions, key notes,
neighbouring strings, glossary terms and, by default, **up to three snippets of your source code per key**
(a few lines around each place the key is used). Both routes send this to Anthropic. If source code must not
leave your machine, set `"claude": { "codeContext": false }`; everything else is still sent.

DeepL and Google never receive code. A rejected API key or exhausted quota (DeepL 401/403/456, Google 401/403
or "API key not valid") stops that provider for the rest of the run instead of failing every key. The remaining
keys go to `fallbackProvider` if it is set.

**Custom Providers**
You can implement custom translation providers by implementing the `TranslationProvider` interface:

```typescript
import { setTranslationProvider, type TranslationProvider } from 'poly-lexis';

class MyCustomProvider implements TranslationProvider {
  async translate(options: TranslateOptions): Promise<string> {
    // Your translation logic here
  }

  async translateBatch(texts: string[], sourceLang: string, targetLang: string, apiKey?: string): Promise<string[]> {
    // Your batch translation logic here
  }
}

// Set your custom provider before running auto-fill
setTranslationProvider(new MyCustomProvider());
```

A provider that translates one string per call receives the context as prose in `options.context`. To use the
full context, implement `ContextualTranslationProvider` instead: `translateItems(request)` receives a batch of
keys from one namespace, each with its role, note, neighbours and code usages.

### Directory Structure

After initialization, your project will have this structure:

```
your-app/
├── .translationsrc.json         # Configuration file
├── public/
│   └── static/
│       └── locales/
│           ├── en/
│           │   ├── common.json
│           │   └── errors.json
│           ├── es/
│           │   ├── common.json
│           │   └── errors.json
│           └── fr/
│               ├── common.json
│               └── errors.json
└── src/
    └── types/
        └── i18nTypes.ts        # Generated TypeScript types
```

### Translation File Format

Translation files are organized by namespace and language:

```json
{
  "HELLO": "Hello",
  "WELCOME": "Welcome to our app",
  "GOODBYE": "Goodbye"
}
```

## Programmatic API

poly-lexis can be used as a library in your Node.js code:

### Initialize Translations

```typescript
import { initTranslationsInteractive } from 'poly-lexis';

await initTranslationsInteractive(process.cwd());
```

### Add Translation Key

```typescript
import { addTranslationKey } from 'poly-lexis';

await addTranslationKey(process.cwd(), {
  namespace: 'common',
  key: 'HELLO',
  value: 'Hello',
  note: 'Greeting at the top of the dashboard', // optional, saved in $context
  autoTranslate: true,
  apiKey: process.env.DEEPL_API_KEY, // the configured provider's key; not needed for claude-code
});
```

### Validate Translations

```typescript
import { validateTranslations } from 'poly-lexis';

// Reads .translationsrc.json from the project root
const result = validateTranslations(process.cwd());

if (!result.valid) {
  console.log('Missing translations:', result.missing);
}
console.log('Stale translations:', result.stale);
console.log('Context issues:', result.contextIssues);
```

### Generate TypeScript Types

```typescript
import { generateTranslationTypes } from 'poly-lexis';

generateTranslationTypes(process.cwd());
```

### Auto-fill Missing Translations

```typescript
import { autoFillTranslations } from 'poly-lexis';

// The provider is automatically selected based on .translationsrc.json
await autoFillTranslations(process.cwd(), {
  apiKey: process.env.DEEPL_API_KEY, // the configured provider's key; not needed for claude-code
  limit: 1000, // optional, default unlimited
  language: 'fr', // optional: auto-fill only this language
  dryRun: false, // optional: preview without saving
  retranslateChanged: false, // optional: also refresh keys whose source changed
  includeManualEdits: false, // optional: also replace translations edited by hand
});
```

### Review Existing Translations

```typescript
import { applyReviewReport, reviewTranslations } from 'poly-lexis';

// Needs a Claude provider. Writes translations-review.json and changes nothing else.
const report = await reviewTranslations(process.cwd(), { language: 'fr' });
console.log(report.entries); // { key, current, proposed, reason, ... }

// Later, after deleting the entries you disagree with:
const { applied, skipped } = applyReviewReport(process.cwd());
// skipped entries have a skipReason: 'translation-changed' or 'source-changed'
```

### Using Custom Translation Providers

```typescript
import { setTranslationProvider, autoFillTranslations } from 'poly-lexis';
import { MyCustomProvider } from './my-provider';

// Set your custom provider before auto-filling
setTranslationProvider(new MyCustomProvider());

// Now auto-fill will use your custom provider
await autoFillTranslations(process.cwd(), {
  apiKey: 'your-custom-api-key',
  limit: 1000,
});
```

A provider with `translate()` gets one string per call, with its context as plain text in `options.context`.
To translate whole batches with structured context, as Claude does, implement `ContextualTranslationProvider`:

```typescript
import {
  setTranslationProvider,
  type ContextualTranslationProvider,
  type TranslationRequest,
  type TranslationResponseItem,
} from 'poly-lexis';

const myProvider: ContextualTranslationProvider = {
  name: 'my-llm', // recorded in .translations-meta.json
  supports: { instructions: true, codeContext: true, review: false, maxItems: 50 },
  async translateItems(request: TranslationRequest): Promise<TranslationResponseItem[]> {
    // request.app, request.namespace, request.language, request.glossary, request.items[]
    // Return { key, translation } for each item, or { key, translation: '', error } for one you couldn't translate
    return request.items.map((item) => ({ key: item.key, translation: item.source }));
  },
};

setTranslationProvider(myProvider);
```

Every result is checked before it's written: placeholders and do-not-translate terms must survive.

## Development

The package uses TypeScript and tsup for building:

```bash
# Install dependencies
npm install

# Build the package
npm run build

# Watch mode for type checking
npm run dev

# Lint and format
npm run lint
npm run format
```

### Project Structure

```
src/
├── index.ts                  # Main library export
├── cli/
│   └── translations.ts       # CLI entry point
└── translations/
    ├── cli/                  # CLI command implementations
    │   ├── init.ts                   # config loading and validation
    │   ├── init-interactive.ts
    │   ├── add-key.ts
    │   ├── validate.ts
    │   ├── auto-fill.ts
    │   ├── review.ts                 # review and review --apply
    │   ├── generate-types.ts
    │   ├── find-unused.ts
    │   ├── find-duplicates.ts
    │   └── manage.ts                 # smart mode
    ├── core/                 # Core types and schemas
    │   ├── types.ts
    │   ├── schema.ts
    │   └── translations-config.schema.json
    └── utils/
        ├── translation-runner.ts     # batch, check, retry, fall back, write
        ├── provider-factory.ts       # picks the provider from the config
        ├── claude-provider.ts        # claude-api and claude-code
        ├── contextual-provider.ts    # wraps DeepL/Google for batches with context
        ├── deepl-translate-provider.ts
        ├── google-translate-provider.ts
        ├── key-context.ts            # UI roles, neighbours, placeholders
        ├── source-context.ts         # $context blocks
        ├── usage-index.ts            # where keys are used in code
        ├── glossary.ts
        ├── translation-checks.ts
        ├── metadata.ts               # .translations-meta.json
        └── utils.ts
```

## Requirements

- Node.js 18+
- For auto-translation, one of: a DeepL API key, a Google Translate API key, a Claude API key, or
  [Claude Code](https://claude.com/claude-code) installed and signed in

## How It Works

1. **Initialization**: Creates `.translationsrc.json` and translation directory structure with provider selection
2. **Validation**: Compares all language files against the source language to find missing, empty, orphaned and
   stale keys, and checks the `$context` blocks
3. **Auto-translation**: Sends the keys that need translating, with their context, to the configured provider in
   batches per namespace. Each result is checked, failures are retried and then sent to the fallback provider, and
   each namespace file is written once. `.translations-meta.json` records how each translation was made, so later
   runs spot changed source strings and hand edits
4. **Review** (optional): Claude checks existing translations against their context and suggests corrections
5. **Type Generation**: Creates TypeScript types from translation keys for autocomplete and type safety

## API Keys

### DeepL API Key (Recommended)
1. Sign up at https://www.deepl.com/pro-api
2. Get your API key from the account dashboard
3. Set `DEEPL_API_KEY` environment variable or pass via `--api-key` flag

### Google Translate API Key
1. Create a project in Google Cloud Console
2. Enable the Cloud Translation API
3. Create credentials (API key)
4. Set `GOOGLE_TRANSLATE_API_KEY` environment variable or pass via `--api-key` flag

### Claude
- **On your machine:** install [Claude Code](https://claude.com/claude-code) and run `claude` to sign in. With
  `"provider": "claude"` or `"claude-code"` no key is needed; translations use your own sign-in.
- **In CI:** create an API key in the [Claude Console](https://console.anthropic.com/), then set
  `ANTHROPIC_API_KEY` or pass `--api-key`, with `"provider": "claude"` or `"claude-api"`.

## License

MIT
