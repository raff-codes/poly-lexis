# poly-lexis

A powerful CLI and library for managing i18n translations with validation, auto-translation, and TypeScript type generation.

## Overview

poly-lexis provides a complete solution for managing internationalization (i18n) in your applications. It offers smart translation management with automatic validation, Google Translate integration for auto-filling missing translations, and TypeScript type generation for type-safe translations.

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
# Initialize translations in your project
npx poly-lexis

# Add a new translation key
npx poly-lexis add

# Auto-fill missing translations
export GOOGLE_TRANSLATE_API_KEY=your_key
npx poly-lexis --auto-fill

# Validate and generate types
npx poly-lexis
```

## Features

- ✅ **Smart translation management** - Automatic initialization and validation
- ✅ **Interactive CLI** - User-friendly prompts for all operations
- ✅ **Auto-translation** - Google Translate integration for missing translations
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

### CLI Options

**Smart Mode:**
- `-a, --auto-fill` - Auto-fill missing translations with Google Translate
- `--api-key <key>` - Google Translate API key (or set GOOGLE_TRANSLATE_API_KEY env var)
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
  "typesOutputPath": "src/types/i18nTypes.ts"
}
```

### Configuration Options

- `translationsPath` - Path to the translations directory (default: `public/static/locales`)
- `languages` - Array of language codes to support (default: `["en"]`)
- `sourceLanguage` - Source language for translations (default: `"en"`)
- `typesOutputPath` - Path to output TypeScript types (default: `src/types/i18nTypes.ts`)

### Environment Variables

- `GOOGLE_TRANSLATE_API_KEY` - Google Translate API key for auto-translation

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
  apiKey: process.env.GOOGLE_TRANSLATE_API_KEY,
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

await autoFillTranslations({
  translationsPath: '/path/to/translations',
  languages: ['es', 'fr'],
  sourceLanguage: 'en',
  apiKey: process.env.GOOGLE_TRANSLATE_API_KEY,
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
- (Optional) Google Translate API key for auto-translation

## How It Works

1. **Initialization**: Creates `.translationsrc.json` and translation directory structure
2. **Validation**: Compares all language files against source language to find missing keys
3. **Auto-translation**: Uses Google Translate API to fill missing translations
4. **Type Generation**: Creates TypeScript types from translation keys for autocomplete and type safety

## License

MIT
