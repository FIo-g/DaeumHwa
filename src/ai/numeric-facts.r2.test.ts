import { describe, expect, it } from 'vitest'
import type { ContextPack, PackEntry, PackFact } from '@/ai/context'
import { findNumericFactMismatches } from '@/ai/numeric-facts'
import { continuityCheckTask } from '@/ai/tasks/continuity-check'

// P13 numeric fact check: years, floor counts, headcounts and English ages, on top of the
// Korean "N살" age rule that numeric-facts.test.ts pins.

type FactInput = string | { content: string; status?: PackFact['status'] }

// Builds a pack from compact entry descriptions. Fact refs and entry refs are assigned in order.
function makePack(
  entries: {
    name: string
    aliases?: string[]
    facts: { content: string; status?: PackFact['status'] }[]
  }[],
): ContextPack {
  let factCount = 0
  const packEntries: PackEntry[] = entries.map((e, index) => ({
    ref: `E${index + 1}`,
    id: `entry-${index + 1}`,
    kind: 'character',
    name: e.name,
    aliases: e.aliases ?? [],
    summary: '',
    fields: {},
    mentionCount: 0,
    facts: e.facts.map((f) => {
      factCount += 1
      return {
        ref: `F${factCount}`,
        id: `fact-${factCount}`,
        content: f.content,
        status: f.status ?? 'confirmed',
        sourcePosition: null,
        validFromPosition: null,
        validToPosition: null,
        evidence: '',
      }
    }),
  }))
  return {
    core: [],
    position: 10,
    entries: packEntries,
    threads: [],
    relations: [],
    previousSummaries: [],
    namingRules: [],
    stats: {
      totalEntries: packEntries.length,
      selectedEntries: packEntries.length,
      approxChars: 0,
    },
  }
}

const asFacts = (items: FactInput[]) =>
  items.map((item) => (typeof item === 'string' ? { content: item } : item))

const mara = (facts: FactInput[] = ['Mara Voss is nineteen years old.']) =>
  makePack([{ name: 'Mara Voss', aliases: ['Mara'], facts: asFacts(facts) }])

const tower = (facts: FactInput[] = ['은빛 등대는 12층 높이의 석조 건물이다.']) =>
  makePack([{ name: '은빛 등대', aliases: ['등대'], facts: asFacts(facts) }])

const keep = () =>
  makePack([
    {
      name: 'Harrow Keep',
      facts: asFacts([
        'Harrow Keep is a nine-story stone fortress.',
        'Harrow Keep was built in 1204.',
      ]),
    },
  ])

const kingdom = (facts: FactInput[] = ['잿빛 왕국은 412년에 건국되었다.']) =>
  makePack([{ name: '잿빛 왕국', aliases: ['왕국'], facts: asFacts(facts) }])

const guard = () =>
  makePack([
    { name: '새벽 호위대', aliases: ['호위대'], facts: asFacts(['새벽 호위대는 모두 7명이다.']) },
  ])

/** [kind, wikiValue, foundValue, suggestion] for each hit. */
function run(chapterText: string, pack: ContextPack) {
  return findNumericFactMismatches({ chapterText, pack }).map((hit) => [
    hit.kind,
    hit.wikiValue,
    hit.foundValue,
    hit.suggestion,
  ])
}

