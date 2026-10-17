import { readFileSync } from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'

// Guards the continuity fixture against the counts and text rules in plan T27. Reads the files
// directly so a broken fixture fails the unit tests, not only the slow eval run.

const DIR = path.resolve(process.cwd(), 'eval/fixtures/continuity')
const readJson = (file: string) => JSON.parse(readFileSync(path.join(DIR, file), 'utf8'))
const readChapter = (position: number) =>
  readFileSync(path.join(DIR, 'chapters', `${String(position).padStart(2, '0')}.md`), 'utf8').trim()

const work = readJson('work.json')
const answers = readJson('answers.json')
const positions = Array.from({ length: 10 }, (_, i) => i + 1)

describe('continuity fixture', () => {
  it('has 10 chapters of 900 to 1300 characters', () => {
    for (const position of positions) {
      const length = readChapter(position).length
      expect(length, `${position}화 length`).toBeGreaterThanOrEqual(900)
      expect(length, `${position}화 length`).toBeLessThanOrEqual(1300)
    }
  })

  it('has at least 6 entries, 20 facts, 3 planted threads and 2 naming rules', () => {
    expect(work.entries.length).toBeGreaterThanOrEqual(6)
    expect(work.facts.length).toBeGreaterThanOrEqual(20)
    expect(
      work.facts.filter(
        (f: { validFromPosition: number | null; validToPosition: number | null }) =>
          f.validFromPosition !== null || f.validToPosition !== null,
      ).length,
    ).toBeGreaterThanOrEqual(2)
    expect(
      work.threads.filter(
        (t: { plantedChapter: number | null; targetChapter: number | null }) =>
          t.plantedChapter !== null && t.targetChapter !== null,
      ).length,
    ).toBeGreaterThanOrEqual(3)
    expect(work.namingRules.length).toBeGreaterThanOrEqual(2)
  })

  it('references only known entry keys and chapter positions', () => {
    const keys = new Set(work.entries.map((e: { key: string }) => e.key))
    for (const fact of work.facts) expect(keys.has(fact.entry), fact.content).toBe(true)
    for (const fact of work.facts) {
      if (fact.sourceChapter !== null) expect(positions).toContain(fact.sourceChapter)
    }
  })

  it('lists exactly 11 expected errors in chapters 3 to 10, each quoted verbatim', () => {
    expect(answers.expected).toHaveLength(11)
    for (const item of answers.expected) {
      expect(item.chapter).toBeGreaterThanOrEqual(3)
      expect(item.chapter).toBeLessThanOrEqual(10)
      expect(readChapter(item.chapter), item.quoteIncludes).toContain(item.quoteIncludes)
    }
  })

  it('keeps the explained age change out of the expected errors', () => {
    const ageNotDefect = answers.notDefects.find(
      (item: { quoteIncludes: string }) => item.quoteIncludes === '세린은 17살이 된 뒤로',
    )
    expect(ageNotDefect).toBeDefined()
    expect(readChapter(ageNotDefect.chapter)).toContain(ageNotDefect.quoteIncludes)
    const expectedAge = answers.expected.filter((item: { quoteIncludes: string }) =>
      item.quoteIncludes.includes('17살'),
    )
    expect(expectedAge).toHaveLength(0)
  })
})
