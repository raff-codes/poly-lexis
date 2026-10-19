import { spawn, spawnSync } from 'node:child_process';
import * as os from 'node:os';
import Anthropic from '@anthropic-ai/sdk';
import type {
  ContextualTranslationProvider,
  ProviderCapabilities,
  TranslationRequest,
  TranslationResponseItem
} from './translator-interface.js';

export const DEFAULT_CLAUDE_API_MODEL = 'claude-opus-5-5';
const DEFAULT_MAX_KEYS_PER_REQUEST = 40;
const CLAUDE_CODE_TIMEOUT_MS = 5 * 60 * 1000;

/**
 * Models that accept server-side refusal fallbacks in the `"default"` form.
 * Other models run without fallbacks unless `claude.serverFallbacks` is true.
 */
export const DEFAULT_FALLBACK_MODELS = new Set([
  'claude-fable-5-1',
  'claude-opus-5-5',
  'claude-opus-5',
  'claude-sonnet-5-5'
]);

const CLAUDE_CAPABILITIES = (maxItems: number): ProviderCapabilities => ({
  instructions: true,
  codeContext: true,
  review: true,
  maxItems
});

export const TRANSLATION_SYSTEM_PROMPT = `You translate user-interface strings for software.

You receive a JSON object describing one batch of strings from a single namespace (one screen or feature) and the target language. For each item return a translation for its "key".

How to use the context:
- "app" and "namespace.description" say what the product and screen are. Choose the meaning that fits them: in a booking tool "Book" is the action of booking, in a stock tool "Ship" is dispatching orders.
- "role" says what the string is in the UI. Translate a status label as a state ("Open" as in "currently open"), a column header or label as a noun phrase, a button as an action in the form that language uses for buttons.
- "note" is written by the developer about this key. It overrides everything else.
- "neighbours" are the strings around this one on the same screen, and "usages" show where the key is used in code. Use them to decide meaning and to keep terminology consistent within the screen.
- "glossary": use each term's translation for the target language when one is given; keep "doNotTranslate" terms exactly as written.

Rules:
- Keep every placeholder ({{name}} or {name}) exactly as written, the same number of times.
- Keep labels as short as the source. Do not add punctuation, quotes, or explanations that are not in the source.
- Follow "language.formality" and "language.instructions" for the target language.
- Return every key exactly once.`;

const REVIEW_INSTRUCTIONS = `This is a review. Each item has "existing", its current translation. Keep it unchanged when it is correct and natural for its role and context. Otherwise return a corrected translation. Set "changed" to true only when your translation differs from "existing", and give a one-sentence "reason" in English. When unchanged, return "existing" as the translation, "changed" false and an empty "reason".`;

/** JSON schema the response must follow */
export const TRANSLATION_RESPONSE_SCHEMA = {
  type: 'object',
  properties: {
    items: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          key: { type: 'string' },
          translation: { type: 'string' },
          changed: { type: 'boolean' },
          reason: { type: 'string' }
        },
        required: ['key', 'translation', 'changed', 'reason'],
        additionalProperties: false
      }
    }
  },
  required: ['items'],
  additionalProperties: false
} as const;

const FORMALITY_INSTRUCTION = {
  formal: 'Address the user formally.',
  informal: 'Address the user informally.',
  default: ''
} as const;

