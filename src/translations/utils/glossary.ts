import * as fs from 'node:fs';
import * as path from 'node:path';
import type { Glossary, GlossaryTerm, TranslationConfig } from '../core/types.js';

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/**
 * Parse a glossary file's contents. Throws with the entry index and field when
 * an entry is malformed, so a broken shared glossary is fixed rather than
 * silently ignored.
 */
export function parseGlossary(raw: unknown, source = 'glossary'): Glossary {
  if (!isRecord(raw) || !Array.isArray(raw.terms)) {
    throw new Error(`${source} must be an object with a "terms" array`);
  }

  const terms = raw.terms.map((entry, index): GlossaryTerm => {
    const where = `${source} terms[${index}]`;
    if (!isRecord(entry) || typeof entry.term !== 'string' || !entry.term.trim()) {
      throw new Error(`${where} needs a non-empty "term"`);
    }
    if (entry.doNotTranslate !== undefined && typeof entry.doNotTranslate !== 'boolean') {
      throw new Error(`${where} "doNotTranslate" must be true or false`);
    }
    if (entry.note !== undefined && typeof entry.note !== 'string') {
      throw new Error(`${where} "note" must be a string`);
    }
    if (
      entry.translations !== undefined &&
      (!isRecord(entry.translations) || Object.values(entry.translations).some((value) => typeof value !== 'string'))
    ) {
      throw new Error(`${where} "translations" must map language codes to strings`);
    }

    return {
      term: entry.term.trim(),
      ...(entry.doNotTranslate && { doNotTranslate: true }),
      ...(typeof entry.note === 'string' && entry.note.trim() && { note: entry.note.trim() }),
      ...(entry.translations !== undefined && { translations: entry.translations as Record<string, string> })
    };
  });

  return { terms };
}

/**
 * Load the glossary the config points at, with `protectedTerms` merged in as
 * do-not-translate terms. A term listed in both keeps the glossary entry.
 */
export function loadGlossary(projectRoot: string, config: Required<TranslationConfig>): Glossary {
  const terms: GlossaryTerm[] = [];

  if (config.glossary) {
    const glossaryPath = path.resolve(projectRoot, config.glossary);
    if (!fs.existsSync(glossaryPath)) {
      throw new Error(`Glossary not found at ${glossaryPath}. Fix "glossary" in .translationsrc.json.`);
    }
    terms.push(...parseGlossary(JSON.parse(fs.readFileSync(glossaryPath, 'utf-8')), config.glossary).terms);
  }

  const known = new Set(terms.map((term) => term.term.toLowerCase()));
  for (const protectedTerm of config.protectedTerms) {
    if (!known.has(protectedTerm.toLowerCase())) {
      terms.push({ term: protectedTerm, doNotTranslate: true });
      known.add(protectedTerm.toLowerCase());
    }
  }

  return { terms };
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** How `term` is spelled where it first occurs in `text` as a whole word (ignoring case), or undefined */
export function findTerm(text: string, term: string): string | undefined {
  return termPattern(term).exec(text)?.[2];
}

/** Whole-word patterns by term; every key in a run is checked against every term */
const TERM_PATTERNS = new Map<string, RegExp>();

/** Not global, so `exec` keeps no `lastIndex` state and the cached pattern is safe to reuse */
const termPattern = (term: string): RegExp => {
  const cached = TERM_PATTERNS.get(term);
  if (cached) return cached;

  const pattern = new RegExp(`(^|[^\\p{L}\\p{N}])(${escapeRegExp(term)})($|[^\\p{L}\\p{N}])`, 'iu');
  TERM_PATTERNS.set(term, pattern);
  return pattern;
};

/** Whether `text` contains `term` as a whole word, ignoring case */
export function containsTerm(text: string, term: string): boolean {
  return findTerm(text, term) !== undefined;
}

/** The glossary terms that appear in any of `texts`, so a request only carries the ones it needs */
export function termsInTexts(glossary: Glossary, texts: string[]): GlossaryTerm[] {
  return glossary.terms.filter((term) => texts.some((text) => containsTerm(text, term.term)));
}

/** Terms whose exact spelling must survive translation */
export function doNotTranslateTerms(glossary: Glossary): string[] {
  return glossary.terms.filter((term) => term.doNotTranslate).map((term) => term.term);
}
