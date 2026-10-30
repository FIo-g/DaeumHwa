import { describe, expect, it } from 'vitest'
import { READER_PERSONAS } from '@/ai/personas'
import { TAG_DATA_RULE } from '@/ai/prompt-utils'
import { DEFAULT_AI_TIMEOUT_MS } from '@/ai/run'
import {
  locateLooseQuote,
  READER_SIM_CLOUD_TIMEOUT_MS,
  READER_SIM_SYSTEM,
  type ReaderSimInput,
  type ReaderSimResult,
  readerSimTask,
} from '@/ai/tasks/reader-sim'
import { locateQuote } from '@/lib/korean'

const CHAPTER = 'Then the bell trembled. Nobody answered.'

const input: ReaderSimInput = {
  chapterText: CHAPTER,
  chapterPosition: 1,
  chapterTitle: 'Bell',
  previousSummaries: [],
  work: { title: 'Grey City', genre: 'fantasy', logline: 'A bell that rings for no one.' },
  personas: READER_PERSONAS,
}

function slice(text: string, range: { start: number; end: number } | null): string | null {
  return range === null ? null : text.slice(range.start, range.end)
}

/** Runs the task's postProcess over one persona with the given moments. */
function process(
  chapterText: string,
  moments: { quote: string; reaction?: string; comment?: string }[],
  rating = 4,
) {
  const output: ReaderSimResult = {
    personas: [
      {
        personaId: 'reader-binge',
        rating,
        dropOffRisk: 'low',
        overall: 'ok',
        moments: moments.map((m) => ({
          quote: m.quote,
          reaction: (m.reaction ?? 'excited') as 'excited',
          comment: m.comment ?? 'c',
        })),
      },
    ],
    summary: 's',
  }
  const postProcess = readerSimTask.postProcess
  if (!postProcess) throw new Error('readerSimTask has no postProcess')
  return postProcess(output, { ...input, chapterText }).personas[0]
}

describe('locateLooseQuote', () => {
  it('finds a quote that differs only in letter case', () => {
    const text = 'Then the bell trembled.'
    expect(slice(text, locateLooseQuote(text, 'The bell trembled.'))).toBe('the bell trembled.')
  })

  it('finds a quote with spacing the manuscript does not have', () => {
    const text = '계단은 아홉개 층이었다.'
    expect(slice(text, locateLooseQuote(text, '계단은 아홉 개 층이었다.'))).toBe(text)
  })

  it('finds a quote when the manuscript has the space and the quote does not', () => {
    const text = '계단은 아홉 개 층이었다.'
    expect(slice(text, locateLooseQuote(text, '계단은아홉개층이었다.'))).toBe(text)
  })

  it('ignores a line break inside the match', () => {
    const text = 'She\nlooked up.'
    expect(slice(text, locateLooseQuote(text, 'shelooked up.'))).toBe('She\nlooked up.')
  })

  it('returns null when the words are not there', () => {
    expect(locateLooseQuote('Then the bell trembled.', 'The bell shook.')).toBeNull()
  })

  it('returns null for an empty or whitespace-only quote', () => {
    expect(locateLooseQuote(CHAPTER, '')).toBeNull()
    expect(locateLooseQuote(CHAPTER, '  \n ')).toBeNull()
  })

  it('maps offsets back across a character whose lower case has two units', () => {
    const text = 'İSTANBUL BELL rang.'
    expect(slice(text, locateLooseQuote(text, 'bell rang.'))).toBe('BELL rang.')
  })
})

describe('readerSimTask quote check', () => {
  it('keeps a quote that matches as given, trimmed', () => {
    const persona = process(CHAPTER, [{ quote: '  Nobody answered.  ' }])
    expect(persona.moments.map((m) => m.quote)).toEqual(['Nobody answered.'])
  })

  it('does not rewrite a quote that locateQuote already matches with collapsed whitespace', () => {
    const persona = process('He  left.', [{ quote: 'He left.' }])
    expect(persona.moments.map((m) => m.quote)).toEqual(['He left.'])
  })

  it('keeps a case-different quote and stores the manuscript wording', () => {
    const persona = process(CHAPTER, [{ quote: 'The bell trembled.', comment: 'kept' }])
    expect(persona.moments).toEqual([
      { quote: 'the bell trembled.', reaction: 'excited', comment: 'kept' },
    ])
  })

  it('keeps a spacing-different quote and stores the manuscript wording', () => {
    const text = '계단은 아홉개 층이었다.'
    const persona = process(text, [{ quote: '계단은 아홉 개 층이었다.' }])
    expect(persona.moments.map((m) => m.quote)).toEqual([text])
  })

  it('stores only quotes the shared locateQuote can find again', () => {
    const persona = process(CHAPTER, [
      { quote: 'The bell trembled.' },
      { quote: 'NOBODY ANSWERED.' },
    ])
    for (const moment of persona.moments) {
      expect(locateQuote(CHAPTER, moment.quote)).not.toBeNull()
    }
    expect(persona.moments).toHaveLength(2)
  })

  it('still drops a paraphrase that is not in the chapter', () => {
    const persona = process(CHAPTER, [{ quote: 'The bell stopped ringing.' }])
    expect(persona.moments).toEqual([])
  })

  it('drops a whitespace-only quote', () => {
    const persona = process(CHAPTER, [{ quote: '   ' }])
    expect(persona.moments).toEqual([])
  })

  it('keeps reaction and comment of a rescued moment and still clamps the rating', () => {
    const persona = process(
      CHAPTER,
      [{ quote: 'the BELL trembled.', reaction: 'moved', comment: 'good beat' }],
      9,
    )
    expect(persona.rating).toBe(5)
    expect(persona.moments).toEqual([
      { quote: 'the bell trembled.', reaction: 'moved', comment: 'good beat' },
    ])
  })
})

describe('reader simulation time limit', () => {
  it('READER_SIM_CLOUD_TIMEOUT_MS is 270000, above the default, above the slowest saved cloud call and under the route limit', () => {
    expect(READER_SIM_CLOUD_TIMEOUT_MS).toBe(270_000)
    expect(READER_SIM_CLOUD_TIMEOUT_MS).toBeGreaterThan(DEFAULT_AI_TIMEOUT_MS)
    expect(READER_SIM_CLOUD_TIMEOUT_MS).toBeGreaterThan(231_113)
    expect(READER_SIM_CLOUD_TIMEOUT_MS).toBeLessThan(300_000)
  })

  it('readerSimTask has no timeoutMs of its own', () => {
    expect(readerSimTask.timeoutMs).toBeUndefined()
  })
})

describe('reader simulation earlier-chapter rule', () => {
  it('the system prompt limits earlier-chapter claims to previous_summaries', () => {
    const rule =
      '- 이전 회차에 대해서는 <previous_summaries>에 적힌 내용만 말한다. 거기에 없는 이전 회차를 읽었다거나, 이전 회차에서 비슷한 표현을 본 적 있다고 쓰지 않는다. (없음)이면 이번 원고만 근거로 삼는다.'
    const lines = READER_SIM_SYSTEM.split('\n')
    const index = lines.indexOf(rule)
    expect(index).toBeGreaterThan(-1)
    expect(lines[index + 1]).toBe(TAG_DATA_RULE)
  })

  it('the user prompt still renders (없음) when there are no summaries', () => {
    const prompt = readerSimTask.buildPrompt(input)
    expect(prompt).toContain('<previous_summaries>\n(없음)\n</previous_summaries>')
  })
})
