import type { GlossaryTerm } from '../core/types.js';
import { findTerm } from './glossary.js';
import { extractPlaceholders } from './key-context.js';

export interface TranslationCheckResult {
  /** Problems that make the translation unusable; it is not written */
  errors: string[];
  /** Problems worth reviewing; the translation is still written */
  warnings: string[];
}

function sortedPlaceholders(text: string): string {
  return extractPlaceholders(text).sort().join(' ');
}

/**
 * Check one provider translation before it is written.
 * - Errors: empty output, placeholders added/lost/renamed, a do-not-translate term changed.
 * - Warnings: a glossary term's required translation was not used.
 */
export function checkTranslation(
  source: string,
  translation: string | undefined,
  targetLang: string,
  glossaryTerms: GlossaryTerm[]
): TranslationCheckResult {
  const errors: string[] = [];
  const warnings: string[] = [];

  if (translation === undefined || (source.trim() !== '' && translation.trim() === '')) {
    errors.push('no translation returned');
    return { errors, warnings };
  }

  if (sortedPlaceholders(source) !== sortedPlaceholders(translation)) {
    errors.push(
      `placeholders differ: source has [${extractPlaceholders(source).join(', ')}], translation has [${extractPlaceholders(translation).join(', ')}]`
    );
  }

  for (const term of glossaryTerms) {
    const sourceSpelling = findTerm(source, term.term);
    if (sourceSpelling === undefined) {
      continue;
    }

    // Either the glossary's spelling or the source's ("LUSH" in an upper-case label) counts as kept
    if (term.doNotTranslate && !translation.includes(term.term) && !translation.includes(sourceSpelling)) {
      errors.push(`"${term.term}" must stay untranslated`);
    }

    const required = term.translations?.[targetLang];
    if (required && !translation.toLowerCase().includes(required.toLowerCase())) {
      warnings.push(`glossary says "${term.term}" is "${required}" in ${targetLang}`);
    }
  }

  return { errors, warnings };
}
