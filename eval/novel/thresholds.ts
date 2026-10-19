// Read-only replay of the provisional guard thresholds on saved eval runs. Nothing here calls a
// model or writes to a run folder. The sweeps score hand labels (thresholds-labels.ts) against
// the detectors at each grid value; decide() applies the fixed rule from spec section 4.

import { existsSync, readFileSync, readdirSync } from 'node:fs'
import path from 'node:path'
import { z } from 'zod'
import { type Lang, isNearDuplicateFact, sampleCopies } from '@/ai/guards'
import { splitSentences } from '@/lib/korean/sentences'
import { SAMPLE_COPY_THRESHOLD, countRepeatedWords } from '@/lib/korean/style-copy'
import { loadBible } from './bible'
import { bibleExempt } from './metrics'
import type { CopyLabel, DupLabel, RepeatLabel } from './thresholds-labels'

/** A change needs at least this many more labeled hits caught (spec section 4 rule). */
export const MIN_GAIN = 3
/** DEFAULT_BUDGET_CHARS of the code that made the saved runs (no keepNamed there). */
export const OLD_BUDGET_CHARS = 12_000
/** sampleCopies' default minContainment; the function has no export for it. */
export const GUARD_MIN_CONTAINMENT = 0.5

const EPSILON = 1e-9

export type RunEvidence = {
  name: string
  lang: Lang
  chapterTexts: string[]
  styleExamples: string[]
  cards: { name: string; facts: string[] }[]
  packs: { step: string; wikiChars: number; cardsInPack: number }[]
  exempt: string[]
}

export type SweepPoint = { value: number; caught: number; wrong: number; unlabeled: number }
export type SweepId = 'repeat' | 'copy-dice' | 'copy-containment' | 'dup'
export type Sweep = {
  id: SweepId
  current: number
  positives: number
  negatives: number
  points: SweepPoint[]
}
export type Decision = {
  id: SweepId
  current: number
  chosen: number
  changed: boolean
  reason: string
}
export type PackRow = {
  run: string
  step: string
  wikiChars: number
  cardsInPack: number
  cardsInWiki: number
}

const ConfigSchema = z.object({ modelId: z.string().optional(), lang: z.string() })

// Tolerant: unknown keys are dropped by zod; missing arrays read as empty.
const WikiSchema = z.object({
  entries: z
    .array(
      z.object({
        name: z.string(),
        archivedAt: z.string().nullish(),
        facts: z
          .array(z.object({ content: z.string(), archivedAt: z.string().nullish() }))
          .optional(),
      }),
    )
    .optional(),
  styleCards: z
    .array(z.object({ archivedAt: z.string().nullish(), examples: z.string().nullish() }))
    .optional(),
})

const CallSchema = z.object({
  task: z.string().optional(),
  step: z.string().optional(),
  error: z.unknown().optional(),
  prompt: z.string().optional(),
})

const WIKI_OPEN = '<wiki>'
const WIKI_CLOSE = '</wiki>'

/** Reads one saved run folder. Read-only: no file is created, changed or deleted. */
export function loadRunEvidence(dir: string): RunEvidence {
  const configPath = path.join(dir, 'config.json')
  if (!existsSync(configPath)) throw new Error(`not a run folder: ${dir}`)
  const config = ConfigSchema.parse(JSON.parse(readFileSync(configPath, 'utf8')))
  if (config.lang !== 'ko' && config.lang !== 'en') {
    throw new Error(`unsupported lang in ${dir}: ${config.lang}`)
  }
  const lang: Lang = config.lang

  const chapterTexts = listFiles(path.join(dir, 'chapters'), /^\d{2}\.md$/).map((file) =>
    readFileSync(path.join(dir, 'chapters', file), 'utf8').trim(),
  )

  const wikiPath = path.join(dir, 'wiki-final.json')
  const wiki = existsSync(wikiPath)
    ? WikiSchema.parse(JSON.parse(readFileSync(wikiPath, 'utf8')))
    : { entries: [], styleCards: [] }

  const cards = (wiki.entries ?? [])
    .filter((entry) => !entry.archivedAt)
    .map((entry) => ({
      name: entry.name,
      facts: (entry.facts ?? []).filter((fact) => !fact.archivedAt).map((fact) => fact.content),
    }))

  const styleExamples = (wiki.styleCards ?? [])
    .filter((card) => !card.archivedAt)
    .map((card) => (card.examples ?? '').trim())
    .filter((examples) => examples !== '')

  const callsDir = path.join(dir, 'calls')
  const packs = listFiles(callsDir, /-continuity-check\.json$/).flatMap((file) => {
    const call = CallSchema.parse(JSON.parse(readFileSync(path.join(callsDir, file), 'utf8')))
    if (call.task !== 'continuity-check' || call.error != null) return []
    const prompt = call.prompt ?? ''
    const open = prompt.indexOf(WIKI_OPEN)
    const close = prompt.indexOf(WIKI_CLOSE)
    if (open < 0 || close < open) return []
    const block = prompt.slice(open, close + WIKI_CLOSE.length)
    const cardsInPack = block.split('\n').filter((line) => /^\[E\d+\] /.test(line)).length
    return [{ step: call.step ?? '', wikiChars: block.length, cardsInPack }]
  })

  return {
    name: path.basename(dir),
    lang,
    chapterTexts,
    styleExamples,
    cards,
    packs,
    exempt: bibleExempt(loadBible(lang)),
  }
}

