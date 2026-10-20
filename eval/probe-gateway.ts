import { randomUUID } from 'node:crypto'
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { OPENCODE_BASE_URL, OPENCODE_OPENAI_BASE_URL } from '@/ai/opencode'
import type { AiClient, AiUsage } from '@/ai/types'
import { MODEL_PROFILES, createModelClient } from './novel/models'

// Probes whether the OpenCode Go gateway passes prompt-cache fields and whether its batch
// endpoints answer. Sends a few small calls and a few GET requests; writes one report file.
//
//   node --env-file=.env.local --import tsx eval/probe-gateway.ts --model <haiku-5.5|luna-6>
//
// Batch probes are GET requests only. Nothing is submitted for batch processing.

const RESULTS_DIR = path.resolve(process.cwd(), 'eval/results')
const BIBLE_FILE = path.resolve(process.cwd(), 'eval/fixtures/novel/ko/bible.json')
const PROBE_PROMPT = '한 문장으로만 답하세요: 1 더하기 1은?'
const PROBE_REPEATS = 3
const BATCH_NOTE_CHARS = 200
const USER_AGENT = 'daeumhwa/0.1'
const MODEL_CHOICES = ['haiku-5.5', 'luna-6'] as const

export type CacheProbeCall = { usage: AiUsage; durationMs: number }
export type CacheProbeResult = { calls: CacheProbeCall[]; cacheHit: boolean }
export type BatchProbeItem = { url: string; status: number | null; note: string }

/**
 * Sends the same small streaming request `repeats` times in sequence. The system text is the
 * same every time, so a gateway with prompt caching reports cache reads from the second call on.
 */
export async function probeCache(
  client: AiClient,
  o: { model: string; system: string; repeats: number },
): Promise<CacheProbeResult> {
  const calls: CacheProbeCall[] = []
  for (let i = 0; i < o.repeats; i += 1) {
    const started = performance.now()
    const stream = client.streamText({
      task: { name: 'draft-chapter', input: { probe: 'cache' } },
      system: o.system,
      prompt: PROBE_PROMPT,
      effort: 'low',
      maxTokens: 200,
      model: o.model,
    })
    for await (const chunk of stream.textStream) void chunk
    const done = await stream.final
    calls.push({ usage: done.usage, durationMs: performance.now() - started })
  }
  const cacheHit = calls.slice(1).some((call) => (call.usage.cacheReadTokens ?? 0) > 0)
  return { calls, cacheHit }
}

/**
 * One GET per URL with the auth headers the OpenCode client sends. Records the status and the
 * start of the body. A network error is recorded with a null status.
 */
export async function probeBatch(
  fetchImpl: typeof fetch,
  o: { urls: string[]; apiKey: string },
): Promise<BatchProbeItem[]> {
  const sessionId = `probe-${randomUUID()}`
  const items: BatchProbeItem[] = []
  for (const url of o.urls) {
    try {
      const res = await fetchImpl(url, {
        method: 'GET',
        headers: {
          Authorization: `Bearer ${o.apiKey}`,
          'x-opencode-session': sessionId,
          'User-Agent': USER_AGENT,
        },
      })
      const body = await res.text()
      items.push({ url, status: res.status, note: body.slice(0, BATCH_NOTE_CHARS) })
    } catch (error) {
      const note = error instanceof Error ? error.message : String(error)
      items.push({ url, status: null, note: note.slice(0, BATCH_NOTE_CHARS) })
    }
  }
  return items
}

/** Value of a single `--flag <value>` pair, or undefined when the flag is absent. */
function argValue(name: string): string | undefined {
  const index = process.argv.indexOf(name)
  if (index === -1) return undefined
  const value = process.argv[index + 1]
  if (value === undefined || value.startsWith('--')) throw new Error(`${name} value is missing`)
  return value
}

async function main(): Promise<void> {
  const modelId = argValue('--model')
  if (modelId === undefined || !(MODEL_CHOICES as readonly string[]).includes(modelId)) {
    throw new Error(`--model must be one of ${MODEL_CHOICES.join(', ')}`)
  }
  const apiKey = process.env.OPENCODE_API_KEY?.trim()
  if (!apiKey) throw new Error('OPENCODE_API_KEY is missing')

  const profile = MODEL_PROFILES[modelId as keyof typeof MODEL_PROFILES]
  const client = createModelClient(profile)
  const system = JSON.stringify(JSON.parse(readFileSync(BIBLE_FILE, 'utf8')), null, 2)

  const cache = await probeCache(client, {
    model: profile.model,
    system,
    repeats: PROBE_REPEATS,
  })
  const batchUrls = [
    `${process.env.OPENCODE_BASE_URL?.trim() || OPENCODE_BASE_URL}/v1/messages/batches`,
    `${process.env.OPENCODE_OPENAI_BASE_URL?.trim() || OPENCODE_OPENAI_BASE_URL}/batches`,
  ]
  const batch = await probeBatch(fetch, { urls: batchUrls, apiKey })

  const stamp = new Date().toISOString().replace(/[:.]/g, '-')
  mkdirSync(RESULTS_DIR, { recursive: true })
  const outFile = path.join(RESULTS_DIR, `probe-gateway-${modelId}-${stamp}.json`)
  writeFileSync(
    outFile,
    `${JSON.stringify({ model: profile.model, createdAt: stamp, cache, batch }, null, 2)}\n`,
  )
  console.log(`cache hit ${cache.cacheHit} · batch ${batch.map((b) => b.status).join(', ')}`)
  console.log(`saved: ${outFile}`)
}

// Runs the CLI only when executed directly; tests import the probes without starting it.
if (!process.env.VITEST) {
  main().catch((error: unknown) => {
    console.error(error)
    process.exitCode = 1
  })
}
