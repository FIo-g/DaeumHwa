import { randomUUID } from 'node:crypto'
import { and, eq, sql } from 'drizzle-orm'
import { runAiTask, throwIfCancelled } from '@/ai/run'
import { draftCheckTask, numberScenes } from '@/ai/tasks/draft-check'
import { acceptSceneFix, sceneFixTask } from '@/ai/tasks/scene-fix'
import type { AiClient } from '@/ai/types'
import type { Db } from '@/db/client'
import { aiRuns, chapters } from '@/db/schema'
import type { Actor } from '@/db/types'
import { resolveWorkSettings } from '@/db/types'
import { AppError } from '@/lib/errors'
import { type DiffPart, diffTexts } from '@/lib/diff'
import {
  codeSceneFindings,
  pickScenes,
  REASON_LABELS,
  type SceneFinding,
  type SceneReason,
} from '@/lib/draft-check'
import { draftLengthPlan } from '@/lib/draft-length'
import { renderPlanInstructions, type DraftPlanCard } from '@/lib/draft-plan'
import { splitParagraphs } from '@/lib/korean/paragraphs'
import { sceneSpans, spliceSpans, type SceneRange } from '@/lib/scene'
import { requireWorkRole } from '@/server/access'
import { getLatestPosition } from '@/server/chapters'
import { requestsForText } from '@/server/directives'
import { listEntries } from '@/server/wiki'
import { listFacts } from '@/server/facts'
import { listStyleCards } from '@/server/styles'
import { recordUsageEvent } from '@/server/usage-events'
import { getWork } from '@/server/works'

// Check-and-fix on a finished draft (stage 3, task 4). Free code checks and one cheap AI check
// find the weak scenes, then at most two of them are rewritten once into a candidate the author
// applies or discards in one click. The manuscript is never touched: only the draft run's output
// changes, through the `check` and `sceneFix` keys.

/** The whole check must finish under the route's 300 s limit, with some margin. */
export const CHECK_BUDGET_MS = 280_000
/** A fix call is not started with less time than this left. */
export const MIN_FIX_MS = 20_000

export const CHECK_FAILED_NOTICE = 'AI 점검을 하지 못했습니다. 코드 점검 결과만 보여 드립니다.'

export type DraftCheckResult = {
  findings: SceneFinding[]
  fix: {
    scenes: { scene: number; reasons: SceneReason[] }[]
    parts: DiffPart[]
    token: string
  } | null
  notice: string | null
}

type StoredCheck = { base: string; findings: SceneFinding[]; notice: string | null }
type StoredFix = {
  base: string
  text: string
  scenes: { scene: number; reasons: SceneReason[] }[]
  token: string
}

/**
 * Checks a finished draft run and fixes up to two weak scenes. Editor role. A second call for
 * the same text returns the stored result without new AI calls.
 */
