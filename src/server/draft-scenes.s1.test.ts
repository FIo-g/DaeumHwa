import { beforeEach, describe, expect, it, vi } from 'vitest'
import { eq } from 'drizzle-orm'
import type { Db } from '@/db/client'
import { aiRuns } from '@/db/schema'
import { draftModeFromEnv } from '@/ai/draft-mode'
import { withSceneTargets } from '@/lib/draft-plan'
import { FakeAiClient } from '@/test/fake-ai'
import { fakeDraftPlan } from '@/test/ai-fakes/draft-plan'
import { createTestDb } from '@/test/db'
import { createTestUser, createTestWork } from '@/test/factories'
import { startDraft } from '@/server/ai-features'

const SEPARATOR = '\n\n***\n\n'

async function readAll(stream: AsyncIterable<string>): Promise<string> {
  let text = ''
  for await (const chunk of stream) text += chunk
  return text
}

/** Returns the outputs in order; an Error entry makes that call throw. */
function scenePlayer(outputs: (string | Error)[]): () => string {
  let call = 0
  return () => {
    const output = outputs[call++]
    if (output instanceof Error) throw output
    return output
  }
}

describe('startDraft in scenes mode', () => {
  let db: Db
  let actor: { userId: string }
  let workId: string
  const card = withSceneTargets(fakeDraftPlan(), 5000)

  beforeEach(async () => {
    db = await createTestDb()
    const owner = await createTestUser(db, { name: '작가', email: 'author@example.com' })
    const work = await createTestWork(db, owner.id, { title: '잿빛 도시' })
    actor = { userId: owner.id }
    workId = work.id
  })

  it('writes one call per scene and joins them with a *** line', async () => {
    const client = new FakeAiClient({
      overrides: {
        'draft-chapter': () => '가',
        'draft-scene': scenePlayer(['나', '다']),
      },
    })
    const { runId, textStream, done } = await startDraft(
      db,
      actor,
      { workId, instructions: '', entryIds: [], targetChars: 5000, plan: card, mode: 'scenes' },
      client,
    )
    const streamed = await readAll(textStream)
    const text = await done

    const joined = `가${SEPARATOR}나${SEPARATOR}다`
    expect(streamed).toBe(joined)
    expect(text).toBe(joined)
    const [first] = await db.select().from(aiRuns).where(eq(aiRuns.id, runId))
    expect(first.output).toMatchObject({ text: joined })
    const runs = await db.select().from(aiRuns).where(eq(aiRuns.workId, workId))
    expect(runs.map((run) => run.task).sort()).toEqual([
      'draft-chapter',
      'draft-scene',
      'draft-scene',
    ])
  })

  it('gives the next scene the text so far and the scene line', async () => {
    const client = new FakeAiClient({
      overrides: { 'draft-chapter': () => '가', 'draft-scene': scenePlayer(['나', '다']) },
    })
    const spy = vi.spyOn(client, 'streamText')
    const { done } = await startDraft(
      db,
      actor,
      { workId, instructions: '', entryIds: [], targetChars: 5000, plan: card, mode: 'scenes' },
      client,
    )
    await done

    const prompt = spy.mock.calls[1][0].prompt
    expect(prompt).toContain('<draft_so_far>\n가')
    expect(prompt).toContain('장면 2만 쓰고 멈춘다')
  })

  it('keeps the scenes already written when a later scene fails, with a SCENES_CUT warning', async () => {
    const client = new FakeAiClient({
      overrides: {
        'draft-chapter': () => '가',
        'draft-scene': scenePlayer(['나', new Error('boom')]),
      },
    })
    const { runId, textStream, done } = await startDraft(
      db,
      actor,
      { workId, instructions: '', entryIds: [], targetChars: 5000, plan: card, mode: 'scenes' },
      client,
    )
    const streamed = await readAll(textStream)
    const text = await done

    const partial = `가${SEPARATOR}나`
    expect(text).toBe(partial)
    expect(streamed).toBe(partial)
    const [row] = await db.select().from(aiRuns).where(eq(aiRuns.id, runId))
    expect(row.output).toMatchObject({
      text: partial,
      warnings: [{ code: 'SCENES_CUT', scenesWritten: 2 }],
    })
  })

  describe('scene break lines', () => {
    async function runScenes(first: string, scenes: (string | Error)[]) {
      const client = new FakeAiClient({
        overrides: { 'draft-chapter': () => first, 'draft-scene': scenePlayer(scenes) },
      })
      const spy = vi.spyOn(client, 'streamText')
      const { runId, textStream, done } = await startDraft(
        db,
        actor,
        { workId, instructions: '', entryIds: [], targetChars: 5000, plan: card, mode: 'scenes' },
        client,
      )
      const streamed = await readAll(textStream)
      const text = await done
      const [row] = await db.select().from(aiRuns).where(eq(aiRuns.id, runId))
      return { streamed, text, output: row.output, spy }
    }

    it('writes each separator once when scenes open and close with a break line', async () => {
      const { streamed, text, output, spy } = await runScenes('가\n\n***', [
        '***\n\n나',
        '다\n\n***',
      ])

      const joined = `가${SEPARATOR}나${SEPARATOR}다`
      expect(streamed).toBe(joined)
      expect(text).toBe(joined)
      expect(output).toMatchObject({ text: joined })
      expect(output).not.toHaveProperty('warnings')
      const prompt = spy.mock.calls[2][0].prompt
      expect(prompt).toContain(`<draft_so_far>\n가${SEPARATOR}나\n</draft_so_far>`)
      const afterSoFar = prompt.slice(prompt.indexOf('<draft_so_far>'))
      expect(afterSoFar.split('\n').filter((line) => line === '***')).toHaveLength(1)
    })

    it('drops spaced and padded break lines at the edges of a scene', async () => {
      const { streamed, text, output } = await runScenes('가', ['***\n\n나', '\n\n* * *\n\n다'])

      const joined = `가${SEPARATOR}나${SEPARATOR}다`
      expect(streamed).toBe(joined)
      expect(text).toBe(joined)
      expect(output).toMatchObject({ text: joined })
    })

    it('holds back a trailing break line that arrives in a later chunk', async () => {
      // The fake client cuts the text every 40 characters: the first chunk ends inside the indent
      // of the break line, so the line is split across two chunks.
      const body = '나'.repeat(37)
      const { streamed, text } = await runScenes('가', [`${body}\n\n  * * *\n\n`, `다\n\n---`])

      const joined = `가${SEPARATOR}${body}${SEPARATOR}다`
      expect(streamed).toBe(joined)
      expect(text).toBe(joined)
    })

    it('keeps a break line in the middle of a scene', async () => {
      const { text } = await runScenes('가', ['나\n\n***\n\n나나', '다'])

      expect(text).toBe(`가${SEPARATOR}나\n\n***\n\n나나${SEPARATOR}다`)
    })

    it('counts a scene that is only a break line as a failed scene', async () => {
      const { streamed, text, output } = await runScenes('가', ['***', '다'])

      expect(streamed).toBe('가')
      expect(text).toBe('가')
      expect(output).toMatchObject({
        text: '가',
        warnings: [{ code: 'SCENES_CUT', scenesWritten: 1 }],
      })
    })

    it.each([
      ['an empty answer', ''],
      ['whitespace only', '  \n'],
      ['a break line only', '\n***\n'],
    ])('records SCENES_CUT with no separator when the first scene is %s', async (_name, first) => {
      const client = new FakeAiClient({
        overrides: { 'draft-chapter': () => first, 'draft-scene': scenePlayer(['나', '다']) },
      })
      const { runId, textStream, done } = await startDraft(
        db,
        actor,
        { workId, instructions: '', entryIds: [], targetChars: 5000, plan: card, mode: 'scenes' },
        client,
      )

      expect(await readAll(textStream)).toBe('')
      expect(await done).toBe('')
      const [row] = await db.select().from(aiRuns).where(eq(aiRuns.id, runId))
      expect(row.output).toMatchObject({
        text: '',
        warnings: [{ code: 'SCENES_CUT', scenesWritten: 0 }],
      })
      const runs = await db.select().from(aiRuns).where(eq(aiRuns.workId, workId))
      expect(runs.map((run) => run.task)).toEqual(['draft-chapter'])
    })
  })

  it('rejects when the user aborts during a later scene', async () => {
    const controller = new AbortController()
    const client = new FakeAiClient({
      overrides: {
        'draft-chapter': () => '가',
        'draft-scene': () => {
          controller.abort()
          throw new Error('aborted by the client')
        },
      },
    })
    const { done } = await startDraft(
      db,
      actor,
      { workId, instructions: '', entryIds: [], targetChars: 5000, plan: card, mode: 'scenes' },
      client,
      controller.signal,
    )
    await expect(done).rejects.toMatchObject({ code: 'CANCELLED' })
  })
})

describe('draftModeFromEnv', () => {
  it('reads scenes only from AI_DRAFT_MODE=scenes', () => {
    expect(draftModeFromEnv({ AI_DRAFT_MODE: 'scenes' })).toBe('scenes')
    expect(draftModeFromEnv({ AI_DRAFT_MODE: 'single' })).toBe('single')
    expect(draftModeFromEnv({})).toBe('single')
  })
})
