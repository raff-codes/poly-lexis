/**
 * Test script for DeepL Translation Provider
 *
 * Usage:
 * 1. Create a .env file in the project root with your DEEPL_API_KEY
 * 2. Run: npx tsx test/test-deepl.ts
 */

import 'dotenv/config';
import { DeepLTranslateProvider } from '../src/translations/utils/deepl-translate-provider.js';

async function testDeepLProvider() {
  console.log('🧪 Testing DeepL Translation Provider\n');

  const apiKey = process.env.DEEPL_API_KEY;

  if (!apiKey) {
    console.error('❌ Error: DEEPL_API_KEY not found in environment variables');
    console.error('Please create a .env file with: DEEPL_API_KEY=your_key_here');
    process.exit(1);
  }

  // Determine if using free API based on key suffix
  const isFreeApi = apiKey.endsWith(':fx');
  const provider = new DeepLTranslateProvider(isFreeApi);

  console.log(`🔑 API Type: ${isFreeApi ? 'Free' : 'Pro'}`);
  console.log(`🌐 Endpoint: ${isFreeApi ? 'api-free.deepl.com' : 'api.deepl.com'}\n`);

  // Test 1: Simple translation
  console.log('Test 1: Simple English to Portuguese translation');
  console.log('─'.repeat(50));
  try {
    const result1 = await provider.translate({
      text: 'Hello, how are you?',
      sourceLang: 'en',
      targetLang: 'pt_BR',
      apiKey
    });
    console.log('✅ Source: "Hello, how are you?"');
    console.log(`✅ Result: "${result1}"\n`);
  } catch (error) {
    console.error('❌ Error:', error instanceof Error ? error.message : error);
    console.log();
  }

  // Test 2: Translation with variables
  console.log('Test 2: Translation with interpolation variables');
  console.log('─'.repeat(50));
  try {
    const result2 = await provider.translate({
      text: 'Welcome {{name}}, you have {{count}} new messages',
      sourceLang: 'en',
      targetLang: 'es',
      apiKey
    });
    console.log('✅ Source: "Welcome {{name}}, you have {{count}} new messages"');
    console.log(`✅ Result: "${result2}"`);

    // Verify variables are preserved
    const hasVariables = result2.includes('{{name}}') && result2.includes('{{count}}');
    console.log(`✅ Variables preserved: ${hasVariables ? 'Yes ✓' : 'No ✗'}\n`);
  } catch (error) {
    console.error('❌ Error:', error instanceof Error ? error.message : error);
    console.log();
  }

  // Test 3: Auto-detect source language
  console.log('Test 3: Auto-detect source language');
  console.log('─'.repeat(50));
  try {
    const result3 = await provider.translate({
      text: 'Bonjour le monde',
      sourceLang: '', // Empty source lang triggers auto-detection
      targetLang: 'en',
      apiKey
    });
    console.log('✅ Source: "Bonjour le monde" (auto-detect)');
    console.log(`✅ Result: "${result3}"\n`);
  } catch (error) {
    console.error('❌ Error:', error instanceof Error ? error.message : error);
    console.log();
  }

  // Test 4: Batch translation
  console.log('Test 4: Batch translation');
  console.log('─'.repeat(50));
  try {
    const texts = ['Good morning', 'Good afternoon', 'Good evening'];

    console.log('✅ Translating 3 texts to German...');
    const results4 = await provider.translateBatch(
      texts,
      'en',
      'de',
      apiKey,
      100 // 100ms delay between requests
    );

    texts.forEach((text, i) => {
      console.log(`   "${text}" → "${results4[i]}"`);
    });
    console.log();
  } catch (error) {
    console.error('❌ Error:', error instanceof Error ? error.message : error);
    console.log();
  }

  // Test 5: Validate config
  console.log('Test 5: Validate configuration');
  console.log('─'.repeat(50));
  try {
    const isValid = await provider.validateConfig();
    console.log(`✅ Configuration valid: ${isValid ? 'Yes ✓' : 'No ✗'}\n`);
  } catch (error) {
    console.error('❌ Error:', error instanceof Error ? error.message : error);
    console.log();
  }

  console.log('✨ All tests completed!');
}

testDeepLProvider().catch(console.error);
