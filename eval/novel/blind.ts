import {
  cpSync,
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from 'node:fs'
import path from 'node:path'
import type { CallRecord } from './eval-client'
import { MODEL_PROFILES } from './models'
import { loadConfig } from './state'
import { SECOND_REVIEW_FILE } from './review-verdict'

// Blinded copy of one finished run, for the reviewer. The reviewer must not learn which model
// produced the run, so every model name, provider word and profile fingerprint is masked or dropped
// in the copy. The stored run is never changed.

export const BLIND_LABEL = '[masked]' as const

export type BlindedCall = Omit<
  CallRecord,
  | 'model'
  | 'effortRequested'
  | 'maxTokens'
  | 'productTimeoutMs'
  | 'speed'
  | 'thinkRequested'
  | 'retryBudget'
  | 'power'
  | 'ollama'
> & { model: typeof BLIND_LABEL }

const VARIANT_SUFFIX = /-(mlx|gguf)$/

function escapeRegExp(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

/** Every spelling a model id can take: the id, the API or Ollama name, and the base Ollama tag. */
export function modelNeedles(): string[] {
  const needles = new Set<string>()
  for (const profile of Object.values(MODEL_PROFILES)) {
    if (profile.id === 'fake') continue
    needles.add(profile.id)
    needles.add(profile.model)
    needles.add(profile.id.replace(/\./g, '-'))
    // Ollama prints the base tag (qwen3.8:27b), not the -mlx or -gguf variant.
    needles.add(profile.model.replace(VARIANT_SUFFIX, ''))
  }
  // Longest first, so a longer name is masked whole before a shorter part of it.
  return [...needles].sort((a, b) => b.length - a.length || a.localeCompare(b))
}

const MODEL_PATTERN = new RegExp(modelNeedles().map(escapeRegExp).join('|'), 'gi')
const PROVIDER_PATTERN = /ollama|opencode/gi
// Claude followed by a version (Claude v1.3) is a literature citation in the criteria doc, not a model.
const BRAND_PATTERN =
  /(?<![A-Za-z])(?:Claude(?!\s+v\d)|Anthropic|Qwen|EXAONE|Sonnet|Opus|Haiku|gpt-oss)(?![A-Za-z])/gi
const REFERENCE_PATTERN =
  /(?<![A-Za-z])(?:Haiku|Luna|Sonnet|Opus|Qwen|EXAONE|gpt-oss)(?![A-Za-z])/gi
const REFERENCE_LABEL = '[모델]'

/** Replaces every model id, tag and base tag (any case) with the label. */
export function maskModelNames(text: string): string {
  return text.replace(MODEL_PATTERN, BLIND_LABEL)
}

/** Replaces the provider words ollama and opencode (any case). */
export function maskProviderNames(text: string): string {
  return text.replace(PROVIDER_PATTERN, BLIND_LABEL)
}

/** Replaces brand words that a model may use to name itself in output. */
export function maskBrandWords(text: string): string {
  return text.replace(BRAND_PATTERN, BLIND_LABEL)
}

/** Masks everything that is operational text: model ids, provider words and brand words. */
export function maskOperationalText(text: string): string {
  return maskBrandWords(maskProviderNames(maskModelNames(text)))
}

/** Masks a reference doc: operational masking, plus Luna (a model name that is also a character name elsewhere). */
export function maskReferenceText(text: string): string {
  return maskOperationalText(text).replace(REFERENCE_PATTERN, REFERENCE_LABEL)
}

/** Deep-masks every string (values and keys) in a JSON-shaped value. Returns a new value. */
function maskDeep(value: unknown): unknown {
  if (typeof value === 'string') return maskOperationalText(value)
  if (Array.isArray(value)) return value.map(maskDeep)
  if (value !== null && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value).map(([key, item]) => [maskOperationalText(key), maskDeep(item)]),
    )
  }
  return value
}

/**
 * One call record for the reviewer. The model field is replaced by the label, the profile
 * fingerprints (effort, think, token cap, timeout, speed), the machine power state and the Ollama
 * attempt block are dropped, and every string is masked.
 * wouldTimeOut stays, because the operations score needs it. The input is not changed.
 */
