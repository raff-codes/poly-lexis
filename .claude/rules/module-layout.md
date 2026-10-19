# Module layout

- `src/translations/cli/` — one file per command. Handles prompts (`@inquirer/prompts`), console
  output and exit codes, then calls into `utils/`.
- `src/translations/utils/` — the logic: file IO, providers, checks, the translation runner. Pure and
  reusable from the library API; no prompts, no `process.exit`.
- `src/translations/core/` — types, constant lists and the config JSON schema.
- `src/cli/translations.ts` — the `poly-lexis` bin entry; argument parsing and dispatch only.
- `src/scripts/` — build-time scripts (schema generation, verification).

Before adding a helper, search `utils/` for one that already does the job. New public modules must
be exported from `src/translations/index.ts`.

Translation providers implement the interface in `utils/translator-interface.ts` and are built in
`utils/provider-factory.ts`; add a new provider there rather than branching on the provider name
elsewhere.
