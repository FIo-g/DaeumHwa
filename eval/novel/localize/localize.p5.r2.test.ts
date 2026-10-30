import { describe, expect, it } from 'vitest'
import { PLANNED_THREAD_MARK, renderContextPack } from '@/ai/context'
import { buildDraftPrompt } from '@/ai/tasks/draft-chapter'
import { DRAFT_CHAPTER_SYSTEM } from './en/draft-chapter'
import { EN_SYSTEMS } from './en-systems'
import { pack } from './samples/shared'
import { findHangul, translateScaffold } from './scaffold'

describe('P5 planned-thread English scaffold', () => {
  const englishMark = translateScaffold(PLANNED_THREAD_MARK)

  it('translates the mark', () => {
    expect(englishMark).toBe('use only if the instructions mention it')
  })

  it('a marked draft prompt has no Hangul left', () => {
    const packText = renderContextPack(pack, { markPlannedThreads: true })
    const prompt = buildDraftPrompt({
      instructions: 'Mina finds the letter under the stairs.',
      targetChars: 3000,
      styleCards: [],
      packText,
      previousSummary: null,
      previousTail: 'The door closed.',
      chapterLabel: '4화 (새 회차)',
    })
    const translated = translateScaffold(prompt)
    expect(findHangul(translated)).toEqual([])
    expect(translated).toContain(
      `- [T2] Missing brother (importance low, planned, overdue, ${englishMark})`,
    )
    const occurrences = translated.split(englishMark).length - 1
    expect(occurrences).toBe(1)
  })

  it('the English system rule quotes the translated mark', () => {
    const quoted = `"${englishMark}"`
    const matching = DRAFT_CHAPTER_SYSTEM.split('\n').filter((line) => line.includes(quoted))
    expect(matching).toHaveLength(1)
    expect(findHangul(DRAFT_CHAPTER_SYSTEM)).toEqual([])
    expect(EN_SYSTEMS['draft-continue']).toBe(EN_SYSTEMS['draft-chapter'])
    expect(EN_SYSTEMS['draft-continue']).toContain(quoted)
  })
})
