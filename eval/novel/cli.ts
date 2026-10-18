import { execFileSync, spawn } from 'node:child_process'
import {
  closeSync,
  existsSync,
  mkdirSync,
  openSync,
  readFileSync,
  readdirSync,
  realpathSync,
  writeFileSync,
} from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { ollamaTransport } from '@/ai/ollama'
import { seoulToday } from '@/lib/dates'
import { readPending } from './author-io'
import { MODEL_IDS, MODEL_PROFILES, type ModelId } from './models'
import {
  type RunConfig,
  type RunState,
  type RunStatus,
  loadConfig,
  loadState,
  saveState,
} from './state'
import { createRun, openRun, runUntilBlocked } from './run'
import { acquireLock, releaseLock, workerAlive } from './worker-lock'

// Command line for the novel eval. Every command prints exactly one JSON line on stdout. Long
// steps run in a detached worker so they outlive the agent's command timeout.
//   init | advance | worker | status | probe-ctx

const RESULTS_DIR = 'eval/results/novel'
const LANGS = ['ko', 'en'] as const
const CLI_PATH = fileURLToPath(import.meta.url)
const MAX_CTX_BYTES = 40 * 1024 ** 3
const PROBE_PROMPT_TOKENS = 30_000
const PROBE_MIN_PROMPT_EVAL = 29_000

export type StatusJson = {
  status: RunStatus | 'running'
  step: string | null
  pendingKind: string | null
  message: string | null
}

/** The documented status shape for one run. */
export function formatStatus(state: RunState, pendingKind: string | null = null): StatusJson {
  return {
    status: state.status,
    step: state.plan[state.cursor] ?? null,
    pendingKind,
    message: state.message,
  }
}

function summarize(dir: string, state: RunState = loadState(dir)): StatusJson {
  let pendingKind: string | null = null
  if (state.status === 'pending') pendingKind = readPending(dir)?.kind ?? null
  return formatStatus(state, pendingKind)
}

function gitCommit(): string {
  try {
    return execFileSync('git', ['rev-parse', '--short', 'HEAD'], {
      encoding: 'utf8',
    }).trim()
  } catch {
    return 'unknown'
  }
}

function parseModel(value: string): ModelId {
  if (!(MODEL_IDS as readonly string[]).includes(value)) {
    throw new Error(`unknown model: ${value}`)
  }
  return value as ModelId
}

function parseLang(value: string): 'ko' | 'en' {
  if (!(LANGS as readonly string[]).includes(value)) throw new Error(`unknown lang: ${value}`)
  return value as 'ko' | 'en'
}

function positiveInt(value: number, name: string): number {
  if (!Number.isInteger(value) || value < 1) throw new Error(`${name} must be a positive integer`)
  return value
}

export type InitOptions = {
  model: string
  lang: string
  chapters?: number
  questions?: number
  dir?: string
}

/** Creates a run, or returns the existing one when it has the same model and lang. */
export function initRun(o: InitOptions): { dir: string; status: RunStatus } {
  const model = parseModel(o.model)
  const lang = parseLang(o.lang)
  const chapters = positiveInt(o.chapters ?? 5, 'chapters')
  const questions = positiveInt(o.questions ?? 12, 'questions')
  const dir = path.resolve(o.dir ?? path.join(RESULTS_DIR, `${seoulToday()}-${model}-${lang}`))

  if (existsSync(path.join(dir, 'config.json'))) {
    const existing: RunConfig = loadConfig(dir)
    if (existing.modelId !== model || existing.lang !== lang) {
      throw new Error(`run exists with another model or lang: ${dir}`)
    }
  } else {
    createRun(dir, {
      modelId: model,
      lang,
      chapters,
      questions,
      maxDraftAttempts: 3,
      commit: gitCommit(),
    })
  }
  return { dir, status: loadState(dir).status }
}

/** Runs the run to its next block in-process. The caller holds no lock; this takes it. */
export async function runWorker(dir: string, o: { fakeAuthor: boolean }): Promise<StatusJson> {
  if (!acquireLock(dir)) throw new Error(`worker already running: ${dir}`)
  try {
    const ctx = await openRun(dir, { autoAuthor: o.fakeAuthor })
    try {
      const state = await runUntilBlocked(ctx)
      return summarize(dir, state)
    } finally {
      await ctx.close()
    }
  } finally {
    releaseLock(dir)
  }
}

