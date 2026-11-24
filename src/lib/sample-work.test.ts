import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { SAMPLE_WORK } from './sample-work'

const FIXTURE_DIR = join(process.cwd(), 'eval', 'fixtures', 'continuity-planted')

type Fixture = {
  chapters: { title: string }[]
  facts: { entry: string; content: string }[]
}

const fixture: Fixture = JSON.parse(readFileSync(join(FIXTURE_DIR, 'work.json'), 'utf8'))

function fixtureChapterBody(position: number): string {
  return readFileSync(join(FIXTURE_DIR, 'chapters', `0${position}.md`), 'utf8').trim()
}

describe('SAMPLE_WORK', () => {
  it('copies chapter titles, manuscripts and facts from the planted eval set', () => {
    expect(SAMPLE_WORK.chapters).toHaveLength(3)
    SAMPLE_WORK.chapters.forEach((chapter, index) => {
      const position = index + 1
      expect(chapter.title).toBe(fixture.chapters[index].title)
      expect(chapter.body).toBe(fixtureChapterBody(position))
    })

    expect(SAMPLE_WORK.facts).toEqual(
      fixture.facts.map((fact) => ({ entryKey: fact.entry, content: fact.content })),
    )
  })

  it('links only cards of the sample, inside its chapters', () => {
    const keys = new Set(SAMPLE_WORK.entries.map((entry) => entry.key))
    expect(SAMPLE_WORK.relations.length).toBeGreaterThanOrEqual(2)
    for (const relation of SAMPLE_WORK.relations) {
      expect(keys.has(relation.sourceKey)).toBe(true)
      expect(keys.has(relation.targetKey)).toBe(true)
      expect(relation.sourceKey).not.toBe(relation.targetKey)
      for (const position of [relation.startPosition, relation.endPosition]) {
        if (position !== null) expect(position).toBeLessThanOrEqual(SAMPLE_WORK.chapters.length)
      }
    }
  })

  it('quotes each planted error verbatim in its chapter', () => {
    expect(SAMPLE_WORK.plantedErrors).toHaveLength(3)
    for (const error of SAMPLE_WORK.plantedErrors) {
      expect(SAMPLE_WORK.chapters[error.chapter - 1].body).toContain(error.quote)
    }
  })
})
