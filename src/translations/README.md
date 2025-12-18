# Translation Management System

A comprehensive TypeScript-based solution for managing i18n translations in your project. This system provides local-first translation management with a single smart command that handles everything.

## Features

- **Smart Command**: One command that initializes, validates, auto-fills, and generates types
- **Local-first**: All translations stored in your codebase
- **TypeScript Support**: Auto-generate types for type-safe translations
- **Variable Preservation**: Automatically preserves `{{variable}}` interpolations during translation
- **Multiple Providers**: DeepL (recommended) or Google Translate for automated translations
- **Custom Providers**: Extensible architecture for custom translation services
- **Validation**: Automatic checking for missing or empty translations
- **Flexible Structure**: Namespace-based organization with per-language folders

## Quick Start

### 1. Run the Interactive Menu

The `translations` command shows an interactive menu with all available options:

```bash
# Run without arguments to see the interactive menu
pnpm translations
```

You'll see:
```
🌍 Translation Management

? What would you like to do?
❯ ✨ Add a new translation key
  🔍 Validate translations
  🤖 Auto-fill missing translations
  📝 Generate TypeScript types
  ⚙️  Initialize/reconfigure
  📊 Full check (validate + types)
```

### 2. Or Use Direct Commands

```bash
# Run with flags for automated workflows
pnpm translations --auto-fill

# Auto-fill only French translations
pnpm translations --auto-fill --language fr

# Preview what would be translated (dry-run)
pnpm translations --auto-fill --dry-run
```

### 3. Add Translation Keys

**Interactive Mode (Recommended):**
```bash
# Just run the add command - it will prompt you for everything!
pnpm translations add
```

The interactive mode will:
- 🎯 Let you select from existing namespaces or create a new one
- ✍️  Validate your input as you type
- 🌍 Optionally auto-translate to all languages
- ✅ Auto-convert keys to UPPERCASE_SNAKE_CASE

**Non-Interactive Mode (with flags):**
```bash
# Add a new key (adds empty values to other languages)
pnpm translations add --namespace common --key SAVE --value "Save"

# Add with auto-translation
pnpm translations add -n common -k CANCEL -v "Cancel" --auto-fill
```

That's it! The smart command handles:
- ✅ Initialization (first run)
- ✅ Validation (every run)
- ✅ Auto-filling (with `--auto-fill`)
- ✅ Type generation (automatic)

## How It Works

The `translations` command is smart and context-aware:

### Interactive Menu Mode (No Arguments/Flags)
```bash
$ pnpm translations
```
Shows an interactive menu where you can:
- ✨ Add a new translation key (guided prompts)
- 🔍 Validate translations (check for missing/empty keys)
- 🤖 Auto-fill missing translations (requires API key)
- 📝 Generate TypeScript types only
- ⚙️  Initialize/reconfigure (setup wizard)
- 📊 Full check (validate + types)

### Command Mode (With Flags)
```bash
$ pnpm translations --auto-fill
```
- Validates all translations
- Translates missing/empty keys using Google Translate
- Re-validates after translation
- Generates TypeScript types
- Shows completion summary

### Add Command
```bash
$ pnpm translations add
```
- Interactive prompts for namespace, key, and value
- Option to auto-translate to all languages
- Auto-validates input as you type

## Directory Structure

```
your-project/
├── public/static/locales/        # Default translations path
│   ├── en/                       # English (source language)
│   │   ├── common.json
│   │   ├── members.json
│   │   └── rewards.json
│   ├── fr/                       # French
│   │   ├── common.json
│   │   ├── members.json
│   │   └── rewards.json
│   └── es/                       # Spanish
│       ├── common.json
│       ├── members.json
│       └── rewards.json
├── src/types/
│   └── i18nTypes.ts             # Generated TypeScript types
└── .translationsrc.json         # Configuration file
```

## Translation Files

Each namespace is a separate JSON file with key-value pairs:

**en/common.json**
```json
{
  "LOADING": "Loading",
  "SAVE": "Save",
  "CANCEL": "Cancel",
  "WELCOME_USER": "Welcome, {{userName}}!",
  "ITEMS_COUNT": "You have {{count}} items"
}
```

**fr/common.json**
```json
{
  "LOADING": "Chargement",
  "SAVE": "Enregistrer",
  "CANCEL": "Annuler",
  "WELCOME_USER": "Bienvenue, {{userName}}!",
  "ITEMS_COUNT": "Vous avez {{count}} éléments"
}
```

## Command Reference

### Main Command: `translations`

Smart translation management with an interactive menu or direct command options.

```bash
translations [command] [options]
```

