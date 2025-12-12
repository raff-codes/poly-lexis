# Custom Translation Provider Examples

## Overview

Lexis uses Google Translate by default, but you can easily plug in your own custom translation provider. This allows you to use any translation API you prefer.

## Quick Start

1. Copy the `custom-provider-template.ts` file
2. Replace the API calls with your translation service
3. Use `setTranslationProvider()` to activate it

## Template File

The `custom-provider-template.ts` file provides a complete implementation template with:

- ✅ Variable preservation (`{{variable}}` interpolations)
- ✅ API request structure
- ✅ Error handling
- ✅ Rate limiting for batch translations
- ✅ Detailed comments explaining each step

## Creating Your Provider

### Step 1: Copy the Template

```bash
cp examples/custom-provider-template.ts src/my-translation-provider.ts
```

### Step 2: Customize the API Calls

Replace these parts with your API's requirements:

```typescript
// API endpoint
this.apiUrl = 'https://your-translation-api.com/translate';

// Request format
body: JSON.stringify({
  text: textWithPlaceholders,
  source_language: sourceLang,
  target_language: targetLang
})

// Response format
const translatedText = data.translated_text; // Adjust based on your API
```

### Step 3: Use Your Provider

```typescript
import { setTranslationProvider } from 'lexis';
import { MyTranslationProvider } from './src/my-translation-provider';

// Activate your provider
setTranslationProvider(new MyTranslationProvider('your-api-key'));

// Now all translations use your provider
```

## Important Requirements

### 1. Variable Preservation (Required)

Your provider **MUST** preserve `{{variable}}` interpolations. The template includes helper methods for this:

```typescript
// Before translation
"Welcome {{userName}}!"

// After translation (variables preserved)
"Bienvenue {{userName}}!"
```

### 2. Interface Implementation (Required)

You must implement the `TranslationProvider` interface:

```typescript
interface TranslationProvider {
  translate(options: TranslateOptions): Promise<string>;
  translateBatch(
    texts: string[],
    sourceLang: string,
    targetLang: string,
    apiKey?: string,
    delayMs?: number
  ): Promise<string[]>;
  validateConfig?(): Promise<boolean>; // Optional
}
```

### 3. Language Code Handling

Different APIs use different language code formats:
- Some use: `en`, `pt`, `zh`
- Others use: `en-US`, `pt-BR`, `zh-CN`

Handle conversion in your provider:

```typescript
private convertLangCode(code: string): string {
  // Convert 'pt_BR' to 'pt-BR' or 'pt' depending on your API
  return code.replace('_', '-');
}
```

### 4. Rate Limiting

Implement delays in `translateBatch` to avoid hitting API rate limits:

```typescript
if (delayMs > 0) {
  await new Promise((resolve) => setTimeout(resolve, delayMs));
}
```

## Using Your Provider

### Option 1: Direct Usage

```typescript
import { setTranslationProvider } from 'lexis';
import { MyProvider } from './my-provider';

setTranslationProvider(new MyProvider());
```

### Option 2: Setup Script

Create `scripts/setup-translator.ts`:

```typescript
import { setTranslationProvider } from 'lexis';
import { MyProvider } from '../src/my-provider';

const apiKey = process.env.MY_TRANSLATION_API_KEY;
setTranslationProvider(new MyProvider(apiKey));
```

Run before translation commands:

```json
{
  "scripts": {
    "translate": "tsx scripts/setup-translator.ts && lexis --auto-fill"
  }
}
```

### Option 3: Conditional Provider

```typescript
import { setTranslationProvider } from 'lexis';
import { MyProvider } from './my-provider';

// Use custom provider in production, Google Translate in dev
if (process.env.NODE_ENV === 'production') {
  setTranslationProvider(new MyProvider());
}
```

## Common Use Cases

### Use Case 1: Alternative Translation Service

Replace Google Translate with your preferred service (DeepL, Azure, AWS, etc.):

```typescript
export class DeepLProvider implements TranslationProvider {
  async translate(options: TranslateOptions): Promise<string> {
    // Call DeepL API
  }
}
```

### Use Case 2: Custom Translation Logic

Implement custom logic like caching, fallbacks, or terminology management:

```typescript
export class CachedProvider implements TranslationProvider {
  private cache = new Map<string, string>();

  async translate(options: TranslateOptions): Promise<string> {
    const cacheKey = `${options.sourceLang}:${options.targetLang}:${options.text}`;

    if (this.cache.has(cacheKey)) {
      return this.cache.get(cacheKey)!;
    }

    const result = await this.callAPI(options);
    this.cache.set(cacheKey, result);
    return result;
  }
}
```

### Use Case 3: Internal Translation API

Connect to your company's internal translation service:

```typescript
export class InternalProvider implements TranslationProvider {
  async translate(options: TranslateOptions): Promise<string> {
    const response = await fetch('https://internal.company.com/translate', {
      headers: { 'Authorization': `Bearer ${this.internalToken}` },
      body: JSON.stringify(options)
    });
    return await response.json();
  }
}
```

## Testing Your Provider

```typescript
import { MyProvider } from './my-provider';

const provider = new MyProvider('test-api-key');

// Test single translation
const result = await provider.translate({
  text: 'Hello {{name}}',
  sourceLang: 'en',
  targetLang: 'es',
  apiKey: 'test-key'
});

console.log(result); // Should preserve {{name}}

// Test batch translation
const results = await provider.translateBatch(
  ['Hello', 'World'],
  'en',
  'es',
  'test-key',
  100
);

console.log(results);
```

## Reset to Default

To go back to Google Translate:

```typescript
import { resetTranslationProvider } from 'lexis';

resetTranslationProvider();
```

## Need Help?

- Review the `custom-provider-template.ts` file for a complete example
- Check the main documentation: `src/translations/README.md`
- The template includes detailed comments for each step
