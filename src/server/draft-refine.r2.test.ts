import { beforeEach, describe, expect, it, vi } from 'vitest'
import { and, eq } from 'drizzle-orm'
import { FakeAiClient } from '@/test/fake-ai'
import type { Db } from '@/db/client'
import { aiRuns } from '@/db/schema'
import type { Actor } from '@/db/types'
import { AppError } from '@/lib/errors'
import { replaceRunOutput } from '@/ai/run'
import type { GenerateObjectArgs } from '@/ai/types'
import { createTestDb } from '@/test/db'
import { addTestMember, createTestUser, createTestWork } from '@/test/factories'
import { createChapterFromDraft, startDraft } from '@/server/ai-features'
import { applyDraftRefinement, previewDraftRefinement } from '@/server/draft-refine'
import { createStyleCard } from '@/server/styles'

const SHORT = '비가 내렸다. 그녀는 창가에 섰다.'
const FIVE =
  '민아는 문을 열었다. 복도는 어두웠다. 바람이 불었다. 발소리가 멀어졌다. 그녀는 숨을 죽였다.'
const SAMPLE = '안개가 계단을 반쯤 삼키고 있었다.'
const NEW_SENTENCE = '계단 아래로 안개가 번져 갔다.'
const INSTRUCTIONS = '서윤이 편지를 발견한다.'

type Setup = { db: Db; actor: Actor; workId: string; ownerId: string }

async function setup(): Promise<Setup> {
  const db = await createTestDb()
  const owner = await createTestUser(db, { name: '작가', email: 'author@example.com' })
  const work = await createTestWork(db, owner.id, { title: '잿빛 도시' })
  return { db, actor: { userId: owner.id }, workId: work.id, ownerId: owner.id }
}

/** Runs a draft whose text is `text`. targetChars is tiny so no continuation runs. */
async function draftOf(
  s: Setup,
  text: string,
  overrides: Record<string, (input: unknown) => unknown> = {},
) {
  const client = new FakeAiClient({ overrides: { 'draft-chapter': () => text, ...overrides } })
  const run = await startDraft(
    s.db,
    s.actor,
    { workId: s.workId, instructions: INSTRUCTIONS, targetChars: 10, entryIds: [] },
    client,
  )
  await run.done
  return { runId: run.runId, client }
}

/** Same as draftOf, with a client the test built itself. */
async function draftWith(s: Setup, client: FakeAiClient): Promise<string> {
  const run = await startDraft(
    s.db,
    s.actor,
    { workId: s.workId, instructions: INSTRUCTIONS, targetChars: 10, entryIds: [] },
    client,
  )
  await run.done
  return run.runId
}

/** A client that holds its first draft-repair call until release(); entered resolves once held. */
function gatedClient(overrides: Record<string, (input: unknown) => unknown>) {
  let release: () => void = () => {}
  const gate = new Promise<void>((resolve) => (release = resolve))
  let enter: () => void = () => {}
  const entered = new Promise<void>((resolve) => (enter = resolve))
  let repairCalls = 0
  class GatedClient extends FakeAiClient {
    override async generateObject<T>(args: GenerateObjectArgs<T>) {
      if (args.task.name === 'draft-repair') {
        repairCalls += 1
        if (repairCalls === 1) {
          enter()
          await gate
        }
      }
      return super.generateObject(args)
    }
  }
  return { client: new GatedClient({ overrides }), entered, release }
}

/** Resolves to the rejection of a promise, or null when it resolves. */
function settle(promise: Promise<unknown>): Promise<unknown> {
  return promise.then(
    () => null,
    (error: unknown) => error,
  )
}

async function outputOf(db: Db, runId: string): Promise<Record<string, unknown>> {
  const [row] = await db.select().from(aiRuns).where(eq(aiRuns.id, runId))
  return row.output as Record<string, unknown>
}

