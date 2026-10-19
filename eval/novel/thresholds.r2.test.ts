import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import {
  mkdtempSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { SAMPLE_COPY_THRESHOLD, findSampleCopies } from '@/lib/korean/style-copy'
import {
  GUARD_MIN_CONTAINMENT,
  copyHits,
  decide,
  dupSweep,
  loadRunEvidence,
  MIN_GAIN,
  OLD_BUDGET_CHARS,
  packDecision,
  packRows,
  copySweep,
  repeatSweep,
  type RunEvidence,
  type Sweep,
} from './thresholds'
import { COPY_LABELS, DEFAULT_RUNS, DUP_LABELS, REPEAT_LABELS } from './thresholds-labels'

let root: string

beforeEach(() => {
  root = mkdtempSync(path.join(os.tmpdir(), 'thresholds-r2-'))
})

afterEach(() => {
  rmSync(root, { recursive: true, force: true })
})

function writeJson(file: string, value: unknown): void {
  mkdirSync(path.dirname(file), { recursive: true })
  writeFileSync(file, JSON.stringify(value), 'utf8')
}

/** Relative path, size and mtime of every file under dir, for the read-only checks. */
function snapshot(dir: string): string[] {
  const out: string[] = []
  const walk = (current: string): void => {
    for (const name of readdirSync(current)) {
      const full = path.join(current, name)
      const stat = statSync(full)
      if (stat.isDirectory()) walk(full)
      else out.push(`${path.relative(dir, full)} ${stat.size} ${stat.mtimeMs}`)
    }
  }
  walk(dir)
  return out.sort()
}

function run(name: string, lang: 'ko' | 'en', chapterTexts: string[]): RunEvidence {
  return {
    name,
    lang,
    chapterTexts,
    styleExamples: [],
    cards: [],
    packs: [],
    exempt: [],
  }
}

const REPEAT_TEXT = [
  ...Array.from({ length: 9 }, () => '구름이 흘렀다.'),
  ...Array.from({ length: 6 }, () => '바람은 불었다.'),
  ...Array.from({ length: 5 }, () => '하늘도 맑았다.'),
].join(' ')

describe('loadRunEvidence', () => {
  it('reads chapters, examples, cards, packs and the exempt list', () => {
    const dir = path.join(root, 'run-x-ko')
    writeJson(path.join(dir, 'config.json'), { modelId: 'haiku-5.5', lang: 'ko' })
    mkdirSync(path.join(dir, 'chapters'), { recursive: true })
    writeFileSync(path.join(dir, 'chapters', '01.md'), '  본문  \n', 'utf8')
    writeFileSync(path.join(dir, 'chapters', '01.draft.md'), '초안', 'utf8')
    writeJson(path.join(dir, 'wiki-final.json'), {
      entries: [
        {
          name: '백지원',
          archivedAt: null,
          facts: [
            { content: '감시관이다', archivedAt: null },
            { content: '지운 사실', archivedAt: '2026-10-18T00:00:00.000Z' },
          ],
        },
        {
          name: '옛 인물',
          archivedAt: '2026-10-18T00:00:00.000Z',
          facts: [{ content: '사라진 사실', archivedAt: null }],
        },
      ],
      styleCards: [
        { name: '문체', examples: '견본 문장.', archivedAt: null },
        { name: '빈 카드', examples: '', archivedAt: null },
      ],
    })
    const prompt = 'x<wiki>\n[E1] a (인물)\n[E2] b (장소)\n</wiki>y'
    const block = prompt.slice(
      prompt.indexOf('<wiki>'),
      prompt.indexOf('</wiki>') + '</wiki>'.length,
    )
    writeJson(path.join(dir, 'calls', '001-interview-question.json'), {
      task: 'interview-question',
      step: 'ch1:ask',
      error: null,
      prompt: 'no wiki here',
    })
    writeJson(path.join(dir, 'calls', '002-continuity-check.json'), {
      task: 'continuity-check',
      step: 'ch1:check',
      error: null,
      prompt,
    })
    writeJson(path.join(dir, 'calls', '003-continuity-check.json'), {
      task: 'continuity-check',
      step: 'ch1:check',
      error: { kind: 'model' },
      prompt,
    })

    const evidence = loadRunEvidence(dir)

    expect(evidence.lang).toBe('ko')
    expect(evidence.chapterTexts).toEqual(['본문'])
    expect(evidence.styleExamples).toEqual(['견본 문장.'])
    expect(evidence.cards).toEqual([{ name: '백지원', facts: ['감시관이다'] }])
    expect(evidence.packs).toEqual([{ step: 'ch1:check', wikiChars: block.length, cardsInPack: 2 }])
    expect(evidence.exempt).toContain('한세린')
  })

  it('leaves the folder unchanged', () => {
    const dir = path.join(root, 'run-y-en')
    writeJson(path.join(dir, 'config.json'), { modelId: 'luna-6', lang: 'en' })
    mkdirSync(path.join(dir, 'chapters'), { recursive: true })
    writeFileSync(path.join(dir, 'chapters', '01.md'), 'Chapter text.', 'utf8')
    const before = snapshot(dir)
    loadRunEvidence(dir)
    expect(snapshot(dir)).toEqual(before)
    expect(readFileSync(path.join(dir, 'chapters', '01.md'), 'utf8')).toBe('Chapter text.')
  })

  it('names the folder when config.json is missing', () => {
    const dir = path.join(root, 'missing-run')
    mkdirSync(dir, { recursive: true })
    expect(() => loadRunEvidence(dir)).toThrow(`not a run folder: ${dir}`)
  })
})

describe('repeatSweep', () => {
  const runs = [run('run-x-ko', 'ko', [REPEAT_TEXT])]

  it('counts caught, wrong and unlabeled per value', () => {
    const sweep = repeatSweep(
      runs,
      [
        { run: 'run-x-ko', words: ['구름'], expect: 'flag', source: 'a.md:1' },
        { run: 'run-x-ko', words: ['바람'], expect: 'ignore', source: 'a.md:2' },
      ],
      [5, 8, 10],
      8,
    )
    expect(sweep.positives).toBe(1)
    expect(sweep.negatives).toBe(1)
    expect(sweep.points).toEqual([
      { value: 5, caught: 1, wrong: 1, unlabeled: 1 },
      { value: 8, caught: 1, wrong: 0, unlabeled: 0 },
      { value: 10, caught: 0, wrong: 0, unlabeled: 0 },
    ])
  })

  it('adds the current value to the grid', () => {
    const sweep = repeatSweep(runs, [], [5, 10], 8)
    expect(sweep.points.map((p) => p.value)).toEqual([5, 8, 10])
  })
})

describe('sweeps reject a label whose run was not loaded', () => {
  const runs = [run('run-x-ko', 'ko', [REPEAT_TEXT])]

  it('repeat', () => {
    expect(() =>
      repeatSweep(
        runs,
        [{ run: 'run-z-ko', words: ['구름'], expect: 'flag', source: 'a.md:1' }],
        [8],
        8,
      ),
    ).toThrow('label run not loaded')
  })

  it('copy', () => {
    expect(() =>
      copySweep(
        runs,
        [{ run: 'run-z-ko', sentence: '구름이 흘렀다.', source: 'a.md:1' }],
        'dice',
        [0.5],
        0.5,
      ),
    ).toThrow('label run not loaded')
  })

  it('dup', () => {
    expect(() =>
      dupSweep(
        runs,
        [{ run: 'run-z-ko', a: 'a', b: 'b', kind: 'dup', source: 'a.md:1' }],
        [0.8],
        0.8,
      ),
    ).toThrow('label run not loaded')
  })
})

const EXAMPLE = '세린은 왼손으로 난간을 짚었다.'

describe('copySweep and copyHits', () => {
  it('dice axis: a paraphrase is caught only below its Dice', () => {
    const text = '세린이 왼손으로 종틀을 짚었다.'
    const runs = [{ ...run('run-x-ko', 'ko', [text]), styleExamples: [EXAMPLE] }]
    const sweep = copySweep(
      runs,
      [{ run: 'run-x-ko', sentence: '세린이 왼손으로 종틀을 짚었다.', source: 'a.md:1' }],
      'dice',
      [0.5, 0.6],
      0.5,
    )
    expect(sweep.points).toEqual([
      { value: 0.5, caught: 1, wrong: 0, unlabeled: 0 },
      { value: 0.6, caught: 0, wrong: 0, unlabeled: 0 },
    ])
  })

  it('containment axis: a sentence is caught by containment alone', () => {
    const text = '쇠가 손바닥에 달라붙을 만큼 차가워서, 세린은 손을 떼지 않고 한 칸씩 올라갔다.'
    const runs = [
      {
        ...run('run-x-ko', 'ko', [text]),
        styleExamples: ['쇠가 손바닥에 들러붙을 만큼 차가웠다.'],
      },
    ]
    const sweep = copySweep(
      runs,
      [{ run: 'run-x-ko', sentence: '쇠가 손바닥에 달라붙을 만큼 차가워서', source: 'a.md:1' }],
      'containment',
      [0.5, 0.6],
      0.5,
    )
    expect(sweep.points.map((p) => p.caught)).toEqual([1, 0])
  })

  it('counts an unlabeled hit', () => {
    const verbatim = '안개가 계단을 반쯤 삼키고 있었다.'
    const text = `${verbatim} 안개가 그 옆모습을 반쯤 삼키고 있었다.`
    const runs = [{ ...run('run-x-ko', 'ko', [text]), styleExamples: [verbatim] }]
    const sweep = copySweep(
      runs,
      [{ run: 'run-x-ko', sentence: verbatim, source: 'a.md:1' }],
      'dice',
      [0.5],
      0.5,
    )
    expect(sweep.points).toEqual([{ value: 0.5, caught: 1, wrong: 0, unlabeled: 1 }])
  })

  it('throws when a label sentence is not in the text', () => {
    const runs = [run('run-x-ko', 'ko', ['다른 문장이 여기 있다.'])]
    expect(() =>
      copySweep(
        runs,
        [{ run: 'run-x-ko', sentence: '없는 문장이다.', source: 'a.md:1' }],
        'dice',
        [0.5],
        0.5,
      ),
    ).toThrow('copy label not found in run-x-ko: 없는 문장이다.')
  })

  it('copyHits at the production values equals findSampleCopies', () => {
    const verbatim = '안개가 계단을 반쯤 삼키고 있었다.'
    const text = `${verbatim} 안개가 그 옆모습을 반쯤 삼키고 있었다.`
    expect(copyHits(text, [verbatim], 'ko', SAMPLE_COPY_THRESHOLD, GUARD_MIN_CONTAINMENT)).toEqual(
      findSampleCopies(text, [verbatim], { lang: 'ko' }).map((f) => f.quote),
    )
  })
})

describe('dupSweep', () => {
  const CARD_A = ['The key has one thin scratch.', 'The key has one thin scratch along its shaft.']
  const CARD_B = [
    'Baek Jiwon is the warden of the Ashen Bell Tower.',
    'Baek Jiwon ordered Han Serin not to return to the upper floors of the Ashen Bell Tower.',
  ]
  const evidence = (): RunEvidence => ({
    ...run('run-x-en', 'en', []),
    cards: [
      { name: 'A', facts: CARD_A },
      { name: 'B', facts: CARD_B },
    ],
  })
  const DUP_A = {
    run: 'run-x-en',
    a: 'The key has one thin scratch.',
    b: 'The key has one thin scratch along',
    kind: 'dup' as const,
    source: 'a.md:1',
  }

  it('counts caught and unlabeled pairs per value', () => {
    const sweep = dupSweep([evidence()], [DUP_A], [0.5, 0.6, 0.7, 0.8], 0.8)
    expect(sweep.points).toEqual([
      { value: 0.5, caught: 1, wrong: 0, unlabeled: 1 },
      { value: 0.6, caught: 1, wrong: 0, unlabeled: 0 },
      { value: 0.7, caught: 1, wrong: 0, unlabeled: 0 },
      { value: 0.8, caught: 0, wrong: 0, unlabeled: 0 },
    ])
  })

  it('ignores a soft pair on both sides', () => {
    const soft = {
      run: 'run-x-en',
      a: 'Baek Jiwon is the warden',
      b: 'Baek Jiwon ordered Han Serin',
      kind: 'soft' as const,
      source: 'a.md:2',
    }
    const sweep = dupSweep([evidence()], [DUP_A, soft], [0.5], 0.8)
    expect(sweep.points[0]?.unlabeled).toBe(0)
  })

  it('throws when a label matches two facts or none', () => {
    const two = { ...DUP_A, a: 'Baek Jiwon', b: 'Baek Jiwon ordered' }
    expect(() => dupSweep([evidence()], [two], [0.8], 0.8)).toThrow('dup label not resolved')
    const none = { ...DUP_A, a: 'Nothing', b: 'The key' }
    expect(() => dupSweep([evidence()], [none], [0.8], 0.8)).toThrow('dup label not resolved')
  })

  it('forms pairs inside one card only', () => {
    const cross = { ...DUP_A, a: 'The key has one thin scratch.', b: 'Baek Jiwon is the warden' }
    expect(() => dupSweep([evidence()], [cross], [0.8], 0.8)).toThrow('dup label not resolved')
  })
})

function sweep(points: Sweep['points'], current: number): Sweep {
  return { id: 'dup', current, positives: 1, negatives: 0, points }
}

describe('decide', () => {
  it('picks the nearest value that gains at least 3', () => {
    const decision = decide(
      sweep(
        [
          { value: 0.6, caught: 16, wrong: 0, unlabeled: 0 },
          { value: 0.7, caught: 8, wrong: 0, unlabeled: 0 },
          { value: 0.8, caught: 4, wrong: 0, unlabeled: 0 },
        ],
        0.8,
      ),
    )
    expect(decision.chosen).toBe(0.7)
    expect(decision.changed).toBe(true)
    expect(decision.reason).toBe(
      '0.7로 바꾼다: 맞힌 라벨 4개 → 8개, 잘못 표시 0 → 0, 라벨 없는 표시 0 → 0.',
    )
  })

  it('keeps the value when the best gain is 2', () => {
    const decision = decide(
      sweep(
        [
          { value: 0.75, caught: 6, wrong: 0, unlabeled: 0 },
          { value: 0.8, caught: 4, wrong: 0, unlabeled: 0 },
        ],
        0.8,
      ),
    )
    expect(decision.chosen).toBe(0.8)
    expect(decision.changed).toBe(false)
    expect(decision.reason).toBe(
      `유지한다: 맞힌 라벨이 ${MIN_GAIN}개 이상 늘면서 잘못 표시와 라벨 없는 표시가 늘지 않는 값이 없다.`,
    )
  })

  it('skips a candidate that adds unlabeled or wrong flags', () => {
    const decision = decide(
      sweep(
        [
          { value: 0.6, caught: 12, wrong: 1, unlabeled: 0 },
          { value: 0.7, caught: 8, wrong: 0, unlabeled: 1 },
          { value: 0.8, caught: 4, wrong: 0, unlabeled: 0 },
        ],
        0.8,
      ),
    )
    expect(decision.chosen).toBe(0.8)
    expect(decision.changed).toBe(false)
  })

  it('breaks a distance tie by more caught', () => {
    const decision = decide(
      sweep(
        [
          { value: 0.7, caught: 8, wrong: 0, unlabeled: 0 },
          { value: 0.8, caught: 4, wrong: 0, unlabeled: 0 },
          { value: 0.9, caught: 9, wrong: 0, unlabeled: 0 },
        ],
        0.8,
      ),
    )
    expect(decision.chosen).toBe(0.9)
  })

  it('throws when the current value has no point', () => {
    expect(() => decide(sweep([{ value: 0.7, caught: 8, wrong: 0, unlabeled: 0 }], 0.8))).toThrow()
  })
})

describe('context pack (H)', () => {
  it('packRows counts the wiki block and the cards', () => {
    const evidence: RunEvidence = {
      ...run('run-x-ko', 'ko', []),
      cards: [
        { name: 'A', facts: [] },
        { name: 'B', facts: [] },
        { name: 'C', facts: [] },
      ],
      packs: [{ step: 'ch1:check', wikiChars: 900, cardsInPack: 2 }],
    }
    expect(packRows([evidence])).toEqual([
      { run: 'run-x-ko', step: 'ch1:check', wikiChars: 900, cardsInPack: 2, cardsInWiki: 3 },
    ])
  })

  it('packDecision keeps H below 90 percent of the old budget and asks for a check above it', () => {
    expect(OLD_BUDGET_CHARS).toBe(12_000)
    const kept = packDecision([
      { run: 'r', step: 's', wikiChars: 6_524, cardsInPack: 4, cardsInWiki: 12 },
    ])
    expect(kept.max).toBe(6_524)
    expect(kept.touchesOldBudget).toBe(false)
    expect(kept.reason).toBe(
      '유지한다: 저장된 맥락은 모두 6,524자 이하라 예산(12,000자)에 닿은 실행이 없다. 이 실행들로는 정할 수 없다.',
    )
    const near = packDecision([
      { run: 'r', step: 's', wikiChars: 11_000, cardsInPack: 6, cardsInWiki: 10 },
    ])
    expect(near.touchesOldBudget).toBe(true)
    expect(near.reason).toBe('확인이 필요하다: 11,000자 맥락이 있어 예산에 가깝다.')
  })
})

describe('label tables', () => {
  it('keep their size and sources', () => {
    expect(REPEAT_LABELS.filter((l) => l.expect === 'flag')).toHaveLength(4)
    expect(REPEAT_LABELS.filter((l) => l.expect === 'ignore')).toHaveLength(2)
    expect(COPY_LABELS).toHaveLength(7)
    expect(DUP_LABELS.filter((l) => l.kind === 'dup')).toHaveLength(23)
    expect(DUP_LABELS.filter((l) => l.kind === 'soft')).toHaveLength(1)
    const all = [...REPEAT_LABELS, ...COPY_LABELS, ...DUP_LABELS]
    for (const label of all) {
      expect(DEFAULT_RUNS).toContain(label.run)
      expect(label.source).toMatch(/^[\w.-]+\.md:\d+$/)
    }
  })

  it('has no duplicate fact pair rows', () => {
    const keys = DUP_LABELS.map((l) => `${l.run}|${l.a}|${l.b}`)
    expect(new Set(keys).size).toBe(keys.length)
  })
})
