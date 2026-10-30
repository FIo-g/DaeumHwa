import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { PROPOSAL_TYPES } from '@/db/types'
import {
  AnswerSchema,
  PendingSchema,
  clearPending,
  logDecision,
  proposalLabel,
  readAnswer,
  readPending,
  writePending,
  type Answer,
  type Pending,
} from './author-io'
import { fakeAnswer } from './fake-author'
import { loadBible } from './bible'
import { chapterMetrics } from './metrics'

const metrics = chapterMetrics('짧은 본문.', 'ko', 100)

const proposals: Pending = {
  kind: 'proposals',
  step: 'ch1:proposals',
  source: 'post_chapter',
  chapter: 1,
  chapterFile: 'ch1.txt',
  items: [
    { id: 'a', type: 'entry_create', payload: { name: '해연' } },
    { id: 'b', type: 'thread_create', payload: { title: '봉인' } },
  ],
}

type InterviewPending = Extract<Pending, { kind: 'interview_answer' }>

const interviewPending: InterviewPending = {
  kind: 'interview_answer',
  step: 'interview',
  turnId: 't1',
  focus: 'setting',
  topic: '도시',
  question: '도시의 성벽은 몇 겹인가요?',
  asked: 1,
  limit: 3,
}

const pendingFixtures: Pending[] = [
  interviewPending,
  proposals,
  {
    kind: 'draft_review',
    step: 'ch1:draft',
    chapter: 1,
    attempt: 1,
    maxAttempts: 2,
    instructions: '첫 장면을 쓴다',
    mustInclude: ['해연'],
    textFile: 'ch1-attempt1.txt',
    metrics,
  },
  {
    kind: 'proofread',
    step: 'ch1:proofread',
    chapter: 1,
    textFile: 'ch1.txt',
    items: [
      {
        id: 'p1',
        quote: '되었다',
        replacement: '됐다',
        kind: 'spelling',
        reason: '구어',
        source: 'rule',
      },
    ],
  },
  {
    kind: 'continuity',
    step: 'ch1:continuity',
    chapter: 1,
    textFile: 'ch1.txt',
    items: [
      {
        id: 'c1',
        kind: 'timeline',
        severity: 'high',
        quote: '어제',
        explanation: '날짜가 맞지 않음',
        suggestion: '그제로 고침',
      },
    ],
  },
  {
    kind: 'advice_note',
    step: 'ch2:advice',
    chapter: 2,
    result: {
      options: [
        {
          title: 'A',
          summary: 'a',
          beats: [],
          usesThreads: [],
          involvedCharacters: [],
          risk: 'low',
        },
      ],
      warnings: [],
      recommendedIndex: 0,
      recommendationReason: '이유',
    },
    nextInstructions: '다음 장을 쓴다',
  },
]

let dir: string

beforeEach(() => {
  dir = mkdtempSync(path.join(os.tmpdir(), 'novel-author-'))
})

afterEach(() => {
  rmSync(dir, { recursive: true, force: true })
})

const answerPath = () => path.join(dir, 'answer.json')
const errorPath = () => path.join(dir, 'answer.error.txt')

describe('pending and answer files', () => {
  it('writes a pending item and reads it back', () => {
    writePending(dir, proposals)
    expect(readPending(dir)).toEqual(proposals)
  })

  it('returns null from readPending when no pending item exists', () => {
    expect(readPending(dir)).toBeNull()
  })

  it('returns null from readAnswer when answer.json is missing', () => {
    writePending(dir, proposals)
    expect(readAnswer(dir, proposals)).toBeNull()
  })

  it('reads a valid answer for the pending kind', () => {
    writePending(dir, proposals)
    const answer: Answer = {
      kind: 'proposals',
      decisions: [
        { id: 'a', approve: true, reason: '좋음' },
        { id: 'b', approve: false, reason: '뺌' },
      ],
    }
    writeFileSync(answerPath(), JSON.stringify(answer))
    expect(readAnswer(dir, proposals)).toEqual(answer)
  })

  it('removes a stale answer.json when a new pending item is written', () => {
    writePending(dir, proposals)
    writeFileSync(answerPath(), '{}')
    writePending(dir, pendingFixtures[0])
    expect(existsSync(answerPath())).toBe(false)
  })

  it('clears the pending item', () => {
    writePending(dir, proposals)
    clearPending(dir)
    expect(readPending(dir)).toBeNull()
  })
})