function listFiles(dir: string, pattern: RegExp): string[] {
  if (!existsSync(dir)) return []
  return readdirSync(dir)
    .filter((name) => pattern.test(name))
    .sort()
}

/** Sample-copy hit texts for one text at the given Dice and containment. */
export function copyHits(
  text: string,
  examples: readonly string[],
  lang: Lang,
  dice: number,
  containment: number,
): string[] {
  return sampleCopies(text, [...examples], {
    lang,
    threshold: dice,
    minContainment: containment,
  }).map((hit) => hit.text)
}

function grid(values: readonly number[], current: number): number[] {
  return [...new Set([...values, current])].sort((a, b) => a - b)
}

function assertRunsLoaded(runs: readonly RunEvidence[], labelRuns: readonly string[]): void {
  const names = new Set(runs.map((run) => run.name))
  for (const run of labelRuns) {
    if (!names.has(run)) throw new Error(`label run not loaded: ${run}`)
  }
}

/** Repeated-word sweep: a flag label is caught when any of its words is flagged. */
export function repeatSweep(
  runs: readonly RunEvidence[],
  labels: readonly RepeatLabel[],
  values: readonly number[],
  current: number,
): Sweep {
  assertRunsLoaded(
    runs,
    labels.map((label) => label.run),
  )
  const points = grid(values, current).map((value): SweepPoint => {
    const flagged = new Map<string, Set<string>>()
    for (const run of runs) {
      const words = new Set<string>()
      for (const text of run.chapterTexts) {
        for (const hit of countRepeatedWords(text, {
          lang: run.lang,
          minCount: value,
          exempt: run.exempt,
        })) {
          words.add(hit.word)
        }
      }
      flagged.set(run.name, words)
    }

    let caught = 0
    let wrong = 0
    for (const label of labels) {
      const words = flagged.get(label.run) ?? new Set<string>()
      const hit = label.words.some((word) => words.has(word))
      if (hit && label.expect === 'flag') caught++
      if (hit && label.expect === 'ignore') wrong++
    }

    let unlabeled = 0
    for (const [run, words] of flagged) {
      for (const word of words) {
        if (!labels.some((label) => label.run === run && label.words.includes(word))) unlabeled++
      }
    }
    return { value, caught, wrong, unlabeled }
  })

  return {
    id: 'repeat',
    current,
    positives: labels.filter((label) => label.expect === 'flag').length,
    negatives: labels.filter((label) => label.expect === 'ignore').length,
    points,
  }
}

/**
 * Sample-copy sweep on one axis. `dice` varies Dice with containment fixed at the guard default;
 * `containment` varies containment with Dice fixed at the production threshold.
 */
export function copySweep(
  runs: readonly RunEvidence[],
  labels: readonly CopyLabel[],
  axis: 'dice' | 'containment',
  values: readonly number[],
  current: number,
): Sweep {
  assertRunsLoaded(
    runs,
    labels.map((label) => label.run),
  )
  for (const label of labels) {
    const run = runs.find((r) => r.name === label.run)
    const found = run?.chapterTexts.some((text) =>
      splitSentences(text).some((s) => s.text.startsWith(label.sentence)),
    )
    if (!found) throw new Error(`copy label not found in ${label.run}: ${label.sentence}`)
  }

  const points = grid(values, current).map((value): SweepPoint => {
    const dice = axis === 'dice' ? value : SAMPLE_COPY_THRESHOLD
    const containment = axis === 'containment' ? value : GUARD_MIN_CONTAINMENT

    let caught = 0
    let unlabeled = 0
    for (const run of runs) {
      const hits = run.chapterTexts.flatMap((text) =>
        copyHits(text, run.styleExamples, run.lang, dice, containment),
      )
      const runLabels = labels.filter((label) => label.run === run.name)
      caught += runLabels.filter((label) => hits.some((h) => h.startsWith(label.sentence))).length
      unlabeled += hits.filter(
        (hit) => !runLabels.some((label) => hit.startsWith(label.sentence)),
      ).length
    }
    return { value, caught, wrong: 0, unlabeled }
  })

  return {
    id: axis === 'dice' ? 'copy-dice' : 'copy-containment',
    current,
    positives: labels.length,
    negatives: 0,
    points,
  }
}

/** Two facts of one card, as an order-free key. */
function pairKey(run: string, x: string, y: string): string {
  return `${run}\u0000${[x, y].sort().join('\u0000')}`
}

/** Resolves a label to its one pair: exactly one card holds one fact per prefix. */
function resolveDup(run: RunEvidence, label: DupLabel): [string, string] {
  const found: [string, string][] = []
  for (const card of run.cards) {
    const as = card.facts.filter((fact) => fact.startsWith(label.a))
    const bs = card.facts.filter((fact) => fact.startsWith(label.b))
    if (as.length === 1 && bs.length === 1 && as[0] !== bs[0]) {
      found.push([as[0] as string, bs[0] as string])
    }
  }
  if (found.length !== 1) {
    throw new Error(`dup label not resolved in ${run.name}: ${label.a} | ${label.b}`)
  }
  return found[0] as [string, string]
}