export async function checkAndFixDraft(
  db: Db,
  actor: Actor,
  input: { workId: string; runId: string },
  client?: AiClient,
  signal?: AbortSignal,
  now: () => number = Date.now,
): Promise<DraftCheckResult> {
  const { workId, runId } = input
  const startedAt = now()
  await requireWorkRole(db, workId, actor.userId, 'editor')
  const { run, output, stored } = await loadDraftRun(db, actor, workId, runId)

  const previous = readStoredResult(output, stored)
  if (previous !== null) return previous

  const card = readPlanCard(output.plan)
  const work = await getWork(db, actor, workId)
  const targetChars = resolveWorkSettings(work.settings).targetChars
  const spans = sceneSpans(stored, card?.scenes.length ?? draftLengthPlan(targetChars).sceneCount)

  const requests = await requestsForText(db, workId, { chapterId: run.chapterId, text: stored })
  const characters = await listEntries(db, actor, workId, { kinds: ['character'] })
  const names = Object.fromEntries(characters.map((e) => [e.id, [e.name, ...e.aliases]]))
  const codeFindings = codeSceneFindings(stored, { spans, requests, names, card })

  const instructions = readInstructions(output)
  const position = await draftPosition(db, workId, run.chapterId)
  const hiddenFacts = await hiddenFactContents(db, actor, workId, position)
  const plan = card ? renderPlanInstructions('', card) : null
  const numbered = numberScenes(stored, spans)

  let aiFindings: SceneFinding[] = []
  let notice: string | null = null
  try {
    const remaining = CHECK_BUDGET_MS - (now() - startedAt)
    const { output: checked } = await runAiTask(
      db,
      {
        userId: actor.userId,
        workId,
        chapterId: run.chapterId,
        signal,
        timeoutMs: Math.max(remaining, 1),
      },
      draftCheckTask,
      { numbered, sceneCount: spans.length, plan, instructions, requests, hiddenFacts },
      client,
    )
    throwIfCancelled(signal)
    aiFindings = checked.scenes.flatMap((scene) =>
      scene.reasons.map((reason) => ({
        scene: scene.scene,
        reason: reason.code,
        note: reason.note,
      })),
    )
  } catch (error) {
    if (isCancel(error)) throw error
    aiFindings = []
    notice = CHECK_FAILED_NOTICE
  }

  const findings = [...codeFindings, ...aiFindings]
  const picked = pickScenes(findings)

  try {
    await recordUsageEvent(db, actor, {
      workId,
      chapterId: run.chapterId,
      runId,
      kind: 'check_flagged',
      value: picked.length,
      extra: { findings: findings.length },
    })
  } catch (error) {
    console.warn('usage event check_flagged failed', error)
  }

  const styleCards = (await listStyleCards(db, actor, workId)).map((card) => ({
    name: card.name,
    entryName: card.entryName,
    tone: card.tone,
    rules: card.rules,
    examples: card.examples,
  }))

  const fixed: { span: SceneRange; text: string }[] = []
  const fixedScenes: { scene: number; reasons: SceneReason[] }[] = []
  for (const scene of picked) {
    const remaining = CHECK_BUDGET_MS - (now() - startedAt)
    if (remaining < MIN_FIX_MS) break
    const span = spans[scene - 1]
    if (!span) continue
    const sceneText = stored.slice(span.start, span.end)
    const reasons = findings
      .filter((finding) => finding.scene === scene)
      .map((finding) => ({ label: REASON_LABELS[finding.reason], note: finding.note }))
    if (reasons.length === 0) continue
    try {
      const { output: fixedScene } = await runAiTask(
        db,
        {
          userId: actor.userId,
          workId,
          chapterId: run.chapterId,
          signal,
          timeoutMs: Math.max(remaining, 1),
        },
        sceneFixTask,
        {
          scene: sceneText,
          before: beforeText(stored, spans, scene),
          after: afterText(stored, spans, scene),
          reasons,
          planScene: card?.scenes[scene - 1]?.summary ?? null,
          requests,
          styleCards,
        },
        client,
      )
      throwIfCancelled(signal)
      if (!acceptSceneFix(sceneText, fixedScene.text, requests)) continue
      fixed.push({ span, text: fixedScene.text })
      fixedScenes.push({
        scene,
        reasons: [...new Set(findings.filter((f) => f.scene === scene).map((f) => f.reason))],
      })
    } catch (error) {
      if (isCancel(error)) throw error
      continue
    }
  }

  throwIfCancelled(signal)

  if (fixed.length > 0) {
    const fixedText = spliceSpans(stored, fixed)
    const token = randomUUID()
    const check: StoredCheck = { base: stored, findings, notice }
    const sceneFix: StoredFix = { base: stored, text: fixedText, scenes: fixedScenes, token }
    const written = await updateWhileDraftIs(
      db,
      runId,
      stored,
      sql`jsonb_set(jsonb_set(${aiRuns.output}, '{check}', ${JSON.stringify(check)}::jsonb), '{sceneFix}', ${JSON.stringify(sceneFix)}::jsonb)`,
    )
    if (!written) {
      throw new AppError('BAD_STATE', '초안이 바뀌어 점검 결과를 버렸습니다. 다시 점검해 주세요.')
    }
    return {
      findings,
      fix: { scenes: fixedScenes, parts: diffTexts(stored, fixedText, 'words'), token },
      notice,
    }
  }

  const check: StoredCheck = { base: stored, findings, notice }
  const written = await updateWhileDraftIs(
    db,
    runId,
    stored,
    sql`jsonb_set(${aiRuns.output}, '{check}', ${JSON.stringify(check)}::jsonb)`,
  )
  if (!written) {
    throw new AppError('BAD_STATE', '초안이 바뀌어 점검 결과를 버렸습니다. 다시 점검해 주세요.')
  }
  return { findings, fix: null, notice }
}

