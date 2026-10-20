import { describe, expect, it } from 'vitest'
import type { EntryKind } from '@/db/types'
import {
  type InterviewQuestionInput,
  interviewQuestionTask,
  UNKNOWN_NAMES_RULE,
} from '@/ai/tasks/interview-question'
import { EN_SYSTEMS } from './en-systems'
import { findHangul, translateScaffold } from './scaffold'
import { KINDS } from './samples/shared'

// P12: the English eval prompt carries the re-ask block and rule, with no Korean left behind.

const baseInput: InterviewQuestionInput = {
  work: {
    title: 'The Clock Tower Courier',
    genre: 'mystery',
    logline: 'A courier finds a stopped clock.',
    synopsis: 'Mina delivers letters that should never arrive.',
  },
  wiki: {
    counts: Object.fromEntries(KINDS.map((kind, i) => [kind, i])) as Record<EntryKind, number>,
    entries: [{ name: 'Mina Park', kind: 'character', factCount: 3, summary: 'A courier' }],
    openThreads: [],
  },
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
}

describe('interview-question re-ask in English (P12)', () => {
  it('the re-ask prompt has no Hangul left after translation', () => {
    const prompt = interviewQuestionTask.buildPrompt({
      ...baseInput,
      rejected: 'Who is Gwak Duseok?',
      unknownNames: ['Gwak Duseok'],
    })
    const translated = translateScaffold(prompt)
    expect(findHangul(translated)).toEqual([])
    expect(translated).toContain('<unknown_names>\nGwak Duseok\n</unknown_names>')
    expect(translated.endsWith('Use only names that exist, or ask without a name.')).toBe(true)
  })

  it('the Korean rule maps to the English sentence', () => {
    expect(translateScaffold(UNKNOWN_NAMES_RULE)).toBe(
      'The names or phrases in <unknown_names> do not appear in the synopsis, wiki or answers the author gave. Do not use them in the question. Use only names that exist, or ask without a name.',
    )
  })

  it('a default prompt is unchanged', () => {
    const translated = translateScaffold(interviewQuestionTask.buildPrompt(baseInput))
    expect(translated).not.toContain('unknown_names')
    expect(EN_SYSTEMS['interview-question']).not.toContain('unknown_names')
  })
})