describe('bad answers are rejected', () => {
  const cases: { name: string; raw: string; names: string }[] = [
    { name: 'malformed JSON', raw: '{"kind": "proposals", ', names: 'JSON' },
    {
      name: 'a kind mismatch',
      raw: JSON.stringify({ kind: 'proofread', decisions: [] }),
      names: 'kind mismatch',
    },
    {
      name: 'a missing item id',
      raw: JSON.stringify({
        kind: 'proposals',
        decisions: [{ id: 'a', approve: true, reason: 'ok' }],
      }),
      names: 'b',
    },
    {
      name: 'a duplicated id',
      raw: JSON.stringify({
        kind: 'proposals',
        decisions: [
          { id: 'a', approve: true, reason: 'ok' },
          { id: 'a', approve: true, reason: 'ok' },
          { id: 'b', approve: true, reason: 'ok' },
        ],
      }),
      names: 'duplicate id: a',
    },
  ]

  for (const c of cases) {
    it(`rejects ${c.name}`, () => {
      writePending(dir, proposals)
      writeFileSync(answerPath(), c.raw)

      expect(readAnswer(dir, proposals)).toBeNull()
      expect(existsSync(answerPath())).toBe(false)
      expect(existsSync(path.join(dir, 'answer.rejected-1.json'))).toBe(true)
      expect(readFileSync(errorPath(), 'utf8')).toContain(c.names)
      expect(readPending(dir)).toEqual(proposals)
    })
  }

  it('numbers each rejected answer after the previous one', () => {
    writePending(dir, proposals)
    writeFileSync(answerPath(), '{')
    readAnswer(dir, proposals)
    writeFileSync(answerPath(), '{')
    readAnswer(dir, proposals)
    expect(existsSync(path.join(dir, 'answer.rejected-1.json'))).toBe(true)
    expect(existsSync(path.join(dir, 'answer.rejected-2.json'))).toBe(true)
  })
})

describe('logDecision', () => {
  it('appends one JSON line per call', () => {
    const answer: Answer = { kind: 'draft_review', usable: true, quality: 3, reason: '괜찮음' }
    logDecision(dir, pendingFixtures[2], answer)
    logDecision(dir, pendingFixtures[2], answer)
    const lines = readFileSync(path.join(dir, 'author-decisions.jsonl'), 'utf8').trim().split('\n')
    expect(lines).toHaveLength(2)
    expect(JSON.parse(lines[0])).toMatchObject({ step: 'ch1:draft', kind: 'draft_review' })
  })
})

describe('proposalLabel', () => {
  it.each([
    ['entry_create', { name: '해연' }, '해연'],
    ['entry_update', { entryName: '해연' }, '해연'],
    ['fact_create', { subjectName: '해연', content: '열쇠를 쥔다' }, '해연: 열쇠를 쥔다'],
    ['thread_create', { title: '봉인' }, '봉인'],
    ['thread_event', { threadTitle: '봉인', kind: 'developed' }, '봉인: developed'],
    ['relation_create', { sourceName: 'A', targetName: 'B', kind: '동료' }, 'A -> B (동료)'],
    ['chapter_summary', { summary: '1화 요약' }, '1화 요약'],
    ['style_card', { name: '해연 말투' }, '해연 말투'],
  ] as const)('names a %s proposal', (type, payload, label) => {
    expect(proposalLabel(type, payload)).toBe(label)
  })

  it('gives an empty label for an empty payload of every type', () => {
    for (const type of PROPOSAL_TYPES) {
      expect(proposalLabel(type, {})).toBe('')
    }
  })

  it('gives an empty label when a name field is not a string', () => {
    expect(proposalLabel('entry_create', { name: 5 })).toBe('')
  })

  it('cuts a label at 120 characters', () => {
    expect(proposalLabel('entry_create', { name: 'a'.repeat(300) })).toHaveLength(120)
  })
})