/** Promotes the stored candidate to the draft text. Fails when the draft changed since the check. Editor role. */
export async function applySceneFix(
  db: Db,
  actor: Actor,
  input: { workId: string; runId: string; token: string },
): Promise<{ runId: string; text: string }> {
  const { workId, runId } = input
  await requireWorkRole(db, workId, actor.userId, 'editor')
  const { output, stored } = await loadDraftRun(db, actor, workId, runId)

  const candidate = readSceneFix(output.sceneFix)
  if (candidate === null) {
    throw new AppError('BAD_STATE', '고친 안이 없습니다.')
  }
  if (candidate.token !== input.token || candidate.base !== stored) {
    throw new AppError('BAD_STATE', '초안이 바뀌어 적용할 수 없습니다.')
  }

  const updated = await db
    .update(aiRuns)
    .set({
      output: {
        ...withoutSceneFix(output),
        text: candidate.text,
        originalText: typeof output.originalText === 'string' ? output.originalText : stored,
      },
    })
    .where(
      and(
        eq(aiRuns.id, runId),
        sql`${aiRuns.output}->>'text' = ${candidate.base}`,
        sql`${aiRuns.output}->'sceneFix'->>'token' = ${candidate.token}`,
      ),
    )
    .returning({ id: aiRuns.id })
  if (updated.length === 0) {
    throw new AppError('BAD_STATE', '초안이 바뀌어 적용할 수 없습니다.')
  }

  try {
    await recordUsageEvent(db, actor, {
      workId,
      runId,
      kind: 'scene_fix_applied',
      value: candidate.scenes.length,
      extra: {},
    })
  } catch (error) {
    console.warn('usage event scene_fix_applied failed', error)
  }
  return { runId, text: candidate.text }
}

/** Drops the stored candidate without changing the draft text. Editor role. */
export async function discardSceneFix(
  db: Db,
  actor: Actor,
  input: { workId: string; runId: string; token: string },
): Promise<{ runId: string }> {
  const { workId, runId } = input
  await requireWorkRole(db, workId, actor.userId, 'editor')
  const { output } = await loadDraftRun(db, actor, workId, runId)

  const candidate = readSceneFix(output.sceneFix)
  if (candidate === null) return { runId }
  if (candidate.token !== input.token) {
    throw new AppError('BAD_STATE', '초안이 바뀌어 적용할 수 없습니다.')
  }

  await db
    .update(aiRuns)
    .set({ output: withoutSceneFix(output) })
    .where(
      and(eq(aiRuns.id, runId), sql`${aiRuns.output}->'sceneFix'->>'token' = ${candidate.token}`),
    )

  try {
    await recordUsageEvent(db, actor, {
      workId,
      runId,
      kind: 'scene_fix_discarded',
      value: 1,
      extra: {},
    })
  } catch (error) {
    console.warn('usage event scene_fix_discarded failed', error)
  }
  return { runId }
}

/** Loads a finished draft run of the actor. The same checks and messages as draft-refine. */
async function loadDraftRun(db: Db, actor: Actor, workId: string, runId: string) {
  const [run] = await db.select().from(aiRuns).where(eq(aiRuns.id, runId)).limit(1)
  if (
    !run ||
    run.workId !== workId ||
    run.userId !== actor.userId ||
    run.task !== 'draft-chapter'
  ) {
    throw new AppError('NOT_FOUND', '항목을 찾을 수 없습니다.')
  }
  if (run.status !== 'done') {
    throw new AppError('BAD_STATE', '초안 작성이 끝난 뒤에 점검할 수 있습니다.')
  }
  const stored = draftText(run.output)
  if (stored === null) throw new AppError('BAD_STATE', '저장된 초안을 읽을 수 없습니다.')
  return { run, output: run.output as Record<string, unknown>, stored }
}

function draftText(output: unknown): string | null {
  if (typeof output === 'object' && output !== null && 'text' in output) {
    const text = (output as { text: unknown }).text
    if (typeof text === 'string') return text
  }
  return null
}

