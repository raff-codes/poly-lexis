---
'poly-lexis': patch
---

Accept regional language codes that fall back to a supported language (such as `fr_ca` → `fr`) in config validation and the JSON schema, instead of warning that they are invalid.
