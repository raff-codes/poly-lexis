/**
 * Translation management utilities
 *
 * This module provides a complete solution for managing i18n translations:
 * - Initialize translation structure
 * - Add and translate new keys
 * - Validate translations
 * - Auto-fill missing translations
 * - Generate TypeScript types
 */

// CLI commands
export * from './cli/add-key.js';
export * from './cli/auto-fill.js';
export * from './cli/find-unused.js';
export * from './cli/generate-types.js';
export * from './cli/init.js';
export * from './cli/init-interactive.js';
export * from './cli/manage.js';
export * from './cli/validate.js';

// Core types and schemas
export * from './core/schema.js';
export * from './core/types.js';
export * from './utils/google-translate-provider.js';
// Utilities
export * from './utils/translator.js';
export * from './utils/translator-interface.js';
export * from './utils/utils.js';