async function taskRows(db: Db, workId: string, task: string) {
  return db
    .select()
    .from(aiRuns)
    .where(and(eq(aiRuns.workId, workId), eq(aiRuns.task, task as 'draft-repair')))
}

async function captureError(promise: Promise<unknown>): Promise<AppError> {
  try {
    await promise
  } catch (error) {
    if (error instanceof AppError) return error
    throw error
  }
  throw new Error('expected the call to reject')
}

describe('previewDraftRefinement', () => {
  let s: Setup

  beforeEach(async () => {
    s = await setup()
  })

  it('previews a trim as a diff and stores a candidate without changing the draft', async () => {
    const stored = `${SHORT}\n\n${FIVE}`
    const { runId, client } = await draftOf(s, stored)
    const before = await outputOf(s.db, runId)

    const result = await previewDraftRefinement(s.db, s.actor, { workId: s.workId, runId }, client)

    expect(result).toMatchObject({
      runId,
      changed: true,
      paragraphsBefore: 1,
      paragraphsAfter: 0,
      repairState: 'none',
    })
    const output = await outputOf(s.db, runId)
    const refinement = output.refinement as { text: string; base: string }
    expect(refinement.base).toBe(stored)
    expect(refinement.text).toContain('불었다.\n\n발소리가')
    const joined = (drop: 'insert' | 'delete') =>
      result.parts
        .filter((part) => part.type !== drop)
        .map((part) => part.value)
        .join('')
    expect(joined('insert')).toBe(stored)
    expect(joined('delete')).toBe(refinement.text)

    expect(output.text).toBe(stored)
    expect(output).not.toHaveProperty('originalText')
    expect(output).toEqual({ ...before, refinement: output.refinement })
    expect(await taskRows(s.db, s.workId, 'paragraph-trim')).toHaveLength(1)
    expect(await taskRows(s.db, s.workId, 'draft-repair')).toHaveLength(0)
  })

  it('repairs flagged sentences after the trim, on the trimmed text', async () => {
    await createStyleCard(s.db, s.actor, { workId: s.workId, name: '작품 문체', examples: SAMPLE })
    const stored = `${FIVE}\n\n${SAMPLE}`
    const recorded: unknown[] = []
    const { runId, client } = await draftOf(s, stored, {
      'draft-repair': (input) => {
        recorded.push(input)
        return { edits: [{ quote: SAMPLE, replacement: NEW_SENTENCE }] }
      },
    })

    const result = await previewDraftRefinement(s.db, s.actor, { workId: s.workId, runId }, client)

    expect(result).toMatchObject({ repairState: 'done', flagged: 1, repaired: 1 })
    const refinement = (await outputOf(s.db, runId)).refinement as { text: string }
    expect(refinement.text).toContain(NEW_SENTENCE)
    expect(refinement.text).not.toContain(SAMPLE)
    expect(JSON.stringify(recorded[0])).toContain('불었다.\\n\\n발소리가')
  })

  it('makes no AI call and stores no candidate when nothing needs fixing', async () => {
    const { runId, client } = await draftOf(s, `${SHORT}\n\n${SAMPLE}`)
    const spy = vi.spyOn(client, 'generateObject')

    const result = await previewDraftRefinement(s.db, s.actor, { workId: s.workId, runId }, client)

    expect(spy).not.toHaveBeenCalled()
    expect(result).toMatchObject({ changed: false, parts: [] })
    expect(await outputOf(s.db, runId)).not.toHaveProperty('refinement')
  })

  it('drops a stale candidate when the new preview finds nothing', async () => {
    const { runId, client } = await draftOf(s, SHORT)
    await replaceRunOutput(s.db, runId, {
      text: SHORT,
      refinement: { base: 'x', text: 'y', paragraphs: 1, sentences: 0 },
    })

    await previewDraftRefinement(s.db, s.actor, { workId: s.workId, runId }, client)

    const output = await outputOf(s.db, runId)
    expect(output.text).toBe(SHORT)
    expect(output).not.toHaveProperty('refinement')
  })

  it('keeps the trim result when the repair call fails', async () => {
    await createStyleCard(s.db, s.actor, { workId: s.workId, name: '작품 문체', examples: SAMPLE })
    const { runId, client } = await draftOf(s, `${FIVE}\n\n${SAMPLE}`, {
      'draft-repair': () => {
        throw new Error('boom')
      },
    })

    const result = await previewDraftRefinement(s.db, s.actor, { workId: s.workId, runId }, client)

    expect(result).toMatchObject({ repairState: 'failed', changed: true, repaired: 0 })
    const refinement = (await outputOf(s.db, runId)).refinement as { text: string }
    expect(refinement.text).toContain('불었다.\n\n발소리가')
  })

  it('rethrows the repair error when the trim changed nothing', async () => {
    await createStyleCard(s.db, s.actor, { workId: s.workId, name: '작품 문체', examples: SAMPLE })
    const { runId, client } = await draftOf(s, `${SHORT}\n\n${SAMPLE}`, {
      'draft-repair': () => {
        throw new AppError('AI_LIMIT', '오늘 AI 사용량 한도를 넘었습니다. 내일 다시 시도해 주세요.')
      },
    })

    const error = await captureError(
      previewDraftRefinement(s.db, s.actor, { workId: s.workId, runId }, client),
    )

    expect(error.code).toBe('AI_LIMIT')
    expect(await outputOf(s.db, runId)).not.toHaveProperty('refinement')
  })

  it('skips the repair when little time is left', async () => {
    await createStyleCard(s.db, s.actor, { workId: s.workId, name: '작품 문체', examples: SAMPLE })
    const repairCall = vi.fn(() => ({ edits: [] }))
    const { runId, client } = await draftOf(s, `${FIVE}\n\n${SAMPLE}`, {
      'draft-repair': repairCall,
    })
    let reads = 0
    const now = () => (reads++ === 0 ? 0 : 275_000)

    const result = await previewDraftRefinement(
      s.db,
      s.actor,
      { workId: s.workId, runId },
      client,
      undefined,
      now,
    )

    expect(repairCall).not.toHaveBeenCalled()
    expect(result).toMatchObject({ repairState: 'skipped', flagged: 1, changed: true })
    const refinement = (await outputOf(s.db, runId)).refinement as { text: string }
    expect(refinement.text).toContain('불었다.\n\n발소리가')
    expect(refinement.text).toContain(SAMPLE)
  })

  it('rethrows a cancel and stores no candidate', async () => {
    const { runId, client } = await draftOf(s, `${SHORT}\n\n${FIVE}`)
    const controller = new AbortController()
    controller.abort()

    const error = await captureError(
      previewDraftRefinement(s.db, s.actor, { workId: s.workId, runId }, client, controller.signal),
    )

    expect(error.code).toBe('CANCELLED')
    expect(await outputOf(s.db, runId)).not.toHaveProperty('refinement')
  })

  it('rejects a draft run that is not done', async () => {
    const [row] = await s.db
      .insert(aiRuns)
      .values({
        workId: s.workId,
        userId: s.ownerId,
        task: 'draft-chapter',
        status: 'error',
        output: { text: SHORT },
      })
      .returning()

    const error = await captureError(
      previewDraftRefinement(
        s.db,
        s.actor,
        { workId: s.workId, runId: row.id },
        new FakeAiClient(),
      ),
    )

    expect(error).toMatchObject({
      code: 'BAD_STATE',
      message: '초안 작성이 끝난 뒤에 다듬을 수 있습니다.',
    })
  })

  it('hides the run from other users', async () => {
    const { runId, client } = await draftOf(s, SHORT)
    const [trimRow] = await s.db
      .insert(aiRuns)
      .values({
        workId: s.workId,
        userId: s.ownerId,
        task: 'paragraph-trim',
        status: 'done',
        output: { text: SHORT },
      })
      .returning()
    const editor = await createTestUser(s.db, { email: 'editor@example.com' })
    await addTestMember(s.db, s.workId, editor.id, 'editor')
    const stranger = await createTestUser(s.db, { email: 'stranger@example.com' })
    const viewer = await createTestUser(s.db, { email: 'viewer@example.com' })
    await addTestMember(s.db, s.workId, viewer.id, 'viewer')

    const asEditor = await captureError(
      previewDraftRefinement(s.db, { userId: editor.id }, { workId: s.workId, runId }, client),
    )
    const asStranger = await captureError(
      previewDraftRefinement(s.db, { userId: stranger.id }, { workId: s.workId, runId }, client),
    )
    const asViewer = await captureError(
      previewDraftRefinement(s.db, { userId: viewer.id }, { workId: s.workId, runId }, client),
    )
    const trimRun = await captureError(
      previewDraftRefinement(s.db, s.actor, { workId: s.workId, runId: trimRow.id }, client),
    )

    expect(asEditor.code).toBe('NOT_FOUND')
    expect(asStranger.code).toBe('NOT_FOUND')
    expect(asViewer.code).toBe('FORBIDDEN')
    expect(trimRun.code).toBe('NOT_FOUND')
  })
})

