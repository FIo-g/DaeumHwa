import type { AiClient, AiUsage, GenerateObjectArgs, StreamTextArgs } from '@/ai/types'

const ZERO_USAGE: AiUsage = { inputTokens: 0, outputTokens: 0 }
const CHUNK_CHARS = 40

/**
 * Deterministic client for tests and demo mode. Each AI task supplies its own `fake(input)`
 * output, so no network call is made and no tokens are counted.
 */
export class FakeAiClient implements AiClient {
  readonly provider = 'fake' as const
  readonly defaultModel = 'fake'

  async generateObject<T>(args: GenerateObjectArgs<T>) {
    const object = args.schema.parse(args.fake())
    return { object, usage: { ...ZERO_USAGE }, model: args.model ?? this.defaultModel }
  }

  streamText(args: StreamTextArgs) {
    const text = args.fake()
    const model = args.model ?? this.defaultModel
    const chunks = splitChunks(text, CHUNK_CHARS)
    const textStream = (async function* () {
      for (const chunk of chunks) yield chunk
    })()
    const final = Promise.resolve({ text, usage: { ...ZERO_USAGE }, model })
    return { textStream, final }
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