export type SpawnWorker = (o: { dir: string; fakeAuthor: boolean }) => Promise<unknown>

const TSX_BIN = path.resolve('node_modules', '.bin', 'tsx')

/** Starts `tsx eval/novel/cli.ts worker` detached, logging to worker.log. Resolves on exit, rejects if it cannot start. */
function spawnDetachedWorker(o: { dir: string; fakeAuthor: boolean }): Promise<void> {
  mkdirSync(o.dir, { recursive: true })
  const log = openSync(path.join(o.dir, 'worker.log'), 'a')
  const args = [CLI_PATH, 'worker', '--dir', o.dir]
  if (o.fakeAuthor) args.push('--fake-author')
  const child = spawn(TSX_BIN, args, {
    cwd: process.cwd(),
    detached: true,
    stdio: ['ignore', log, log],
  })
  closeSync(log)
  child.unref()
  return new Promise((resolve, reject) => {
    child.once('exit', () => resolve())
    child.once('error', reject)
  })
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

const LOG_TAIL_LINES = 20

/** The last lines of worker.log, or null when the log is missing or empty. */
function logTail(dir: string): string | null {
  try {
    const lines = readFileSync(path.join(dir, 'worker.log'), 'utf8')
      .split('\n')
      .map((line) => line.trimEnd())
      .filter((line) => line.length > 0)
    return lines.slice(-LOG_TAIL_LINES).join('\n') || null
  } catch {
    return null
  }
}

/** Marks the run paused-error with the reason a worker failed without saving a result. */
function pausedError(dir: string, state: RunState, message: string): StatusJson {
  const next: RunState = { ...state, status: 'paused-error', message }
  saveState(dir, next)
  return summarize(dir, next)
}

export type AdvanceOptions = {
  maxSeconds?: number
  fakeAuthor?: boolean
  spawnWorker?: SpawnWorker
  pollMs?: number
}

/** Starts a worker if none is alive, then waits up to maxSeconds for it to finish or block. */
export async function advanceRun(dir: string, o: AdvanceOptions = {}): Promise<StatusJson> {
  const maxMs = (o.maxSeconds ?? 540) * 1000
  const pollMs = o.pollMs ?? 2000
  const fakeAuthor = o.fakeAuthor ?? false
  const started = Date.now()

  // Settles when the spawned worker exits (ok) or fails to start (error). Kept on an object so
  // the closure's writes are visible after the loop.
  const spawn: { settled: boolean; error: string | null } = { settled: false, error: null }
  const spawned = !workerAlive(dir)
  if (spawned) {
    const startWorker = o.spawnWorker ?? spawnDetachedWorker
    Promise.resolve()
      .then(() => startWorker({ dir, fakeAuthor }))
      .then(
        () => {
          spawn.settled = true
        },
        (error: unknown) => {
          spawn.settled = true
          spawn.error = errorMessage(error)
        },
      )
  }

  for (;;) {
    if (spawn.settled) break
    if (!spawned && !workerAlive(dir)) break
    if (Date.now() - started >= maxMs) break
    await sleep(pollMs)
  }

  const state = loadState(dir)
  // A spawned child that has not exited yet may not hold the lock yet (startup gap), so it counts as live.
  const live = (spawned && !spawn.settled) || workerAlive(dir)
  if (live) {
    const summary = summarize(dir, state)
    if (state.status === 'new' || state.status === 'running')
      return { ...summary, status: 'running' }
    return summary
  }
  // No live worker. A run still new or running, or a spawn failure, means the worker died
  // before it saved a result. Report it as paused-error so the caller stops retrying.
  if (spawn.error === null && state.status !== 'new' && state.status !== 'running') {
    return summarize(dir, state)
  }
  return pausedError(
    dir,
    state,
    spawn.error ?? logTail(dir) ?? 'worker exited without saving a result',
  )
}

/** One run's summary, or every run under the results directory. */
export function runStatus(o: {
  dir?: string
  all?: boolean
}): StatusJson | (StatusJson & { dir: string })[] {
  if (o.all) {
    const root = path.resolve(RESULTS_DIR)
    if (!existsSync(root)) return []
    return readdirSync(root, { withFileTypes: true })
      .filter(
        (entry) => entry.isDirectory() && existsSync(path.join(root, entry.name, 'config.json')),
      )
      .map((entry) => {
        const dir = path.join(root, entry.name)
        return { dir, ...summarize(dir) }
      })
  }
  if (!o.dir) throw new Error('status needs --dir or --all')
  return summarize(path.resolve(o.dir))
}

type FetchFn = typeof fetch

export type ProbeOptions = {
  model: ModelId
  sizes?: number[]
  fetch?: FetchFn
  baseUrl?: string
  outDir?: string
}

export type ProbeAttempt = {
  numCtx: number
  sizeBytes: number | null
  longPromptEvalCount: number | null
  error: string | null
}

/**
 * One streamed generate that produces a single token, so it times loading and prompt evaluation
 * only. Runs on ollamaTransport, which has no headers timeout: Ollama sends headers only after the
 * prompt is evaluated, so a long prompt would otherwise fail. Returns the final NDJSON chunk.
 */
async function ollamaGenerate(
  fetchFn: FetchFn,
  base: string,
  model: string,
  prompt: string,
  numCtx: number,
): Promise<{ prompt_eval_count?: number }> {
  const res = await fetchFn(`${base}/api/generate`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      model,
      prompt,
      stream: true,
      think: false,
      options: { num_ctx: numCtx, num_predict: 1 },
    }),
  })
  if (!res.ok) throw new Error(`generate HTTP ${res.status}: ${await res.text()}`)
  const lines = (await res.text()).split('\n').filter((line) => line.trim().length > 0)
  const chunks = lines.map((line) => JSON.parse(line) as { error?: string; done?: boolean })
  const failed = chunks.find((chunk) => chunk.error !== undefined)
  if (failed) throw new Error(`generate failed: ${failed.error}`)
  const last = chunks.at(-1)
  if (!last?.done) throw new Error('generate stream ended without a done chunk')
  return last as { prompt_eval_count?: number }
}