**Interactive Menu Mode (no arguments):**
```bash
# Launch interactive menu
translations
```

**Command Mode (with flags):**
```bash
# Validate and auto-fill missing translations
translations --auto-fill

# Auto-fill specific language
translations --auto-fill --language fr

# Preview without saving
translations --auto-fill --dry-run

# Skip type generation
translations --skip-types
```

**Options:**
- `-a, --auto-fill` - Auto-fill missing translations with DeepL or Google Translate
- `--api-key <key>` - Translation API key (or set `DEEPL_API_KEY` or `GOOGLE_TRANSLATE_API_KEY`)
- `-l, --language <lang>` - Process only this language
- `--limit <number>` - Max translations to process (default: 1000)
- `--skip-types` - Skip TypeScript type generation
- `-d, --dry-run` - Preview changes without saving
- `-h, --help` - Show help

**Add Command:**

*Interactive Mode (no flags):*
```bash
# Launch interactive prompts
translations add
```

This will guide you through:
1. Selecting or creating a namespace
2. Entering the translation key (auto-converts to UPPERCASE_SNAKE_CASE)
3. Entering the English translation
4. Optionally auto-translating to all languages

*Non-Interactive Mode (with flags):*
```bash
# Add a new translation key
translations add --namespace common --key HELLO --value "Hello"

# Add with auto-translation
translations add -n common -k WELCOME -v "Welcome" --auto-fill
```

**Options:**
- `-n, --namespace <name>` - Namespace for the translation
- `-k, --key <key>` - Translation key
- `-v, --value <value>` - Translation value in source language
- `-a, --auto-fill` - Auto-translate to all languages
- `--api-key <key>` - Google Translate API key
- (no options) - Interactive mode

## Configuration

The `.translationsrc.json` file is automatically created on first run:

```json
{
  "translationsPath": "public/static/locales",
  "languages": ["en", "fr", "es", "de", "pt", "pl", "it", "nl", "sv", "hu", "cs", "ja", "zh_hk", "de_at"],
  "sourceLanguage": "en",
  "typesOutputPath": "src/types/i18nTypes.ts",
  "provider": "deepl"
}
```

You can customize:
- `translationsPath` - Where translation files are stored
- `languages` - Which languages to support
- `sourceLanguage` - Source language for translations (usually 'en')
- `typesOutputPath` - Where to generate TypeScript types
- `provider` - Translation provider: `"deepl"` or `"google"` (default: `"deepl"`)

## Variable Interpolation

The system automatically preserves variables in the format `{{variableName}}` during translation:

```typescript
// English source
"WELCOME_USER": "Welcome, {{userName}}!"

// Auto-translated to French (variables preserved)
"WELCOME_USER": "Bienvenue, {{userName}}!"

// Auto-translated to Spanish (variables preserved)
"WELCOME_USER": "¡Bienvenido, {{userName}}!"
```

## Translation Providers

### Built-in Providers

**DeepL (Recommended)**
- Higher translation quality
- Supports 30+ languages
- Get API key from https://www.deepl.com/pro-api
- Set `"provider": "deepl"` in config and `DEEPL_API_KEY` environment variable

**Google Translate**
- Supports 100+ languages
- Requires Google Cloud Translation API key
- Set `"provider": "google"` in config and `GOOGLE_TRANSLATE_API_KEY` environment variable

### Custom Translation Providers

You can easily plug in your own custom translation provider by implementing the `TranslationProvider` interface.

### Creating a Custom Provider

Implement the `TranslationProvider` interface:

```typescript
import type { TranslationProvider, TranslateOptions } from 'lexis';

export class MyCustomProvider implements TranslationProvider {
  async translate(options: TranslateOptions): Promise<string> {
    const { text, sourceLang, targetLang, apiKey } = options;

    // IMPORTANT: Preserve {{variable}} interpolations
    const preserved = this.preserveVariables(text);

    // Call your translation API (example)
    const response = await fetch('https://your-translation-api.com/translate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        text: preserved.text,
        from: sourceLang,
        to: targetLang,
        apiKey: apiKey,
      }),
    });

    const data = await response.json();
    const translated = data.translatedText;

    // Restore variables
    return this.restoreVariables(translated, preserved.variableMap);
  }

  async translateBatch(
    texts: string[],
    sourceLang: string,
    targetLang: string,
    apiKey?: string,
    delayMs?: number,
  ): Promise<string[]> {
    const results: string[] = [];

    for (const text of texts) {
      const translated = await this.translate({
        text,
        sourceLang,
        targetLang,
        apiKey,
      });
      results.push(translated);

      // Add delay to avoid rate limiting
      if (delayMs && delayMs > 0) {
        await new Promise((resolve) => setTimeout(resolve, delayMs));
      }
    }

    return results;
  }

  // Helper: Preserve {{variable}} interpolations
  private preserveVariables(text: string) {
    const variableMap = new Map<string, string>();
    let index = 0;

    const processedText = text.replace(/\{\{([^}]+)\}\}/g, (match) => {
      const placeholder = `__VAR_${index}__`;
      variableMap.set(placeholder, match);
      index++;
      return placeholder;
    });

    return { text: processedText, variableMap };
  }

  // Helper: Restore {{variable}} interpolations
  private restoreVariables(text: string, variableMap: Map<string, string>): string {
    let result = text;
    for (const [placeholder, original] of variableMap) {
      result = result.replace(new RegExp(placeholder, 'g'), original);
    }
    return result;
  }
}
```

