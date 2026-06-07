---
"poly-lexis": minor
---

Detect and re-translate stale translations when a source string changes.

poly-lexis now records a hash of the source value each translation was generated from (in a
`.translations-meta.json` sidecar inside the translations directory). Validation warns when a
translated value may be outdated relative to its current source string, and two new auto-fill
flags let you fix them:

- `--retranslate-changed` re-translates only the keys whose source value has changed.
- `--force` re-translates every key, regardless of its current value.

Both flags imply `--auto-fill`. Stale translations are surfaced as a warning and do not fail
validation on their own.
