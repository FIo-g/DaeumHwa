import { interviewQuestionTask } from '@/ai/tasks/interview-question'
import { KINDS } from './shared'

export const interviewQuestionSample = interviewQuestionTask.buildPrompt({
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
})
