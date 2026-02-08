import { extractPluralBaseKeys } from '../translations/cli/generate-types.js';

describe('extractPluralBaseKeys', () => {
  test('should extract base key from _one suffix', () => {
    const keys = ['items_one', 'items_other'];
    const result = extractPluralBaseKeys(keys);
    expect(result).toEqual(['items']);
  });

  test('should extract base keys from all CLDR plural suffixes', () => {
    const keys = ['count_zero', 'count_one', 'count_two', 'count_few', 'count_many', 'count_other'];
    const result = extractPluralBaseKeys(keys);
    expect(result).toEqual(['count']);
  });

  test('should not add base key if it already exists', () => {
    const keys = ['items', 'items_one', 'items_other'];
    const result = extractPluralBaseKeys(keys);
    expect(result).toEqual([]);
  });

  test('should handle nested dot-notation keys', () => {
    const keys = ['cart.items_one', 'cart.items_other'];
    const result = extractPluralBaseKeys(keys);
    expect(result).toEqual(['cart.items']);
  });

  test('should not produce empty base key from bare suffix', () => {
    const keys = ['_one', '_other'];
    const result = extractPluralBaseKeys(keys);
    expect(result).toEqual([]);
  });

  test('should return empty array when no plural keys exist', () => {
    const keys = ['HELLO', 'GOODBYE', 'nav.home'];
    const result = extractPluralBaseKeys(keys);
    expect(result).toEqual([]);
  });

  test('should handle multiple different plural groups', () => {
    const keys = ['items_one', 'items_other', 'messages_one', 'messages_many'];
    const result = extractPluralBaseKeys(keys);
    expect(result).toContain('items');
    expect(result).toContain('messages');
    expect(result).toHaveLength(2);
  });

  test('should not duplicate base keys when multiple suffixes match the same base', () => {
    const keys = ['items_zero', 'items_one', 'items_two', 'items_few', 'items_many', 'items_other'];
    const result = extractPluralBaseKeys(keys);
    expect(result).toEqual(['items']);
  });

  test('should not match keys that merely contain suffix as substring', () => {
    const keys = ['someone', 'zone_manager'];
    const result = extractPluralBaseKeys(keys);
    expect(result).toEqual([]);
  });
});