describe('findNumericFactMismatches: hits', () => {
  it('age, English words take the wiki wording', () => {
    expect(run('Mara Voss was twenty-two years old.', mara())).toEqual([
      ['age', 19, 22, 'Mara Voss was nineteen years old.'],
    ])
  })

  it('age, English digits take the wiki wording', () => {
    expect(run('Mara Voss was 22 years old.', mara())).toEqual([
      ['age', 19, 22, 'Mara Voss was nineteen years old.'],
    ])
  })

  it('age, aged', () => {
    expect(run('Mara Voss was aged twenty-two.', mara())).toEqual([
      ['age', 19, 22, 'Mara Voss was aged nineteen.'],
    ])
  })

  it('year, Korean, with its explanation', () => {
    const pack = kingdom()
    expect(run('잿빛 왕국이 413년에 건국되었다.', pack)).toEqual([
      ['year', 412, 413, '잿빛 왕국이 412년에 건국되었다.'],
    ])
    const [hit] = findNumericFactMismatches({
      chapterText: '잿빛 왕국이 413년에 건국되었다.',
      pack,
    })
    expect(hit.explanation).toBe('위키의 연도(412년)와 원고의 연도(413년)가 다릅니다.')
  })

  it('year, English', () => {
    expect(run('Harrow Keep was built in 1206, according to the ledgers.', keep())).toEqual([
      ['year', 1204, 1206, 'Harrow Keep was built in 1204, according to the ledgers.'],
    ])
    expect(run('Harrow Keep was built in the year 1206.', keep())).toEqual([
      ['year', 1204, 1206, 'Harrow Keep was built in the year 1204.'],
    ])
  })

  it('floor, Korean forms', () => {
    const pack = tower()
    const [hit] = findNumericFactMismatches({
      chapterText: '은빛 등대는 14층 높이로 솟아 있었다.',
      pack,
    })
    expect(hit.explanation).toBe('위키의 층수(12층)와 원고의 층수(14층)가 다릅니다.')
    expect(run('은빛 등대는 14층 높이로 솟아 있었다.', pack)).toEqual([
      ['floor', 12, 14, '은빛 등대는 12층 높이로 솟아 있었다.'],
    ])
    expect(run('은빛 등대는 14층짜리 건물이었다.', pack)[0][3]).toBe(
      '은빛 등대는 12층짜리 건물이었다.',
    )
    expect(run('은빛 등대는 14층으로 솟아 있었다.', pack)[0][3]).toBe(
      '은빛 등대는 12층으로 솟아 있었다.',
    )
    expect(run('은빛 등대는 모두 14층이었다.', pack)[0][3]).toBe('은빛 등대는 모두 12층이었다.')
  })

  it('floor, English forms', () => {
    expect(run('Harrow Keep was a seven-story fortress.', keep())[0]).toEqual([
      'floor',
      9,
      7,
      'Harrow Keep was a nine-story fortress.',
    ])
    expect(run('Harrow Keep was a 7-story fortress.', keep())[0][3]).toBe(
      'Harrow Keep was a nine-story fortress.',
    )
    expect(run('Harrow Keep rose seven stories above the courtyard.', keep())[0][3]).toBe(
      'Harrow Keep rose nine stories above the courtyard.',
    )
    expect(run('Harrow Keep was seven stories tall.', keep())[0][3]).toBe(
      'Harrow Keep was nine stories tall.',
    )
  })

  it('person, Korean', () => {
    expect(run('새벽 호위대는 모두 9명이었다.', guard())).toEqual([
      ['person', 7, 9, '새벽 호위대는 모두 7명이었다.'],
    ])
    expect(run('새벽 호위대는 9명뿐이었다.', guard())[0][3]).toBe('새벽 호위대는 7명뿐이었다.')
  })

  it('person, English', () => {
    const pack = makePack([
      { name: 'Ironwatch', facts: asFacts(['Ironwatch has only twelve guards.']) },
    ])
    expect(run('Ironwatch kept only nine guards on the wall.', pack)).toEqual([
      ['person', 12, 9, 'Ironwatch kept only twelve guards on the wall.'],
    ])
  })

  it('the Latin name check respects word boundaries', () => {
    const pack = makePack([{ name: 'Serin', facts: asFacts(['Serin is sixteen years old.']) }])
    expect(run('Serin was nineteen years old.', pack)).toEqual([
      ['age', 16, 19, 'Serin was sixteen years old.'],
    ])
    expect(run('Serinity was nineteen years old.', pack)).toEqual([])
  })
})

