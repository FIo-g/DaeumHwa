import { describe, expect, it } from 'vitest'
import { AI_TASKS, type AiTaskName } from '@/db/types'
import { EN_INTERVIEW_TOPICS, EN_SYSTEMS } from './en-systems'
import { chapterExtractSample } from './samples/chapter-extract'
import { continuityCheckSample } from './samples/continuity-check'
import { directionAdviceSample } from './samples/direction-advice'
import { draftSample } from './samples/draft-chapter'
import { draftContinueSample } from './samples/draft-continue'
import { draftRepairSample } from './samples/draft-repair'
import { interviewExtractSample } from './samples/interview-extract'
import { interviewQuestionSample } from './samples/interview-question'
import { paragraphTrimSample } from './samples/paragraph-trim'
import { proofreadSample } from './samples/proofread'
import { readerSimSample } from './samples/reader-sim'
import { styleSuggestSample } from './samples/style-suggest'
import { findHangul, translateScaffold } from './scaffold'

// English-content sample inputs for every task (one module per task in ./samples). Together they
// exercise every branch of the product prompt builders, so a Korean fragment left in a builder
// shows up as Hangul here.

const PROMPTS: Record<AiTaskName, string> = {
  'interview-question': interviewQuestionSample,
  'interview-extract': interviewExtractSample,
  'chapter-extract': chapterExtractSample,
  'continuity-check': continuityCheckSample,
  proofread: proofreadSample,
  'reader-sim': readerSimSample,
  'direction-advice': directionAdviceSample,
  'draft-chapter': draftSample,
  'draft-continue': draftContinueSample,
  'style-suggest': styleSuggestSample,
  'paragraph-trim': paragraphTrimSample,
  'draft-repair': draftRepairSample,
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
