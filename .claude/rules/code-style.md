# Code style

Biome enforces formatting and the lint rules in `biome.json` (2-space indent, single quotes, no
trailing commas, 120 columns). Everything here is caught in review instead.

## Files and names

- Files are kebab-case and named after what they hold: `cli/auto-fill.ts`,
  `utils/deepl-translate-provider.ts`, `__tests__/plural-keys.test.ts`.
- Use ESM imports with the `.js` extension on relative paths (`'./utils.js'`) and the `node:` prefix
  for built-ins (`'node:fs'`).
- Top-level functions are `export function name(…): ReturnType`, matching the rest of the package.
  Small callbacks and helpers inside a function can be arrows.
- Give exported functions, types and their fields a short JSDoc comment that says what they are for
  and any default (`/** Maximum keys sent in one request (default: 40) */`). These land in the
  published `.d.ts`.
- Spell names out in full: `language`, not `l`; `error`, `index`, `entry`, not `err`, `idx`, `e`.
  Established terms (`id`, `url`, `config`, `i` of a numeric loop) are fine.
- Name constants that hold magic values: `const CLAUDE_CODE_TIMEOUT_MS = 5 * 60 * 1000`, not an
  inline `300000`.

## Control flow

- Prefer `const`. Reach for `let` only when a loop or accumulator really needs it; otherwise compute
  the value in one expression, a helper, or an early return.
- Return early instead of nesting. Don't chain ternaries; use a lookup object or a helper with early
  returns.
- Check lengths by truthiness: `!items.length` / `!!items.length`, not `=== 0` / `> 0`.
- Never prefix a call with `void`. Write the bare call, or handle the rejection
  (`save().catch(handleError)`).

## CLI output

- Commands in `src/translations/cli/` own all user-facing output and process exits. Code in
  `utils/` returns values or throws; it does not call `process.exit`.
- Keep console output in the existing tone (emoji status prefix, one line per result) so command
  output reads consistently.

## Tests

- Tests live in `src/__tests__/<feature>.test.ts` and import from `@jest/globals`.
- Mock network calls (`global.fetch`) and the filesystem through temp dirs; tests must not hit a
  real translation API.
