import { mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import type { HelperThink, ModelId } from './models'
import type { InterviewTurnStat } from './metrics-interview'
import type { DraftPlanCard } from '@/lib/draft-plan'

// Run config and resumable progress for one novel eval run. Both files live in the run directory.

export type RunConfig = {
  runId: string
  modelId: ModelId
  lang: 'ko' | 'en'
  chapters: number
  questions: number
  maxDraftAttempts: number
  createdAt: string
  commit: string
  /** Think level for helper tasks (compare runs only). Absent means the profile's own think. */
  helperThink?: HelperThink
  /** Send the task's own maxTokens (compare runs only). Absent means the profile floor applies. */
  productLimits?: boolean
  /** The task's own effort and maxTokens are sent, as the product sends them (`--deploy-settings`). Absent means off. */
  deploySettings?: boolean
  /** Speech feature on for this run, with its bible copy (compare runs only). Absent means off. */
  speech?: boolean
  /** Two-step draft and scene rewrite also on a cloud profile (compare runs only). Absent means the profile's default. */
  twoStep?: boolean
  /** Chapter 1's instructions get the planted author directives, and their kept/broken counts are measured (`--directives on`). Absent means off. */
  directives?: boolean
  /** Chapter instructions are only the first sentence and the draft review gets no mustInclude list (`--few-instructions`). Absent means off. */
  fewInstructions?: boolean
  /** No plan card: the draft is written at once, as before stage 1 (`--quick`). Absent means off. */
  quick?: boolean
  /** Comparison only: `scenes` writes one call per scene (`--draft-mode scenes`). Absent means `single`. */
  draftMode?: 'single' | 'scenes'
  /** A short draft is filled by the append continuation instead of scene expansion (`--length-mode continue`). Absent means expand. */
  lengthMode?: 'continue'
}

export type RunStatus =
  'new' | 'running' | 'pending' | 'done' | 'paused-limit' | 'paused-error' | 'blocked'

export type DraftAttempt = {
  runId: string
  usable: boolean | null
  quality: number | null
  reason: string
  /** Foreign-script repair of the attempt's draft (track C). Optional, so older state files load. */
  foreign?: { found: number; replaced: number; unresolved: number }
}

export type RunData = {
  userId?: string
  workId?: string
  sessionId?: string
  asked: number
  openTurnId?: string
  turnProposalIds?: string[]
  chapterIds: Record<number, string>
  drafts: Record<number, DraftAttempt[]>
  /** Idempotency markers, e.g. 'ch1:chapter-created'. */
  marks: Record<string, true>
  styleProposalIds?: string[]
  /** Ids of proposals returned by runChapterCheck for chapter n; read by the ch{n}:proposals step. */
  checkProposalIds?: Record<number, string[]>
  focusCounts: Record<string, number>
  /** One entry per answered or skipped interview turn; optional so state files from before resume. */
  interviewTurns?: InterviewTurnStat[]
  /**
   * The approved plan card of chapter n, with the run id of the plan call and the author's notes
   * (few-instruction runs). Optional so state files from before stage 1 load.
   */
  plans?: Record<number, { runId: string; card: DraftPlanCard; notes: string[] }>
}

export type RunState = {
  status: RunStatus
  cursor: number
  plan: string[]
  data: RunData
  pauses: Record<string, number>
  retried: Record<string, number>
  failed: { step: string; message: string }[]
  message: string | null
  nextSeq: number
  updatedAt: string
}

const CONFIG_FILE = 'config.json'
const STATE_FILE = 'state.json'

export function buildPlan(c: Pick<RunConfig, 'chapters'>): string[] {
  const plan = ['setup', 'interview']
  for (let n = 1; n <= c.chapters; n++) {
    if (n >= 2) plan.push(`ch${n}:advice`)
    plan.push(
      `ch${n}:draft`,
      `ch${n}:proofread`,
      `ch${n}:check`,
      `ch${n}:continuity`,
      `ch${n}:proposals`,
    )
    if (n === 2) plan.push('style:suggest', 'style:review')
    plan.push(`ch${n}:reader`)
  }
  plan.push('finish')
  return plan
}

export function newState(c: RunConfig): RunState {
  return {
    status: 'new',
    cursor: 0,
    plan: buildPlan(c),
    data: {
      asked: 0,
      chapterIds: {},
      drafts: {},
      marks: {},
      focusCounts: {},
    },
    pauses: {},
    retried: {},
    failed: [],
    message: null,
    nextSeq: 0,
    updatedAt: new Date().toISOString(),
  }
}

export function loadConfig(dir: string): RunConfig {
  return JSON.parse(readFileSync(path.join(dir, CONFIG_FILE), 'utf8')) as RunConfig
}

export function saveConfig(dir: string, c: RunConfig): void {
  writeJson(dir, CONFIG_FILE, c)
}

export function loadState(dir: string): RunState {
  return JSON.parse(readFileSync(path.join(dir, STATE_FILE), 'utf8')) as RunState
}

/** Writes to a tmp file and renames it, so an interrupted save never leaves a half-written state. */
export function saveState(dir: string, s: RunState): void {
  writeJson(dir, STATE_FILE, s)
}

function writeJson(dir: string, name: string, value: unknown): void {
  mkdirSync(dir, { recursive: true })
  const target = path.join(dir, name)
  const tmp = `${target}.tmp`
  writeFileSync(tmp, `${JSON.stringify(value, null, 2)}\n`)
  renameSync(tmp, target)
}
