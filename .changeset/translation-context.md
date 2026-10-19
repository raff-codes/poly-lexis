---
"poly-lexis": minor
---

Translate with context, and add Claude as a provider.

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
- **Programmatic API changes:** `TranslationMetadata` entries are objects (`{ sourceHash, translationHash, … }`) instead of hash strings, `ValidationResult` has a new `contextIssues` field, and `ApplyReviewResult.skipped` entries carry a `skipReason`.
- **Behaviour change:** writing a namespace file now reads the existing file to keep its `$context`, so a target file that isn't valid JSON raises an error instead of being silently overwritten.