describe('logDecision details', () => {
  it('stores item labels for proposals', () => {
    logDecision(dir, proposals, {
      kind: 'proposals',
      decisions: [
        { id: 'a', approve: true, reason: 'ok' },
        { id: 'b', approve: false, reason: 'x' },
      ],
    })
    const line = JSON.parse(readFileSync(path.join(dir, 'author-decisions.jsonl'), 'utf8'))
    expect(line.items).toEqual([
      { id: 'a', type: 'entry_create', label: '해연', approve: true, reason: 'ok' },
      { id: 'b', type: 'thread_create', label: '봉인', approve: false, reason: 'x' },
    ])
    expect(line).toMatchObject({
      step: 'ch1:proposals',
      kind: 'proposals',
      answer: {
        kind: 'proposals',
        decisions: [
          { id: 'a', approve: true, reason: 'ok' },
          { id: 'b', approve: false, reason: 'x' },
        ],
      },
    })
  })

  it('stores topic and question for interview answers', () => {
    logDecision(dir, interviewPending, { kind: 'interview_answer', answer: '세 겹', bankKeys: [] })
    const line = JSON.parse(readFileSync(path.join(dir, 'author-decisions.jsonl'), 'utf8'))
    expect(line).toMatchObject({
      topic: '도시',
      question: '도시의 성벽은 몇 겹인가요?',
    })
    expect(line.items).toBeUndefined()
  })
})

describe('fakeAnswer', () => {
  const bible = loadBible('ko')

  it('returns a schema-valid answer for every pending kind', () => {
    for (const p of pendingFixtures) {
      expect(AnswerSchema.safeParse(fakeAnswer(p, bible)).success).toBe(true)
      expect(PendingSchema.safeParse(p).success).toBe(true)
    }
  })

  it('approves every proposal and accepts every proofread and continuity item', () => {
    expect(fakeAnswer(proposals, bible)).toEqual({
      kind: 'proposals',
      decisions: [
        { id: 'a', approve: true, reason: expect.any(String) },
        { id: 'b', approve: true, reason: expect.any(String) },
      ],
    })
    const proofread = fakeAnswer(pendingFixtures[3], bible)
    expect(proofread).toMatchObject({ kind: 'proofread', decisions: [{ id: 'p1', accept: true }] })
    const continuity = fakeAnswer(pendingFixtures[4], bible)
    expect(continuity).toMatchObject({ kind: 'continuity', decisions: [{ id: 'c1', valid: true }] })
  })

  it('marks every draft usable with quality 3', () => {
    expect(fakeAnswer(pendingFixtures[2], bible)).toMatchObject({
      kind: 'draft_review',
      usable: true,
      quality: 3,
    })
  })

  it('answers an interview question with the first bank entry sharing a word with it', () => {
    // '종루' and '봉인' both match; the bank lists rule-bell before places, so rule-bell wins.
    const p: InterviewPending = { ...interviewPending, question: '종루의 봉인은 어떻게 풀리나요?' }
    const entry = bible.answerBank.find((item) => item.key === 'rule-bell')
    expect(fakeAnswer(p, bible)).toEqual({
      kind: 'interview_answer',
      answer: entry?.answer,
      bankKeys: ['rule-bell'],
    })
  })

  it('falls back to the first bank entry when no topic matches the question', () => {
    const p: InterviewPending = { ...interviewPending, question: 'zzz' }
    const first = bible.answerBank[0]
    expect(fakeAnswer(p, bible)).toMatchObject({ answer: first.answer, bankKeys: [first.key] })
  })
})
