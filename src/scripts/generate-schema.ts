/**
 * Generate JSON schema file from TypeScript schema definition
 * This ensures the JSON schema stays in sync with the TypeScript source
 */
import { writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { TRANSLATION_CONFIG_SCHEMA } from '../translations/core/schema.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Write to src directory, not dist
// When compiled to dist/scripts/, we need to go up 2 levels to get to project root
const projectRoot = join(__dirname, '../..');
const SCHEMA_OUTPUT_PATH = join(projectRoot, 'src/translations/core/translations-config.schema.json');

const schemaWithMeta = {
  $schema: 'http://json-schema.org/draft-07/schema#',
  $id: 'https://raw.githubusercontent.com/designedhead/lexis/main/src/translations/core/translations-config.schema.json',
  ...TRANSLATION_CONFIG_SCHEMA
};

writeFileSync(SCHEMA_OUTPUT_PATH, `${JSON.stringify(schemaWithMeta, null, 2)}\n`);

console.log('✅ Generated translations-config.schema.json');
