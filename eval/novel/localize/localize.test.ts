import { describe, expect, it } from 'vitest'
import { AI_TASKS, type AiTaskName } from '@/db/types'
import { type ContextPack, renderContextPack } from '@/ai/context'
import { buildDraftPrompt } from '@/ai/tasks/draft-chapter'
import { chapterExtractTask } from '@/ai/tasks/chapter-extract'
import { continuityCheckTask } from '@/ai/tasks/continuity-check'
import { directionAdviceTask } from '@/ai/tasks/direction-advice'
import { interviewExtractTask } from '@/ai/tasks/interview-extract'
import { interviewQuestionTask } from '@/ai/tasks/interview-question'
import { proofreadTask } from '@/ai/tasks/proofread'
import { readerSimTask } from '@/ai/tasks/reader-sim'
import { styleSuggestTask } from '@/ai/tasks/style-suggest'
import { READER_PERSONAS } from '@/ai/personas'
import { EN_INTERVIEW_TOPICS, EN_SYSTEMS } from './en-systems'
import { findHangul, translateScaffold } from './scaffold'

// English-content sample inputs for every task. Together they exercise every branch of the
// product prompt builders, so a Korean fragment left in a builder shows up as Hangul here.

const pack: ContextPack = {
  position: 3,
  entries: [
    {
      ref: 'E1',
      id: 'e1',
      kind: 'character',
      name: 'Mina Park',
      aliases: ['Min'],
      summary: 'A courier who never misses a deadline',
      fields: {
        role: 'protagonist',
        age: '19',
        gender: 'female',
        appearance: 'short black hair',
        personality: 'stubborn',
        speech: 'casual',
        goal: 'find her brother',
        background: 'raised by her aunt',
      },
      mentionCount: 4,
      facts: [
        {
          ref: 'F1',
          id: 'f1',
          content: 'Mina lost her left ring finger',
          status: 'confirmed',
          sourcePosition: 1,
          validFromPosition: 1,
          validToPosition: null,
          evidence: 'She hid her left hand.',
        },
        {
          ref: 'F2',
          id: 'f2',
          content: 'Mina can hear the clock tower at night',
          status: 'assumed',
          sourcePosition: null,
          validFromPosition: null,
          validToPosition: 5,
          evidence: '',
        },
        {
          ref: 'F3',
          id: 'f3',
          content: 'The brother may be alive',
          status: 'undecided',
          sourcePosition: 2,
          validFromPosition: 2,
          validToPosition: 4,
          evidence: '',
        },
      ],
    },
    {
      ref: 'E2',
      id: 'e2',
      kind: 'place',
      name: 'Clock Tower',
      aliases: [],
      summary: '',
      fields: { location: 'east district', features: 'stopped at midnight' },
      mentionCount: 1,
      facts: [],
    },
  ],
  threads: [
    {
      ref: 'T1',
      id: 't1',
      title: 'Locked drawer',
      description: 'Who owns the key?',
      status: 'planted',
      plantedPosition: 2,
      targetPosition: 5,
      importance: 'high',
      overdue: false,
    },
    {
      ref: 'T2',
      id: 't2',
      title: 'Missing brother',
      description: '',
      status: 'planned',
      plantedPosition: null,
      targetPosition: null,
      importance: 'low',
      overdue: true,
    },
    {
      ref: 'T3',
      id: 't3',
      title: 'Old debt',
      description: 'Owed to the courier guild',
      status: 'developing',
      plantedPosition: 1,
      targetPosition: null,
      importance: 'medium',
      overdue: false,
    },
    {
      ref: 'T4',
      id: 't4',
      title: 'Found letter',
      description: '',
      status: 'resolved',
      plantedPosition: 1,
      targetPosition: 2,
      importance: 'low',
      overdue: false,
    },
    {
      ref: 'T5',
      id: 't5',
      title: 'Dropped idea',
      description: '',
      status: 'discarded',
      plantedPosition: null,
      targetPosition: null,
      importance: 'high',
      overdue: false,
    },
  ],
  relations: [
    {
      sourceName: 'Mina Park',
      targetName: 'Clock Tower',
      kind: 'owner',
      description: 'works there',
    },
  ],
  previousSummaries: [{ position: 2, title: 'The drawer', summary: 'Mina finds a locked drawer.' }],
  namingRules: [{ canonical: 'Clock Tower', variants: ['Clocktower'] }],
  stats: { totalEntries: 2, selectedEntries: 2, approxChars: 0 },
}

