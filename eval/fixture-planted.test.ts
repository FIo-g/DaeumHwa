import { readFileSync } from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import type { ContextPack, PackEntry } from '@/ai/context'
import { findNumericFactMismatches } from '@/ai/numeric-facts'
import { findMentions, findNamedAnywhere } from '@/lib/korean/mentions'
import { scoreNotDefects } from './score'

// Guards the planted recall fixture (track H). Reads the files directly, like fixture.test.ts.

const DIR = path.resolve(process.cwd(), 'eval/fixtures/continuity-planted')
const readJson = (file: string) => JSON.parse(readFileSync(path.join(DIR, file), 'utf8'))
const readChapter = (position: number) =>
  readFileSync(path.join(DIR, 'chapters', `${String(position).padStart(2, '0')}.md`), 'utf8').trim()

const work = readJson('work.json')
const answers = readJson('answers.json')
const positions = [1, 2, 3, 4]

describe('continuity-planted fixture', () => {
  it('has 4 chapters of 400 to 800 characters', () => {
    expect(work.chapters.map((c: { position: number }) => c.position)).toEqual(positions)
    for (const position of positions) {
      const length = readChapter(position).length
      expect(length, `${position}화 length`).toBeGreaterThanOrEqual(400)
      expect(length, `${position}화 length`).toBeLessThanOrEqual(800)
    }
  })

  it('lists 4 expected errors and 2 notDefects, each quoted verbatim in its chapter', () => {
    expect(answers.expected).toHaveLength(4)
    expect(answers.notDefects).toHaveLength(2)
    for (const item of [...answers.expected, ...answers.notDefects]) {
      expect(readChapter(item.chapter), item.quoteIncludes).toContain(item.quoteIncludes)
    }
  })

  it('mentions the lighthouse only by a compound that findMentions cannot match', () => {
    const ch3 = readChapter(3)
    expect(ch3).toContain('종루지기')
    const lighthouse = { id: 'jongru', names: ['잿빛 종루', '종루'] }
    expect(findMentions(ch3, [lighthouse])).toEqual([])
    expect(findNamedAnywhere(ch3, [lighthouse]).map((h) => h.entryId)).toEqual(['jongru'])
  })
})

// A pack that holds only the planted age fact (confirmed), with every card of the planted wiki.
function plantedPack(): ContextPack {
  const entries: PackEntry[] = work.entries.map(
    (e: { name: string; aliases: string[]; kind: PackEntry['kind'] }, index: number) => ({
      ref: `E${index + 1}`,
      id: `entry-${index + 1}`,
      kind: e.kind,
      name: e.name,
      aliases: e.aliases,
      summary: '',
      fields: {},
      mentionCount: 0,
      facts:
        e.name === '한세린'
          ? [
              {
                ref: 'F1',
                id: 'fact-1',
                content: '한세린의 나이는 16살이다.',
                status: 'confirmed',
                sourcePosition: null,
                validFromPosition: null,
                validToPosition: null,
                evidence: '',
              },
            ]
          : [],
    }),
  )
  return {
    position: 4,
    entries,
    threads: [],
    relations: [],
    previousSummaries: [],
    namingRules: [],
    stats: { totalEntries: entries.length, selectedEntries: entries.length, approxChars: 0 },
  }
}

describe('continuity-planted numeric check', () => {
  it('finds only the planted age error, in chapter 2, and no trap sentence', () => {
    const pack = plantedPack()
    const hits = positions.flatMap((position) =>
      findNumericFactMismatches({ chapterText: readChapter(position), pack }).map((hit) => ({
        chapter: position,
        quote: hit.quote,
        kind: 'contradiction' as const,
      })),
    )
    expect(hits).toEqual([
      { chapter: 2, quote: '19살의 세린은 말없이 고개를 숙였다.', kind: 'contradiction' },
    ])
    expect(scoreNotDefects(answers.notDefects, hits)).toEqual([])
  })
})