### Using Your Custom Provider

```typescript
import { setTranslationProvider } from 'lexis';
import { MyCustomProvider } from './my-custom-provider';

// Set your custom provider
setTranslationProvider(new MyCustomProvider());

// Now all translation operations will use your provider
// This affects: auto-fill, add-key --auto-fill, etc.
```

### Important Notes

1. **Variable Preservation is Required**: Your provider MUST preserve `{{variable}}` interpolations
2. **Language Codes**: Handle language codes like `pt_BR`, `zh_CN` according to your API's format
3. **Rate Limiting**: Implement delays in `translateBatch` to avoid hitting API rate limits
4. **Error Handling**: Add appropriate error handling for API failures

## Workflow Examples

### Daily Development

```bash
# Add new translations as you develop
pnpm translations add -n members -k MEMBER_DETAILS -v "Member Details"
pnpm translations add -n members -k VIEW_PROFILE -v "View Profile"

# At the end of the day, validate and check status
pnpm translations
```

### Before Deployment

```bash
# Ensure all translations are complete
pnpm translations --auto-fill

# Review the auto-translated content
git diff

# Commit
git commit -m "Complete translations for deployment"
```

### Working on a Specific Language

```bash
# Fill only Spanish translations
pnpm translations --auto-fill --language es --limit 50

# Review and adjust
# Edit files in public/static/locales/es/

# Validate
pnpm translations
```

### CI/CD Integration

Add to your CI pipeline:

```yaml
- name: Validate Translations
  run: pnpm translations
  env:
    DEEPL_API_KEY: ${{ secrets.DEEPL_API_KEY }}
    # Or use GOOGLE_TRANSLATE_API_KEY if provider is "google"
```

This will fail the build if translations are incomplete.

## Best Practices

### 1. Use Meaningful Namespaces

Organize translations by feature or page:

```
common.json       - Shared translations (buttons, labels, etc.)
members.json      - Member-related translations
rewards.json      - Rewards-related translations
errors.json       - Error messages
```

### 2. Use UPPERCASE_SNAKE_CASE for Keys

```json
{
  "SAVE_CHANGES": "Save Changes",
  "CANCEL_ACTION": "Cancel",
  "USER_PROFILE": "User Profile"
}
```

### 3. Always Define Variables in English First

```json
{
  "WELCOME_MESSAGE": "Welcome, {{userName}}! You have {{count}} new messages."
}
```

### 4. Run Translations Command Regularly

```bash
# After adding new keys
pnpm translations

# Before committing
pnpm translations
```

### 5. Review Auto-Translations

Auto-translations are not perfect. Always review machine-translated content, especially for:
- Marketing copy
- Legal text
- Context-dependent phrases
- Brand-specific terminology

### 6. Use Dry-Run for Safety

Preview changes before applying:

```bash
pnpm translations --auto-fill --dry-run
```

## Migration from Lokalise

If you're migrating from Lokalise:

1. **Fetch final translations from Lokalise**:
   ```bash
   pnpm fetch-translations
   ```

2. **Run the smart command** (it will detect existing files):
   ```bash
   pnpm translations
   ```

3. **Verify everything**:
   ```bash
   pnpm translations --auto-fill --dry-run
   ```

4. **Update your CI/CD** to use the new command instead of Lokalise

## Summary

The new translation system provides a single, smart command that:

- ✅ Initializes automatically on first use
- ✅ Validates translations every time
- ✅ Auto-fills missing translations on demand
- ✅ Generates TypeScript types automatically
- ✅ Provides clear feedback and next steps
- ✅ Preserves interpolation variables
- ✅ Works offline (except for auto-fill)

**One command to rule them all:**

```bash
pnpm translations --auto-fill
```

## License

Private package for internal use.
