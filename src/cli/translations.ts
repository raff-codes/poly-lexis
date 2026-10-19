import 'dotenv/config';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { parseArgs } from 'node:util';
import { confirm, input, select } from '@inquirer/prompts';
import { addTranslationKey } from '../translations/cli/add-key.js';
import { loadConfig } from '../translations/cli/init.js';
import { initTranslationsInteractive } from '../translations/cli/init-interactive.js';
import { manageTranslations } from '../translations/cli/manage.js';
import type { TranslationProviderType } from '../translations/core/schema.js';
import { getApiKeyEnvVar } from '../translations/utils/provider-factory.js';
import { readNamespaceContexts } from '../translations/utils/source-context.js';
import { getNamespaces } from '../translations/utils/utils.js';

/**
 * API key from --api-key or the configured provider's environment variable.
 * `missingEnvVar` names the variable to set when the provider needs a key and none was found.
 */
function resolveApiKey(
  provider: TranslationProviderType,
  flagValue?: string
): { apiKey?: string; missingEnvVar?: string } {
  const envVar = getApiKeyEnvVar(provider);
  const apiKey = flagValue || (envVar ? process.env[envVar] : undefined);
  return { apiKey, missingEnvVar: envVar && !apiKey ? envVar : undefined };
}

/** Optional context prompts for the interactive add flow */
async function promptForContext(askForDescription: boolean): Promise<{ description?: string; note?: string }> {
  const description = askForDescription
    ? await input({
        message: 'Describe this namespace for translators (which screen or feature):'
      })
    : '';
  const note = await input({
    message: 'Note for translators about this key (optional, e.g. "Button that confirms the booking"):'
  });
  return {
    ...(description.trim() && { description: description.trim() }),
    ...(note.trim() && { note: note.trim() })
  };
}

/** Namespace names are file names: lowercase letters, numbers and hyphens */
function validateNamespaceName(value: string): string | true {
  if (!value.trim()) return 'Namespace is required';
  if (!/^[a-z0-9-]+$/.test(value)) {
    return 'Namespace must contain only lowercase letters, numbers, and hyphens';
  }
  return true;
}

/** Ask for an existing namespace or a new one's name; `isNew` drives the description prompt */
async function promptForNamespace(existingNamespaces: string[]): Promise<{ namespace: string; isNew: boolean }> {
  if (!existingNamespaces.length) {
    const namespace = await input({
      message: 'Enter namespace name (e.g., common, members):',
      default: 'common',
      validate: validateNamespaceName
    });
    return { namespace, isNew: true };
  }

  const choice = await select({
    message: 'Select namespace:',
    choices: [
      ...existingNamespaces.map((ns) => ({ name: ns, value: ns })),
      { name: '➕ Create new namespace', value: '__new__' }
    ]
  });
  if (choice !== '__new__') {
    return { namespace: choice, isNew: false };
  }

  const namespace = await input({ message: 'Enter new namespace name:', validate: validateNamespaceName });
  return { namespace, isNew: true };
}

/**
 * The interactive add flow shared by `add` with no flags and the menu: offers
 * to initialise, prompts for the key and its context, then adds it.
 */
