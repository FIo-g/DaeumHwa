import { describe, expect, it } from 'vitest'
import { ZodError } from 'zod'
import { DRAFT_SYSTEM } from '@/ai/tasks/draft-chapter'
import {
  buildContinuationPrompt,
  buildDraftPrompt,
  BEATS_RULE,
  type DraftPromptInput,
} from '@/ai/tasks/draft-chapter'
import {
  BEATS_STATE_RULE,
  type DraftBeats,
  DraftBeatsSchema,
  DRAFT_BEATS_SYSTEM,
  draftBeatsTask,
  renderBeats,
} from '@/ai/tasks/draft-beats'
import { TAG_DATA_RULE } from '@/ai/prompt-utils'

const sample: DraftPromptInput = {
  instructions: '서윤이 탑에 올라간다. 문지기가 열쇠를 건넨다.',
  targetChars: 5500,
  styleCards: [],
  packText: '<entries>\n- 서윤 (인물)\n</entries>',
  previousSummary: null,
  previousTail: '문이 닫혔다.',
  chapterLabel: '4화 (새 회차)',
}

const plain: DraftBeats = {
  scenes: [
    {
      place: '탑 입구',
      characters: ['서윤', '문지기'],
      objects: ['열쇠 (문지기가 들고 있음)'],
      sequence: ['문지기가 열쇠를 꺼낸다.', '서윤이 열쇠를 받는다.'],
    },
    {
      place: '탑 계단',
      characters: ['서윤'],
      objects: [],
      sequence: ['서윤이 계단을 오른다.'],
    },
  ],
}

const withState: DraftBeats = {
  scenes: [
    {
      ...plain.scenes[0],
      decision: '서윤은 편지를 지금 뜯지 않기로 한다.',
      stake: '어머니의 소식을 바랐지만 편지는 봉인된 채다.',
    },
    plain.scenes[1],
  ],
}

describe('DraftBeatsSchema with decision and stake (P2)', () => {
  it('keeps decision and stake when present', () => {
    expect(DraftBeatsSchema.parse(withState)).toEqual(withState)
  })

  it('accepts a scene without them and adds no keys', () => {
    const parsed = DraftBeatsSchema.parse(plain)
    expect(parsed.scenes[0]).not.toHaveProperty('decision')
    expect(parsed.scenes[0]).not.toHaveProperty('stake')
  })

  it('rejects a non-string decision', () => {
    expect(() =>
      DraftBeatsSchema.parse({
        scenes: [{ ...plain.scenes[0], decision: 3 }],
      }),
    ).toThrow(ZodError)
  })
})

describe('renderBeats with decision and stake (P2)', () => {
  it('writes the state lines between the objects line and the sequence', () => {
    expect(renderBeats({ scenes: [withState.scenes[0]] })).toBe(
      [
        BEATS_STATE_RULE,
        '',
        '장면 1',
        '장소: 탑 입구',
        '인물: 서윤, 문지기',
        '물건: 열쇠 (문지기가 들고 있음)',
        '결정 상태: 서윤은 편지를 지금 뜯지 않기로 한다.',
        '기대한 것과 잃은 것: 어머니의 소식을 바랐지만 편지는 봉인된 채다.',
        '순서:',
        '1. 문지기가 열쇠를 꺼낸다.',
        '2. 서윤이 열쇠를 받는다.',
      ].join('\n'),
    )
  })

  it('renders a list without state fields exactly as before and adds no rule', () => {
    const text = renderBeats(plain)
    expect(text).toBe(
      [
        '장면 1',
        '장소: 탑 입구',
        '인물: 서윤, 문지기',
        '물건: 열쇠 (문지기가 들고 있음)',
        '순서:',
        '1. 문지기가 열쇠를 꺼낸다.',
        '2. 서윤이 열쇠를 받는다.',
        '',
        '장면 2',
        '장소: 탑 계단',
        '인물: 서윤',
        '물건: (없음)',
        '순서:',
        '1. 서윤이 계단을 오른다.',
      ].join('\n'),
    )
    expect(text).not.toContain(BEATS_STATE_RULE)
  })

  it('adds the rule once, at the top, when only some scenes have a state', () => {
    const mixed: DraftBeats = { scenes: [plain.scenes[0], withState.scenes[0]] }
    const text = renderBeats(mixed)
    expect(text.startsWith(BEATS_STATE_RULE)).toBe(true)
    expect(text.split(BEATS_STATE_RULE).length - 1).toBe(1)
    const body = text.replace(BEATS_STATE_RULE, '')
    const firstBlock = body.slice(0, body.indexOf('장면 2'))
    expect(firstBlock).not.toContain('결정 상태')
    expect(text).toContain('결정 상태: 서윤은 편지를 지금 뜯지 않기로 한다.')
  })

  it('skips empty and whitespace-only values', () => {
    const text = renderBeats({
      scenes: [{ ...plain.scenes[1], decision: '정한 것', stake: '   ' }],
    })
    expect(text).toContain('결정 상태: 정한 것')
    expect(text.replace(BEATS_STATE_RULE, '')).not.toContain('기대한 것과 잃은 것')
    expect(text.startsWith(BEATS_STATE_RULE)).toBe(true)

    const empty = renderBeats({
      scenes: [{ ...plain.scenes[0], decision: '', stake: '' }],
    })
    expect(empty).toBe(renderBeats({ scenes: [plain.scenes[0]] }))
    expect(empty).not.toContain(BEATS_STATE_RULE)
  })

  it('collapses line breaks inside a value', () => {
    const text = renderBeats({
      scenes: [{ ...plain.scenes[1], decision: '뜯지 않는다.\n그리고 숨긴다.' }],
    })
    expect(text).toContain('결정 상태: 뜯지 않는다. 그리고 숨긴다.\n')
    expect(text.split('\n').filter((line) => line.startsWith('결정 상태'))).toEqual([
      '결정 상태: 뜯지 않는다. 그리고 숨긴다.',
    ])
  })

  it('keeps an empty scene list as (없음)', () => {
    expect(renderBeats({ scenes: [] })).toBe('(없음)')
  })
})