describe('findNumericFactMismatches: no hit', () => {
  it('equal numbers', () => {
    expect(run('Mara Voss was nineteen years old.', mara())).toEqual([])
    expect(run('은빛 등대는 12층 높이로 솟아 있었다.', tower())).toEqual([])
  })

  it('English age skips', () => {
    const pack = mara()
    for (const text of [
      'Mara Voss was about twenty years old.',
      'Mara Voss helped a five-year-old girl.',
      'Mara Voss was twenty-two years old when the siege began.',
      'Mara Voss was five years older than Jon.',
      'Jon told Mara Voss he was twenty-two years old.',
      "Mara Voss's brother was nine years old.",
    ]) {
      expect(run(text, pack)).toEqual([])
    }
  })

  it('English age fact gate: a fact without is/are/age is not an age', () => {
    const pack = mara(['Mara Voss took up the sword at nineteen years old.'])
    expect(run('Mara Voss was twenty-two years old.', pack)).toEqual([])
  })

  it('year needs a shared event word', () => {
    expect(run('잿빛 왕국은 590년에 멸망했다.', kingdom())).toEqual([])
    expect(run('Harrow Keep fell in 1290.', keep())).toEqual([])
    expect(
      run('잿빛 왕국이 413년에 건국되었다.', kingdom(['잿빛 왕국의 기록은 412년부터 시작된다.'])),
    ).toEqual([])
  })

  it('year skips durations, decades, two digits and time skips', () => {
    const pack = kingdom()
    expect(run('잿빛 왕국은 413년 동안 이어졌다.', pack)).toEqual([])
    expect(run('잿빛 왕국은 건국 413년 만에 무너졌다.', pack)).toEqual([])
    expect(run('잿빛 왕국은 413년 전에 건국되었다.', pack)).toEqual([])
    expect(run('잿빛 왕국은 41년에 건국되었다.', pack)).toEqual([])
    expect(
      run('잿빛 왕국은 1990년대에 건국되었다.', kingdom(['잿빛 왕국은 1990년에 건국되었다.'])),
    ).toEqual([])
  })

  it('an entry with two different years is unusable', () => {
    const pack = kingdom(['잿빛 왕국은 412년에 건국되었다.', '잿빛 왕국은 590년에 멸망했다.'])
    expect(run('잿빛 왕국이 413년에 건국되었다.', pack)).toEqual([])
  })

  it('floor and person positions and parts are not totals', () => {
    expect(run('하준은 등대 5층에서 걸음을 멈췄다.', tower())).toEqual([])
    expect(run('새벽 호위대는 3명을 먼저 보냈다.', guard())).toEqual([])
    expect(run('In Harrow Keep, the fourth story held the armory.', keep())).toEqual([])
  })

  it('floor and person: not the subject or a possessive', () => {
    expect(run('등대 옆에는 5층 높이의 창고가 있었다.', tower())).toEqual([])
    expect(run('등대의 14층 높이 벽면이 무너졌다.', tower())).toEqual([])
    expect(run('The pilgrims climbed Harrow Keep, a seven-story ruin.', keep())).toEqual([])
    expect(run('호위대원은 모두 9명이었다.', guard())).toEqual([])
  })

  it('only confirmed facts count for the new kinds', () => {
    for (const status of ['assumed', 'undecided'] as const) {
      const pack = tower([{ content: '은빛 등대는 12층 높이다.', status }])
      expect(run('은빛 등대는 14층 높이로 솟아 있었다.', pack)).toEqual([])
    }
  })

  it('two floor facts that disagree make the entry unusable', () => {
    const pack = tower(['은빛 등대는 12층 높이다.', '은빛 등대는 13층 높이다.'])
    expect(run('은빛 등대는 14층 높이로 솟아 있었다.', pack)).toEqual([])
  })

  it('two numbers of one kind in a sentence are skipped', () => {
    expect(run('은빛 등대는 12층 높이이고 14층짜리였다.', tower())).toEqual([])
  })

  it('kinds do not mix', () => {
    expect(run('Mara Voss was a seven-story ruin.', mara())).toEqual([])
    expect(run('Mara Voss was built in 1206.', mara())).toEqual([])
  })

  it('Korean number words are not read yet (documented limit; P13b)', () => {
    const yeonseo = makePack([{ name: '오연서', facts: asFacts(['오연서의 나이는 18살이다.']) }])
    expect(run('오연서는 열아홉 살이었다.', yeonseo)).toEqual([])
    const yeonseoWords = makePack([
      { name: '오연서', facts: asFacts(['오연서의 나이는 열여덟 살이다.']) },
    ])
    expect(run('오연서는 19살의 얼굴로 웃었다.', yeonseoWords)).toEqual([])
    expect(run('은빛 등대는 열네 층 높이로 솟아 있었다.', tower())).toEqual([])
  })

  it('never throws on empty text and an empty pack', () => {
    expect(findNumericFactMismatches({ chapterText: '', pack: makePack([]) })).toEqual([])
    expect(findNumericFactMismatches({ chapterText: '', pack: mara() })).toEqual([])
  })
})

describe('through continuityCheckTask.postProcess', () => {
  it('a floor mismatch becomes a contradiction issue', () => {
    const chapterText = '은빛 등대는 14층 높이로 솟아 있었다.'
    const processed = continuityCheckTask.postProcess?.(
      { issues: [] },
      { chapterText, chapterPosition: 3, chapterTitle: '3화', pack: tower() },
    )
    expect(processed?.issues).toHaveLength(1)
    expect(processed?.issues[0]).toMatchObject({
      quote: chapterText,
      kind: 'contradiction',
      severity: 'medium',
      factRef: 'F1',
      entryRef: 'E1',
      suggestion: '은빛 등대는 12층 높이로 솟아 있었다.',
    })
    expect(processed?.issues[0].explanation).toContain('층수')
  })

  it('an English age mismatch is located and kept', () => {
    const chapterText = 'Mara Voss was twenty-two years old.'
    const processed = continuityCheckTask.postProcess?.(
      { issues: [] },
      { chapterText, chapterPosition: 2, chapterTitle: '2화', pack: mara() },
    )
    expect(processed?.issues).toHaveLength(1)
    expect(processed?.issues[0]).toMatchObject({
      quote: chapterText,
      kind: 'contradiction',
      suggestion: 'Mara Voss was nineteen years old.',
    })
  })
})

