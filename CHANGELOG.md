# poly-lexis

## 1.0.1

### Patch Changes

- 2093606: Accept regional language codes that fall back to a supported language (such as `fr_ca` → `fr`) in config validation and the JSON schema, instead of warning that they are invalid.

## 1.0.0

### Major Changes

- 925faca: Translate with context, and add Claude as a provider.

  - **Context for every key.** Each key is sent with the app description (`context` in `.translationsrc.json`), its namespace description and an optional note (a reserved `$context` entry in the source-language file), a UI role inferred from the key name (`COL_*`, `STATUS_*`, `*_PLACEHOLDER`…, extendable with `keyRoles`), the strings next to it, and the code that uses it (`t('KEY')`, `t('ns:KEY')`, `t('ns.KEY')`). `$context` is never translated, synced to other languages or included in the generated types. Validation reports notes for keys that no longer exist, and, once `context` or `contextRequired` is set, namespaces without a description; `contextRequired` makes them fail validation.
  - **Glossary.** `glossary` points at a shared file of terms with required translations or `doNotTranslate`. `protectedTerms` still works and is merged in.
  - **Claude providers.** `claude` uses the local Claude Code CLI when signed in, else the Claude API with `ANTHROPIC_API_KEY`, else `fallbackProvider`. `claude-code` and `claude-api` require one route. Claude translates a namespace in batches with all of the context above.
  - **Code is sent to Claude by default.** Up to three snippets of source code per key go with each Claude request. Set `claude.codeContext: false` to send none. `claude.serverFallbacks` controls the API's fallback model, and metadata records the model that actually answered.
  - **Review.** `poly-lexis review` checks existing translations against their context and writes suggested corrections to `translations-review.json`; `poly-lexis review --apply` writes the ones you keep. Apply rejects a malformed report with the index of the bad entry, and skips entries whose translation or source string changed after the review.
  - **Checks before writing.** Translations that are empty, lose a placeholder or change a do-not-translate term are retried once, then sent to `fallbackProvider`, then reported with the provider's own error. A rejected DeepL or Google key or quota stops that provider for the rest of the run instead of failing every key. Custom providers can throw the new `ProviderAuthError` to get the same behaviour. An invalid `keyRoles` pattern stops the run before anything is written, and a `fallbackProvider` without its API key is skipped with a warning.
  - **Config is validated.** `.translationsrc.json` with a wrong type, an unknown provider or invalid JSON stops the command and names the field.
  - **Hand edits are kept.** The metadata file (now version 2, older files are read as before) records a hash of each translation written; `--force`, `--retranslate-changed` and `review` skip translations edited by hand unless `--include-manual-edits` is passed.
  - **DeepL** now receives the context as prose and `languageSettings.<lang>.formality` as a soft formality preference.
  - **`poly-lexis add`** takes `--note` and `--description`, and asks for them interactively (the description too when an existing namespace has none). Changing an existing key's value re-translates the languages whose translation came from the old value and keeps the ones edited by hand.
  - Each namespace is now written once per run instead of once per key.
  - README, `--help` and the custom provider guide cover the new features.
  - **Breaking:** `TranslationMetadata` entries are objects (`{ sourceHash, translationHash, … }`) instead of hash strings, `ValidationResult` has a new `contextIssues` field, and `ApplyReviewResult.skipped` entries carry a `skipReason`.
  - **Behaviour change:** writing a namespace file now reads the existing file to keep its `$context`, so a target file that isn't valid JSON raises an error instead of being silently overwritten.

## 0.11.0

### Minor Changes

- 93f6622: Automatically baseline existing translations for change tracking.

  Any normal run (`poly-lexis`, the "Full check" menu option, or validation) now records a
  source-value hash for every key that is already translated but not yet tracked, creating or
  updating `.translations-meta.json`. This means existing codebases start detecting stale
  translations on their next run, without having to re-translate anything.

  Already-tracked keys are never overwritten, so genuinely stale translations are still flagged.
  The baseline treats the current repo state as up to date, and a dry run (`--dry-run`) never
  writes it.

## 0.10.0

### Minor Changes

- Track translation hashes for retranslations
- b9de3b6: Detect and re-translate stale translations when a source string changes.

  poly-lexis now records a hash of the source value each translation was generated from (in a
  `.translations-meta.json` sidecar inside the translations directory). Validation warns when a
  translated value may be outdated relative to its current source string, and two new auto-fill
  flags let you fix them:

  - `--retranslate-changed` re-translates only the keys whose source value has changed.
  - `--force` re-translates every key, regardless of its current value.

  Both flags imply `--auto-fill`. Stale translations are surfaced as a warning and do not fail
  validation on their own.

## 0.9.3

### Patch Changes

- Schema fix

## 0.9.2

### Patch Changes

- Update schema

## 0.9.1

### Patch Changes

- minor: Update the config schema (adding protectedTerms)

## 0.9.0

### Minor Changes

- 21577f5: Add Protected Terms - Use `protectedTerms` to prevent specific words or phrases from being translated — useful for brand names, product names, or any term that must remain unchanged across all languages.

## 0.8.1

### Patch Changes

- Auto generate langauge array

## 0.8.0

### Minor Changes

- b480a8a: Generate pluralised keys
- 0e5e148: Find duplicate key values

## 0.6.0

### Minor Changes

- Allow nested translations structure

## 0.5.3

### Patch Changes

- Allow {} params

## 0.5.2

### Patch Changes

- Improved auto translation concurrency

## 0.5.1

### Patch Changes

- Remove orphaned namespaces

## 0.5.0

### Minor Changes

- d1f9b48: Remove orphaned keys outside of the main language
- Find unsused translation keys in the project

## 0.4.3

### Patch Changes

- regenerate types on new key submition

## 0.4.2

### Patch Changes

- Fix translations not checking provider setup

## 0.4.1

### Patch Changes

- Fix issues with library binary being under lexis instead of poly-lexis

## 0.4.0

### Minor Changes

- Language Fallback & improved language folder/file detection

## 0.3.2

### Patch Changes

- Schema path

## 0.3.1

### Patch Changes

- 3a18f59: Add generated json schemas
- ac67084: Schema Generation