describe('applyDraftRefinement', () => {
  let s: Setup

  beforeEach(async () => {
    s = await setup()
  })

  it('apply promotes the candidate', async () => {
    const stored = `${SHORT}\n\n${FIVE}`
    const { runId, client } = await draftOf(s, stored)
    await replaceRunOutput(s.db, runId, { text: stored, warnings: [{ kind: 'kept' }] })
    const preview = await previewDraftRefinement(s.db, s.actor, { workId: s.workId, runId }, client)
    const refined = ((await outputOf(s.db, runId)).refinement as { text: string }).text

    const applied = await applyDraftRefinement(s.db, s.actor, {
      workId: s.workId,
      runId,
      token: preview.token,
    })

    expect(applied).toEqual({ runId, text: refined })
    const output = await outputOf(s.db, runId)
    expect(output.text).toBe(refined)
    expect(output.originalText).toBe(stored)
    expect(output.refined).toEqual({ paragraphs: 1, sentences: 0 })
    expect(output).not.toHaveProperty('refinement')
    expect(output.warnings).toEqual([{ kind: 'kept' }])

    const chapter = await createChapterFromDraft(s.db, s.actor, { workId: s.workId, runId })
    expect(chapter.body).toBe(refined)
  })

  it('apply keeps an earlier originalText', async () => {
    const BASE = `${SHORT}\n\n${FIVE}`
    const REFINED = `${SHORT}\n\n민아는 문을 열었다.`
    const { runId } = await draftOf(s, BASE)
    await replaceRunOutput(s.db, runId, {
      text: BASE,
      originalText: 'first original',
      refinement: { base: BASE, text: REFINED, paragraphs: 1, sentences: 0, token: 'seed-token' },
    })

    await applyDraftRefinement(s.db, s.actor, { workId: s.workId, runId, token: 'seed-token' })

    const output = await outputOf(s.db, runId)
    expect(output.text).toBe(REFINED)
    expect(output.originalText).toBe('first original')
  })

  it('apply fails without a candidate and on a second apply', async () => {
    const { runId, client } = await draftOf(s, `${SHORT}\n\n${FIVE}`)
    const preview = await previewDraftRefinement(s.db, s.actor, { workId: s.workId, runId }, client)
    const token = preview.token
    await applyDraftRefinement(s.db, s.actor, { workId: s.workId, runId, token })

    const second = await captureError(
      applyDraftRefinement(s.db, s.actor, { workId: s.workId, runId, token }),
    )

    expect(second).toMatchObject({
      code: 'BAD_STATE',
      message: '적용할 다듬기 결과가 없습니다. 다시 다듬어 주세요.',
    })
    const none = await draftOf(s, SHORT)
    const missing = await captureError(
      applyDraftRefinement(s.db, s.actor, { workId: s.workId, runId: none.runId, token: 'any' }),
    )
    expect(missing).toMatchObject({
      code: 'BAD_STATE',
      message: '적용할 다듬기 결과가 없습니다. 다시 다듬어 주세요.',
    })
  })

  it('apply fails when the stored text changed after the preview', async () => {
    const { runId, client } = await draftOf(s, `${SHORT}\n\n${FIVE}`)
    const preview = await previewDraftRefinement(s.db, s.actor, { workId: s.workId, runId }, client)
    const output = await outputOf(s.db, runId)
    await replaceRunOutput(s.db, runId, { ...output, text: 'another draft' })
    const changed = await outputOf(s.db, runId)

    const error = await captureError(
      applyDraftRefinement(s.db, s.actor, { workId: s.workId, runId, token: preview.token }),
    )

    expect(error).toMatchObject({
      code: 'BAD_STATE',
      message: '초안이 바뀌어 적용할 수 없습니다. 다시 다듬어 주세요.',
    })
    expect(await outputOf(s.db, runId)).toEqual(changed)
  })

  it('apply checks the role', async () => {
    const { runId, client } = await draftOf(s, `${SHORT}\n\n${FIVE}`)
    const { token } = await previewDraftRefinement(
      s.db,
      s.actor,
      { workId: s.workId, runId },
      client,
    )
    const viewer = await createTestUser(s.db, { email: 'viewer@example.com' })
    await addTestMember(s.db, s.workId, viewer.id, 'viewer')
    const stranger = await createTestUser(s.db, { email: 'stranger@example.com' })

    const asViewer = await captureError(
      applyDraftRefinement(s.db, { userId: viewer.id }, { workId: s.workId, runId, token }),
    )
    const asStranger = await captureError(
      applyDraftRefinement(s.db, { userId: stranger.id }, { workId: s.workId, runId, token }),
    )

    expect(asViewer.code).toBe('FORBIDDEN')
    expect(asStranger.code).toBe('NOT_FOUND')
  })
})

