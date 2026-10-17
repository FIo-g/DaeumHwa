import { randomUUID } from 'node:crypto'
import Anthropic from '@anthropic-ai/sdk'
import { AnthropicAiClient } from '@/ai/anthropic'
import { providerDefaultModel } from '@/ai/models'

/** OpenCode Go's Anthropic-compatible endpoint (Messages API under /v1/messages). */
export const OPENCODE_BASE_URL = 'https://opencode.ai/inference/go/anthropic'
const USER_AGENT = 'daeumhwa/0.1'
/** One session id per process; the gateway rejects requests without it. */
const SESSION_ID = `daeumhwa-${randomUUID()}`

/**
 * Anthropic SDK client pointed at OpenCode Go. The key goes in the Bearer header (authToken),
 * never in x-api-key. OPENCODE_BASE_URL overrides the endpoint.
 */
export function createOpencodeSdk(options: { fetch?: typeof fetch } = {}): Anthropic {
  return new Anthropic({
    baseURL: process.env.OPENCODE_BASE_URL?.trim() || OPENCODE_BASE_URL,
    apiKey: null,
    authToken: process.env.OPENCODE_API_KEY?.trim() || null,
    defaultHeaders: {
      'x-opencode-session': SESSION_ID,
      'User-Agent': USER_AGENT,
    },
    fetch: options.fetch,
  })
}

/** OpenCode Go models that the research notes list as lacking structured output; they start in JSON mode. */
const JSON_MODE_MODELS = ['qwen3.7-plus']

/**
 * OpenCode Go client. It reuses the Anthropic request, parse and error logic with three
 * differences: the provider label is 'opencode', server-side fallback is never sent, and a
 * gateway that rejects or ignores output_config gets one JSON-mode retry per model.
 */
export class OpencodeAiClient extends AnthropicAiClient {
  declare readonly provider: 'opencode'

  constructor(sdk?: Anthropic, defaultModel?: string) {
    super(sdk ?? createOpencodeSdk(), defaultModel ?? providerDefaultModel('opencode'), {
      provider: 'opencode',
      serverFallback: false,
      jsonFallback: true,
      jsonModels: JSON_MODE_MODELS,
    })
  }
}