/** Fact-pair sweep over every pair inside each card. `soft` pairs are skipped on both sides. */
export function dupSweep(
  runs: readonly RunEvidence[],
  labels: readonly DupLabel[],
  values: readonly number[],
  current: number,
): Sweep {
  assertRunsLoaded(
    runs,
    labels.map((label) => label.run),
  )
  const dupKeys: { key: string; pair: [string, string] }[] = []
  const softKeys = new Set<string>()
  for (const label of labels) {
    const run = runs.find((r) => r.name === label.run) as RunEvidence
    const [x, y] = resolveDup(run, label)
    const key = pairKey(run.name, x, y)
    if (label.kind === 'dup') dupKeys.push({ key, pair: [x, y] })
    else softKeys.add(key)
  }

  const universe: { run: string; x: string; y: string; key: string }[] = []
  for (const run of runs) {
    for (const card of run.cards) {
      for (let i = 0; i < card.facts.length; i++) {
        for (let j = i + 1; j < card.facts.length; j++) {
          const x = card.facts[i] as string
          const y = card.facts[j] as string
          universe.push({ run: run.name, x, y, key: pairKey(run.name, x, y) })
        }
      }
    }
  }

  const points = grid(values, current).map((value): SweepPoint => {
    let caught = 0
    for (const { pair } of dupKeys) {
      if (isNearDuplicateFact(pair[0], pair[1], value)) caught++
    }
    let unlabeled = 0
    for (const pair of universe) {
      if (softKeys.has(pair.key) || dupKeys.some((d) => d.key === pair.key)) continue
      if (isNearDuplicateFact(pair.x, pair.y, value)) unlabeled++
    }
    return { value, caught, wrong: 0, unlabeled }
  })

  return {
    id: 'dup',
    current,
    positives: dupKeys.length,
    negatives: 0,
    points,
  }
}

/**
 * The fixed rule (spec section 4): the nearest value that gains at least `minGain` caught labels
 * without adding wrong or unlabeled flags. Otherwise the current value is kept.
 */
export function decide(sweep: Sweep, minGain: number = MIN_GAIN): Decision {
  const base = sweep.points.find((p) => Math.abs(p.value - sweep.current) < EPSILON)
  if (!base) throw new Error(`no point at the current value ${sweep.current} in ${sweep.id}`)

  const candidates = sweep.points.filter(
    (p) =>
      Math.abs(p.value - sweep.current) >= EPSILON &&
      p.caught - base.caught >= minGain &&
      p.wrong <= base.wrong &&
      p.unlabeled <= base.unlabeled,
  )

  if (candidates.length === 0) {
    return {
      id: sweep.id,
      current: sweep.current,
      chosen: sweep.current,
      changed: false,
      reason: `유지한다: 맞힌 라벨이 ${minGain}개 이상 늘면서 잘못 표시와 라벨 없는 표시가 늘지 않는 값이 없다.`,
    }
  }

  const distance = (p: SweepPoint): number => Math.abs(p.value - sweep.current)
  const best = candidates.reduce((a, b) => {
    if (Math.abs(distance(a) - distance(b)) > EPSILON) return distance(a) < distance(b) ? a : b
    if (a.caught !== b.caught) return a.caught > b.caught ? a : b
    return a.value <= b.value ? a : b
  })

  return {
    id: sweep.id,
    current: sweep.current,
    chosen: best.value,
    changed: true,
    reason: `${best.value}로 바꾼다: 맞힌 라벨 ${base.caught}개 → ${best.caught}개, 잘못 표시 ${base.wrong} → ${best.wrong}, 라벨 없는 표시 ${base.unlabeled} → ${best.unlabeled}.`,
  }
}

/** One row per saved context pack, with the card count of the whole wiki. */
export function packRows(runs: readonly RunEvidence[]): PackRow[] {
  return runs.flatMap((run) =>
    run.packs.map((pack) => ({
      run: run.name,
      step: pack.step,
      wikiChars: pack.wikiChars,
      cardsInPack: pack.cardsInPack,
      cardsInWiki: run.cards.length,
    })),
  )
}

/**
 * H is never changed here. The saved packs can only show whether they came near the old budget;
 * the reason says so.
 */
export function packDecision(rows: readonly PackRow[]): {
  max: number
  touchesOldBudget: boolean
  reason: string
} {
  const max = Math.max(0, ...rows.map((row) => row.wikiChars))
  const touchesOldBudget = max >= 0.9 * OLD_BUDGET_CHARS
  const shown = max.toLocaleString('en-US')
  const reason = touchesOldBudget
    ? `확인이 필요하다: ${shown}자 맥락이 있어 예산에 가깝다.`
    : `유지한다: 저장된 맥락은 모두 ${shown}자 이하라 예산(12,000자)에 닿은 실행이 없다. 이 실행들로는 정할 수 없다.`
  return { max, touchesOldBudget, reason }
}