describe('overlapping previews', () => {
  let s: Setup

  beforeEach(async () => {
    s = await setup()
    await createStyleCard(s.db, s.actor, { workId: s.workId, name: '작품 문체', examples: SAMPLE })
  })

  it('an older preview that lands after apply keeps the applied text', async () => {
    const original = `${SHORT}\n\n${SAMPLE}`
    const { client, entered, release } = gatedClient({
      'draft-chapter': () => original,
      'draft-repair': () => ({ edits: [{ quote: SAMPLE, replacement: NEW_SENTENCE }] }),
    })
    const runId = await draftWith(s, client)
    // Request 1 hangs in the repair call: the author cancelled, but the server never saw it.
    const first = settle(previewDraftRefinement(s.db, s.actor, { workId: s.workId, runId }, client))
    await entered
    const second = await previewDraftRefinement(s.db, s.actor, { workId: s.workId, runId }, client)
    const applied = await applyDraftRefinement(s.db, s.actor, {
      workId: s.workId,
      runId,
      token: second.token,
    })
    release()
    const late = await first

    const output = await outputOf(s.db, runId)
    expect(output.text).toBe(applied.text)
    expect(applied.text).toContain(NEW_SENTENCE)
    expect(output.originalText).toBe(original)
    expect(output.refined).toEqual({ paragraphs: 0, sentences: 1 })
    expect(output).not.toHaveProperty('refinement')
    const chapter = await createChapterFromDraft(s.db, s.actor, { workId: s.workId, runId })
    expect(chapter.body).toBe(applied.text)
    expect(late).toBeInstanceOf(AppError)
    expect(late).toMatchObject({
      code: 'BAD_STATE',
      message: '초안이 바뀌어 다듬기 결과를 버렸습니다. 다시 다듬어 주세요.',
    })
  })

  it('an older preview that finds nothing does not put the old draft back after apply', async () => {
    const original = `${SHORT}\n\n${SAMPLE}`
    let calls = 0
    const { client, entered, release } = gatedClient({
      'draft-chapter': () => original,
      // The gate holds request 1 before its fake runs, so request 2's call is the first one the
      // fake sees: it rewrites the flagged sentence, and request 1 (released later) makes no edit.
      'draft-repair': () => {
        calls += 1
        return { edits: calls === 1 ? [{ quote: SAMPLE, replacement: NEW_SENTENCE }] : [] }
      },
    })
    const runId = await draftWith(s, client)
    // A candidate from an even earlier preview is stored, so the held preview will drop it.
    await replaceRunOutput(s.db, runId, {
      text: original,
      refinement: { base: original, text: 'old', paragraphs: 0, sentences: 0, token: 'stale' },
    })
    const first = settle(previewDraftRefinement(s.db, s.actor, { workId: s.workId, runId }, client))
    await entered
    const second = await previewDraftRefinement(s.db, s.actor, { workId: s.workId, runId }, client)
    const applied = await applyDraftRefinement(s.db, s.actor, {
      workId: s.workId,
      runId,
      token: second.token,
    })
    release()
    const late = await first

    const output = await outputOf(s.db, runId)
    expect(output.text).toBe(applied.text)
    expect(applied.text).toContain(NEW_SENTENCE)
    expect(output.originalText).toBe(original)
    expect(late).toMatchObject({ code: 'BAD_STATE' })
  })

  it('apply refuses a candidate the author did not see', async () => {
    const original = `${SHORT}\n\n${SAMPLE}`
    let n = 0
    const { client, entered, release } = gatedClient({
      'draft-chapter': () => original,
      'draft-repair': () => {
        n += 1
        return { edits: [{ quote: SAMPLE, replacement: `고친 문장 ${n}이다.` }] }
      },
    })
    const runId = await draftWith(s, client)
    const first = previewDraftRefinement(s.db, s.actor, { workId: s.workId, runId }, client)
    const firstSettled = settle(first)
    await entered
    // Request 2 finishes first: this is the preview the author sees.
    const second = await previewDraftRefinement(s.db, s.actor, { workId: s.workId, runId }, client)
    // Request 1 lands before the author presses 적용 and takes the stored candidate.
    release()
    await firstSettled
    const firstPreview = await first

    expect(firstPreview.token).not.toBe(second.token)
    const error = await captureError(
      applyDraftRefinement(s.db, s.actor, { workId: s.workId, runId, token: second.token }),
    )

    expect(error).toMatchObject({
      code: 'BAD_STATE',
      message: '다듬기 결과가 바뀌었습니다. 다시 다듬어 주세요.',
    })
    expect((await outputOf(s.db, runId)).text).toBe(original)
    const applied = await applyDraftRefinement(s.db, s.actor, {
      workId: s.workId,
      runId,
      token: firstPreview.token,
    })
    expect(applied.text).toContain('고친 문장 2이다.')
  })

  it('apply refuses a token that is not the stored candidate', async () => {
    const { runId, client } = await draftOf(s, `${SHORT}\n\n${FIVE}`)
    await previewDraftRefinement(s.db, s.actor, { workId: s.workId, runId }, client)
    const before = await outputOf(s.db, runId)

    const error = await captureError(
      applyDraftRefinement(s.db, s.actor, { workId: s.workId, runId, token: 'not-the-token' }),
    )

    expect(error).toMatchObject({
      code: 'BAD_STATE',
      message: '다듬기 결과가 바뀌었습니다. 다시 다듬어 주세요.',
    })
    expect(await outputOf(s.db, runId)).toEqual(before)
  })
})
