import { describe, expect, it } from 'vitest'
import type { ContextPack } from '@/ai/context'
import type { AdviceInput } from '@/ai/tasks/direction-advice'
import { directionAdviceTask } from '@/ai/tasks/direction-advice'
import { chapterExtractTask } from '@/ai/tasks/chapter-extract'
import { continuityCheckTask } from '@/ai/tasks/continuity-check'
import { DRAFT_SYSTEM } from '@/ai/tasks/draft-chapter'
import { interviewExtractTask } from '@/ai/tasks/interview-extract'
import { type InterviewQuestionInput, interviewQuestionTask } from '@/ai/tasks/interview-question'
import { proofreadTask } from '@/ai/tasks/proofread'
import { readerSimTask } from '@/ai/tasks/reader-sim'
import { styleSuggestTask } from '@/ai/tasks/style-suggest'
import { ENTRY_KINDS, type EntryKind } from '@/db/types'
import { READER_PERSONAS } from '@/ai/personas'
import { respond } from './responders'

const CONTINUITY_PACK: ContextPack = {
  core: [],
  position: 2,
  entries: [
    {
      ref: 'E1',
      id: 'entry-seoyun',
      kind: 'character',
      name: '서윤',
      aliases: [],
      summary: '',
      fields: {},
      mentionCount: 1,
      facts: [
        {
          ref: 'F1',
          id: 'fact-left-hand',
          content: '서윤은 왼손잡이다.',
          status: 'confirmed',
          sourcePosition: 1,
          validFromPosition: null,
          validToPosition: null,
          evidence: '',
        },
      ],
    },
  ],
  threads: [],
  relations: [],
  previousSummaries: [],
  namingRules: [],
  stats: { totalEntries: 1, selectedEntries: 1, approxChars: 0 },
}

const ZERO_COUNTS = Object.fromEntries(ENTRY_KINDS.map((kind) => [kind, 0])) as Record<
  EntryKind,
  number
>

const ADVICE_INPUT: AdviceInput = {
  work: { title: '테스트', genre: '판타지', logline: '', synopsis: '' },
  latestPosition: 3,
  threads: [
    {
      title: '시계탑 봉인',
      description: '',
      status: 'planted',
      plantedPosition: 1,
      targetPosition: 5,
      overdue: false,
    },
  ],
  characters: [{ name: '서윤', summary: '', lastPosition: 3, keyFacts: [] }],
  recentSummaries: [{ position: 3, title: '', summary: '서윤이 시계탑에 들어간다.' }],
}

/** Sends a request shaped like the Anthropic SDK's and returns the parsed JSON answer. */
function answer(system: string, prompt: string): unknown {
  const reply = respond({
    system: [{ type: 'text', text: system }],
    messages: [{ role: 'user', content: prompt }],
    model: 'm',
  })
  return JSON.parse(reply.text)
}

const SAMPLE_TEXT = '서윤은 시계탑 앞에 섰다. 바람이 차가웠다.'

describe('respond: every structured task answers with schema-valid JSON', () => {
  it.each([
    [
      'continuity-check',
      continuityCheckTask,
      {
        chapterText: SAMPLE_TEXT,
        chapterPosition: 2,
        chapterTitle: '2화',
        pack: CONTINUITY_PACK,
      },
    ],
    [
      'chapter-extract',
      chapterExtractTask,
      {
        chapterText: SAMPLE_TEXT,
        chapterPosition: 2,
        chapterTitle: '2화',
        known: [],
        openThreads: [],
        knownFacts: [],
      },
    ],
    [
      'interview-extract',
      interviewExtractTask,
      {
        topic: '주인공',
        focus: 'setting',
        question: '주인공은 누구인가요?',
        answer: '서윤은 시계탑 수리공이다.',
        known: [],
        threads: [],
        knownFacts: [],
      },
    ],
    [
      'interview-question',
      interviewQuestionTask,
      {
        work: { title: '테스트', genre: '', logline: '', synopsis: '' },
        wiki: { counts: ZERO_COUNTS, entries: [], openThreads: [] },
        story: {
          latestPosition: null,
          recentSummaries: [],
          readerReactions: [],
          openIssueCount: 0,
        },
        covered: [],
        coveredDropped: 0,
        recent: [],
        rejected: null,
      } satisfies InterviewQuestionInput,
    ],
    ['proofread', proofreadTask, { text: SAMPLE_TEXT }],
    [
      'reader-sim',
      readerSimTask,
      {
        chapterText: SAMPLE_TEXT,
        chapterPosition: 2,
        chapterTitle: '2화',
        previousSummaries: [],
        work: { title: '테스트', genre: '판타지', logline: '' },
        personas: READER_PERSONAS,
      },
    ],
    ['direction-advice', directionAdviceTask, ADVICE_INPUT],
    ['style-suggest', styleSuggestTask, { entryName: '서윤', samples: ['가자.', '싫어.'] }],
  ])('%s', (_name, task, input) => {
    const parsed = answer(task.system, task.buildPrompt(input as never))
    expect(task.schema.safeParse(parsed).success).toBe(true)
  })

  it('answers the draft prompt with plain text', () => {
    const reply = respond({
      system: [{ type: 'text', text: DRAFT_SYSTEM }],
      messages: [{ role: 'user', content: '<instructions>서윤이 시계탑에 오른다.</instructions>' }],
      model: 'm',
    })
    expect(reply.task).toBe('draft-chapter')
    expect(reply.text.trim().length).toBeGreaterThan(0)
  })

  it('answers the continuation prompt with its own plain text, not the draft text', () => {
    const draft = respond({
      system: [{ type: 'text', text: DRAFT_SYSTEM }],
      messages: [{ role: 'user', content: '<instructions>서윤이 시계탑에 오른다.</instructions>' }],
      model: 'm',
    })
    const continuation = respond({
      system: [{ type: 'text', text: DRAFT_SYSTEM }],
      messages: [
        {
          role: 'user',
          content:
            '<instructions>서윤이 시계탑에 오른다.</instructions>\n\n<draft_so_far>\n서윤은 조용히 문을 열었다.\n</draft_so_far>\n<continue_length>지금까지 17자를 썼다.</continue_length>',
        },
      ],
      model: 'm',
    })
    expect(continuation.task).toBe('draft-chapter')
    expect(continuation.text.trim().length).toBeGreaterThan(0)
    expect(continuation.text).not.toBe(draft.text)
  })
})

