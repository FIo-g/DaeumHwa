import type { AiTaskName } from '@/db/types'
import type { AiClient, AiUsage, GenerateObjectArgs, StreamTextArgs } from '@/ai/types'
import { FAKE_OUTPUTS, FAKE_TEXT } from '@/test/ai-fakes'

const ZERO_USAGE: AiUsage = { inputTokens: 0, outputTokens: 0 }
const CHUNK_CHARS = 40

type FakeFn = (input: unknown) => unknown

/** What the fake client was asked in one call. Prefix and cache key are kept for tests to read. */
export interface FakeAiCall {
  name: AiTaskName
  prompt: string
  promptPrefix?: string[]
  cacheKey?: string
}

export interface FakeAiOptions {
  /** Per-test outputs that win over the fixed registry, keyed by task name. */
  overrides?: Partial<Record<AiTaskName, FakeFn>>
}

/**
 * Deterministic AI client for tests. It answers each task from the fixed output in
 * `@/test/ai-fakes`, or from `overrides`. No network call is made and no tokens are counted.
 */
export class FakeAiClient implements AiClient {
  readonly provider = 'test'
  readonly defaultModel = 'fake'
  private readonly overrides: Partial<Record<AiTaskName, FakeFn>>
  /** Every call made on this client, in order. */
  readonly recorded: FakeAiCall[] = []

  constructor(options: FakeAiOptions = {}) {
    this.overrides = options.overrides ?? {}
  }

  async generateObject<T>(args: GenerateObjectArgs<T>) {
    const { name, input } = args.task
    this.record(args)
    const object = args.schema.parse(this.structuredOutput(name, input))
    return { object, usage: { ...ZERO_USAGE }, model: args.model ?? this.defaultModel }
  }

  streamText(args: StreamTextArgs) {
    const { name, input } = args.task
    this.record(args)
    const text = this.streamedText(name, input)
    const model = args.model ?? this.defaultModel
    const chunks = splitChunks(text, CHUNK_CHARS)
    const textStream = (async function* () {
      for (const chunk of chunks) yield chunk
    })()
    const final = Promise.resolve({ text, usage: { ...ZERO_USAGE }, model })
    return { textStream, final }
  }

  private record(args: GenerateObjectArgs<unknown> | StreamTextArgs): void {
    this.recorded.push({
      name: args.task.name,
      prompt: args.prompt,
      ...(args.promptPrefix ? { promptPrefix: args.promptPrefix } : {}),
      ...(args.cacheKey ? { cacheKey: args.cacheKey } : {}),
    })
  }

  private structuredOutput(name: AiTaskName, input: unknown): unknown {
    const override = this.overrides[name]
    if (override) return override(input)
    const fake = FAKE_OUTPUTS[name]
    if (fake) return fake(input)
    throw new Error(`No fake output for task ${name}`)
  }

  private streamedText(name: AiTaskName, input: unknown): string {
    const override = this.overrides[name]
    if (override) {
      const value = override(input)
      if (typeof value !== 'string') throw new Error(`Fake text for task ${name} must be a string`)
      return value
    }
    const fake = FAKE_TEXT[name]
    if (fake) return fake(input)
    throw new Error(`No fake output for task ${name}`)
  }
}

/** Splits by code point so that no Hangul syllable or surrogate pair is cut in half. */
function splitChunks(text: string, size: number): string[] {
  const chars = Array.from(text)
  const chunks: string[] = []
  for (let i = 0; i < chars.length; i += size) {
    chunks.push(chars.slice(i, i + size).join(''))
  }
  return chunks
}
