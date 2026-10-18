import { describe, expect, it } from 'vitest'
import { bibleDir, BibleSchema, loadBible } from './bible'

// Guards the story bible fixtures for the novel eval. Checks the schema, the chapter and naming
// rules, and that the Korean and English bibles stay in parity so scores compare like for like.

const ko = loadBible('ko')
const en = loadBible('en')

const keysOf = (items: readonly { key: string }[]) => items.map((item) => item.key)

describe('story bible fixtures', () => {
  it('parse with BibleSchema', () => {
    expect(BibleSchema.safeParse(ko).success).toBe(true)
    expect(BibleSchema.safeParse(en).success).toBe(true)
  })

  it('resolve the fixture directory from the repo root', () => {
    expect(bibleDir('ko')).toMatch(/eval[\\/]fixtures[\\/]novel[\\/]ko$/)
    expect(bibleDir('en')).toMatch(/eval[\\/]fixtures[\\/]novel[\\/]en$/)
  })

  it('has 5 chapters at positions 1 to 5', () => {
    for (const bible of [ko, en]) {
      expect(bible.chapters.length).toBe(5)
      expect(bible.chapters.map((chapter) => chapter.position)).toEqual([1, 2, 3, 4, 5])
    }
  })

  it('names a character, place or item for every fact subject', () => {
    for (const bible of [ko, en]) {
      const names = new Set(
        [...bible.characters, ...bible.places, ...bible.items].map((entity) => entity.name),
      )
      for (const fact of bible.facts) {
        expect(
          names.has(fact.subject),
          `${bible.lang} fact ${fact.key} subject "${fact.subject}"`,
        ).toBe(true)
      }
    }
  })

  it('has unique answerBank keys', () => {
    for (const bible of [ko, en]) {
      const keys = keysOf(bible.answerBank)
      expect(new Set(keys).size, `${bible.lang} answerBank keys`).toBe(keys.length)
    }
  })

  it('keeps ko and en keys equal for every keyed array', () => {
    const arrays = ['characters', 'places', 'items', 'facts', 'threads', 'answerBank'] as const
    for (const field of arrays) {
      expect(keysOf(en[field]).sort(), field).toEqual(keysOf(ko[field]).sort())
    }
  })

  it('keeps ko and en chapter counts and mustInclude lengths equal', () => {
    expect(en.chapters.length).toBe(ko.chapters.length)
    ko.chapters.forEach((chapter, index) => {
      expect(en.chapters[index].mustInclude.length, `chapter ${chapter.position}`).toBe(
        chapter.mustInclude.length,
      )
    })
  })

  it('keeps ko and en timing and importance values equal per key', () => {
    const byKey = <T extends { key: string }>(items: T[]) =>
      new Map(items.map((item) => [item.key, item]))
    const enFacts = byKey(en.facts)
    for (const fact of ko.facts) {
      const other = enFacts.get(fact.key)
      expect(other?.validFrom, `fact ${fact.key} validFrom`).toBe(fact.validFrom)
      expect(other?.validTo, `fact ${fact.key} validTo`).toBe(fact.validTo)
    }
    const enThreads = byKey(en.threads)
    for (const thread of ko.threads) {
      const other = enThreads.get(thread.key)
      expect(other?.plannedChapter, `thread ${thread.key} plannedChapter`).toBe(
        thread.plannedChapter,
      )
      expect(other?.targetChapter, `thread ${thread.key} targetChapter`).toBe(thread.targetChapter)
      expect(other?.importance, `thread ${thread.key} importance`).toBe(thread.importance)
    }
  })

  it('targets 5000 characters for ko', () => {
    expect(ko.targetChars).toBe(5000)
  })

  it('targets 9000 to 13000 characters for en', () => {
    expect(en.targetChars).toBeGreaterThanOrEqual(9000)
    expect(en.targetChars).toBeLessThanOrEqual(13000)
  })

  it('keeps Hangul out of the English bible', () => {
    expect(JSON.stringify(en).match(/[가-힣]/g) ?? []).toEqual([])
  })
})