/** The error message, with the network cause code appended when fetch has one. */
function attemptError(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error)
  const code = (error as { cause?: { code?: unknown } } | null)?.cause?.code
  return typeof code === 'string' ? `${message} (${code})` : message
}

async function loadedSize(fetchFn: FetchFn, base: string, model: string): Promise<number | null> {
  const res = await fetchFn(`${base}/api/ps`)
  if (!res.ok) throw new Error(`ps HTTP ${res.status}`)
  const body = (await res.json()) as { models?: { name?: string; model?: string; size?: number }[] }
  const entry = body.models?.find((m) => m.name === model || m.model === model)
  return typeof entry?.size === 'number' ? entry.size : null
}

/**
 * Finds the largest context size (tried descending) that loads, keeps the model under 40 GiB,
 * and reports at least 29k prompt tokens for a ~30k-token prompt. Writes the probe as JSON.
 */
export async function probeContext(o: ProbeOptions): Promise<{
  model: ModelId
  numCtx: number | null
  file: string
}> {
  const profile = MODEL_PROFILES[o.model]
  if (profile.provider !== 'ollama') throw new Error(`${o.model} does not run on Ollama`)
  const fetchFn = o.fetch ?? ollamaTransport
  const base = (o.baseUrl ?? process.env.OLLAMA_BASE_URL ?? 'http://127.0.0.1:11434').replace(
    /\/$/,
    '',
  )
  const sizes = [...(o.sizes ?? [131072, 65536, 32768])].sort((a, b) => b - a)
  const attempts: ProbeAttempt[] = []
  let chosen: number | null = null

  for (const numCtx of sizes) {
    const attempt: ProbeAttempt = {
      numCtx,
      sizeBytes: null,
      longPromptEvalCount: null,
      error: null,
    }
    attempts.push(attempt)
    try {
      await ollamaGenerate(fetchFn, base, profile.model, 'Reply with OK.', numCtx)
      attempt.sizeBytes = await loadedSize(fetchFn, base, profile.model)
      if (attempt.sizeBytes === null) {
        attempt.error = 'model not listed in /api/ps'
        continue
      }
      if (attempt.sizeBytes > MAX_CTX_BYTES) {
        attempt.error = 'loaded size is over 40 GiB'
        continue
      }
      const long = await ollamaGenerate(
        fetchFn,
        base,
        profile.model,
        'word '.repeat(PROBE_PROMPT_TOKENS),
        numCtx,
      )
      attempt.longPromptEvalCount = long.prompt_eval_count ?? 0
      if (attempt.longPromptEvalCount < PROBE_MIN_PROMPT_EVAL) {
        attempt.error = `prompt_eval_count ${attempt.longPromptEvalCount} is below ${PROBE_MIN_PROMPT_EVAL}`
        continue
      }
      chosen = numCtx
      break
    } catch (error) {
      attempt.error = attemptError(error)
    }
  }

  const outDir = path.resolve(o.outDir ?? RESULTS_DIR)
  mkdirSync(outDir, { recursive: true })
  const file = path.join(outDir, `ctx-probe-${o.model}.json`)
  writeFileSync(
    file,
    `${JSON.stringify(
      { model: o.model, ollamaModel: profile.model, chosenNumCtx: chosen, attempts },
      null,
      2,
    )}\n`,
  )
  return { model: o.model, numCtx: chosen, file }
}

