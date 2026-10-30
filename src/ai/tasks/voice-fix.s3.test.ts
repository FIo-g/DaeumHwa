import { describe, expect, it } from 'vitest'
import {
  acceptVoiceLine,
  VOICE_FIX_SYSTEM,
  voiceFixTask,
  VoiceFixSchema,
  type VoiceFixInput,
} from '@/ai/tasks/voice-fix'
import { VOICE_FIX_SYSTEM as EN_VOICE_FIX_SYSTEM } from '../../../eval/novel/localize/en/voice-fix'
import { findHangul } from '../../../eval/novel/localize/scaffold'

function fullInput(): VoiceFixInput {
  return {
    marked: '세린이 말했다. ⟦1⟧"빨래 가져왔어요."\n민준이 물었다. ⟦2⟧"누구세요."',
    voices: [{ name: '세린', level: 'banmal', speech: '반말을 쓰며 짧고 직설적이다.' }],
  }
}

describe('voiceFixTask.buildPrompt', () => {
  it('holds <voices> then <draft> with one line per voice', () => {
    const prompt = voiceFixTask.buildPrompt(fullInput())
    expect(prompt).toContain('<voices>\n- 세린: 반말 (반말을 쓰며 짧고 직설적이다.)\n</voices>')
    expect(prompt).toContain('<draft>')
    expect(prompt.indexOf('<voices>')).toBeLessThan(prompt.indexOf('<draft>'))
    expect(prompt).toContain('⟦1⟧"빨래 가져왔어요."')
  })

  it('renders 존댓말 for a jondaet voice', () => {
    const prompt = voiceFixTask.buildPrompt({
      marked: '⟦1⟧"빨리 와."',
      voices: [{ name: '민준', level: 'jondaet', speech: '존댓말을 쓰며 공손하다.' }],
    })
    expect(prompt).toContain('- 민준: 존댓말 (존댓말을 쓰며 공손하다.)')
  })
})

describe('voiceFixTask definition', () => {
  it('runs cheap with 6000 max tokens', () => {
    expect(voiceFixTask.name).toBe('voice-fix')
    expect(voiceFixTask.effort).toBe('low')
    expect(voiceFixTask.maxTokens).toBe(6000)
  })

  it('accepts lines and rejects more than 40', () => {
    expect(VoiceFixSchema.parse({ lines: [] })).toEqual({ lines: [] })
    expect(
      VoiceFixSchema.parse({ lines: [{ id: 1, speaker: '세린', text: '"빨래 가져왔어."' }] }),
    ).toBeDefined()
    expect(() =>
      VoiceFixSchema.parse({
        lines: Array.from({ length: 41 }, (_, i) => ({
          id: i + 1,
          speaker: '세린',
          text: '"빨래 가져왔어."',
        })),
      }),
    ).toThrow()
  })
})

describe('VOICE_FIX_SYSTEM', () => {
  it('is Korean and names the numbered lines', () => {
    expect(findHangul(VOICE_FIX_SYSTEM).length).toBeGreaterThan(0)
    expect(VOICE_FIX_SYSTEM).toContain('{"lines": []}')
  })
})

describe('acceptVoiceLine', () => {
  it('keeps a rewrite in the speaker level with most words kept', () => {
    expect(acceptVoiceLine('"빨래 가져왔어요."', '"빨래 가져왔어."', 'banmal')).toBe(true)
  })

  it('rejects a rewrite still in the wrong level', () => {
    expect(acceptVoiceLine('"빨래 가져왔어요."', '"빨래 가져왔어요."', 'banmal')).toBe(false)
  })

  it('rejects a rewrite with Dice below 0.5', () => {
    expect(acceptVoiceLine('"빨래 가져왔어요. 빨래를 들고 왔다."', '"가라."', 'banmal')).toBe(false)
  })

  it('rejects a rewrite that drops the quote marks', () => {
    expect(acceptVoiceLine('"빨래 가져왔어요."', '빨래 가져왔어.', 'banmal')).toBe(false)
  })

  it('rejects a rewrite with a newline', () => {
    expect(acceptVoiceLine('"빨래 가져왔어요."', '"빨래\n가져왔어."', 'banmal')).toBe(false)
  })

  it('rejects a rewrite outside 50-200% of the original length', () => {
    const original = '"빨래 가져왔어요. 빨래를 들고 왔다."'
    const short = '"가라."'
    expect(short.length / original.length).toBeLessThan(0.5)
    expect(acceptVoiceLine(original, short, 'banmal')).toBe(false)
    const long = `"${'가져왔어 '.repeat(20)}."`
    expect(long.length / original.length).toBeGreaterThan(2)
    expect(acceptVoiceLine(original, long, 'banmal')).toBe(false)
  })
})

describe('voice-fix English localization', () => {
  it('leaves no Hangul', () => {
    expect(findHangul(EN_VOICE_FIX_SYSTEM)).toEqual([])
    expect(findHangul(VOICE_FIX_SYSTEM)).not.toEqual([])
  })
})
