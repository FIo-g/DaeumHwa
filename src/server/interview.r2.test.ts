import { beforeEach, describe, expect, it } from 'vitest'
import { eq } from 'drizzle-orm'
import { FakeAiClient } from '@/test/fake-ai'
import type { GenerateObjectArgs } from '@/ai/types'
import type { Db } from '@/db/client'
import { changeLog, proposals, styleCards, wikiEntries } from '@/db/schema'
import type { Actor } from '@/db/types'
import { createTestDb } from '@/test/db'
import { addTestMember, createTestEntry, createTestUser, createTestWork } from '@/test/factories'
import { answerTurn, askNextQuestion, startInterview } from '@/server/interview'
import { approveProposal } from '@/server/proposals'

/** Records every prompt that reaches the AI and the task name of each call. */
class RecordingAiClient extends FakeAiClient {
  prompts: string[] = []
  tasks: string[] = []

  override async generateObject<T>(args: GenerateObjectArgs<T>) {
    this.tasks.push(args.task.name)
    this.prompts.push(args.prompt)
    return super.generateObject(args)
  }
}

const STYLE_QUESTION = {
  focus: 'setting' as const,
  topic: '문체',
  question: '어떤 시점과 분위기로 쓰고 싶나요?',
  rationale: '문체 카드를 채웁니다.',
}

const KO_ANSWER =
  '세린 시점의 3인칭 제한 시점으로 써요. 건조하고 차분하게, 안개와 소리, 차가움 같은 감각으로 분위기를 만들어요. 감정은 직접 말하지 않고 몸짓으로 보여 주고, 문단은 짧게 끊어요.'

const EN_ANSWER =
  "It's written in third-person limited from Serin's point of view. Dry and calm, building mood through senses like fog, sound and cold. Emotions are shown through gestures rather than stated, and paragraphs are kept short."

let db: Db
let owner: Actor
let editor: Actor
let workId: string

beforeEach(async () => {
  db = await createTestDb()
  const ownerUser = await createTestUser(db, { name: '작가' })
  const editorUser = await createTestUser(db, { name: '편집자' })
  const work = await createTestWork(db, ownerUser.id, { title: '새벽의 검' })
  await addTestMember(db, work.id, editorUser.id, 'editor')
  workId = work.id
  owner = { userId: ownerUser.id }
  editor = { userId: editorUser.id }
})

/** Starts an interview whose first question is the style topic, then answers it. */
async function askStyleAndAnswer(client: RecordingAiClient, answer: string) {
  const session = await startInterview(db, owner, workId)
  const turn = await askNextQuestion(db, owner, session.id, client)
  client.prompts = []
  client.tasks = []
  return answerTurn(db, editor, { turnId: turn.id, answer }, client)
}

function styleClient(extract?: (input: unknown) => unknown) {
  return new RecordingAiClient({
    overrides: {
      'interview-question': () => STYLE_QUESTION,
      ...(extract ? { 'interview-extract': extract } : {}),
    },
  })
}

