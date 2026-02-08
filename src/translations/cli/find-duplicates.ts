import * as path from 'node:path';
import type { DuplicateKeysResult, DuplicateTranslation } from '../core/types.js';
import { getNamespaces, readTranslations } from '../utils/utils.js';
import { loadConfig } from './init.js';

/**
 * Find translation values in non-common namespaces that are exact duplicates
 * of values already present in the common namespace.
 */
export function findDuplicates(projectRoot: string = process.cwd()): DuplicateKeysResult {
  const config = loadConfig(projectRoot);
  const translationsPath = path.join(projectRoot, config.translationsPath);
  const sourceLanguage = config.sourceLanguage;

  const namespaces = getNamespaces(translationsPath, sourceLanguage);
  const sourceTranslations = readTranslations(translationsPath, sourceLanguage);

  console.log('=====');
  console.log('Finding duplicate translations (common namespace)');
  console.log('=====');
  console.log(`Source language: ${sourceLanguage}`);
  console.log(`Namespaces: ${namespaces.join(', ')}`);
  console.log('=====');

  const commonValues = sourceTranslations['common'] || {};

  if (Object.keys(commonValues).length === 0) {
    console.log('No common namespace found or it is empty.');
    return { duplicates: [], totalKeysChecked: 0 };
  }

  // Build reverse map: value -> key in common
  const valueToCommonKey = new Map<string, string>();
  for (const [key, value] of Object.entries(commonValues)) {
    // If multiple common keys share the same value, keep the first one
    if (!valueToCommonKey.has(value)) {
      valueToCommonKey.set(value, key);
    }
  }

  const duplicates: DuplicateTranslation[] = [];
  let totalKeysChecked = 0;

  for (const namespace of namespaces) {
    if (namespace === 'common') continue;

    const nsValues = sourceTranslations[namespace] || {};

    for (const [key, value] of Object.entries(nsValues)) {
      totalKeysChecked++;

      const commonKey = valueToCommonKey.get(value);
      if (commonKey) {
        duplicates.push({
          namespace,
          key,
          commonKey,
          value
        });
      }
    }
  }

  console.log('=====');

  return { duplicates, totalKeysChecked };
}

/**
 * Print duplicate keys results in a formatted way
 */
export function printDuplicateKeysResult(result: DuplicateKeysResult): void {
  if (result.duplicates.length === 0) {
    console.log('✓ No duplicate values found across namespaces!');
    return;
  }

  console.log(`\n⚠ Found ${result.duplicates.length} values duplicated from common:\n`);

  // Group by namespace
  const byNamespace = new Map<string, DuplicateTranslation[]>();
  for (const dup of result.duplicates) {
    const items = byNamespace.get(dup.namespace) || [];
    items.push(dup);
    byNamespace.set(dup.namespace, items);
  }

  for (const [namespace, items] of byNamespace) {
    console.log(`  ${namespace}:`);
    for (const item of items) {
      console.log(`    - ${item.key} → common.${item.commonKey} ("${item.value}")`);
    }
  }

  console.log(`\n📊 Summary:`);
  console.log(`  Keys checked: ${result.totalKeysChecked}`);
  console.log(`  Duplicates found: ${result.duplicates.length}`);
  console.log('=====');
}