export function blindCallRecord(call: CallRecord): BlindedCall {
  // The ollama key is removed before masking: maskDeep masks keys too, so "ollama" would become
  // "[masked]" and its attempt timings would stay in the copy.
  const copy: Partial<CallRecord> = { ...call }
  delete copy.ollama
  const masked = maskDeep(copy) as Record<string, unknown>
  delete masked.effortRequested
  delete masked.effortRule
  delete masked.thinkRequested
  delete masked.retryBudget
  delete masked.maxTokens
  delete masked.productTimeoutMs
  delete masked.speed
  delete masked.power
  return { ...masked, model: BLIND_LABEL } as BlindedCall
}

/** Any state or log JSON: every string masked. */
export function blindJson(value: unknown): unknown {
  return maskDeep(value)
}

/**
 * The run summary without its speed and power blocks (speed is the profile fingerprint the reviewer
 * must not see; power only exists on local runs).
 */
export function blindRunSummary(summary: unknown): unknown {
  const masked = maskDeep(summary) as Record<string, unknown>
  delete masked.speed
  delete masked.power
  return masked
}

/** Where the blinded copy of a run goes: the sibling blind/ folder with the same run name. */
export function defaultBlindDir(runDir: string): string {
  return path.join(path.dirname(runDir), 'blind', path.basename(runDir))
}

/**
 * Where the second reviewer's blinded copy goes: blind-2/ beside blind/, same run name. It is a
 * separate folder so building it never removes the first reviewer's copy and review.md.
 */
export function secondBlindDir(runDir: string): string {
  return path.join(path.dirname(runDir), 'blind-2', path.basename(runDir))
}

const CRITERIA_DOC = 'docs/eval/novel-quality-criteria.md'
const SPEC_DOC = 'docs/superpowers/specs/2026-10-18-lightweight-model-novel-eval-design.md'

function jsonText(value: unknown): string {
  return `${JSON.stringify(value, null, 2)}\n`
}

/** Every file under root/rel, as paths relative to root with '/' separators, sorted. */
function listFiles(root: string, rel = ''): string[] {
  const abs = path.join(root, rel)
  if (!existsSync(abs)) return []
  return readdirSync(abs, { withFileTypes: true })
    .flatMap((entry) => {
      const child = rel === '' ? entry.name : `${rel}/${entry.name}`
      return entry.isDirectory() ? listFiles(root, child) : [child]
    })
    .sort()
}

/** True when child is parent itself or inside it. */
function isWithin(child: string, parent: string): boolean {
  const rel = path.relative(parent, child)
  return rel === '' || (rel !== '..' && !rel.startsWith(`..${path.sep}`) && !path.isAbsolute(rel))
}

function readRequired(file: string): string {
  if (!existsSync(file)) throw new Error(`missing blind source: ${file}`)
  return readFileSync(file, 'utf8')
}

/** Spec section 9, from its heading up to (not including) the heading of section 10. */
function specSectionNine(spec: string): string {
  const lines = spec.split('\n')
  const start = lines.findIndex((line) => line.startsWith('## 9.'))
  const end = lines.findIndex((line, index) => index > start && line.startsWith('## 10.'))
  if (start < 0 || end < 0) throw new Error('spec section 9 not found')
  return lines.slice(start, end).join('\n')
}

/** Text for one file of the copy: .json through blindJson (falls back to text masking), other text through masking. */
function blindText(file: string, text: string): string {
  if (!file.endsWith('.json')) return maskOperationalText(text)
  try {
    return jsonText(blindJson(JSON.parse(text)))
  } catch {
    return maskOperationalText(text)
  }
}

/**
 * Builds the reviewer's copy of a run. Only an allow-list is copied (chapters, metrics, reader,
 * calls, summary, state, log, two docs), and every file except chapters is masked. Rebuilds from
 * scratch, so an old copy (and its review.md) is removed first.
 */