describe('answerTurn style topic (P11)', () => {
  it('does not turn a style answer into a character fact (saved haiku ko output)', async () => {
    await createTestEntry(db, workId, { name: '한세린', kind: 'character' })
    const client = styleClient(() => ({
      summary: null,
      entries: [],
      facts: [
        {
          subjectName: '한세린',
          content: '이야기는 세린 시점의 3인칭 제한 시점으로 전개한다.',
          evidence: '세린 시점의 3인칭 제한 시점으로 써요.',
          suggestedStatus: 'confirmed',
          supersedesFactRef: null,
        },
      ],
      threads: [],
      relations: [],
    }))
    await askStyleAndAnswer(client, KO_ANSWER)
    const rows = await db.select().from(proposals).where(eq(proposals.workId, workId))
    expect(rows.some((r) => r.type === 'fact_create')).toBe(false)
    expect(rows.some((r) => r.type === 'entry_create')).toBe(false)
  })

  it('does not make a card of the work title (saved luna ko output)', async () => {
    const client = styleClient(() => ({
      summary: null,
      entries: [
        {
          name: '《잿빛 종루의 열쇠》',
          kind: 'other',
          aliases: [],
          summary: '한세린 시점의 3인칭 제한 시점으로 쓰는 작품.',
          fields: [{ key: '시점', value: '한세린 시점의 3인칭 제한 시점' }],
        },
      ],
      facts: [
        {
          subjectName: '《잿빛 종루의 열쇠》',
          content: '이야기는 세린 시점의 3인칭 제한 시점으로 전개한다.',
          evidence: '세린 시점의 3인칭 제한 시점으로 써요.',
          suggestedStatus: 'confirmed',
          supersedesFactRef: null,
        },
      ],
      threads: [],
      relations: [],
    }))
    await askStyleAndAnswer(client, KO_ANSWER)
    const rows = await db.select().from(proposals).where(eq(proposals.workId, workId))
    expect(rows.some((r) => r.type === 'entry_create')).toBe(false)
    expect(rows.some((r) => r.type === 'fact_create')).toBe(false)
  })

  it('does not make a rule card (saved luna en output)', async () => {
    // The question topic is English here, as in the saved en run.
    const client = new RecordingAiClient({
      overrides: {
        'interview-question': () => ({ ...STYLE_QUESTION, topic: 'Style' }),
        'interview-extract': () => ({
          summary: null,
          entries: [
            {
              name: 'Narration style',
              kind: 'rule',
              aliases: [],
              summary: 'Third-person limited from Serin.',
              fields: [{ key: 'pov', value: 'Serin, third-person limited' }],
            },
          ],
          facts: [],
          threads: [],
          relations: [],
        }),
      },
    })
    const session = await startInterview(db, owner, workId)
    const turn = await askNextQuestion(db, owner, session.id, client)
    await answerTurn(db, editor, { turnId: turn.id, answer: EN_ANSWER }, client)
    const rows = await db.select().from(proposals).where(eq(proposals.workId, workId))
    expect(rows.some((r) => r.type === 'entry_create')).toBe(false)
    expect(client.tasks).not.toContain('interview-extract')
  })

  it('stores one style_card proposal for the answer', async () => {
    const client = styleClient()
    const { turn, proposals: created } = await askStyleAndAnswer(client, KO_ANSWER)
    const rows = await db.select().from(proposals).where(eq(proposals.workId, workId))
    expect(rows).toHaveLength(1)
    const [row] = rows
    expect(row.type).toBe('style_card')
    expect(row.source).toBe('interview')
    expect(row.sourceRef).toBe(turn.id)
    expect(row.status).toBe('pending')
    expect(row.chapterId).toBeNull()
    expect(row.payload).toEqual({
      entryName: null,
      name: '문체',
      tone: '세린 시점의 3인칭 제한 시점으로 써요.',
      rules:
        '- 건조하고 차분하게, 안개와 소리, 차가움 같은 감각으로 분위기를 만들어요.\n- 감정은 직접 말하지 않고 몸짓으로 보여 주고, 문단은 짧게 끊어요.',
      examples: '',
    })
    expect(turn.proposalCount).toBe(1)
    expect(created).toHaveLength(1)
  })

  it('makes no AI call for a style answer', async () => {
    const client = styleClient()
    await askStyleAndAnswer(client, KO_ANSWER)
    expect(client.tasks).not.toContain('interview-extract')
  })

  it('an undecided style answer makes no proposal and no AI call', async () => {
    const client = styleClient()
    const { turn, proposals: created } = await askStyleAndAnswer(client, '아직 정하지 않았어요.')
    expect(client.tasks).not.toContain('interview-extract')
    expect(turn.proposalCount).toBe(0)
    expect(created).toHaveLength(0)
  })

  it('still extracts other topics', async () => {
    const client = new RecordingAiClient()
    const session = await startInterview(db, owner, workId)
    const turn = await askNextQuestion(db, owner, session.id, client)
    expect(turn.topic).toBe('주인공')
    client.tasks = []
    await answerTurn(db, editor, { turnId: turn.id, answer: '서윤은 열일곱 살 검객이다.' }, client)
    expect(client.tasks).toContain('interview-extract')
    const rows = await db.select().from(proposals).where(eq(proposals.workId, workId))
    expect(rows.some((r) => r.type === 'fact_create')).toBe(true)
  })

  it('approving the proposal creates a work-level style card', async () => {
    const client = styleClient()
    const { proposals: created } = await askStyleAndAnswer(client, KO_ANSWER)
    const [proposal] = created
    await approveProposal(db, editor, { proposalId: proposal.id })

    const cards = await db.select().from(styleCards).where(eq(styleCards.workId, workId))
    expect(cards).toHaveLength(1)
    expect(cards[0].entryId).toBeNull()
    expect(cards[0].name).toBe('문체')
    expect(cards[0].tone).toBe('세린 시점의 3인칭 제한 시점으로 써요.')
    expect(cards[0].createdByType).toBe('ai')

    const log = await db.select().from(changeLog).where(eq(changeLog.workId, workId))
    expect(
      log.some((row) => row.targetTable === 'style_cards' && row.proposalId === proposal.id),
    ).toBe(true)

    const entries = await db.select().from(wikiEntries).where(eq(wikiEntries.workId, workId))
    expect(entries).toHaveLength(0)
  })
})
