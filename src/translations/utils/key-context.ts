import type { KeyContext, KeyRoleRule, KeyUsage, NamespaceContext, TranslationFile } from '../core/types.js';
import { hashSourceValue } from './metadata.js';

/**
 * Built-in key-name conventions. The first matching rule wins, so more specific
 * suffixes come before broad prefixes. Projects add their own with `keyRoles`.
 */
export const DEFAULT_KEY_ROLES: KeyRoleRule[] = [
  { pattern: '_PLACEHOLDER$', role: 'placeholder text inside an empty input' },
  { pattern: '_TOOLTIP$', role: 'tooltip' },
  { pattern: '(^|_)(COL|COLUMN)_', role: 'table column header' },
  { pattern: '(^|_)STATUS_', role: 'status label describing a state, not an action' },
  // Before the _TITLE rule: NAVIGATION_SHIP_TITLE is a nav item, not a page heading
  { pattern: '^(NAV|NAVIGATION|BREADCRUMB|MENU)_', role: 'navigation item' },
  { pattern: '(_|^)(SUBTITLE|DESCRIPTION|HINT|HELP)$', role: 'helper text under a heading or field' },
  { pattern: '(_|^)(TITLE|HEADING)$|^HEADING_', role: 'heading' },
  { pattern: '(^|_)FILTER(_|$)', role: 'filter label' },
  { pattern: '(_|^)(BUTTON|CTA|SUBMIT)$|^(BUTTON|CTA)_', role: 'button label, an action' },
  { pattern: '(_|^)LABEL$', role: 'form field label' },
  { pattern: '(^|_)TAB(_|$)', role: 'tab label' },
  { pattern: '(^|_)TOAST(_|$)', role: 'short notification message' },
  { pattern: '(_|^)(ERROR|ERROR_MESSAGE)$|^ERROR_', role: 'error message' },
  { pattern: '^(KPI|STAT)_', role: 'statistic label' }
];

const PLURAL_SUFFIX = /_(zero|one|two|few|many|other)$/;

/** A key-role rule with its pattern compiled */
export interface CompiledKeyRole {
  regex: RegExp;
  role: string;
}

/**
 * Compile key-role rules once. Throws naming the rule when a pattern isn't a
 * valid regular expression, so a typo in `keyRoles` stops the run before
 * anything is translated or written.
 */
export function compileKeyRoles(rules: KeyRoleRule[], source = 'keyRoles'): CompiledKeyRole[] {
  return rules.map((rule, index) => {
    try {
      return { regex: new RegExp(rule.pattern), role: rule.role };
    } catch (error) {
      throw new Error(
        `${source}[${index}] has an invalid pattern "${rule.pattern}": ${error instanceof Error ? error.message : String(error)}`
      );
    }
  });
}

const COMPILED_DEFAULT_KEY_ROLES = compileKeyRoles(DEFAULT_KEY_ROLES, 'DEFAULT_KEY_ROLES');

const isCompiled = (rules: KeyRoleRule[] | CompiledKeyRole[]): rules is CompiledKeyRole[] =>
  !!rules.length && 'regex' in rules[0];

/**
 * Infer what a key is in the UI from its name: project rules first, then the
 * built-in conventions. Plural keys also say which plural form they are.
 * Pass rules from {@link compileKeyRoles} when inferring many keys.
 */
export function inferKeyRole(key: string, projectRules: KeyRoleRule[] | CompiledKeyRole[] = []): string | undefined {
  const compiled = isCompiled(projectRules) ? projectRules : compileKeyRoles(projectRules);
  const baseKey = key.replace(PLURAL_SUFFIX, '');
  const rule = [...compiled, ...COMPILED_DEFAULT_KEY_ROLES].find((candidate) => candidate.regex.test(baseKey));
  const plural = key.match(PLURAL_SUFFIX)?.[1];

  if (plural) {
    const pluralRole = `plural form "${plural}" (i18next count category)`;
    return rule ? `${rule.role}; ${pluralRole}` : pluralRole;
  }

  return rule?.role;
}

/** Interpolation placeholders in a string: {{name}} and {name} */
export function extractPlaceholders(text: string): string[] {
  return text.match(/\{\{[^}]+\}\}|\{[^{}]+\}/g) ?? [];
}

/** Up to `count` keys either side of `key` in file order */
export function getNeighbours(
  entries: TranslationFile,
  key: string,
  count: number
): Array<{ key: string; source: string }> {
  const keys = Object.keys(entries);
  const index = keys.indexOf(key);

  if (index === -1 || count <= 0) {
    return [];
  }

  return [...keys.slice(Math.max(0, index - count), index), ...keys.slice(index + 1, index + 1 + count)].map(
    (neighbour) => ({ key: neighbour, source: entries[neighbour] })
  );
}

export interface BuildKeyContextOptions {
  key: string;
  sourceEntries: TranslationFile;
  namespaceContext: NamespaceContext;
  /** Project rules; pass them through {@link compileKeyRoles} once when building many keys */
  keyRoles: KeyRoleRule[] | CompiledKeyRole[];
  usages?: KeyUsage[];
  existing?: string;
  /** How many neighbouring keys to include either side (default: 3) */
  neighbourCount?: number;
}

/** Assemble everything known about one key for a translation request */
export function buildKeyContext(options: BuildKeyContextOptions): KeyContext {
  const { key, sourceEntries, namespaceContext, keyRoles, usages = [], existing, neighbourCount = 3 } = options;
  const source = sourceEntries[key];
  const role = inferKeyRole(key, keyRoles);
  const note = namespaceContext.keys[key];

  return {
    key,
    source,
    ...(role && { role }),
    ...(note && { note }),
    neighbours: getNeighbours(sourceEntries, key, neighbourCount),
    usages,
    placeholders: extractPlaceholders(source),
    ...(existing?.trim() && { existing })
  };
}

/**
 * Hash of the context a person controls for a key: app description, namespace
 * description, key note and inferred role. Neighbours and code usages are left
 * out because they change for reasons unrelated to this key.
 *
 * Recorded as `contextHash` in metadata but not read yet.
 * TODO: offer `--retranslate-changed-context` to re-translate keys whose hash
 * no longer matches, once there's a way to tell a meaningful context edit from a reword.
 */
export function hashKeyContext(appContext: string, namespaceDescription: string | undefined, item: KeyContext): string {
  return hashSourceValue(JSON.stringify([appContext, namespaceDescription ?? '', item.note ?? '', item.role ?? '']));
}