describe('findNumericFactMismatches: whole numbers, ranges and large number words', () => {
  it('a range gives no hit, whatever value it contains', () => {
    expect(run('은빛 등대는 12~13층 높이로 솟아 있었다.', tower())).toEqual([])
    expect(run('잿빛 왕국은 412~413년 사이에 건국되었다.', kingdom())).toEqual([])
    expect(run('새벽 호위대는 7~8명뿐이었다.', guard())).toEqual([])
    expect(run('Harrow Keep was nine or ten stories tall.', keep())).toEqual([])
  })

  it('a number inside a longer number gives no hit', () => {
    expect(run('새벽 호위대는 3000명뿐이었다.', guard())).toEqual([])
    expect(
      run('잿빛 왕국은 1,412년에 건국되었다.', kingdom(['잿빛 왕국은 1412년에 건국되었다.'])),
    ).toEqual([])
    expect(
      run(
        '새벽 호위대는 모두 12명이었다.',
        makePack([
          {
            name: '새벽 호위대',
            aliases: ['호위대'],
            facts: asFacts(['새벽 호위대는 2,000명뿐이다.']),
          },
        ]),
      ),
    ).toEqual([])
  })

  it('a hundred or more in English words gives no hit', () => {
    const pack = mara(['Mara Voss is 120 years old.'])
    expect(run('Mara Voss was a hundred and twenty years old.', pack)).toEqual([])
    const wordPack = mara(['Mara Voss is one hundred and twenty years old.'])
    expect(run('Mara Voss was 120 years old.', wordPack)).toEqual([])
    expect(run('Harrow Keep was a hundred and two stories tall.', keep())).toEqual([])
  })
})

describe('findNumericFactMismatches: durations, bounds and aging (FX4)', () => {
  it('a duration after an event word gives no year hit (F3)', () => {
    const pack = kingdom()
    for (const text of [
      '잿빛 왕국은 건국된 지 500년이 지났다.',
      '잿빛 왕국은 건국 500년을 맞았다.',
      '잿빛 왕국은 건국 이래 300년을 버텼다.',
      '잿빛 왕국은 건국되고 300년이 흘렀다.',
    ]) {
      expect(run(text, pack)).toEqual([])
    }
  })

  it('a duration in the wiki fact is not a year (F3, reverse case)', () => {
    expect(
      run('잿빛 왕국은 412년에 건국되었다.', kingdom(['잿빛 왕국은 건국된 지 500년이 지났다.'])),
    ).toEqual([])
  })

  it('an English duration after built in gives no year hit (F3)', () => {
    expect(run('Harrow Keep was built in 300 nights.', keep())).toEqual([])
  })

  it('bounds and rough numbers are skipped (F5)', () => {
    const cases: [string, ReturnType<typeof guard>][] = [
      ['새벽 호위대는 모두 5명 이상이었다.', guard()],
      ['새벽 호위대는 총 5명 넘게 모였다.', guard()],
      ['새벽 호위대는 모두 2명씩 조를 짰다.', guard()],
      ['새벽 호위대는 모두 9명 미만이었다.', guard()],
      ['잿빛 왕국은 413년경 건국되었다.', kingdom()],
      ['잿빛 왕국은 413년 즈음 건국되었다.', kingdom()],
      ['은빛 등대는 약 13층 높이로 솟아 있었다.', tower()],
      ['은빛 등대는 대략 13층 높이였다.', tower()],
      ['Harrow Keep was at least seven stories tall.', keep()],
    ]
    for (const [text, pack] of cases) {
      expect(run(text, pack)).toEqual([])
    }
  })

  it('the Korean 살 age form keeps its behaviour (F5 guard)', () => {
    const pack = makePack([{ name: '도윤서', facts: asFacts(['도윤서의 나이는 27살이다.']) }])
    expect(run('도윤서는 약 25살이었다.', pack)).toEqual([])
    expect(run('도윤서는 25살이다.', pack)).toEqual([['age', 27, 25, '도윤서는 27살이다.']])
  })

  it('a verb "had aged N years" is not an age (F9)', () => {
    expect(run('Mara Voss had aged ten years overnight.', mara())).toEqual([])
    expect(run('Mara Voss has aged ten years in a single night.', mara())).toEqual([])
  })
})