async function addKeyInteractively(apiKeyFlag?: string): Promise<void> {
  if (!fs.existsSync(path.join(process.cwd(), '.translationsrc.json'))) {
    console.log('⚠️  Translation structure not initialized.');
    const shouldInit = await confirm({
      message: 'Would you like to initialize it now?',
      default: true
    });

    if (!shouldInit) {
      console.log('❌ Cannot add translations without initialization.');
      process.exit(1);
    }
    await initTranslationsInteractive(process.cwd());
    console.log();
  }

  const config = loadConfig(process.cwd());
  const translationsPath = path.join(process.cwd(), config.translationsPath);
  const { namespace, isNew } = await promptForNamespace(getNamespaces(translationsPath, config.sourceLanguage));

  const key = await input({
    message: 'Enter translation key (UPPERCASE_SNAKE_CASE):',
    validate: (value) => {
      if (!value.trim()) return 'Key is required';
      if (!/^[A-Z0-9_]+$/.test(value.toUpperCase())) {
        return 'Key must be SNAKE_CASE (e.g., SAVE_CHANGES)';
      }
      return true;
    },
    transformer: (value) => value.toUpperCase()
  });

  const value = await input({
    message: `Enter ${config.sourceLanguage.toUpperCase()} translation:`,
    validate: (value) => {
      if (!value.trim()) return 'Translation value is required';
      return true;
    }
  });

  // Also ask when an existing namespace was never described, so adding a key fills the gap
  const hasDescription = !!readNamespaceContexts(translationsPath, config.sourceLanguage)[namespace]?.context
    .description;
  const context = await promptForContext(isNew || !hasDescription);

  const autoTranslate = await confirm({
    message: `Auto-translate to ${config.languages.length - 1} other languages?`,
    default: true
  });

  const { apiKey, missingEnvVar } = resolveApiKey(config.provider, apiKeyFlag);
  if (autoTranslate && missingEnvVar) {
    console.log(`\n⚠️  ${missingEnvVar} environment variable not found.`);
    console.log('Skipping auto-translation. Set this variable to enable auto-translation.\n');
  }

  console.log();

  await addTranslationKey(process.cwd(), {
    namespace,
    key: key.toUpperCase(),
    value,
    ...context,
    autoTranslate: autoTranslate && !missingEnvVar,
    apiKey
  });
}

const { values, positionals } = parseArgs({
  options: {
    'auto-fill': {
      type: 'boolean',
      short: 'a',
      default: false
    },
    'api-key': {
      type: 'string'
    },
    limit: {
      type: 'string'
    },
    concurrency: {
      type: 'string',
      default: '5'
    },
    language: {
      type: 'string',
      short: 'l'
    },
    'skip-types': {
      type: 'boolean',
      default: false
    },
    'dry-run': {
      type: 'boolean',
      short: 'd',
      default: false
    },
    'retranslate-changed': {
      type: 'boolean',
      default: false
    },
    force: {
      type: 'boolean',
      default: false
    },
    namespace: {
      type: 'string',
      short: 'n'
    },
    key: {
      type: 'string',
      short: 'k'
    },
    value: {
      type: 'string',
      short: 'v'
    },
    note: {
      type: 'string'
    },
    description: {
      type: 'string'
    },
    apply: {
      type: 'boolean',
      default: false
    },
    output: {
      type: 'string'
    },
    'include-manual-edits': {
      type: 'boolean',
      default: false
    },
    help: {
      type: 'boolean',
      short: 'h'
    }
  },
  allowPositionals: true
});