const KINDS = [
  'character',
  'place',
  'organization',
  'item',
  'rule',
  'event',
  'term',
  'other',
] as const

const PROMPTS: Record<AiTaskName, string> = {
  'interview-question': interviewQuestionTask.buildPrompt({
    work: {
      title: 'The Clock Tower Courier',
      genre: 'mystery',
      logline: 'A courier finds a stopped clock.',
      synopsis: 'Mina delivers letters that should never arrive.',
    },
    wiki: {
      counts: Object.fromEntries(KINDS.map((k, i) => [k, i])) as Record<
        (typeof KINDS)[number],
        number
      >,
      entries: [
        { name: 'Mina Park', kind: 'character', factCount: 3, summary: 'A courier' },
        { name: 'Clock Tower', kind: 'place', factCount: 0, summary: '' },
      ],
      openThreads: [
        { title: 'Locked drawer', targetChapterPosition: 5 },
        { title: 'Missing brother', targetChapterPosition: null },
      ],
    },
    story: {
      latestPosition: 3,
      recentSummaries: [{ position: 3, title: 'Midnight', summary: 'Mina climbs the tower.' }],
      readerReactions: [{ position: 3, digest: 'Readers liked the climb.' }],
      openIssueCount: 2,
    },
    covered: [
      {
        topic: 'protagonist',
        question: 'Who is Mina?',
        answer: 'A courier.',
        skipped: false,
        focus: 'setting',
      },
      {
        topic: 'ending direction',
        question: 'How does it end?',
        answer: null,
        skipped: false,
        focus: 'story',
      },
      { topic: 'style', question: 'What tone?', answer: null, skipped: true, focus: 'setting' },
    ],
    coveredDropped: 4,
    recent: [
      {
        topic: 'central conflict',
        question: 'What is at stake?',
        answer: 'Her brother.',
        skipped: false,
      },
    ],
    rejected: 'Who is Mina?',
  }),
  'interview-extract': interviewExtractTask.buildPrompt({
    topic: 'protagonist',
    focus: 'setting',
    question: 'Who is Mina?',
    answer: 'Mina is a courier who lost a finger.',
    known: [
      { name: 'Mina Park', kind: 'character', aliases: ['Min'], pending: false },
      { name: 'Han Siwoo', kind: 'character', aliases: [], pending: true },
    ],
    threads: [
      { title: 'Locked drawer', pending: false },
      { title: 'Old debt', pending: true },
    ],
  }),
  'chapter-extract': chapterExtractTask.buildPrompt({
    chapterText: 'Mina opened the drawer at midnight.',
    chapterPosition: 3,
    chapterTitle: 'Midnight',
    known: [
      { name: 'Mina Park', kind: 'character', aliases: ['Min'] },
      { name: 'Han Siwoo', kind: 'character', aliases: [], pending: true },
    ],
    openThreads: [
      { ref: 'T1', title: 'Locked drawer', description: 'Who owns the key?', status: 'planted' },
      { ref: 'T2', title: 'Missing brother', description: '', status: 'planned' },
    ],
    knownFacts: [{ ref: 'F1', subjectName: 'Mina Park', content: 'Lost a finger' }],
  }),
  'continuity-check': continuityCheckTask.buildPrompt({
    chapterText: 'Mina opened the drawer at midnight.',
    chapterPosition: 3,
    chapterTitle: 'Midnight',
    pack,
  }),
  proofread: proofreadTask.buildPrompt({ text: 'She go to the tower.' }),
  'reader-sim': readerSimTask.buildPrompt({
    chapterText: 'Mina opened the drawer at midnight.',
    chapterPosition: 3,
    chapterTitle: 'Midnight',
    previousSummaries: [{ position: 2, summary: 'Mina finds a locked drawer.' }],
    work: { title: 'The Clock Tower Courier', genre: '', logline: '' },
    personas: READER_PERSONAS,
  }),
  'direction-advice': directionAdviceTask.buildPrompt({
    work: {
      title: 'The Clock Tower Courier',
      genre: 'mystery',
      logline: 'A courier finds a stopped clock.',
      synopsis: '',
    },
    latestPosition: 3,
    threads: [
      {
        title: 'Locked drawer',
        description: 'Who owns the key?',
        status: 'planted',
        plantedPosition: 2,
        targetPosition: 5,
        overdue: true,
      },
      {
        title: 'Missing brother',
        description: '',
        status: 'planned',
        plantedPosition: null,
        targetPosition: null,
        overdue: false,
      },
    ],
    characters: [
      { name: 'Mina Park', summary: 'A courier', lastPosition: 3, keyFacts: ['Lost a finger'] },
      { name: 'Han Siwoo', summary: '', lastPosition: null, keyFacts: [] },
    ],
    recentSummaries: [{ position: 3, title: 'Midnight', summary: 'Mina climbs the tower.' }],
  }),
  'draft-chapter': buildDraftPrompt({
    instructions: 'Mina finds the letter under the stairs.',
    targetChars: 3000,
    styleCards: [
      {
        name: 'Mina Park speech',
        entryName: 'Mina Park',
        tone: 'blunt',
        rules: 'Short sentences.',
        examples: 'Fine. Move.',
      },
      { name: 'Narration', entryName: null, tone: '', rules: '', examples: '' },
    ],
    packText: renderContextPack(pack),
    previousSummary: null,
    previousTail: 'The door closed.',
    chapterLabel: 'Chapter 4',
  }),
  'style-suggest': styleSuggestTask.buildPrompt({
    entryName: 'Mina Park',
    samples: ['Fine. Move.', 'I am not waiting all night.'],
  }),
}

