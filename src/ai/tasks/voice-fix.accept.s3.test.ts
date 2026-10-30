import { describe, expect, it } from 'vitest'
import { acceptVoiceLine } from '@/ai/tasks/voice-fix'

// Stage 3 M3 finding F6: plain-speech rewrites that drop the polite ending must be
// accepted even when `speechLevelOf` reads the fix as null, and very short lines
// must pass on their opening when Dice drops.
describe('acceptVoiceLine plain-speech fixes (F6)', () => {
  const accepted: [string, string][] = [
    ['"누구예요."', '"누구야."'],
    ['"왜요."', '"왜."'],
    ['"검사가 왜 종루 계단에서 기다려요."', '"검사가 왜 종루 계단에서 기다려."'],
    ['"모른다고요? 검사면서요."', '"모른다고? 검사면서."'],
    ['"뜯어도 돼요?"', '"뜯어도 돼?"'],
    ['"그럼 왜 왔어요."', '"그럼 왜 왔어."'],
  ]

  for (const [original, fixed] of accepted) {
    it(`accepts ${original} -> ${fixed} at banmal`, () => {
      expect(acceptVoiceLine(original, fixed, 'banmal')).toBe(true)
    })
  }

  it('rejects a rewrite still polite at banmal', () => {
    expect(acceptVoiceLine('"모른다고요? 검사면서요."', '"모른다고? 검사면서요."', 'banmal')).toBe(
      false,
    )
  })

  it('rejects a short line with a changed first syllable at banmal', () => {
    expect(acceptVoiceLine('"누구세요."', '"가."', 'banmal')).toBe(false)
  })

  it('rejects a rewrite with no level on either side at banmal', () => {
    expect(acceptVoiceLine('"그 칼."', '"그 칼은."', 'banmal')).toBe(false)
  })

  it('rejects a banmal ending at jondaet', () => {
    expect(acceptVoiceLine('"가라."', '"가."', 'jondaet')).toBe(false)
  })
})
