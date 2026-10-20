import { mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { z } from 'zod'
import { ExtractionSchema } from '@/ai/extraction'
import type { AiClient, AiEffort, AiUsage } from '@/ai/types'
import { MODEL_IDS, MODEL_PROFILES, createModelClient } from './novel/models'
import { billedUsageOf } from './billed-usage'
import { withEffort } from './effort-client'
import { type ExtractionCompare, compareExtraction } from './replay-compare'

// Replays saved chapter-extract calls of finished eval runs at another effort, and compares each
// new output with the saved one. Replay does not change any run; it writes one report file.
//
//   node --env-file=.env.local --import tsx eval/replay-calls.ts --run <dir> [--run <dir> ...] \
//     --task chapter-extract --model <haiku-5.5|luna-6> --effort <low|medium|high>

const RESULTS_DIR = path.resolve(process.cwd(), 'eval/results/replay')
const DEFAULT_MAX_TOKENS = 16000
const EFFORTS: readonly AiEffort[] = ['low', 'medium', 'high']
const TASKS = ['chapter-extract'] as const

export type ReplayTask = (typeof TASKS)[number]

export type ReplayItem = {
  source: string
  usage: AiUsage | null
  durationMs: number
  output: unknown | null
  error?: string
  compare: ExtractionCompare | null
}

export type ReplayReport = {
  task: ReplayTask
  model: string
  effort: AiEffort
  createdAt: string
  items: ReplayItem[]
  totals: { outputTokens: number; inputTokens: number; durationMs: number }
}

const SavedRecordSchema = z.object({
  system: z.string(),
  prompt: z.string(),
  promptPrefix: z.array(z.string()).optional(),
  taskMaxTokens: z.number().optional(),
  output: z.unknown(),
})

/** Saved call files of one run that belong to the task, in name order. */
function savedCallFiles(run: string, task: ReplayTask): string[] {
  const dir = path.join(run, 'calls')
  return readdirSync(dir)
    .filter((name) => name.endsWith(`-${task}.json`))
    .sort()
    .map((name) => path.join(dir, name))
}

/** Re-sends one saved call and compares the new output with the saved one. Errors are recorded. */
async function replayOne(
  file: string,
  o: { task: ReplayTask; effort: AiEffort; client: AiClient; model: string },
): Promise<ReplayItem> {
  const started = Date.now()
  try {
    const record = SavedRecordSchema.parse(JSON.parse(readFileSync(file, 'utf8')))
    const reference = ExtractionSchema.parse(record.output)
    const { object, usage } = await o.client.generateObject({
      task: { name: o.task, input: { system: record.system, prompt: record.prompt } },
      system: record.system,
      prompt: record.prompt,
      promptPrefix: record.promptPrefix,
      schema: ExtractionSchema,
      effort: o.effort,
      maxTokens: record.taskMaxTokens ?? DEFAULT_MAX_TOKENS,
      model: o.model,
    })
    return {
      source: file,
      usage,
      durationMs: Date.now() - started,
      output: object,
      compare: compareExtraction(reference, object),
    }
  } catch (error) {
    return {
      source: file,
      usage: billedUsageOf(error),
      durationMs: Date.now() - started,
      output: null,
      error: error instanceof Error ? error.message : String(error),
      compare: null,
    }
  }
}

/** Replays every saved call of the task in each run, one after another, at the given effort. */
export async function replayCalls(o: {
  runs: string[]
  task: ReplayTask
  effort: AiEffort
  client: AiClient
  model: string
}): Promise<ReplayReport> {
  const items: ReplayItem[] = []
  for (const run of o.runs) {
    for (const file of savedCallFiles(run, o.task)) {
      items.push(await replayOne(file, o))
    }
  }
  const totals = items.reduce(
    (sum, item) => ({
      outputTokens: sum.outputTokens + (item.usage?.outputTokens ?? 0),
      inputTokens: sum.inputTokens + (item.usage?.inputTokens ?? 0),
      durationMs: sum.durationMs + item.durationMs,
    }),
    { outputTokens: 0, inputTokens: 0, durationMs: 0 },
  )
  return {
    task: o.task,
    model: o.model,
    effort: o.effort,
    createdAt: new Date().toISOString(),
    items,
    totals,
  }
}

/** Values of every `--flag <value>` pair, in order. Throws when a value is missing. */
function argValues(name: string): string[] {
  const values: string[] = []
  process.argv.forEach((arg, index) => {
    if (arg !== name) return
    const value = process.argv[index + 1]
    if (value === undefined || value.startsWith('--')) throw new Error(`${name} value is missing`)
    values.push(value)
  })
  return values
}

/** Value of a single `--flag <value>` pair, or undefined when the flag is absent. */
function argValue(name: string): string | undefined {
  return argValues(name)[0]
}

async function main(): Promise<void> {
  const runs = argValues('--run').map((run) => path.resolve(process.cwd(), run))
  if (runs.length === 0) throw new Error('--run is required')
  const task = argValue('--task') ?? 'chapter-extract'
  if (!(TASKS as readonly string[]).includes(task)) throw new Error(`unknown --task: ${task}`)
  const modelId = argValue('--model')
  if (modelId === undefined || !(MODEL_IDS as readonly string[]).includes(modelId)) {
    throw new Error(`--model must be one of ${MODEL_IDS.join(', ')}`)
  }
  const effort = argValue('--effort')
  if (effort === undefined || !(EFFORTS as readonly string[]).includes(effort)) {
    throw new Error(`--effort must be one of ${EFFORTS.join(', ')}`)
  }

  const profile = MODEL_PROFILES[modelId as keyof typeof MODEL_PROFILES]
  const client = withEffort(createModelClient(profile), effort as AiEffort)
  const report = await replayCalls({
    runs,
    task: task as ReplayTask,
    effort: effort as AiEffort,
    client,
    model: profile.model,
  })

  const stamp = new Date().toISOString().replace(/[:.]/g, '-')
  mkdirSync(RESULTS_DIR, { recursive: true })
  const outFile = path.join(RESULTS_DIR, `${stamp}-${task}-${modelId}-${effort}.json`)
  writeFileSync(outFile, `${JSON.stringify(report, null, 2)}\n`)
  console.log(`items ${report.items.length} · output tokens ${report.totals.outputTokens}`)
  console.log(`saved: ${outFile}`)
  if (report.items.some((item) => item.error !== undefined)) process.exitCode = 1
}

// Runs the CLI only when executed directly; tests import replayCalls without starting it.
if (!process.env.VITEST) {
  main().catch((error: unknown) => {
    console.error(error)
    process.exitCode = 1
  })
}