export function writeBlindCopy(
  runDir: string,
  opts: { out?: string; repoRoot?: string } = {},
): { dir: string; files: number } {
  const run = path.resolve(runDir)
  if (!existsSync(path.join(run, 'config.json'))) throw new Error(`not a run dir: ${run}`)
  const out = path.resolve(opts.out ?? defaultBlindDir(run))
  if (isWithin(out, run) || isWithin(run, out)) throw new Error(`unsafe blind output dir: ${out}`)

  // Read the reference docs before the old copy is removed, so a missing doc leaves it in place.
  const repoRoot = path.resolve(opts.repoRoot ?? process.cwd())
  const criteria = maskReferenceText(readRequired(path.join(repoRoot, CRITERIA_DOC)))
  const section = maskReferenceText(specSectionNine(readRequired(path.join(repoRoot, SPEC_DOC))))

  rmSync(out, { recursive: true, force: true })
  mkdirSync(out, { recursive: true })
  const write = (rel: string, text: string): void => {
    mkdirSync(path.dirname(path.join(out, rel)), { recursive: true })
    writeFileSync(path.join(out, rel), text)
  }

  if (existsSync(path.join(run, 'chapters'))) {
    cpSync(path.join(run, 'chapters'), path.join(out, 'chapters'), { recursive: true })
  }
  for (const rel of ['metrics', 'reader']) {
    for (const file of listFiles(run, rel)) {
      write(file, blindText(file, readFileSync(path.join(run, file), 'utf8')))
    }
  }
  for (const file of ['author-decisions.jsonl', 'wiki-final.json', 'worker.log']) {
    if (existsSync(path.join(run, file))) {
      write(file, blindText(file, readFileSync(path.join(run, file), 'utf8')))
    }
  }
  for (const file of listFiles(run, 'calls').filter((name) => name.endsWith('.json'))) {
    const call = JSON.parse(readFileSync(path.join(run, file), 'utf8')) as CallRecord
    write(file, jsonText(blindCallRecord(call)))
  }
  if (existsSync(path.join(run, 'run-summary.json'))) {
    const summary = JSON.parse(readFileSync(path.join(run, 'run-summary.json'), 'utf8'))
    write('run-summary.json', jsonText(blindRunSummary(summary)))
  }
  if (existsSync(path.join(run, 'state.json'))) {
    write('state.json', blindText('state.json', readFileSync(path.join(run, 'state.json'), 'utf8')))
  }
  write('reference/criteria.md', criteria)
  write('reference/spec-section-9.md', section)

  const leaks = findLeaks(out)
  if (leaks.length > 0) throw new Error(`model name left in blind copy: ${leaks.join(', ')}`)
  return { dir: out, files: listFiles(out).length }
}

/**
 * Files in a blinded copy that still hold a model name, provider word or brand word, sorted.
 * chapters/ (story text) and review.md (the reviewer's own output) are not checked.
 */
export function findLeaks(blindDir: string): string[] {
  return listFiles(blindDir)
    .filter((rel) => rel !== 'review.md' && !rel.startsWith('chapters/'))
    .filter((rel) => {
      const text = readFileSync(path.join(blindDir, rel), 'utf8')
      const masked = rel.startsWith('reference/')
        ? maskReferenceText(text)
        : maskOperationalText(text)
      return masked !== text
    })
    .sort()
}

/**
 * Writes the review to docs (header line first), then to the run dir. The model id is read from the
 * real run's config.json; the blind dir has none. The docs file is written first, so a failed docs
 * write leaves no run-dir review that would make the next invocation skip the review.
 * With second, the blind dir is blind-2/, the run-side file is review-2.md, and the header gets a
 * "검토: 2" part, so the second review is never mistaken for the first.
 */
export function publishReview(
  runDir: string,
  docsPath: string,
  opts: { blindDir?: string; second?: boolean } = {},
): { docsPath: string; runReviewPath: string } {
  const run = path.resolve(runDir)
  const second = opts.second === true
  const defaultDir = second ? secondBlindDir(run) : defaultBlindDir(run)
  const blindReview = path.join(path.resolve(opts.blindDir ?? defaultDir), 'review.md')
  if (!existsSync(blindReview)) {
    throw new Error(`review.md missing in blind dir: ${path.dirname(blindReview)}`)
  }
  const config = loadConfig(run)
  const header =
    config.lang === 'ko'
      ? `모델: ${config.modelId} | 언어: ${config.lang}`
      : `Model: ${config.modelId} | Language: ${config.lang}`
  const reviewPart = second ? (config.lang === 'ko' ? ' | 검토: 2' : ' | Review: 2') : ''
  const text = `${header}${reviewPart}\n\n${readFileSync(blindReview, 'utf8')}`

  const docs = path.resolve(docsPath)
  mkdirSync(path.dirname(docs), { recursive: true })
  writeFileSync(docs, text)
  const runReviewPath = path.join(run, second ? SECOND_REVIEW_FILE : 'review.md')
  writeFileSync(runReviewPath, text)
  return { docsPath: docs, runReviewPath }
}