type Flags = Record<string, string | true>

function parseFlags(args: string[]): Flags {
  const flags: Flags = {}
  for (let i = 0; i < args.length; i++) {
    const arg = args[i] as string
    if (!arg.startsWith('--')) throw new Error(`unexpected argument: ${arg}`)
    const name = arg.slice(2)
    const next = args[i + 1]
    if (next === undefined || next.startsWith('--')) {
      flags[name] = true
    } else {
      flags[name] = next
      i++
    }
  }
  return flags
}

function stringFlag(flags: Flags, name: string): string {
  const value = flags[name]
  if (typeof value !== 'string') throw new Error(`missing --${name}`)
  return value
}

function optionalNumber(flags: Flags, name: string): number | undefined {
  const value = flags[name]
  if (value === undefined) return undefined
  if (typeof value !== 'string' || !/^\d+$/.test(value))
    throw new Error(`--${name} must be a number`)
  return Number(value)
}

function optionalSizes(flags: Flags): number[] | undefined {
  const value = flags.sizes
  if (value === undefined) return undefined
  if (typeof value !== 'string') throw new Error('--sizes needs a comma-separated list')
  return value.split(',').map((item) => positiveInt(Number(item), 'sizes'))
}

async function dispatch(command: string | undefined, flags: Flags): Promise<unknown> {
  switch (command) {
    case 'init':
      return initRun({
        model: stringFlag(flags, 'model'),
        lang: stringFlag(flags, 'lang'),
        chapters: optionalNumber(flags, 'chapters'),
        questions: optionalNumber(flags, 'questions'),
        dir: typeof flags.dir === 'string' ? flags.dir : undefined,
      })
    case 'advance':
      return advanceRun(path.resolve(stringFlag(flags, 'dir')), {
        maxSeconds: optionalNumber(flags, 'max-seconds'),
        fakeAuthor: flags['fake-author'] === true,
      })
    case 'worker': {
      if (existsSync('.env.local')) process.loadEnvFile('.env.local')
      return runWorker(path.resolve(stringFlag(flags, 'dir')), {
        fakeAuthor: flags['fake-author'] === true,
      })
    }
    case 'status':
      return runStatus({
        dir: typeof flags.dir === 'string' ? flags.dir : undefined,
        all: flags.all === true,
      })
    case 'probe-ctx':
      return probeContext({
        model: parseModel(stringFlag(flags, 'model')),
        sizes: optionalSizes(flags),
      })
    default:
      throw new Error(
        `usage: eval:novel init|advance|worker|status|probe-ctx (got ${command ?? 'nothing'})`,
      )
  }
}

/** Runs one command and prints its single JSON line. Returns the process exit code. */
export async function main(argv: string[]): Promise<number> {
  try {
    const [command, ...rest] = argv
    const result = await dispatch(command, parseFlags(rest))
    console.log(JSON.stringify(result))
    return 0
  } catch (error) {
    console.log(JSON.stringify({ error: error instanceof Error ? error.message : String(error) }))
    return 1
  }
}

function isEntry(): boolean {
  const entry = process.argv[1]
  if (!entry) return false
  try {
    return realpathSync(entry) === realpathSync(CLI_PATH)
  } catch {
    return false
  }
}

if (isEntry()) {
  main(process.argv.slice(2)).then((code) => {
    process.exitCode = code
  })
}
