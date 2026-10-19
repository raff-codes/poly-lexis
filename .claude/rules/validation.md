# Validating input

The package has no validation library; validation is hand-written, so keep it at the boundary.

- Treat anything read from outside the process as `unknown`: config files, translation JSON,
  metadata, glossary files, provider/API responses, `claude` CLI output, environment variables.
- Parse it in one `parseX(value: unknown): X` function that checks the shape and returns a typed
  value or throws a clear error (see `parseGlossary`, `parseTranslationResponse`). Don't
  `JSON.parse(…) as Foo` and trust the cast.
- Validate languages and providers with the helpers in `core/schema.ts`
  (`validateLanguages`, `isValidLanguageForProvider`, …) instead of re-checking lists inline.
- Code past the boundary trusts its types and does not re-check.
- Write error messages the user can act on: name the file, key or field and say what is expected
  ("glossary.json: `terms` must be an array of strings"), not "Invalid".