describe('DRAFT_BEATS_SYSTEM state rules (P2)', () => {
  it('asks for decision and stake before the data rule', () => {
    const lines = DRAFT_BEATS_SYSTEM.split('\n')
    const decisionIndex = lines.findIndex((line) => line.includes('결정 상태(decision)'))
    const stakeIndex = lines.findIndex((line) => line.includes('기대한 것과 잃은 것(stake)'))
    const orderIndex = lines.findIndex((line) => line.startsWith('- 사건 순서는'))
    const tagIndex = lines.indexOf(TAG_DATA_RULE)
    expect(decisionIndex).toBeGreaterThan(orderIndex)
    expect(stakeIndex).toBeGreaterThan(orderIndex)
    expect(decisionIndex).toBeLessThan(tagIndex)
    expect(stakeIndex).toBeLessThan(tagIndex)
  })

  it('keeps the tag data rule second to last and the language line last', () => {
    const lines = DRAFT_BEATS_SYSTEM.split('\n')
    expect(lines[lines.length - 2]).toBe(TAG_DATA_RULE)
    expect(lines[lines.length - 1]).toBe('- 모든 출력은 한국어로 쓴다.')
  })

  it('does not leak into the prose system prompt', () => {
    expect(DRAFT_SYSTEM).not.toContain('결정 상태')
    expect(DRAFT_SYSTEM).not.toContain('기대한 것과 잃은 것')
  })
})

describe('prompt composition with state lines (P2)', () => {
  it('puts the state rule after BEATS_RULE inside the beats block', () => {
    const prompt = buildDraftPrompt({ ...sample, beats: renderBeats(withState) })
    const open = prompt.indexOf('<beats>')
    expect(open).toBeLessThan(prompt.indexOf(BEATS_RULE))
    expect(prompt.indexOf(BEATS_RULE)).toBeLessThan(prompt.indexOf(BEATS_STATE_RULE))
    expect(prompt.indexOf(BEATS_STATE_RULE)).toBeLessThan(prompt.indexOf('장면 1'))
    expect(prompt.trimEnd().endsWith('</beats>')).toBe(true)
  })

  it('leaves the prompt without beats free of the state text', () => {
    const plainPrompt = buildDraftPrompt(sample)
    expect(plainPrompt).not.toContain(BEATS_STATE_RULE)
    expect(plainPrompt).not.toContain('결정 상태')

    const withPlainBeats = buildDraftPrompt({ ...sample, beats: renderBeats(plain) })
    expect(withPlainBeats).toContain(BEATS_RULE)
    expect(withPlainBeats).not.toContain(BEATS_STATE_RULE)
  })

  it('carries the rule into the continuation prompt', () => {
    const prompt = buildContinuationPrompt(
      { ...sample, targetChars: 5500, beats: renderBeats(withState) },
      '짧은 초안이다.',
    )
    expect(prompt).toContain(BEATS_STATE_RULE)
    expect(prompt).toContain('결정 상태: 서윤은 편지를 지금 뜯지 않기로 한다.')
  })

  it('keeps the state text out of the beat call own prompt', () => {
    const prompt = draftBeatsTask.buildPrompt(sample)
    expect(prompt).not.toContain(BEATS_STATE_RULE)
    expect(prompt).not.toContain('결정 상태')
  })
})
