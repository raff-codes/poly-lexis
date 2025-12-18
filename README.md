# poly-lexis

A powerful CLI and library for managing i18n translations with validation, auto-translation, and TypeScript type generation.

## Overview

poly-lexis provides a complete solution for managing internationalization (i18n) in your applications. It offers smart translation management with automatic validation, DeepL and Google Translate integration for auto-filling missing translations, and TypeScript type generation for type-safe translations.

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

# Auto-fill missing translations with DeepL (recommended)
export DEEPL_API_KEY=your_key
npx poly-lexis --auto-fill

# Or use Google Translate
export GOOGLE_TRANSLATE_API_KEY=your_key
npx poly-lexis --auto-fill

# Validate and generate types
npx poly-lexis
```

## Features

- ✅ **Smart translation management** - Automatic initialization and validation
- ✅ **Interactive CLI** - User-friendly prompts for all operations
- ✅ **Multiple providers** - DeepL (recommended) or Google Translate for auto-translation
- ✅ **Custom providers** - Extensible architecture for custom translation services
- ✅ **Type generation** - Generate TypeScript types for type-safe translations
- ✅ **Validation** - Detect missing or empty translation keys
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

### Add Translation Keys

```bash
# Interactive mode
poly-lexis add

# With flags
poly-lexis add --namespace common --key HELLO --value "Hello"

# With auto-translation
poly-lexis add -n common -k WELCOME -v "Welcome" --auto-fill
```

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
- `-a, --auto-fill` - Auto-fill missing translations with DeepL or Google Translate
- `--api-key <key>` - Translation API key (or set DEEPL_API_KEY/GOOGLE_TRANSLATE_API_KEY env var)
- `-l, --language <lang>` - Process only this language
- `--limit <number>` - Max translations to process (default: 1000)
- `--skip-types` - Skip TypeScript type generation
- `-d, --dry-run` - Preview changes without saving

**Add Mode:**
- `-n, --namespace <name>` - Namespace for the translation
- `-k, --key <key>` - Translation key
- `-v, --value <value>` - Translation value in source language
- `-a, --auto-fill` - Auto-translate to all languages

## Configuration

poly-lexis uses a `.translationsrc.json` file in your project root for configuration:

```json
{
  "translationsPath": "public/static/locales",
  "languages": ["en", "es", "fr", "de"],
  "sourceLanguage": "en",
  "typesOutputPath": "src/types/i18nTypes.ts",
  "provider": "deepl"
}
```

### Configuration Options

- `translationsPath` - Path to the translations directory (default: `public/static/locales`)
- `languages` - Array of language codes to support (default: `["en"]`)
- `sourceLanguage` - Source language for translations (default: `"en"`)
- `typesOutputPath` - Path to output TypeScript types (default: `src/types/i18nTypes.ts`)
- `provider` - Translation provider to use: `"deepl"` or `"google"` (default: `"deepl"`)

### Environment Variables

- `DEEPL_API_KEY` - DeepL API key for auto-translation (when provider is "deepl")
- `GOOGLE_TRANSLATE_API_KEY` - Google Translate API key for auto-translation (when provider is "google")

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
  autoTranslate: true,
  apiKey: process.env.DEEPL_API_KEY, // or GOOGLE_TRANSLATE_API_KEY
});
```

### Validate Translations

```typescript
import { validateTranslations } from 'poly-lexis';

const result = await validateTranslations(
  '/path/to/translations',
  ['en', 'es', 'fr'],
  'en'
);

if (!result.valid) {
  console.log('Missing translations:', result.missing);
}
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
  apiKey: process.env.DEEPL_API_KEY, // or GOOGLE_TRANSLATE_API_KEY
  limit: 1000,
  language: 'fr', // optional: auto-fill only this language
  dryRun: false, // optional: preview without saving
});
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
    │   ├── init.ts
    │   ├── init-interactive.ts
    │   ├── add-key.ts
    │   ├── validate.ts
    │   ├── auto-fill.ts
    │   ├── generate-types.ts
    │   └── manage.ts
    ├── core/                 # Core types and schemas
    │   ├── types.ts
    │   ├── schema.ts
    │   └── translations-config.schema.json
    └── utils/                # Utility functions
        ├── utils.ts
        └── translator.ts
```

## Requirements

- Node.js 18+
- (Optional) DeepL API key or Google Translate API key for auto-translation

## How It Works

1. **Initialization**: Creates `.translationsrc.json` and translation directory structure with provider selection
2. **Validation**: Compares all language files against source language to find missing keys
3. **Auto-translation**: Uses DeepL or Google Translate API (based on config) to fill missing translations
4. **Type Generation**: Creates TypeScript types from translation keys for autocomplete and type safety

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

## License

MIT
