import 'dotenv/config';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { parseArgs } from 'node:util';
import { confirm, input, select } from '@inquirer/prompts';
import { addTranslationKey } from '../translations/cli/add-key.js';
import { loadConfig } from '../translations/cli/init.js';
import { initTranslationsInteractive } from '../translations/cli/init-interactive.js';
import { manageTranslations } from '../translations/cli/manage.js';
import { getNamespaces } from '../translations/utils/utils.js';

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
    help: {
      type: 'boolean',
      short: 'h'
    }
  },
  allowPositionals: true
});

if (values.help) {
  console.log(`
Usage: translations [command] [options]

Smart translation management - automatically handles initialization, validation,
auto-filling, and type generation based on your project's current state.

Commands:
  (none)          Smart mode - validates, fills, and generates types
  add             Add a new translation key
  find-unused     Find translation keys that are not used in the codebase

Options (Smart Mode):
  -a, --auto-fill         Auto-fill missing translations with DeepL or Google Translate
  --api-key <key>         Translation API key (or set DEEPL_API_KEY/GOOGLE_TRANSLATE_API_KEY)
  -l, --language <lang>   Process only this language
  --limit <number>        Max translations to process (default: unlimited)
  --concurrency <number>  Number of concurrent translation requests (default: 5)
  --skip-types            Skip TypeScript type generation
  -d, --dry-run           Preview changes without saving
  -h, --help              Show this help

Options (Add Mode):
  -n, --namespace <name>  Namespace for the translation
  -k, --key <key>         Translation key
  -v, --value <value>     Translation value in source language
  -a, --auto-fill         Auto-translate to all languages

  (no options)            Interactive mode - prompts for all inputs

Examples:
  # Smart mode - check and validate translations
  translations

  # Smart mode - validate and auto-fill missing translations (DeepL)
  export DEEPL_API_KEY=your_key
  translations --auto-fill

  # Smart mode - validate and auto-fill missing translations (Google)
  export GOOGLE_TRANSLATE_API_KEY=your_key
  translations --auto-fill

  # Smart mode - auto-fill only French translations
  translations --auto-fill --language fr

  # Preview what would be translated (dry-run)
  translations --auto-fill --dry-run

  # Add a new translation key (interactive mode)
  translations add

  # Add with flags (non-interactive)
  translations add --namespace common --key HELLO --value "Hello"

  # Add with auto-translation
  translations add -n common -k WELCOME -v "Welcome" --auto-fill

  # Find unused translation keys
  translations find-unused

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
// Handle 'add' command
else if (command === 'add') {
  // Interactive mode if no options provided
  if (!values.namespace && !values.key && !values.value) {
    (async () => {
      try {
        console.log('\n✨ Add a new translation key\n');

        // Check if initialized
        const configPath = path.join(process.cwd(), '.translationsrc.json');
        const isInitialized = fs.existsSync(configPath);

        if (!isInitialized) {
          console.log('⚠️  Translation structure not initialized.');
          const shouldInit = await confirm({
            message: 'Would you like to initialize it now?',
            default: true
          });

          if (shouldInit) {
            await initTranslationsInteractive(process.cwd());
            console.log();
          } else {
            console.log('❌ Cannot add translations without initialization.');
            process.exit(1);
          }
        }

        // Load config to get existing namespaces
        const config = loadConfig(process.cwd());
        const translationsPath = path.join(process.cwd(), config.translationsPath);
        const existingNamespaces = getNamespaces(translationsPath, config.sourceLanguage);

        // Prompt for namespace
        let namespace: string;
        if (existingNamespaces.length > 0) {
          const namespaceChoice = await select({
            message: 'Select namespace:',
            choices: [
              ...existingNamespaces.map((ns) => ({ name: ns, value: ns })),
              { name: '➕ Create new namespace', value: '__new__' }
            ]
          });

          if (namespaceChoice === '__new__') {
            namespace = await input({
              message: 'Enter new namespace name:',
              validate: (value) => {
                if (!value.trim()) return 'Namespace is required';
                if (!/^[a-z0-9-]+$/.test(value)) {
                  return 'Namespace must contain only lowercase letters, numbers, and hyphens';
                }
                return true;
              }
            });
          } else {
            namespace = namespaceChoice;
          }
        } else {
          namespace = await input({
            message: 'Enter namespace name (e.g., common, members):',
            default: 'common',
            validate: (value) => {
              if (!value.trim()) return 'Namespace is required';
              if (!/^[a-z0-9-]+$/.test(value)) {
                return 'Namespace must contain only lowercase letters, numbers, and hyphens';
              }
              return true;
            }
          });
        }

        // Prompt for key
        const key = await input({
          message: 'Enter translation key (UPPERCASE_SNAKE_CASE):',
          validate: (value) => {
            if (!value.trim()) return 'Key is required';
            if (!/^[A-Z0-9_]+$/.test(value)) {
              return 'Key should use UPPERCASE_SNAKE_CASE (e.g., SAVE_CHANGES)';
            }
            return true;
          },
          transformer: (value) => value.toUpperCase()
        });

        // Prompt for value
        const value = await input({
          message: `Enter ${config.sourceLanguage.toUpperCase()} translation:`,
          validate: (value) => {
            if (!value.trim()) return 'Translation value is required';
            return true;
          }
        });

        // Ask about auto-translation
        const autoTranslate = await confirm({
          message: `Auto-translate to ${config.languages.length - 1} other languages?`,
          default: true
        });

        let apiKey: string | undefined;
        if (autoTranslate) {
          const provider = config.provider || 'deepl';
          const envVarName = provider === 'google' ? 'GOOGLE_TRANSLATE_API_KEY' : 'DEEPL_API_KEY';
          apiKey = values['api-key'] || process.env[envVarName];
          if (!apiKey) {
            console.log(`\n⚠️  ${envVarName} environment variable not found.`);
            console.log('Skipping auto-translation. Set this variable to enable auto-translation.\n');
          }
        }

        console.log();

        // Add the translation
        await addTranslationKey(process.cwd(), {
          namespace,
          key: key.toUpperCase(),
          value,
          autoTranslate: autoTranslate && !!apiKey,
          apiKey
        });

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
    const provider = config.provider || 'deepl';
    const envVarName = provider === 'google' ? 'GOOGLE_TRANSLATE_API_KEY' : 'DEEPL_API_KEY';
    const apiKey = values['api-key'] || process.env[envVarName];

    if (values['auto-fill'] && !apiKey) {
      console.error(`Error: --api-key or ${envVarName} environment variable is required for auto-translation`);
      process.exit(1);
    }

    addTranslationKey(process.cwd(), {
      namespace: values.namespace,
      key: values.key,
      value: values.value,
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
  const hasFlags = values['auto-fill'] || values.language || values['skip-types'] || values['dry-run'];

  if (hasFlags) {
    // Flag mode - run with provided options
    const configPath = path.join(process.cwd(), '.translationsrc.json');
    const config = fs.existsSync(configPath) ? loadConfig(process.cwd()) : { provider: 'deepl' };
    const provider = config.provider || 'deepl';
    const envVarName = provider === 'google' ? 'GOOGLE_TRANSLATE_API_KEY' : 'DEEPL_API_KEY';
    const apiKey = values['api-key'] || process.env[envVarName];
    const limit = values.limit ? Number.parseInt(values.limit, 10) : undefined;
    const concurrency = Number.parseInt(values.concurrency || '5', 10);

    manageTranslations(process.cwd(), {
      autoFill: values['auto-fill'],
      apiKey,
      limit,
      concurrency,
      language: values.language,
      skipTypes: values['skip-types'],
      dryRun: values['dry-run']
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
        const configPath = path.join(process.cwd(), '.translationsrc.json');
        const isInitialized = fs.existsSync(configPath);

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
              name: '🤖 Auto-fill missing translations',
              value: 'autofill',
              description: 'Automatically translate missing keys with DeepL or Google Translate'
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
          // Run add command in interactive mode
          if (!isInitialized) {
            console.log('⚠️  Translation structure not initialized.');
            const shouldInit = await confirm({
              message: 'Would you like to initialize it now?',
              default: true
            });

            if (shouldInit) {
              await initTranslationsInteractive(process.cwd());
              console.log();
            } else {
              console.log('❌ Cannot add translations without initialization.');
              process.exit(1);
            }
          }

          const config = loadConfig(process.cwd());
          const translationsPath = path.join(process.cwd(), config.translationsPath);
          const existingNamespaces = getNamespaces(translationsPath, config.sourceLanguage);

          let namespace: string;
          if (existingNamespaces.length > 0) {
            const namespaceChoice = await select({
              message: 'Select namespace:',
              choices: [
                ...existingNamespaces.map((ns) => ({ name: ns, value: ns })),
                { name: '➕ Create new namespace', value: '__new__' }
              ]
            });

            if (namespaceChoice === '__new__') {
              namespace = await input({
                message: 'Enter new namespace name:',
                validate: (value) => {
                  if (!value.trim()) return 'Namespace is required';
                  if (!/^[a-z0-9-]+$/.test(value)) {
                    return 'Namespace must contain only lowercase letters, numbers, and hyphens';
                  }
                  return true;
                }
              });
            } else {
              namespace = namespaceChoice;
            }
          } else {
            namespace = await input({
              message: 'Enter namespace name (e.g., common, members):',
              default: 'common',
              validate: (value) => {
                if (!value.trim()) return 'Namespace is required';
                if (!/^[a-z0-9-]+$/.test(value)) {
                  return 'Namespace must contain only lowercase letters, numbers, and hyphens';
                }
                return true;
              }
            });
          }

          const key = await input({
            message: 'Enter translation key (UPPERCASE_SNAKE_CASE):',
            validate: (value) => {
              if (!value.trim()) return 'Key is required';
              if (!/^[A-Z0-9_]+$/.test(value)) {
                return 'Key should use UPPERCASE_SNAKE_CASE (e.g., SAVE_CHANGES)';
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

          // Ask about auto-translation
          const autoTranslate = await confirm({
            message: `Auto-translate to ${config.languages.length - 1} other languages?`,
            default: true
          });

          let apiKey: string | undefined;
          if (autoTranslate) {
            const provider = config.provider || 'deepl';
            const envVarName = provider === 'google' ? 'GOOGLE_TRANSLATE_API_KEY' : 'DEEPL_API_KEY';
            apiKey = process.env[envVarName];
            if (!apiKey) {
              console.log(`\n⚠️  ${envVarName} environment variable not found.`);
              console.log('Skipping auto-translation. Set this variable to enable auto-translation.\n');
            }
          }

          console.log();

          await addTranslationKey(process.cwd(), {
            namespace,
            key: key.toUpperCase(),
            value,
            autoTranslate: autoTranslate && !!apiKey,
            apiKey
          });

          console.log('\n💡 Run "translations" again to validate and generate types');
        } else if (action === 'init') {
          await initTranslationsInteractive(process.cwd());
        } else if (action === 'validate') {
          await manageTranslations(process.cwd(), {
            skipTypes: true
          });
        } else if (action === 'autofill') {
          const config = loadConfig(process.cwd());
          const provider = config.provider || 'deepl';
          const envVarName = provider === 'google' ? 'GOOGLE_TRANSLATE_API_KEY' : 'DEEPL_API_KEY';
          const apiKey = process.env[envVarName];
          if (!apiKey) {
            console.log(`⚠️  ${envVarName} environment variable not found.`);
            console.log('Please set it to enable auto-translation.\n');
            process.exit(1);
          }

          const shouldContinue = await confirm({
            message: 'This will auto-translate all missing keys. Continue?',
            default: true
          });

          if (shouldContinue) {
            await manageTranslations(process.cwd(), {
              autoFill: true,
              apiKey
            });
          }
        } else if (action === 'find-unused') {
          const { findUnusedKeys, printUnusedKeysResult } = await import('../translations/cli/find-unused.js');
          const result = findUnusedKeys(process.cwd());
          printUnusedKeysResult(result);
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