if (values.help) {
  console.log(`
Usage: poly-lexis [command] [options]

Smart translation management - automatically handles initialization, validation,
auto-filling, and type generation based on your project's current state.

Commands:
  (none)              Smart mode - validates, fills, and generates types
  add                 Add a new translation key
  find-unused         Find translation keys that are not used in the codebase
  find-duplicates     Find values duplicated from the common namespace
  review              Check existing translations against their context (Claude providers)

Options (Smart Mode):
  -a, --auto-fill         Auto-fill missing translations with the configured provider
  --api-key <key>         API key for the configured provider (or set DEEPL_API_KEY,
                          GOOGLE_TRANSLATE_API_KEY or ANTHROPIC_API_KEY)
  -l, --language <lang>   Process only this language
  --limit <number>        Max translations to process (default: unlimited)
  --concurrency <number>  Number of concurrent translation requests (default: 5)
  --retranslate-changed   Re-translate keys whose source value has changed since last run
  --force                 Re-translate every key, even ones already translated
  --include-manual-edits  Also replace translations someone edited by hand
  --skip-types            Skip TypeScript type generation
  -d, --dry-run           Preview changes without saving
  -h, --help              Show this help

Options (Add Mode):
  -n, --namespace <name>  Namespace for the translation
  -k, --key <key>         Translation key
  -v, --value <value>     Translation value in source language
  --note <text>           Note for translators about this key (saved in $context)
  --description <text>    Description of the namespace (saved in $context)
  -a, --auto-fill         Auto-translate to all languages

Options (Review Mode):
  -l, --language <lang>   Review only this language
  -n, --namespace <name>  Review only this namespace
  --output <file>         Report file (default: translations-review.json)
  --apply                 Apply the corrections in the report file
  --include-manual-edits  Also review translations someone edited by hand
  --api-key <key>         Claude API key (or set ANTHROPIC_API_KEY)

  (no options)            Interactive mode - prompts for all inputs

Examples:
  # Smart mode - check and validate translations
  poly-lexis

  # Smart mode - validate and auto-fill missing translations (DeepL)
  export DEEPL_API_KEY=your_key
  poly-lexis --auto-fill

  # Smart mode - validate and auto-fill missing translations (Google)
  export GOOGLE_TRANSLATE_API_KEY=your_key
  poly-lexis --auto-fill

  # Smart mode - auto-fill with Claude ("provider": "claude"): uses your Claude Code
  # sign-in, or ANTHROPIC_API_KEY when Claude Code isn't signed in
  poly-lexis --auto-fill

  # Smart mode - auto-fill only French translations
  poly-lexis --auto-fill --language fr

  # Preview what would be translated (dry-run)
  poly-lexis --auto-fill --dry-run

  # Re-translate keys whose source string changed since last run
  poly-lexis --auto-fill --retranslate-changed

  # Re-translate everything from scratch
  poly-lexis --auto-fill --force

  # Add a new translation key (interactive mode)
  poly-lexis add

  # Add with flags (non-interactive)
  poly-lexis add --namespace common --key HELLO --value "Hello"

  # Add with auto-translation
  poly-lexis add -n common -k WELCOME -v "Welcome" --auto-fill

  # Find unused translation keys
  poly-lexis find-unused

  # Find values duplicated from common namespace
  poly-lexis find-duplicates

  # Add a key with a note for translators
  poly-lexis add -n treatments -k BOOK -v "Book" --note "Button that confirms the booking"

  # Review existing French translations, then apply the corrections you keep
  poly-lexis review --language fr
  poly-lexis review --apply

What happens in smart mode:
  1. Checks if translations are initialized (creates .translationsrc.json if needed)
  2. Validates all translations against source language
  3. Auto-fills missing translations if --auto-fill is provided
  4. Generates TypeScript types (unless --skip-types)
  5. Shows summary and next steps
`);
  process.exit(0);
}

const command = positionals[0];

