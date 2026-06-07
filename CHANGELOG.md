# poly-lexis

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
