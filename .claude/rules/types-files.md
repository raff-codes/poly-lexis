# Where types live

- Configuration and other public types go in `src/translations/core/types.ts` and are exported
  through `src/translations/index.ts`, which `src/index.ts` re-exports. Anything a library consumer
  might pass in or receive back belongs there.
- Constant lists and the types derived from them (`TRANSLATION_PROVIDERS` →
  `TranslationProviderType`) go in `src/translations/core/schema.ts`, using
  `as const` + `(typeof X)[number]` rather than a hand-written union.
- A type used only inside one module (a provider's API response shape, an internal result) can stay
  in that module, unexported.
- When you add or change a field on `TranslationConfig`, update `TRANSLATION_CONFIG_SCHEMA` in
  `core/schema.ts` too, then run `npm run build` so `translations-config.schema.json` is regenerated.
  Don't edit the JSON file by hand.