// Handle 'find-unused' command
if (command === 'find-unused') {
  (async () => {
    try {
      const { findUnusedKeys, printUnusedKeysResult } = await import('../translations/cli/find-unused.js');

      console.log('\n🔍 Finding unused translation keys...\n');

      const result = findUnusedKeys(process.cwd());
      printUnusedKeysResult(result);
    } catch (error) {
      console.error('Error:', error instanceof Error ? error.message : error);
      process.exit(1);
    }
  })();
}
// Handle 'find-duplicates' command
else if (command === 'find-duplicates') {
  (async () => {
    try {
      const { findDuplicates, printDuplicateKeysResult } = await import('../translations/cli/find-duplicates.js');

      console.log('\n🔍 Finding duplicate translations (common namespace)...\n');

      const result = findDuplicates(process.cwd());
      printDuplicateKeysResult(result);
    } catch (error) {
      console.error('Error:', error instanceof Error ? error.message : error);
      process.exit(1);
    }
  })();
}
// Handle 'review' command
else if (command === 'review') {
  (async () => {
    try {
      const { applyReviewReport, reviewTranslations } = await import('../translations/cli/review.js');

      if (values.apply) {
        const result = applyReviewReport(process.cwd(), values.output);
        if (result.skipped.length > 0) {
          process.exit(1);
        }
        return;
      }

      const config = loadConfig(process.cwd());
      await reviewTranslations(process.cwd(), {
        language: values.language,
        namespace: values.namespace,
        apiKey: resolveApiKey(config.provider, values['api-key']).apiKey,
        concurrency: Number.parseInt(values.concurrency || '5', 10),
        outputPath: values.output,
        includeManualEdits: values['include-manual-edits']
      });
    } catch (error) {
      console.error('Error:', error instanceof Error ? error.message : error);
      process.exit(1);
    }
  })();
}
// Handle 'add' command
else if (command === 'add') {
  // Interactive mode if no options provided
  if (!values.namespace && !values.key && !values.value) {
    (async () => {
      try {
        console.log('\n✨ Add a new translation key\n');

        await addKeyInteractively(values['api-key']);

        console.log('\n💡 Run "translations" to validate and generate types');
      } catch (error) {
        if ((error as { message?: string }).message === 'User force closed the prompt') {
          console.log('\n❌ Cancelled');
          process.exit(0);
        }
        console.error('Error:', error instanceof Error ? error.message : error);
        process.exit(1);
      }
    })();
  } else {
    // Non-interactive mode with flags
    if (!values.namespace || !values.key || !values.value) {
      console.error('Error: --namespace, --key, and --value are required for add command');
      console.log('Use --help for usage information');
      process.exit(1);
    }

    const config = loadConfig(process.cwd());
    const { apiKey, missingEnvVar } = resolveApiKey(config.provider, values['api-key']);

    if (values['auto-fill'] && missingEnvVar) {
      console.error(`Error: --api-key or ${missingEnvVar} environment variable is required for auto-translation`);
      process.exit(1);
    }

    addTranslationKey(process.cwd(), {
      namespace: values.namespace,
      key: values.key,
      value: values.value,
      note: values.note,
      description: values.description,
      autoTranslate: values['auto-fill'],
      apiKey
    })
      .then(() => {
        console.log('\n💡 Run "translations" to validate and generate types');
      })
      .catch((error) => {
        console.error('Error:', error instanceof Error ? error.message : error);
        process.exit(1);
      });
  }
} else if (command) {
  console.error(`Unknown command: ${command}`);
  console.log('Use --help for usage information');
  process.exit(1);
} else {
  // Check if any flags were provided
  const hasFlags =
    values['auto-fill'] ||
    values.language ||
    values['skip-types'] ||
    values['dry-run'] ||
    values['retranslate-changed'] ||
    values.force ||
    values['include-manual-edits'];

  if (hasFlags) {
    // Flag mode - run with provided options
    const configPath = path.join(process.cwd(), '.translationsrc.json');
    const provider: TranslationProviderType = fs.existsSync(configPath) ? loadConfig(process.cwd()).provider : 'deepl';
    const { apiKey } = resolveApiKey(provider, values['api-key']);
    const limit = values.limit ? Number.parseInt(values.limit, 10) : undefined;
    const concurrency = Number.parseInt(values.concurrency || '5', 10);

    // Re-translation flags imply auto-fill (they require the translation API)
    const autoFill = values['auto-fill'] || values['retranslate-changed'] || values.force;

    manageTranslations(process.cwd(), {
      autoFill,
      apiKey,
      limit,
      concurrency,
      language: values.language,
      skipTypes: values['skip-types'],
      dryRun: values['dry-run'],
      retranslateChanged: values['retranslate-changed'],
      force: values.force,
      includeManualEdits: values['include-manual-edits']
    })
      .then((isValid) => {
        if (!isValid) {
          process.exit(1);
        }
      })
      .catch((error) => {
        console.error('Error:', error instanceof Error ? error.message : error);
        process.exit(1);
      });
  } else {
    // Interactive menu mode - show options
    (async () => {
      try {
        console.log('\n🌍 Translation Management\n');

        const action = await select({
          message: 'What would you like to do?',
          choices: [
            {
              name: '✨ Add a new translation key',
              value: 'add',
              description: 'Add a translation key to all languages'
            },
            {
              name: '🔍 Validate translations',
              value: 'validate',
              description: 'Check for missing or empty translations'
            },
            {
              name: '🔎 Find unused keys',
              value: 'find-unused',
              description: 'Find translation keys not used in the codebase'
            },
            {
              name: '🔎 Find duplicate values',
              value: 'find-duplicates',
              description: 'Find values duplicated from the common namespace'
            },
            {
              name: '🤖 Auto-fill missing translations',
              value: 'autofill',
              description: 'Automatically translate missing keys with the configured provider'
            },
            {
              name: '🧐 Review existing translations',
              value: 'review',
              description: 'Check translations against their context and write suggested corrections'
            },
            {
              name: '📝 Generate TypeScript types',
              value: 'types',
              description: 'Generate types from translation files'
            },
            {
              name: '⚙️  Initialize/reconfigure',
              value: 'init',
              description: 'Set up or change translation configuration'
            },
            {
              name: '📊 Full check (validate + types)',
              value: 'full',
              description: 'Validate translations and generate types'
            }
          ]
        });

        console.log();

        if (action === 'add') {
          await addKeyInteractively();

          console.log('\n💡 Run "translations" again to validate and generate types');
        } else if (action === 'init') {
          await initTranslationsInteractive(process.cwd());
        } else if (action === 'validate') {
          await manageTranslations(process.cwd(), {
            skipTypes: true
          });
        } else if (action === 'autofill') {
          const config = loadConfig(process.cwd());
          const { apiKey, missingEnvVar } = resolveApiKey(config.provider);
          if (missingEnvVar) {
            console.log(`⚠️  ${missingEnvVar} environment variable not found.`);
            console.log('Please set it to enable auto-translation.\n');
            process.exit(1);
          }

          const shouldContinue = await confirm({
            message: 'This will auto-translate all missing keys. Continue?',
            default: true
          });

          if (shouldContinue) {
            const retranslateChanged = await confirm({
              message: 'Also re-translate keys whose source value has changed?',
              default: false
            });

            await manageTranslations(process.cwd(), {
              autoFill: true,
              apiKey,
              retranslateChanged
            });
          }
        } else if (action === 'review') {
          const { reviewTranslations } = await import('../translations/cli/review.js');
          const config = loadConfig(process.cwd());
          await reviewTranslations(process.cwd(), { apiKey: resolveApiKey(config.provider).apiKey });
        } else if (action === 'find-unused') {
          const { findUnusedKeys, printUnusedKeysResult } = await import('../translations/cli/find-unused.js');
          const result = findUnusedKeys(process.cwd());
          printUnusedKeysResult(result);
        } else if (action === 'find-duplicates') {
          const { findDuplicates, printDuplicateKeysResult } = await import('../translations/cli/find-duplicates.js');
          const result = findDuplicates(process.cwd());
          printDuplicateKeysResult(result);
        } else if (action === 'types') {
          console.log('📝 Generating TypeScript types...\n');
          const { generateTranslationTypes } = await import('../translations/cli/generate-types.js');
          generateTranslationTypes(process.cwd());
          console.log('\n✅ Types generated!\n');
        } else if (action === 'full') {
          await manageTranslations(process.cwd());
        }
      } catch (error) {
        if ((error as { message?: string }).message === 'User force closed the prompt') {
          console.log('\n❌ Cancelled');
          process.exit(0);
        }
        console.error('Error:', error instanceof Error ? error.message : error);
        process.exit(1);
      }
    })();
  }
}
