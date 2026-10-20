import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { buildDraftPrompt } from '@/ai/tasks/draft-chapter'
import { AI_TASKS, type AiTaskName } from '@/db/types'
import { EN_INTERVIEW_TOPICS, EN_SYSTEMS } from './en-systems'
import { chapterExtractSample } from './samples/chapter-extract'
import { chapterExtractFactsSample } from './samples/chapter-extract-facts'
import { chapterExtractRelationsSample } from './samples/chapter-extract-relations'
import { chapterExtractThreadsSample } from './samples/chapter-extract-threads'
import { continuityCheckSample } from './samples/continuity-check'
import { directionAdviceSample } from './samples/direction-advice'
import { draftBeatsSample } from './samples/draft-beats'
import { draftSample } from './samples/draft-chapter'
import { draftContinueSample } from './samples/draft-continue'
import { draftPlanSample } from './samples/draft-plan'
import { draftRepairSample } from './samples/draft-repair'
import { interviewExtractSample } from './samples/interview-extract'
import { interviewQuestionSample } from './samples/interview-question'
import { paragraphTrimSample } from './samples/paragraph-trim'
import { proofreadSample } from './samples/proofread'
import { readerSimSample } from './samples/reader-sim'
import { sceneRewriteSample } from './samples/scene-rewrite'
import { styleSuggestSample } from './samples/style-suggest'
import { countHangul, findHangul, translateScaffold } from './scaffold'

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
  'draft-beats': draftBeatsSample,
  'draft-plan': draftPlanSample,
  // Scene calls are built on the draft prompt (stage 1, draft-scene); the sample is the draft prompt.
  'draft-scene': draftSample,
  'scene-rewrite': sceneRewriteSample,
  'chapter-extract-facts': chapterExtractFactsSample,
  'chapter-extract-threads': chapterExtractThreadsSample,
  'chapter-extract-relations': chapterExtractRelationsSample,
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

  it('translates the new-chapter draft label', () => {
    expect(translateScaffold('3화 (새 회차)')).toBe('Chapter 3 (new chapter)')
  })

  it('leaves no Hangul in a draft prompt built with the product label', () => {
    // Own input instead of the shared draft sample, so the product label is exercised without
    // changing the sample module.
    const prompt = buildDraftPrompt({
      instructions: 'Mina finds the letter under the stairs.',
      targetChars: 3000,
      styleCards: [],
      packText: 'Pack.',
      previousSummary: null,
      previousTail: 'The door closed.',
      chapterLabel: '4화 (새 회차)',
    })
    const result = translateScaffold(prompt)
    expect(findHangul(result)).toEqual([])
    expect(result).toContain('<chapter>Chapter 4 (new chapter)</chapter>')
  })

  it('leaves a bare Korean word that is not in the table alone', () => {
    expect(translateScaffold('회차 메모')).toBe('회차 메모')
  })

  it('keeps the generic chapter-number rule for other labels', () => {
    expect(translateScaffold('3화')).toBe('Chapter 3')
  })

  it('countHangul is 0 after translating the draft label', () => {
    expect(countHangul(translateScaffold('3화 (새 회차)'))).toBe(0)
  })

  it('product draft label still matches the fixture and the rule', () => {
    // Drift check: the product builds this label in src/server/ai-features.ts. If its wording
    // changes, update the rule, the draft sample and the tests above together.
    const source = readFileSync(
      fileURLToPath(new URL('../../../src/server/ai-features.ts', import.meta.url)),
      'utf8',
    )
    expect(source).toContain('화 (새 회차)')
  })
})
