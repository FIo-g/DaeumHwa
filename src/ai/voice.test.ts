import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  isSpeechStyleEnabled,
  MAIN_VOICE_LIMIT,
  renderVoiceLines,
  selectMainVoices,
  type VoiceSource,
} from '@/ai/voice'

const source = (over: Partial<VoiceSource> & { entryId: string }): VoiceSource => ({
  name: over.entryId,
  speech: '반말',
  selected: false,
  createdAt: new Date('2026-01-01T00:00:00Z'),
  ...over,
})

describe('selectMainVoices', () => {
  it('skips empty speech', () => {
    const lines = selectMainVoices([
      source({ entryId: 'a', speech: '' }),
      source({ entryId: 'b', speech: '  ' }),
      source({ entryId: 'c', speech: '반말' }),
    ])
    expect(lines).toEqual([{ entryId: 'c', name: 'c', speech: '반말' }])
  })

  it('orders selected entries first, then by createdAt', () => {
    const lines = selectMainVoices([
      source({ entryId: 'A', createdAt: new Date('2026-01-01') }),
      source({ entryId: 'B', selected: true, createdAt: new Date('2026-01-02') }),
    ])
    expect(lines.map((line) => line.entryId)).toEqual(['B', 'A'])
  })

  it('breaks ties by entryId', () => {
    const same = new Date('2026-01-01')
    const lines = selectMainVoices([
      source({ entryId: 'y', createdAt: same }),
      source({ entryId: 'x', createdAt: same }),
    ])
    expect(lines.map((line) => line.entryId)).toEqual(['x', 'y'])
  })

  it('caps at MAIN_VOICE_LIMIT and keeps the earliest', () => {
    expect(MAIN_VOICE_LIMIT).toBe(6)
    const sources = Array.from({ length: 8 }, (_, i) =>
      source({ entryId: `e${i}`, createdAt: new Date(2026, 0, 8 - i) }),
    )
    const lines = selectMainVoices(sources)
    expect(lines).toHaveLength(6)
    expect(lines.map((line) => line.entryId)).toEqual(['e7', 'e6', 'e5', 'e4', 'e3', 'e2'])
  })

  it('collapses whitespace and cuts speech at 200 characters', () => {
    const [short] = selectMainVoices([source({ entryId: 'a', speech: '반말\n짧게' })])
    expect(short.speech).toBe('반말 짧게')

    const [long] = selectMainVoices([source({ entryId: 'b', speech: '가'.repeat(300) })])
    expect(Array.from(long.speech)).toHaveLength(201)
    expect(long.speech.endsWith('…')).toBe(true)
  })
})

describe('renderVoiceLines', () => {
  it('renders (없음) for no lines', () => {
    expect(renderVoiceLines([])).toBe('(없음)')
  })

  it('renders one "- name: speech" line each', () => {
    expect(
      renderVoiceLines([
        { name: '서윤', speech: '반말' },
        { name: '윤서', speech: '존댓말' },
      ]),
    ).toBe('- 서윤: 반말\n- 윤서: 존댓말')
  })
})

describe('isSpeechStyleEnabled', () => {
  afterEach(() => {
    vi.unstubAllEnvs()
  })

  it('is on unless off, 0 or false (trimmed, case-insensitive)', () => {
    expect(isSpeechStyleEnabled({})).toBe(true)
    expect(isSpeechStyleEnabled({ AI_SPEECH_STYLE: '' })).toBe(true)
    expect(isSpeechStyleEnabled({ AI_SPEECH_STYLE: 'off' })).toBe(false)
    expect(isSpeechStyleEnabled({ AI_SPEECH_STYLE: ' FALSE ' })).toBe(false)
    expect(isSpeechStyleEnabled({ AI_SPEECH_STYLE: '0' })).toBe(false)
    expect(isSpeechStyleEnabled({ AI_SPEECH_STYLE: 'on' })).toBe(true)
    expect(isSpeechStyleEnabled({ AI_SPEECH_STYLE: '1' })).toBe(true)
  })

  it('reads process.env at call time', () => {
    vi.stubEnv('AI_SPEECH_STYLE', 'on')
    expect(isSpeechStyleEnabled()).toBe(true)
    vi.stubEnv('AI_SPEECH_STYLE', 'off')
    expect(isSpeechStyleEnabled()).toBe(false)
  })
})
