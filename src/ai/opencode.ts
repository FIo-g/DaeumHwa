import { randomUUID } from 'node:crypto'
import Anthropic from '@anthropic-ai/sdk'
import { AnthropicAiClient } from '@/ai/anthropic'
import { ResponsesAiClient } from '@/ai/responses'
import { providerDefaultModel } from '@/ai/models'
import type { AiClient, GenerateObjectArgs, StreamTextArgs } from '@/ai/types'

/** OpenCode Go's Anthropic-compatible endpoint (Messages API under /v1/messages). */
export const OPENCODE_BASE_URL = 'https://opencode.ai/inference/go/anthropic'
/** OpenCode Go's OpenAI-compatible endpoint (Responses API under /responses). */
export const OPENCODE_OPENAI_BASE_URL = 'https://opencode.ai/inference/go/openai/v1'
const USER_AGENT = 'daeumhwa/0.1'
/** One session id per process; the gateway rejects requests without it. Shared by both formats. */
const SESSION_ID = `daeumhwa-${randomUUID()}`
const SHARED_HEADERS = { 'x-opencode-session': SESSION_ID, 'User-Agent': USER_AGENT }

/** OpenCode Go models served through the OpenAI Responses format. */
const RESPONSES_MODELS = new Set([
  'muse-spark-1.3-contributor',
  'muse-spark-1.2-contributor',
  'gpt-6-luna',
  'gpt-5.6-luna',
  'grok-4.7',
])
const RESPONSES_PREFIXES = ['gpt-', 'grok-', 'muse-']

export type OpencodeApiFormat = 'anthropic' | 'responses'

let warnedFormat = false

/**
 * Anthropic SDK client pointed at OpenCode Go. The key goes in the Bearer header (authToken),
 * never in x-api-key. OPENCODE_BASE_URL overrides the endpoint.
 */
export function createOpencodeSdk(options: { fetch?: typeof fetch } = {}): Anthropic {
  return new Anthropic({
    baseURL: process.env.OPENCODE_BASE_URL?.trim() || OPENCODE_BASE_URL,
    apiKey: null,
    authToken: process.env.OPENCODE_API_KEY?.trim() || null,
    defaultHeaders: { ...SHARED_HEADERS },
    fetch: options.fetch,
  })
}

/**
 * OpenAI Responses client for OpenCode Go. OPENCODE_OPENAI_BASE_URL overrides the endpoint.
 * `defaultModel` is used when a call names no model.
 */
export function createOpencodeResponsesClient(
  options: { fetch?: typeof fetch; defaultModel?: string } = {},
): ResponsesAiClient {
  return new ResponsesAiClient({
    baseUrl: process.env.OPENCODE_OPENAI_BASE_URL?.trim() || OPENCODE_OPENAI_BASE_URL,
    apiKey: process.env.OPENCODE_API_KEY?.trim() || null,
    headers: { ...SHARED_HEADERS },
    fetch: options.fetch,
    defaultModel: options.defaultModel ?? providerDefaultModel('opencode'),
  })
}

/**
 * OPENCODE_API_FORMAT forces one format for every model. Returns undefined when it is unset or
 * unknown (an unknown value is ignored with one warning).
 */
export function apiFormatOverride(): OpencodeApiFormat | undefined {
  const raw = process.env.OPENCODE_API_FORMAT?.trim().toLowerCase() ?? ''
  if (raw === '') return undefined
  if (raw === 'anthropic' || raw === 'responses') return raw
  if (!warnedFormat) {
    warnedFormat = true
    console.warn(
      `OPENCODE_API_FORMAT 값 "${raw}"은(는) 알 수 없어 무시합니다. (anthropic, responses 중 하나)`,
    )
  }
  return undefined
}

/** API format for one model id. Responses models use the OpenAI format; everything else is Anthropic. */
export function apiFormatFor(
  model: string,
  override: OpencodeApiFormat | undefined = apiFormatOverride(),
): OpencodeApiFormat {
  if (override) return override
  if (
    RESPONSES_MODELS.has(model) ||
    RESPONSES_PREFIXES.some((prefix) => model.startsWith(prefix))
  ) {
    return 'responses'
  }
  return 'anthropic'
}

/** OpenCode Go models that the research notes list as lacking structured output; they start in JSON mode. */
const JSON_MODE_MODELS = ['qwen3.7-plus']

/**
 * OpenCode Go client. Each call picks its API format from its model id (see apiFormatFor):
 * Anthropic-format models go through AnthropicAiClient (with its JSON and effort fallbacks),
 * Responses-format models through ResponsesAiClient. Both share the session id and User-Agent.
 */
export class OpencodeAiClient implements AiClient {
  readonly provider = 'opencode' as const
  readonly defaultModel: string
  private readonly anthropic: AnthropicAiClient
  private readonly responses: ResponsesAiClient

  constructor(sdk?: Anthropic, defaultModel?: string, responses?: ResponsesAiClient) {
    this.defaultModel = defaultModel ?? providerDefaultModel('opencode')
    // Server-side fallback is never sent: the OpenCode gateway does not support it.
    this.anthropic = new AnthropicAiClient(sdk ?? createOpencodeSdk(), this.defaultModel, {
      provider: 'opencode',
      serverFallback: false,
      jsonFallback: true,
      jsonModels: JSON_MODE_MODELS,
    })
    this.responses = responses ?? createOpencodeResponsesClient({ defaultModel: this.defaultModel })
  }

  generateObject<T>(args: GenerateObjectArgs<T>) {
    const model = args.model ?? this.defaultModel
    return this.clientFor(model).generateObject({ ...args, model })
  }

  streamText(args: StreamTextArgs) {
    const model = args.model ?? this.defaultModel
    return this.clientFor(model).streamText({ ...args, model })
  }

  private clientFor(model: string): AiClient {
    return apiFormatFor(model) === 'responses' ? this.responses : this.anthropic
  }
}