describe('respond: scenarios', () => {
  it('continuity: a right-hand sentence against a left-handed fact yields one issue', () => {
    const prompt = continuityCheckTask.buildPrompt({
      chapterText: '서윤은 오른손으로 검을 쥐었다.',
      chapterPosition: 2,
      chapterTitle: '2화',
      pack: CONTINUITY_PACK,
    })
    const parsed = answer(continuityCheckTask.system, prompt) as {
      issues: { quote: string; factRef: string | null; entryRef: string | null }[]
    }
    expect(parsed.issues).toHaveLength(1)
    expect(parsed.issues[0]?.quote).toBe('서윤은 오른손으로 검을 쥐었다.')
    expect(parsed.issues[0]?.factRef).toBe('F1')
    expect(parsed.issues[0]?.entryRef).toBe('E1')
  })

  it('chapter extract: the summary is not null, so the approval dialog opens', () => {
    const prompt = chapterExtractTask.buildPrompt({
      chapterText: SAMPLE_TEXT,
      chapterPosition: 2,
      chapterTitle: '2화',
      known: [],
      openThreads: [],
      knownFacts: [],
    })
    const parsed = answer(chapterExtractTask.system, prompt) as { summary: string | null }
    expect(parsed.summary).not.toBeNull()
    expect(parsed.summary?.length).toBeGreaterThan(0)
  })

  it.each([
    [0, 1],
    [2, 3],
    [5, 6],
  ])('interview question with %i covered items asks question (%i)', (covered, expected) => {
    const coveredTurns = Array.from({ length: covered }, (_, i) => ({
      topic: `주제${i}`,
      question: `질문${i}`,
      answer: `답${i}`,
      skipped: false,
      focus: 'setting' as const,
    }))
    const prompt = interviewQuestionTask.buildPrompt({
      work: { title: '테스트', genre: '', logline: '', synopsis: '' },
      wiki: { counts: ZERO_COUNTS, entries: [], openThreads: [] },
      story: { latestPosition: null, recentSummaries: [], readerReactions: [], openIssueCount: 0 },
      covered: coveredTurns,
      coveredDropped: 0,
      recent: [],
      rejected: null,
    })
    const parsed = answer(interviewQuestionTask.system, prompt) as {
      focus: string
      question: string
    }
    expect(parsed.question).toContain(`(${expected})`)
    expect(['setting', 'story']).toContain(parsed.focus)
  })

  it('interview question prompt: a slow prompt marker gives a 30 second delay, otherwise none', () => {
    const body = (text: string) => ({
      system: [{ type: 'text' as const, text: interviewQuestionTask.system }],
      messages: [{ role: 'user', content: text }],
      model: 'm',
    })
    expect(respond(body('[느리게] 질문')).delayMs).toBe(30000)
    expect(respond(body('질문')).delayMs).toBe(0)
  })

  it('an unknown system prompt is rejected', () => {
    expect(() =>
      respond({
        system: 'unknown system',
        messages: [{ role: 'user', content: 'hi' }],
        model: 'm',
      }),
    ).toThrow()
  })
})
