---
"poly-lexis": minor
---

Automatically baseline existing translations for change tracking.

Any normal run (`poly-lexis`, the "Full check" menu option, or validation) now records a
source-value hash for every key that is already translated but not yet tracked, creating or
updating `.translations-meta.json`. This means existing codebases start detecting stale
translations on their next run, without having to re-translate anything.

Already-tracked keys are never overwritten, so genuinely stale translations are still flagged.
The baseline treats the current repo state as up to date, and a dry run (`--dry-run`) never
writes it.