/** The stored result when the draft has not changed since the check, or null for a fresh check. */
function readStoredResult(
  output: Record<string, unknown>,
  stored: string,
): DraftCheckResult | null {
  const check = readCheck(output.check)
  if (check === null || check.base !== stored) return null
  const fix = readSceneFix(output.sceneFix)
  if (fix === null || fix.base !== stored) {
    return { findings: check.findings, fix: null, notice: check.notice }
  }
  return {
    findings: check.findings,
    fix: { scenes: fix.scenes, parts: diffTexts(stored, fix.text, 'words'), token: fix.token },
    notice: check.notice,
  }
}

function readCheck(value: unknown): StoredCheck | null {
  if (typeof value !== 'object' || value === null) return null
  const candidate = value as Record<string, unknown>
  if (
    typeof candidate.base === 'string' &&
    Array.isArray(candidate.findings) &&
    (candidate.notice === null || typeof candidate.notice === 'string')
  ) {
    return candidate as unknown as StoredCheck
  }
  return null
}

function readSceneFix(value: unknown): StoredFix | null {
  if (typeof value !== 'object' || value === null) return null
  const candidate = value as Record<string, unknown>
  if (
    typeof candidate.base === 'string' &&
    typeof candidate.text === 'string' &&
    Array.isArray(candidate.scenes) &&
    typeof candidate.token === 'string'
  ) {
    return candidate as unknown as StoredFix
  }
  return null
}

function readPlanCard(value: unknown): DraftPlanCard | null {
  if (typeof value !== 'object' || value === null) return null
  const candidate = value as { scenes?: unknown }
  if (!Array.isArray(candidate.scenes)) return null
  return value as DraftPlanCard
}

/** The instruction text with the card-chain plan notes, or null when the run has neither. */
function readInstructions(output: Record<string, unknown>): string | null {
  const parts: string[] = []
  if (typeof output.instructions === 'string' && output.instructions.trim() !== '') {
    parts.push(output.instructions.trim())
  }
  if (Array.isArray(output.planNotes)) {
    for (const note of output.planNotes) {
      if (typeof note === 'string' && note.trim() !== '') parts.push(note.trim())
    }
  }
  if (parts.length === 0) return null
  return parts.join('\n')
}

/** The position the draft belongs to: its chapter, or the next one for a new chapter. */
async function draftPosition(db: Db, workId: string, chapterId: string | null): Promise<number> {
  if (chapterId) {
    const [chapter] = await db
      .select({ position: chapters.position })
      .from(chapters)
      .where(eq(chapters.id, chapterId))
      .limit(1)
    if (chapter) return chapter.position
  }
  return (await getLatestPosition(db, workId)) + 1
}

/** Contents of the work's facts still hidden at `position`, at most 20. */
async function hiddenFactContents(
  db: Db,
  actor: Actor,
  workId: string,
  position: number,
): Promise<string[]> {
  const facts = await listFacts(db, actor, workId)
  return facts
    .filter((fact) => fact.revealAtPosition !== null && fact.revealAtPosition > position)
    .map((fact) => fact.content)
    .slice(0, 20)
}

/** The last two paragraphs of the previous scene, or '' for the first scene. */
function beforeText(text: string, spans: SceneRange[], scene: number): string {
  if (scene <= 1) return ''
  const prev = text.slice(spans[scene - 2].start, spans[scene - 2].end)
  return splitParagraphs(prev)
    .slice(-2)
    .map((paragraph) => paragraph.text)
    .join('\n\n')
}

/** The first paragraph of the next scene, or '' for the last scene. */
function afterText(text: string, spans: SceneRange[], scene: number): string {
  if (scene >= spans.length) return ''
  const next = text.slice(spans[scene].start, spans[scene].end)
  return splitParagraphs(next)[0]?.text ?? ''
}

/**
 * Sets `output` of the run to `value` only while its stored text still equals `stored`. Returns
 * whether a row was updated. Same conditional pattern as draft-refine.
 */
async function updateWhileDraftIs(
  db: Db,
  runId: string,
  stored: string,
  value: ReturnType<typeof sql>,
): Promise<boolean> {
  const updated = await db
    .update(aiRuns)
    .set({ output: value })
    .where(and(eq(aiRuns.id, runId), sql`${aiRuns.output}->>'text' = ${stored}`))
    .returning({ id: aiRuns.id })
  return updated.length > 0
}

function withoutSceneFix(output: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(Object.entries(output).filter(([key]) => key !== 'sceneFix'))
}

function isCancel(error: unknown): boolean {
  return error instanceof AppError && error.code === 'CANCELLED'
}
