import { beforeEach, describe, expect, jest, test } from '@jest/globals';
import { DeepLTranslateProvider } from '../translations/utils/deepl-translate-provider.js';
import { GoogleTranslateProvider } from '../translations/utils/google-translate-provider.js';

const mockFetch = jest.fn<typeof fetch>();
global.fetch = mockFetch;

function makeDeepLResponse(text: string): Response {
  return {
    ok: true,
    json: async () => ({ translations: [{ text, detected_source_language: 'EN' }] })
  } as unknown as Response;
}

function makeGoogleResponse(text: string): Response {
  return {
    ok: true,
    json: async () => ({ data: { translations: [{ translatedText: text }] } })
  } as unknown as Response;
}

describe('protectedTerms — DeepL provider', () => {
  const provider = new DeepLTranslateProvider();
  const baseOptions = { sourceLang: 'en', targetLang: 'fr', apiKey: 'test-key' };

  beforeEach(() => {
    mockFetch.mockReset();
  });

  test('protected terms are replaced with placeholders before sending to the API', async () => {
    mockFetch.mockResolvedValue(makeDeepLResponse('Bienvenue dans XXX_0_XXX'));

    await provider.translate({
      ...baseOptions,
      text: 'Welcome to Vandelay Industries',
      protectedTerms: ['Vandelay Industries']
    });

    const body = JSON.parse((mockFetch.mock.calls[0][1] as RequestInit).body as string) as { text: string[] };
    expect(body.text[0]).not.toContain('Vandelay Industries');
    expect(body.text[0]).toContain('XXX_0_XXX');
  });

  test('protected terms are restored in the translated output', async () => {
    mockFetch.mockResolvedValue(makeDeepLResponse('Bienvenue dans XXX_0_XXX'));

    const result = await provider.translate({
      ...baseOptions,
      text: 'Welcome to Vandelay Industries',
      protectedTerms: ['Vandelay Industries']
    });

    expect(result).toBe('Bienvenue dans Vandelay Industries');
  });

  test('multiple protected terms are all preserved', async () => {
    mockFetch.mockResolvedValue(makeDeepLResponse('XXX_0_XXX et XXX_1_XXX'));

    const result = await provider.translate({
      ...baseOptions,
      text: 'Vandelay Industries and Kramerica Industries',
      protectedTerms: ['Vandelay Industries', 'Kramerica Industries']
    });

    expect(result).toBe('Vandelay Industries et Kramerica Industries');
  });

  test('protected terms and interpolation variables coexist', async () => {
    mockFetch.mockResolvedValue(makeDeepLResponse('Bonjour XXX_1_XXX, bienvenue dans XXX_0_XXX'));

    const result = await provider.translate({
      ...baseOptions,
      text: 'Hello {{name}}, welcome to Vandelay Industries',
      protectedTerms: ['Vandelay Industries']
    });

    expect(result).toContain('Vandelay Industries');
    expect(result).toContain('{{name}}');
  });

  test('repeated occurrences of a protected term are all restored', async () => {
    mockFetch.mockResolvedValue(makeDeepLResponse('XXX_0_XXX et XXX_1_XXX'));

    const result = await provider.translate({
      ...baseOptions,
      text: 'Vandelay Industries and Vandelay Industries',
      protectedTerms: ['Vandelay Industries']
    });

    expect(result).toBe('Vandelay Industries et Vandelay Industries');
  });

  test('no protectedTerms passes text to API unchanged', async () => {
    mockFetch.mockResolvedValue(makeDeepLResponse('Bonjour'));

    await provider.translate({ ...baseOptions, text: 'Hello' });

    const body = JSON.parse((mockFetch.mock.calls[0][1] as RequestInit).body as string) as { text: string[] };
    expect(body.text[0]).toBe('Hello');
  });
});

describe('protectedTerms — Google provider', () => {
  const provider = new GoogleTranslateProvider();
  const baseOptions = { sourceLang: 'en', targetLang: 'fr', apiKey: 'test-key' };

  beforeEach(() => {
    mockFetch.mockReset();
  });

  test('protected terms are not sent to the API', async () => {
    mockFetch.mockResolvedValue(makeGoogleResponse('Bienvenue dans XXX_0_XXX'));

    await provider.translate({
      ...baseOptions,
      text: 'Welcome to Vandelay Industries',
      protectedTerms: ['Vandelay Industries']
    });

    const body = JSON.parse((mockFetch.mock.calls[0][1] as RequestInit).body as string) as { q: string };
    expect(body.q).not.toContain('Vandelay Industries');
    expect(body.q).toContain('XXX_0_XXX');
  });

  test('protected terms are restored in the translated output', async () => {
    mockFetch.mockResolvedValue(makeGoogleResponse('Bienvenue dans XXX_0_XXX'));

    const result = await provider.translate({
      ...baseOptions,
      text: 'Welcome to Vandelay Industries',
      protectedTerms: ['Vandelay Industries']
    });

    expect(result).toBe('Bienvenue dans Vandelay Industries');
  });

  test('multiple protected terms are all preserved', async () => {
    mockFetch.mockResolvedValue(makeGoogleResponse('XXX_0_XXX et XXX_1_XXX'));

    const result = await provider.translate({
      ...baseOptions,
      text: 'Vandelay Industries and Kramerica Industries',
      protectedTerms: ['Vandelay Industries', 'Kramerica Industries']
    });

    expect(result).toBe('Vandelay Industries et Kramerica Industries');
  });

  test('protected terms and interpolation variables coexist', async () => {
    mockFetch.mockResolvedValue(makeGoogleResponse('Bonjour XXX_1_XXX, bienvenue dans XXX_0_XXX'));

    const result = await provider.translate({
      ...baseOptions,
      text: 'Hello {{name}}, welcome to Vandelay Industries',
      protectedTerms: ['Vandelay Industries']
    });

    expect(result).toContain('Vandelay Industries');
    expect(result).toContain('{{name}}');
  });
});