/** The user message for a request: the batch as JSON, plus review instructions in review mode */
export function buildTranslationPrompt(request: TranslationRequest): string {
  const payload = {
    sourceLanguage: request.sourceLang,
    targetLanguage: request.targetLang,
    app: request.app || undefined,
    namespace: request.namespace,
    language: {
      formality: FORMALITY_INSTRUCTION[request.language.formality] || undefined,
      instructions: request.language.instructions.length ? request.language.instructions : undefined
    },
    glossary: request.glossary.length ? request.glossary : undefined,
    items: request.items.map((item) => ({
      key: item.key,
      source: item.source,
      role: item.role,
      note: item.note,
      neighbours: item.neighbours.length ? item.neighbours : undefined,
      usages: item.usages.length
        ? item.usages.map((usage) => `${usage.file}:${usage.line}\n${usage.snippet}`)
        : undefined,
      existing: request.mode === 'review' ? item.existing : undefined
    }))
  };

  const body = JSON.stringify(payload, null, 2);
  return request.mode === 'review' ? `${REVIEW_INSTRUCTIONS}\n\n${body}` : body;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/**
 * Read the structured response. Entries that don't match the schema are
 * dropped; the caller treats keys missing from the result as failed.
 */
export function parseTranslationResponse(value: unknown): TranslationResponseItem[] {
  if (!isRecord(value) || !Array.isArray(value.items)) {
    throw new Error('Claude returned a response without an "items" array');
  }

  return value.items.flatMap((entry): TranslationResponseItem[] => {
    if (!isRecord(entry) || typeof entry.key !== 'string' || typeof entry.translation !== 'string') {
      return [];
    }
    return [
      {
        key: entry.key,
        translation: entry.translation,
        ...(typeof entry.changed === 'boolean' && { changed: entry.changed }),
        ...(typeof entry.reason === 'string' && entry.reason && { reason: entry.reason })
      }
    ];
  });
}

export interface ClaudeProviderOptions {
  model?: string;
  maxKeysPerRequest?: number;
  /** claude-api only: whether to send server-side fallbacks (default: on for {@link DEFAULT_FALLBACK_MODELS}) */
  serverFallbacks?: boolean;
}

/**
 * Claude through the Messages API, authenticated with ANTHROPIC_API_KEY.
 * Use this in CI and anywhere Claude Code isn't signed in.
 */
export class ClaudeApiProvider implements ContextualTranslationProvider {
  readonly name = 'claude-api';
  readonly model: string;
  readonly supports: ProviderCapabilities;
  private readonly client: Anthropic;
  private readonly useFallbacks: boolean;

  constructor(apiKey: string, options: ClaudeProviderOptions = {}) {
    this.model = options.model || DEFAULT_CLAUDE_API_MODEL;
    this.supports = CLAUDE_CAPABILITIES(options.maxKeysPerRequest || DEFAULT_MAX_KEYS_PER_REQUEST);
    this.client = new Anthropic({ apiKey });
    this.useFallbacks = options.serverFallbacks ?? DEFAULT_FALLBACK_MODELS.has(this.model);
  }

  async translateItems(request: TranslationRequest): Promise<TranslationResponseItem[]> {
    const response = await this.client.beta.messages.create({
      model: this.model,
      max_tokens: 16000,
      system: TRANSLATION_SYSTEM_PROMPT,
      messages: [{ role: 'user', content: buildTranslationPrompt(request) }],
      output_config: { format: { type: 'json_schema', schema: TRANSLATION_RESPONSE_SCHEMA } },
      // On a policy decline, re-run the request on a fallback model inside the same call
      ...(this.useFallbacks && { betas: ['server-side-fallback-2026-07-01'], fallbacks: 'default' as const })
    });

    if (response.stop_reason === 'refusal') {
      throw new Error('Claude declined to translate this batch');
    }
    if (response.stop_reason === 'max_tokens') {
      throw new Error('Claude ran out of output tokens; lower claude.maxKeysPerRequest');
    }

    const text = response.content
      .filter((block) => block.type === 'text')
      .map((block) => block.text)
      .join('');
    const items = parseTranslationResponse(JSON.parse(text));
    // A server-side fallback answers with another model; record the one that wrote the translations
    return response.model === this.model ? items : items.map((item) => ({ ...item, model: response.model }));
  }
}

/** Output of `claude -p --output-format json` */
interface ClaudeCodeResult {
  is_error?: boolean;
  result?: string;
  structured_output?: unknown;
}

/**
 * Read `claude -p --output-format json` output. A failure inside the run is
 * reported in the JSON (`is_error`), not only through the exit code.
 */
export function parseClaudeCodeOutput(stdout: string, exitCode: number | null): TranslationResponseItem[] {
  let parsed: ClaudeCodeResult;
  try {
    parsed = JSON.parse(stdout) as ClaudeCodeResult;
  } catch {
    throw new Error(`Claude Code exited with code ${exitCode} and no JSON output: ${stdout.trim().slice(0, 300)}`);
  }

  if (exitCode !== 0 || parsed.is_error) {
    throw new Error(`Claude Code failed: ${parsed.result?.trim() || `exit code ${exitCode}`}`);
  }
  if (parsed.structured_output === undefined) {
    throw new Error('Claude Code returned no structured output');
  }

  return parseTranslationResponse(parsed.structured_output);
}

/**
 * Environment for the `claude` child process. API credentials are removed so
 * Claude Code uses the developer's own sign-in; in print mode a set
 * ANTHROPIC_API_KEY would otherwise take precedence and bill the API instead.
 */
function claudeCodeEnv(): NodeJS.ProcessEnv {
  const { ANTHROPIC_API_KEY: _apiKey, ANTHROPIC_AUTH_TOKEN: _authToken, ...env } = process.env;
  return env;
}

/**
 * Whether the `claude` CLI is installed and signed in, so translations can run
 * through the developer's own Claude Code login.
 */
export function isClaudeCodeAvailable(command = 'claude'): boolean {
  const result = spawnSync(command, ['auth', 'status', '--json'], {
    env: claudeCodeEnv(),
    encoding: 'utf-8',
    timeout: 15_000
  });
  if (result.error || result.status !== 0) {
    return false;
  }
  // The exit code alone doesn't say whether anyone is signed in; the JSON does
  try {
    return (JSON.parse(result.stdout) as { loggedIn?: unknown }).loggedIn === true;
  } catch {
    return false;
  }
}

/**
 * Claude through the developer's locally installed Claude Code, using their
 * own sign-in. Runs `claude -p` as a plain translator: no tools, no project
 * settings, hooks or MCP servers, no saved session.
 *
 * For local use only. In CI use claude-api with an API key.
 */
export class ClaudeCodeProvider implements ContextualTranslationProvider {
  readonly name = 'claude-code';
  readonly model?: string;
  readonly supports: ProviderCapabilities;
  private readonly command: string;

  constructor(options: ClaudeProviderOptions & { command?: string } = {}) {
    this.model = options.model;
    this.supports = CLAUDE_CAPABILITIES(options.maxKeysPerRequest || DEFAULT_MAX_KEYS_PER_REQUEST);
    this.command = options.command ?? 'claude';
  }

  /** Arguments for one `claude -p` translation call */
  buildArgs(): string[] {
    return [
      '-p',
      '--output-format',
      'json',
      '--json-schema',
      JSON.stringify(TRANSLATION_RESPONSE_SCHEMA),
      '--system-prompt',
      TRANSLATION_SYSTEM_PROMPT,
      '--tools',
      '',
      '--permission-mode',
      'dontAsk',
      '--setting-sources',
      '',
      '--strict-mcp-config',
      '--no-session-persistence',
      ...(this.model ? ['--model', this.model] : [])
    ];
  }

  translateItems(request: TranslationRequest): Promise<TranslationResponseItem[]> {
    return new Promise((resolve, reject) => {
      // Run outside the project so no project CLAUDE.md is loaded into the call
      const child = spawn(this.command, this.buildArgs(), {
        cwd: os.tmpdir(),
        env: claudeCodeEnv(),
        stdio: ['pipe', 'pipe', 'pipe']
      });
      let stdout = '';
      let stderr = '';
      const timer = setTimeout(() => {
        child.kill();
        reject(new Error(`Claude Code took longer than ${CLAUDE_CODE_TIMEOUT_MS / 1000}s`));
      }, CLAUDE_CODE_TIMEOUT_MS);

      child.stdout.on('data', (chunk) => {
        stdout += chunk;
      });
      child.stderr.on('data', (chunk) => {
        stderr += chunk;
      });
      child.on('error', (error) => {
        clearTimeout(timer);
        reject(new Error(`Could not run "${this.command}": ${error.message}`));
      });
      child.on('close', (code) => {
        clearTimeout(timer);
        try {
          resolve(parseClaudeCodeOutput(stdout, code));
        } catch (error) {
          const detail = stderr.trim() ? ` (${stderr.trim().slice(0, 300)})` : '';
          reject(new Error(`${error instanceof Error ? error.message : String(error)}${detail}`));
        }
      });

      // The prompt goes over stdin: a large batch can exceed the argument length limit
      child.stdin.end(buildTranslationPrompt(request));
    });
  }
}
