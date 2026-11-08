---
'poly-lexis': minor
---

`review --language` now fails with a clear error when the language isn't in `languages` in `.translationsrc.json`, or is the source language. Before, it ran and reported 0 translations to review. The interactive menu's review option now asks which language to review, or all of them. The new `getTargetLanguages` and `resolveTargetLanguages` helpers are exported from the package.
