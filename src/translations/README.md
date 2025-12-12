# Translation Management System

A comprehensive TypeScript-based solution for managing i18n translations in your project. This system provides local-first translation management with a single smart command that handles everything.

## Features

- **Smart Command**: One command that initializes, validates, auto-fills, and generates types
- **Local-first**: All translations stored in your codebase
- **TypeScript Support**: Auto-generate types for type-safe translations
- **Variable Preservation**: Automatically preserves `{{variable}}` interpolations during translation
- **Auto-translation**: Optional Google Translate integration for automated translations
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
- `-a, --auto-fill` - Auto-fill missing translations with Google Translate
- `--api-key <key>` - Google Translate API key (or set `GOOGLE_TRANSLATE_API_KEY`)
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
  "typesOutputPath": "src/types/i18nTypes.ts"
}
```

You can customize:
- `translationsPath` - Where translation files are stored
- `languages` - Which languages to support
- `sourceLanguage` - Source language for translations (usually 'en')
- `typesOutputPath` - Where to generate TypeScript types

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
    GOOGLE_TRANSLATE_API_KEY: ${{ secrets.GOOGLE_TRANSLATE_API_KEY }}
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
