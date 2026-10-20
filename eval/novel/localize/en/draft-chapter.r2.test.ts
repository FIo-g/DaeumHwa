import { describe, expect, it } from 'vitest'
import { DRAFT_SYSTEM } from '@/ai/tasks/draft-chapter'
import { EN_SYSTEMS } from '../en-systems'
import { findHangul } from '../scaffold'
import { DRAFT_CHAPTER_SYSTEM } from './draft-chapter'

const RHYTHM_EN =
  '- Write with the paragraph rhythm of web novels (short paragraphs, dialogue-driven).'
const lines = DRAFT_CHAPTER_SYSTEM.split('\n')
const at = lines.indexOf(RHYTHM_EN)

const tagsOf = (line: string) => [...line.matchAll(/<([a-z_]+)>/g)].map((m) => m[1])

describe('P4 draft rules (English system prompt)', () => {
  it('puts the English opening and introduction rules right after the paragraph-rhythm rule', () => {
    expect(at).toBeGreaterThanOrEqual(0)
    expect(
      lines[at + 1].startsWith(
        "- If <draft_so_far> is not given, show the character's goal or conflict early in the first scene.",
      ),
    ).toBe(true)
    expect(lines[at + 2].startsWith('- When a character or proper term')).toBe(true)
  })

  it('keeps the English rules free of Hangul', () => {
    expect(findHangul(DRAFT_CHAPTER_SYSTEM)).toEqual([])
  })

  it('matches the Korean system in rule count', () => {
    const count = (text: string) => text.split('\n').filter((l) => l.startsWith('- ')).length
    expect(count(DRAFT_CHAPTER_SYSTEM)).toBe(count(DRAFT_SYSTEM))
  })

  it('names the same tags in the same order as the Korean rules', () => {
    const koLines = DRAFT_SYSTEM.split('\n')
    const koAt = koLines.findIndex((l) => l.startsWith('- 웹소설 문단 호흡'))
    const enOpening = lines[at + 1]
    const enIntro = lines[at + 2]
    const koOpening = koLines[koAt + 1]
    const koIntro = koLines[koAt + 2]
    expect(tagsOf(enOpening)).toEqual(tagsOf(koOpening))
    expect(tagsOf(enIntro)).toEqual(tagsOf(koIntro))
    expect(tagsOf(enOpening)).toEqual(['draft_so_far'])
    expect(tagsOf(enIntro)).toEqual(['previous_summary', 'previous_tail', 'draft_so_far'])
  })

  it('keeps the instruction-bound clauses', () => {
    expect(lines[at + 1]).toContain("the author's instructions and the wiki")
    expect(lines[at + 2]).toContain("Use only what the author's instructions and the wiki say")
    expect(lines[at + 2]).toContain('do not pile up explanation')
  })

  it('serves the continuation call the same text', () => {
    expect(EN_SYSTEMS['draft-continue']).toBe(EN_SYSTEMS['draft-chapter'])
    expect(EN_SYSTEMS['draft-continue']).toContain('- If <draft_so_far> is not given')
  })
})