describe('EN_SYSTEMS', () => {
  it('has an English prompt for every task', () => {
    for (const name of AI_TASKS) {
      expect(EN_SYSTEMS[name].length).toBeGreaterThan(0)
      expect(findHangul(EN_SYSTEMS[name])).toEqual([])
    }
  })

  it('lists 8 non-empty interview topics with no empty array slot', () => {
    expect(EN_INTERVIEW_TOPICS).toHaveLength(8)
    expect(EN_INTERVIEW_TOPICS.every((topic) => topic.length > 0)).toBe(true)
    expect(EN_SYSTEMS['interview-question']).not.toContain(', ,')
  })
})

describe('translateScaffold', () => {
  it('leaves Korean-free scaffolding fully translated for every task', () => {
    for (const name of AI_TASKS) {
      const translated = translateScaffold(PROMPTS[name])
      expect(findHangul(translated), name).toEqual([])
    }
  })

  it('keeps XML tag names in the same order', () => {
    const tagNames = (text: string) => [...text.matchAll(/<\/?([A-Za-z_][\w-]*)/g)].map((m) => m[1])
    for (const name of AI_TASKS) {
      expect(tagNames(translateScaffold(PROMPTS[name])), name).toEqual(tagNames(PROMPTS[name]))
    }
  })

  it('leaves English content untouched', () => {
    const prompt = '<instructions>\nMina finds the letter under the stairs.\n</instructions>'
    expect(translateScaffold(prompt)).toBe(prompt)
  })

  it('translates chapter numbers and status labels', () => {
    expect(translateScaffold('현재 회차: 3화')).toBe('Current chapter: 3')
    expect(translateScaffold('- 요약: 3화')).toBe('- Summary: Chapter 3')
  })
})
